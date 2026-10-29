'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')
const db = require('./db')
const restoreState = require('./restore-state')
const { safeName } = require('./files')
const { inside } = require('./validation')
const stampName = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').replace('Z', '')
const nameDb = (dir) => ['mngmnt.db', 'lara.db'].find((n) => fs.existsSync(path.join(dir, n)))
let activeBackupWorkers = 0

function validate(file) {
  let probe
  try {
    probe = new DatabaseSync(file, { readOnly: true })
    if (probe.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Archivio danneggiato')
    const names = new Set(probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name))
    if (!['pratiche', 'anagrafica', 'settings', 'documenti'].every((n) => names.has(n))) throw new Error('Archivio non riconosciuto')
    if (probe.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Collegamenti dei dati non validi')
    const version = probe.prepare('PRAGMA user_version').get().user_version
    for (const [table, columns] of Object.entries(db.backupSchema)) {
      if (version < 2 && ['calendari', 'eventi_esterni', 'cronologia', 'documenti_testo', 'alert_fired'].includes(table)) continue
      const present = new Set(probe.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name))
      if (!columns.filter((c) => (c !== 'calcolo' || version >= 2) && (c !== 'importazione' || version >= 4)).every((c) => present.has(c))) throw new Error('Schema incompleto: ' + table)
    }
    if (version >= 3 && !probe.prepare('PRAGMA table_info(documenti_testo)').all().some(c => c.name === 'sorgente')) throw new Error('Schema indice incompleto')
    if (version >= 5) for (const [table, columns] of Object.entries(db.backupBusinessSchema)) {
      const present = new Set(probe.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name))
      if (!columns.every(c=>present.has(c))) throw new Error('Schema gestione incompleto: ' + table)
    }
    if (version > db.SCHEMA_VERSION) throw new Error('Backup creato da una versione più recente: aggiorna TIO')
  } catch (error) { throw new Error('Backup non valido: ' + error.message) }
  finally { probe?.close() }
}
function isBackup(dir) { try { const n = nameDb(dir); if (!n) return false; validate(path.join(dir, n)); return true } catch { return false } }

function walk(root, fn, relative = '') {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Il backup contiene un collegamento simbolico non consentito')
    const rel = path.join(relative, entry.name)
    if (entry.isDirectory()) walk(root, fn, rel)
    else if (entry.isFile()) fn(rel)
  }
}
// Cifratura a blocchi: niente archivio completo in memoria. Ogni file usa sale e nonce distinti.
function cryptFile(source, target, password, decrypt = false) {
  let input, output
  try {
    input = fs.openSync(source, 'r'); output = fs.openSync(target, 'wx', 0o600)
    let salt, nonce, cipher, position = 0, end = fs.fstatSync(input).size
    if (decrypt) {
      const header = Buffer.alloc(34); if (fs.readSync(input, header, 0, 34, 0) !== 34 || header.subarray(0, 6).toString() !== 'MNGC01') throw new Error('File cifrato non valido')
      salt = header.subarray(6, 22); nonce = header.subarray(22, 34)
      const tag = Buffer.alloc(16); if (end < 50) throw new Error('File cifrato troncato'); fs.readSync(input, tag, 0, 16, end - 16)
      cipher = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(password, salt, 32), nonce); cipher.setAuthTag(tag)
      position = 34; end -= 16
    } else {
      salt = crypto.randomBytes(16); nonce = crypto.randomBytes(12)
      cipher = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(password, salt, 32), nonce)
      fs.writeSync(output, Buffer.concat([Buffer.from('MNGC01'), salt, nonce]))
    }
    const buffer = Buffer.alloc(1024 * 1024)
    while (position < end) { const n = fs.readSync(input, buffer, 0, Math.min(buffer.length, end - position), position); if (!n) throw new Error('File incompleto'); position += n; fs.writeSync(output, cipher.update(buffer.subarray(0, n))) }
    fs.writeSync(output, cipher.final()); if (!decrypt) fs.writeSync(output, cipher.getAuthTag())
  } catch (error) { if (decrypt) throw new Error('Password del backup errata o file danneggiato'); throw error }
  finally { if (input !== undefined) fs.closeSync(input); if (output !== undefined) fs.closeSync(output) }
}

