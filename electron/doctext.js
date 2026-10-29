'use strict'
// Testo dei documenti allegati alle pratiche, per la ricerca globale. Sola lettura: i file non vengono modificati.
// Formati: Word (.docx), fogli di calcolo (.xlsx), OpenDocument (.odt/.ods), testo (.txt .csv .md .html .xml), email salvate (.eml).
// PDF testuali e OCR di PDF/immagini vengono letti dal worker locale document-worker.js.
const fs = require('node:fs')
const path = require('node:path')
const db = require('./db')
const docfile = require('./docfile')
const docx = require('./docx')
const { leggiZip } = require('./zip')

const MAX_TESTO = 2 * 1024 * 1024
const MAX_FILE = 60 * 1024 * 1024
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&')
const senzaTag = (s) => unesc(s.replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, ' ').replace(/<\/(?:p|div|tr|li|br|h\d|text:p|text:h)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n')
const comeTesto = (buf) => (buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8')).replace(/\u0000/g, '')

function decodificaQP(s) { return Buffer.from(s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8') }
function parole2047(s) { return s.replace(/=\?([\w-]+)\?([bq])\?([^?]*)\?=/gi, (_, cs, k, t) => { try { return k.toLowerCase() === 'b' ? Buffer.from(t, 'base64').toString(/utf-?8/i.test(cs) ? 'utf8' : 'latin1') : decodificaQP(t.replace(/_/g, ' ')) } catch { return t } }) }
function emlTesto(raw) {
  const out = []
  const parte = (blocco, profondita) => {
    const i = blocco.search(/\r?\n\r?\n/); if (i < 0) return
    const testa = blocco.slice(0, i).replace(/\r?\n[ \t]+/g, ' '), corpo = blocco.slice(i).replace(/^\r?\n\r?\n/, '')
    const h = (n) => (testa.match(new RegExp('^' + n + ':\\s*(.*)$', 'im')) || [])[1] || ''
    const tipoOrig = h('content-type'), tipo = tipoOrig.toLowerCase(), cte = h('content-transfer-encoding').toLowerCase().trim()
    const confine = (tipoOrig.match(/boundary="?([^";]+)"?/i) || [])[1]
    if (profondita === 0) for (const k of ['from', 'to', 'cc', 'subject', 'date']) { const v = h(k); if (v) out.push(`${k}: ${parole2047(v)}`) }
    if (tipo.includes('multipart') && confine && profondita < 6) { for (const p of corpo.split('--' + confine)) if (p.trim() && !p.startsWith('--')) parte(p.replace(/^\r?\n/, ''), profondita + 1); return }
    if (tipo && !/text\/(plain|html)/.test(tipo)) return // allegati: non si leggono
    let t = corpo; const cs = (tipo.match(/charset="?([^";]+)"?/) || [])[1] || 'utf-8'
    try {
      if (cte === 'base64') t = Buffer.from(corpo.replace(/\s/g, ''), 'base64').toString(/utf-?8/i.test(cs) ? 'utf8' : 'latin1')
      else if (cte === 'quoted-printable') t = /utf-?8/i.test(cs) ? decodificaQP(corpo) : Buffer.from(corpo.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16))), 'latin1').toString('latin1')
    } catch { /* corpo illeggibile */ }
    out.push(/html/.test(tipo) ? senzaTag(t) : t)
  }
  parte(raw.replace(/^(?:\r?\n)+/, ''), 0)
  return out.join('\n')
}

function xlsxTesto(zip) {
  const t = (n) => { const b = zip.leggi(n); return b ? b.toString('utf8') : '' }
  const out = []
  const ss = t('xl/sharedStrings.xml'); for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) out.push(unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')))
  for (const n of zip.nomi.filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x))) for (const m of t(n).matchAll(/<is>([\s\S]*?)<\/is>/g)) out.push(unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')))
  return out.join('\n')
}

