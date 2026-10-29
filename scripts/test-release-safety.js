'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const db = require('../electron/db'), backup = require('../electron/backup'), validation = require('../electron/validation')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-release-'))
let count = 0
const ok = (label) => console.log(`ok ${++count} - ${label}`)
async function main() {
try {
  db.open(path.join(root, 'data'))
  const p = db.save('pratiche', { titolo: 'Pratica di prova' })
  const { praticaDir, docPath } = require('../electron/ipc/percorsi')
  for (const id of ['../altra', -1, 0, 1.1, '1/2', null]) assert.throws(() => praticaDir(id), /Identificativo/)
  assert.throws(() => docPath('../fuori'), /Percorso/)
  if (process.platform !== 'win32') { fs.symlinkSync(root, path.join(db.getDataDir(), 'documenti', 'link')); assert.throws(() => docPath('link/file'), /simbolico/); fs.unlinkSync(path.join(db.getDataDir(), 'documenti', 'link')) }
  ok('ID anomali, traversal e collegamenti simbolici interni rifiutati')
  assert.throws(() => db.save('ore', { pratica_id: p.id, data: '2026-10-13', minuti: -5, descrizione: 'x' }), /non negativo/)
  assert.throws(() => db.save('ore', { pratica_id: p.id, data: '2026-02-30', minuti: 5, descrizione: 'x' }), /Data/)
  assert.throws(() => validation.record('scadenze', { promemoria: '{bad' }), /Formato/)
  ok('date inesistenti, durate negative e promemoria malformati rifiutati')
  const inv = { data: '2026-10-13', numero: '1/2026', progressivo: 1, anno: 2026, voci: [] }
  db.saveParcella(inv); assert.throws(() => db.saveParcella(inv), /già utilizzato/)
  assert.equal(db.saveParcella({ data: '2026-10-13', tipo: 'preventivo' }).numero, 'PR 1/2026')
  ok('numeri duplicati rifiutati, preventivi in una serie indipendente')
  db.setSettings({ stati_pratica: [{ nome: 'Aperta', chiusa: false }] }); db.save('pratiche', { id: p.id, stato: 'Aperta' })
  db.setSettings({ stati_pratica: [{ nome: 'Attiva', chiusa: false }] }); assert.equal(db.get('pratiche', p.id).stato, 'Attiva')
  ok('rinomina dello stato propagata alle pratiche')
  const bad = path.join(root, 'bad'); fs.mkdirSync(bad); fs.writeFileSync(path.join(bad, 'mngmnt.db'), 'testo')
  assert.equal(backup.isBackup(bad), false); assert.throws(() => backup.restore(bad), /Backup non valido/)
  assert.equal(db.get('pratiche', p.id).titolo, 'Pratica di prova')
  ok('backup corrotto rifiutato prima di toccare l’archivio attivo')
  const source = path.join(root, 'documento.txt'); fs.writeFileSync(source, 'contenuto riservato da ritrovare')
  const doc = require('../electron/docfile').collega(p.id, source)
  const portable = backup.run(path.join(root, 'backup'), { includeLinked: true })
  assert.deepEqual(backup.inspect(portable), { valido: true, integritaFile: true, portabile: true, documenti: 1, mancanti: 0 })
  fs.unlinkSync(source); backup.restore(portable)
  const restored = db.get('documenti', doc.id); assert.equal(fs.readFileSync(restored.percorso, 'utf8'), 'contenuto riservato da ritrovare')
  ok('backup portabile verificabile, file recuperato e ricollegato senza l’originale')
  const working = backup.runAsync(path.join(root, 'backup-worker'), { includeLinked: true })
  assert.throws(() => backup.restore(portable), /Backup in corso/)
  assert.equal((await backup.inspectAsync(await working)).documenti, 1)
  ok('ripristino impedito mentre il worker di backup usa l’archivio')
  const reader = new (require('node:sqlite').DatabaseSync)(path.join(db.getDataDir(), 'mngmnt.db'), { readOnly: true })
  try {
    reader.exec('BEGIN'); reader.prepare('SELECT * FROM pratiche').all()
    db.save('pratiche', { id: p.id, titolo: 'Aggiornamento nel journal' })
    db.getDb().exec('PRAGMA busy_timeout = 30')
    assert.throws(() => backup.restore(portable), /Archivio in uso/)
    assert.equal(db.get('pratiche', p.id).titolo, 'Aggiornamento nel journal')
  } finally { reader.close(); db.getDb().exec('PRAGMA busy_timeout = 10000') }
  backup.restore(portable)
  assert.equal(db.get('pratiche', p.id).titolo, 'Pratica di prova')
  ok('journal con lettore attivo non sostituito; ripristino successivo senza residui WAL')
  const realRename = fs.renameSync
  let interrupted = false
  fs.renameSync = (from, to) => {
    if (!interrupted && String(from).includes('.restore-') && path.basename(from) === 'mngmnt.db' && to === path.join(db.getDataDir(), 'mngmnt.db')) { interrupted = true; throw new Error('Errore di copia simulato') }
    return realRename(from, to)
  }
  try { assert.throws(() => backup.restore(portable), /archivio precedente recuperato/) } finally { fs.renameSync = realRename }
  assert.ok(interrupted); assert.equal(db.get('pratiche', p.id).titolo, 'Pratica di prova'); assert.ok(fs.existsSync(db.get('documenti', doc.id).percorso))
  ok('fallimento durante la sostituzione: archivio e documenti recuperati automaticamente')
  const encrypted = backup.run(path.join(root, 'backup'), { includeLinked: true, password: 'Una-password-lunga-2026' })
  assert.ok(!fs.existsSync(path.join(encrypted, 'mngmnt.db')))
  assert.throws(() => backup.inspect(encrypted, 'password sbagliata'), /Password/)
  assert.equal(backup.inspect(encrypted, 'Una-password-lunga-2026').documenti, 1)
  backup.restore(encrypted, 'Una-password-lunga-2026'); assert.equal(db.get('pratiche', p.id).titolo, 'Pratica di prova')
  const bytes = fs.readFileSync(path.join(encrypted, 'indice.enc')); bytes[bytes.length - 1] ^= 1; fs.writeFileSync(path.join(encrypted, 'indice.enc'), bytes)
  assert.throws(() => backup.restore(encrypted, 'Una-password-lunga-2026'), /Password/)
  assert.ok(db.get('pratiche', p.id)); ok('backup cifrato recuperabile, password errata e manomissione rilevate senza perdita dati')
  const manifest = JSON.parse(fs.readFileSync(path.join(portable, 'manifest.json'), 'utf8')); fs.unlinkSync(path.join(portable, manifest.linked[0].file))
  assert.throws(() => backup.inspect(portable), /mancante/); assert.throws(() => backup.restore(portable), /mancante/); assert.ok(db.get('pratiche', p.id))
  ok('verifica e ripristino rifiutano un documento promesso dal manifest ma assente')
  backup.autoBackupIfDue({ backup_cartella: path.join(root, 'non-collegato') })
  assert.equal(db.getSettings().backup_esito, 'errore'); ok('destinazione assente segnalata nello stato del backup')
} finally { db.close(); fs.rmSync(root, { recursive: true, force: true }) }
console.log(`\n${count} prove di sicurezza della release superate`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