function run(destParent, { prefix = 'TIO-backup', includeLinked = false, password = '' } = {}) {
  if (password && password.length < 12) throw new Error('La password del backup deve avere almeno 12 caratteri')
  const dest = path.join(destParent, `${prefix}-${stampName()}-${crypto.randomBytes(3).toString('hex')}`)
  // Per i backup cifrati il testo in chiaro rimane solo nell'area locale privata.
  // La destinazione (anche un disco condiviso) riceve esclusivamente ciphertext.
  fs.mkdirSync(destParent, { recursive: true })
  const staging = password ? fs.mkdtempSync(path.join(db.getDataDir(), '.backup-privato-')) : dest + '.incomplete'
  fs.mkdirSync(staging, { recursive: true, mode: 0o700 })
  try {
    const dbFile = path.join(staging, 'mngmnt.db')
    db.getDb().exec(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`); validate(dbFile)
    const docs = path.join(db.getDataDir(), 'documenti')
    if (fs.existsSync(docs)) { walk(docs, () => {}); fs.cpSync(docs, path.join(staging, 'documenti'), { recursive: true }) }
    const manifest = { version: 2, files: [], created: new Date().toISOString(), portable: includeLinked, linked: [], missing: [] }
    const snapshot = new DatabaseSync(dbFile, { readOnly: true })
    let documents
    try { documents = snapshot.prepare('SELECT * FROM documenti').all() } finally { snapshot.close() }
    if (includeLinked) for (const doc of documents) {
      if (!doc.percorso) continue
      try {
        if (!fs.statSync(doc.percorso).isFile()) throw new Error('Non è un file')
        const rel = `documenti-collegati/${doc.id}/${safeName(path.basename(doc.percorso))}`
        const target = inside(staging, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(doc.percorso, target)
        manifest.linked.push({ id: doc.id, file: rel, size: fs.statSync(target).size })
      } catch { manifest.missing.push({ id: doc.id, nome: doc.nome }) }
    }
    walk(staging, (rel) => manifest.files.push({ file: rel.split(path.sep).join('/'), sha256: digest(path.join(staging, rel)) }))
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2))
    fs.writeFileSync(path.join(staging, 'LEGGIMI.txt'), `Backup TIO. Ripristina da Impostazioni → Backup e sicurezza.\n${includeLinked ? 'Include copie dei documenti collegati disponibili. I file mancanti sono elencati nel manifest.' : 'Include dati e copie interne. I documenti COLLEGATI nelle cartelle dell’utente NON sono inclusi: proteggi anche quelle cartelle.'}\n${password ? 'Cifrato: occorre la password del backup, senza possibilità di recuperarla.' : 'Non cifrato: proteggi la cartella e il disco.'}\n`)
    if (password) {
      const encrypted = dest + '.encrypted.incomplete'; fs.mkdirSync(encrypted, { mode: 0o700 })
      try {
        const map = []; walk(staging, (rel) => { const filename = crypto.randomUUID() + '.enc'; cryptFile(path.join(staging, rel), path.join(encrypted, filename), password); map.push({ path: rel.split(path.sep).join('/'), file: filename }) })
        const indexFile = path.join(staging, '_indice.json'); fs.writeFileSync(indexFile, JSON.stringify(map)); cryptFile(indexFile, path.join(encrypted, 'indice.enc'), password)
        fs.writeFileSync(path.join(encrypted, 'backup.json'), JSON.stringify({ format: 'MNGMNT-AES-256-GCM', version: 1 }))
        fs.renameSync(encrypted, dest)
      } catch (error) { fs.rmSync(encrypted, { recursive: true, force: true }); throw error }
      fs.rmSync(staging, { recursive: true, force: true })
    } else fs.renameSync(staging, dest)
    return dest
  } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error }
}

function prepare(srcDir, staging, password) {
  if (fs.existsSync(path.join(srcDir, 'indice.enc'))) {
    if (!password) throw new Error('Inserisci la password del backup cifrato')
    const index = path.join(staging, '_indice.json'); cryptFile(path.join(srcDir, 'indice.enc'), index, password, true)
    const map = JSON.parse(fs.readFileSync(index, 'utf8')); fs.rmSync(index)
    if (!Array.isArray(map) || map.length > 100000) throw new Error('Indice del backup non valido')
    for (const entry of map) { const source = inside(srcDir, entry.file), target = inside(staging, entry.path); fs.mkdirSync(path.dirname(target), { recursive: true }); cryptFile(source, target, password, true) }
  } else {
    if (!nameDb(srcDir)) throw new Error('La cartella selezionata non contiene un backup di TIO (manca mngmnt.db).')
    walk(srcDir, () => {}); fs.cpSync(srcDir, staging, { recursive: true })
  }
  const file = nameDb(staging); if (!file) throw new Error('Backup privo di archivio dati')
  validate(path.join(staging, file))
  if (file !== 'mngmnt.db') fs.renameSync(path.join(staging, file), path.join(staging, 'mngmnt.db'))
}
function digest(file) {
  const fd = fs.openSync(file, 'r'), hash = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024)
  try { let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n)); return hash.digest('hex') }
  finally { fs.closeSync(fd) }
}
function verifyDocuments(staging) {
  const manifestFile = path.join(staging, 'manifest.json')
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { portable: false, linked: [], missing: [] }
  if (!Array.isArray(manifest.linked) || !Array.isArray(manifest.missing)) throw new Error('Manifest del backup non valido')
  if (manifest.version !== undefined && ![1,2].includes(manifest.version)) throw new Error('Versione del manifest non supportata')
  if (manifest.version === 2) {
    if (!Array.isArray(manifest.files) || manifest.files.length > 100000) throw new Error('Indice di integrità non valido')
    const covered = new Set()
    for (const entry of manifest.files) {
      if (!/^[a-f0-9]{64}$/.test(entry.sha256 || '') || covered.has(entry.file)) throw new Error('Impronta del backup non valida')
      const source = inside(staging, entry.file)
      if (!fs.existsSync(source) || digest(source) !== entry.sha256) throw new Error('File mancante o integrità del backup non verificata: ' + entry.file)
      covered.add(entry.file)
    }
    walk(staging, (rel) => { if (!['manifest.json','LEGGIMI.txt'].includes(rel) && !covered.has(rel.split(path.sep).join('/'))) throw new Error('File privo di impronta: ' + rel) })
    if (!covered.has('mngmnt.db')) throw new Error('Archivio privo di impronta')
  }
  for (const entry of manifest.linked) {
    const source = inside(staging, entry.file)
    if (!fs.existsSync(source) || !fs.statSync(source).isFile() || (entry.size !== undefined && fs.statSync(source).size !== entry.size)) throw new Error('Documento incluso nel backup mancante o incompleto')
  }
  const probe = new DatabaseSync(path.join(staging, 'mngmnt.db'), { readOnly: true })
  try {
    const columns = probe.prepare('PRAGMA table_info(documenti)').all().map((column) => column.name)
    for (const doc of probe.prepare('SELECT * FROM documenti').all()) {
      if (columns.includes('percorso') && doc.percorso) continue
      if (!doc.file) continue
      const source = inside(path.join(staging, 'documenti'), doc.file)
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error('Copia interna del documento assente nel backup: ' + doc.nome)
    }
  } finally { probe.close() }
  return manifest
}

function inspect(srcDir, password = '') {
  const staging = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mngmnt-verifica-'))
  try {
    prepare(srcDir, staging, password)
    const manifest = verifyDocuments(staging)
    return { valido: true, integritaFile: manifest.version === 2, portabile: !!manifest.portable, documenti: manifest.linked.length, mancanti: manifest.missing.length }
  } finally { fs.rmSync(staging, { recursive: true, force: true }) }
}
function restore(srcDir, password = '') {
  if (activeBackupWorkers) throw new Error('Backup in corso: attendi il completamento prima di ripristinare')
  const dataDir = db.getDataDir(), staging = fs.mkdtempSync(path.join(dataDir, '.restore-'))
  let keepStaging = false, state
  try {
    prepare(srcDir, staging, password); verifyDocuments(staging) // nessuna modifica all’archivio attivo prima di questo punto
    const safeParent = path.join(dataDir, '_copie-di-sicurezza'), safety = run(safeParent, { prefix: 'prima-del-ripristino' })
    const dbTarget = path.join(dataDir, 'mngmnt.db'), docsTarget = path.join(dataDir, 'documenti'), oldDb = path.join(staging, '_precedente.db'), oldDocs = path.join(staging, '_precedenti-documenti')
    // Il vecchio journal non deve accompagnare il nuovo archivio. Nessuna sostituzione con lettori attivi.
    if (db.getDb().prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy) throw new Error('Archivio in uso da un’altra operazione: riprova il ripristino tra poco')
    restoreState.syncTree(staging)
    keepStaging = true
    state = restoreState.begin(dataDir, staging)
    db.close()
    try {
      for (const ext of ['-wal', '-shm']) fs.rmSync(dbTarget + ext, { force: true })
      fs.renameSync(dbTarget, oldDb)
      restoreState.syncDir(staging); restoreState.syncDir(dataDir)
      if (fs.existsSync(docsTarget)) fs.renameSync(docsTarget, oldDocs)
      restoreState.syncDir(staging); restoreState.syncDir(dataDir)
      fs.renameSync(path.join(staging, 'mngmnt.db'), dbTarget)
      fs.mkdirSync(docsTarget, { recursive: true })
      if (fs.existsSync(path.join(staging, 'documenti'))) fs.cpSync(path.join(staging, 'documenti'), docsTarget, { recursive: true })
      db.open(dataDir, { restoring: true })
      const manifestFile = path.join(staging, 'manifest.json')
      if (fs.existsSync(manifestFile)) {
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
        const portableRoot = path.join(docsTarget, 'ripristinati-' + crypto.randomBytes(4).toString('hex'))
        db.transaction(() => { for (const entry of manifest.linked || []) {
          const source = inside(staging, entry.file), target = inside(portableRoot, `${entry.id}/${safeName(path.basename(source))}`)
          if (!fs.existsSync(source)) throw new Error('Documento del backup mancante')
          fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target)
          if (db.get('documenti', entry.id)) db.save('documenti', { id: entry.id, percorso: target, rel: null })
        } })
      }
      if (!db.verificaIntegrita()) throw new Error('Verifica dopo il ripristino fallita')
      if (db.getDb().prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy) throw new Error('Archivio ancora in uso')
      restoreState.syncTree(dbTarget); restoreState.syncTree(docsTarget); restoreState.syncDir(dataDir)
      restoreState.write(dataDir, { ...state, status: 'committed' })
    } catch (error) {
      try {
        db.close()
        const recovery = restoreState.recover(dataDir)
        keepStaging = false
        db.open(dataDir)
        if (recovery && !recovery.recovered) return { safety }
      } catch (recoveryError) {
        throw new Error(`Ripristino interrotto: recupero automatico non riuscito. Copia di sicurezza: ${safety}. File precedenti conservati in: ${staging}. ${recoveryError.message}`)
      }
      throw new Error('Ripristino annullato; archivio precedente recuperato. ' + error.message)
    }
    // Un errore di pulizia dopo il commit non deve annullare un ripristino riuscito.
    try { restoreState.recover(dataDir); keepStaging = false } catch { /* pulizia al prossimo avvio */ }
    return { safety }
  } finally { if (!keepStaging) fs.rmSync(staging, { recursive: true, force: true }) }
}
function prune(parent, prefix, keep) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp('^' + escaped + '-[0-9]{8}-[0-9]{6}(?:\\.[0-9]{3})?(?:-[0-9a-f]{6})?$')
  const dirs = fs.readdirSync(parent).filter((n) => pattern.test(n) && fs.lstatSync(path.join(parent, n)).isDirectory() && (isBackup(path.join(parent, n)) || fs.existsSync(path.join(parent, n, 'backup.json')))).sort()
  for (const n of dirs.slice(0, Math.max(0, dirs.length - keep))) fs.rmSync(path.join(parent, n), { recursive: true, force: true })
}
function autoBackupIfDue(settings, defaultFolder = null, now = Date.now(), options = {}) {
  if (settings.backup_automatico === false) return null
  const folder = settings.backup_cartella || defaultFolder
  if (!folder) return null
  const last = Date.parse(settings.backup_ultimo || '')
  if (Number.isFinite(last) && now - last < 20 * 3600000) return null
  if (settings.backup_tentativo && now - Date.parse(settings.backup_tentativo) < 5 * 60000) return null
  try {
    if (!fs.existsSync(folder)) { if (settings.backup_cartella) throw new Error('Cartella del backup non disponibile: collega il disco o scegli una cartella'); fs.mkdirSync(folder, { recursive: true }) }
    if (settings.backup_cifrato === true && !options.password) throw new Error('Password del backup automatico non disponibile: nessuna copia in chiaro creata')
    const result = run(folder, { prefix: 'TIO-auto', includeLinked: settings.backup_documenti !== false, ...options })
    prune(folder, 'TIO-auto', Math.max(1, Math.min(90, Number(settings.backup_mantieni) || 7)))
    db.setSettings({ backup_ultimo: new Date(now).toISOString(), backup_tentativo: new Date(now).toISOString(), backup_esito: 'ok', backup_errore: '' })
    return result
  } catch (error) {
    db.setSettings({ backup_tentativo: new Date(now).toISOString(), backup_esito: 'errore', backup_errore: error.message })
    return null
  }
}
module.exports = { run, restore, inspect, isBackup, autoBackupIfDue, cryptFile }

function background(data) {
  const { Worker } = require('node:worker_threads')
  return new Promise((resolve, reject) => {
    const file = path.join(__dirname, 'backup-worker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
    const worker = new Worker(file, { workerData: data, resourceLimits: { maxOldGenerationSizeMb: 256 } })
    const readingArchive = data.operation === 'run'
    if (readingArchive) activeBackupWorkers++
    let message, settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      if (readingArchive) activeBackupWorkers--
      if (error || message?.error) reject(error || new Error(message.error))
      else if (message) resolve(message.result)
      else reject(new Error('Operazione di backup interrotta'))
    }
    worker.once('message', (result) => { message = result })
    worker.once('error', (error) => { finish(error) })
    worker.once('exit', (code) => { finish(code !== 0 ? new Error('Operazione di backup interrotta') : null) })
  })
}
module.exports.runAsync = (folder, options) => background({ operation: 'run', dataDir: db.getDataDir(), folder, options })
module.exports.inspectAsync = (source, password) => background({ operation: 'inspect', source, password })
let automaticRunning = false
module.exports.autoBackupAsync = async (settings, defaultFolder, { passwordProvider = async () => '' } = {}) => {
  if (automaticRunning || settings.backup_automatico === false) return false
  const now = Date.now(), folder = settings.backup_cartella || defaultFolder
  // dopo una scrittura negata (per esempio dalla protezione ransomware di Windows, che a ogni tentativo mostra un avviso) si riprova dopo 6 ore, non dopo 5 minuti
  const attesa = settings.backup_negato ? 6 * 3600000 : 5 * 60000
  if (!folder || now - Date.parse(settings.backup_ultimo || '') < 20 * 3600000 || now - Date.parse(settings.backup_tentativo || '') < attesa) return false
  automaticRunning = true
  const archive = db.getDb()
  try {
    if (!fs.existsSync(folder)) { if (settings.backup_cartella) throw new Error('Cartella del backup non disponibile: collega il disco o scegli una cartella'); fs.mkdirSync(folder, { recursive: true }) }
    const password = await passwordProvider()
    if (db.getDb() !== archive) return false
    if (settings.backup_cifrato === true && !password) throw new Error('Password del backup automatico non disponibile: nessuna copia in chiaro creata')
    await module.exports.runAsync(folder, { prefix: 'TIO-auto', includeLinked: settings.backup_documenti !== false, password })
    if (db.getDb() !== archive) return false
    prune(folder, 'TIO-auto', Math.max(1, Math.min(90, Number(settings.backup_mantieni) || 7)))
    db.setSettings({ backup_ultimo: new Date().toISOString(), backup_tentativo: new Date().toISOString(), backup_esito: 'ok', backup_errore: '', backup_negato: false })
  } catch (error) {
    const { accessoNegato, spiegaAccessoNegato } = require('./cartelle-utente')
    if (db.getDb() === archive) db.setSettings({ backup_tentativo: new Date().toISOString(), backup_esito: 'errore', backup_errore: spiegaAccessoNegato(error).message, backup_negato: accessoNegato(error) })
  }
  finally { automaticRunning = false }
  return true
}