/** Testo ricavabile dal file, o '' se il formato non è supportato. */
function estrai(buf, nome) {
  const ext = path.extname(nome).toLowerCase()
  let t = ''
  if (ext === '.docx') { const d = docx.apri(buf); t = d.nomi.filter((n) => docx.PARTI_TESTO.test(n)).map((n) => docx.testoDi(d.testo(n))).join('\n') }
  else if (ext === '.xlsx' || ext === '.xlsm') t = xlsxTesto(leggiZip(buf))
  else if (ext === '.odt' || ext === '.ods') { const z = leggiZip(buf); const c = z.leggi('content.xml'); t = c ? senzaTag(c.toString('utf8')) : '' }
  else if (['.txt', '.csv', '.tsv', '.md', '.log'].includes(ext)) t = comeTesto(buf)
  else if (['.html', '.htm', '.xml'].includes(ext)) t = senzaTag(comeTesto(buf))
  else if (ext === '.eml') t = emlTesto(buf.toString('utf8'))
  return t.replace(/\u0000/g, '').slice(0, MAX_TESTO)
}

/** Legge il testo dei documenti non ancora indicizzati (al massimo `max` per volta). Un file illeggibile viene segnato come vuoto e non riprovato. */
function indicizzaPendenti(max = 40) {
  const d = db.getDb(); if (!d) return 0
  const lista = d.prepare('SELECT d.id, d.nome, d.file, d.percorso FROM documenti d LEFT JOIN documenti_testo t ON t.documento_id = d.id WHERE t.documento_id IS NULL ORDER BY d.id DESC LIMIT ?').all(max)
  const ins = d.prepare('INSERT OR REPLACE INTO documenti_testo(documento_id, testo) VALUES(?, ?)')
  for (const r of lista) {
    let testo = ''
    try {
      if (r.percorso && !docfile.esiste(r)) continue // file collegato non trovato (spostato o disco non collegato): si riprova più tardi
      const file = docfile.risolvi(r)
      if (fs.statSync(file).size <= MAX_FILE) testo = estrai(fs.readFileSync(file), file)
    } catch { /* illeggibile o in formato non valido */ }
    ins.run(r.id, testo)
  }
  return lista.length
}

/** Brano di testo attorno alla parola cercata. */
function brano(testo, q, raggio = 45) {
  const i = testo.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return ''
  const a = Math.max(0, i - raggio), b = Math.min(testo.length, i + q.length + raggio)
  return (a > 0 ? '…' : '') + testo.slice(a, b).replace(/\s+/g, ' ').trim() + (b < testo.length ? '…' : '')
}

/** Documenti il cui contenuto contiene il testo cercato. */
function cercaNeiDocumenti(q, limite = 8) {
  const testo = String(q ?? '').replace(/\u0000/g, '').trim().slice(0, 100)
  if (testo.length < 3) return []
  const s = `%${testo.replace(/[\\%_]/g, (m) => '\\' + m)}%`
  return db.getDb().prepare(`SELECT d.id, d.nome, d.pratica_id, p.colore, p.numero, t.testo FROM documenti_testo t JOIN documenti d ON d.id = t.documento_id LEFT JOIN pratiche p ON p.id = d.pratica_id WHERE t.testo LIKE ? ESCAPE '\\' ORDER BY d.id DESC LIMIT ?`).all(s, limite)
    .map((r) => ({ kind: 'documento', id: r.id, pratica_id: r.pratica_id, title: r.nome, sub: brano(r.testo, testo) || 'Contenuto del documento', color: r.colore, nelTesto: true }))
}

module.exports = { estrai, indicizzaPendenti, cercaNeiDocumenti, brano, emlTesto }

let running = false
function estraiFileAsync(file, name, ocr = false) {
  const { Worker } = require('node:worker_threads')
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'document-worker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'), { workerData: { file, name, ocr }, resourceLimits: { maxOldGenerationSizeMb: 512 } })
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Il documento ha superato il tempo massimo di elaborazione')) }, ocr ? 180000 : 45000)
    const finish = () => clearTimeout(timer)
    worker.once('message', (result) => { finish(); worker.terminate(); result.error ? reject(new Error(result.error)) : resolve(result) })
    worker.once('error', (error) => { finish(); reject(error) })
    worker.once('exit', (code) => { finish(); if (code !== 0) reject(new Error('Indicizzazione interrotta')) })
  })
}
// Include anche ctime e identità del file: rileva modifiche della stessa dimensione e sostituzioni.
function sorgente(doc) {
  const file = docfile.risolvi(doc)
  try { const st = fs.statSync(file); return JSON.stringify([file, st.size, st.mtimeMs, st.ctimeMs, st.ino, st.dev]) }
  catch { return JSON.stringify([file, 'assente']) }
}
async function indicizzaDocumento(id, ocr = false) {
  const current = db.getDb(), doc = db.get('documenti', id)
  if (!doc) throw new Error('Documento non trovato')
  const file = docfile.risolvi(doc), revision = sorgente(doc)
  const corrente = () => db.getDb() === current && !!db.get('documenti', id) && sorgente(db.get('documenti', id)) === revision
  try {
    const result = await estraiFileAsync(file, file, ocr)
    if (!corrente()) return null // la lettura non appartiene più al file/archivio attivo
    const fingerprint = docfile.impronta(file), size = fs.statSync(file).size
    if (!corrente()) return null
    // Conserva l'identità della revisione corrente: una successiva modifica/spostamento
    // non deve costringere a cercare l'impronta del documento precedente.
    if (doc.impronta !== fingerprint || doc.dimensione !== size) db.senzaCronologia(() => db.save('documenti', { id, impronta: fingerprint, dimensione: size }))
    current.prepare('INSERT INTO documenti_testo(documento_id,testo,versione,stato,errore,sorgente) VALUES(?,?,3,?,NULL,?) ON CONFLICT(documento_id) DO UPDATE SET testo=excluded.testo,versione=3,stato=excluded.stato,errore=NULL,sorgente=excluded.sorgente').run(id, result.text, result.status, revision)
    return { caratteri: result.text.length, stato: result.status }
  } catch (error) {
    if (corrente()) current.prepare("INSERT INTO documenti_testo(documento_id,testo,versione,stato,errore,sorgente) VALUES(?,'',3,'errore',?,?) ON CONFLICT(documento_id) DO UPDATE SET testo='',versione=3,stato='errore',errore=excluded.errore,sorgente=excluded.sorgente").run(id, error.message, revision)
    throw error
  }
}
let scanArchive = null, scanAfter = 0
async function indicizzaPdfPendenti(max = 2) {
  if (running || !db.getDb()) return false
  const current = db.getDb()
  running = true
  try {
    if (scanArchive !== current) { scanArchive = current; scanAfter = 0 }
    // Prima i nuovi documenti; le revisioni vengono controllate in blocchi per non monopolizzare l'interfaccia.
    const nuovi = current.prepare('SELECT d.* FROM documenti d LEFT JOIN documenti_testo t ON t.documento_id=d.id WHERE t.documento_id IS NULL ORDER BY d.id DESC LIMIT ?').all(max)
    let records = current.prepare('SELECT d.*,t.sorgente,t.versione FROM documenti d LEFT JOIN documenti_testo t ON t.documento_id=d.id WHERE d.id > ? ORDER BY d.id LIMIT 400').all(scanAfter)
    if (!records.length) { scanAfter = 0; records = current.prepare('SELECT d.*,t.sorgente,t.versione FROM documenti d LEFT JOIN documenti_testo t ON t.documento_id=d.id ORDER BY d.id LIMIT 400').all() }
    const pending = new Map(nuovi.map((r) => [r.id, r]))
    for (const r of records) {
      if (pending.size >= max && !pending.has(r.id)) break
      scanAfter = r.id
      if (r.versione !== 3 || r.sorgente !== sorgente(r)) pending.set(r.id, r)
    }
    for (const r of pending.values()) {
      if (db.getDb() !== current) break
      try { await indicizzaDocumento(r.id) } catch { /* il file assente viene riprovato quando torna disponibile */ }
    }
    return pending.size > 0
  } finally { running = false }
}
module.exports.estraiFileAsync = estraiFileAsync
module.exports.indicizzaDocumento = indicizzaDocumento
module.exports.indicizzaPdfPendenti = indicizzaPdfPendenti
module.exports.indicizzaPendentiAsync = indicizzaPdfPendenti
module.exports.statoIndice = (praticaId) => db.getDb().prepare('SELECT d.id, t.stato, t.errore FROM documenti d LEFT JOIN documenti_testo t ON t.documento_id=d.id WHERE d.pratica_id=?').all(praticaId)
