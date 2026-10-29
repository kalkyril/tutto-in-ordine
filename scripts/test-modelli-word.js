'use strict'
// Modelli Word dell'utente: importazione nell'archivio, campi trovati anche se Word li spezza in più frammenti,
// compilazione che conserva impaginazione, intestazione, piè di pagina e immagini.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const db = require('../electron/db'), word = require('../electron/modelli-word'), documento = require('../electron/documento'), docx = require('../electron/docx')
const { leggiZip } = require('../electron/zip')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-word-')); let n = 0
const ok = (s) => console.log(`ok ${++n} - ${s}`)
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const testo = (buf) => { const d = docx.apri(buf); return d.nomi.filter((x) => docx.PARTI_TESTO.test(x)).map((x) => docx.testoDi(d.testo(x))).join('\n') }
try {
  db.open(dir)
  // carta intestata con logo e campi: uno spezzato da Word in due frammenti con formattazioni diverse
  const carta = documento.genera('docx', {
    titolo: 'Carta intestata {{pratica.numero}}', intestazione: [{ testo: '{{studio.nome}}', dimensione: 'grande', grassetto: true }], footer: [{ testo: 'P.IVA {{studio.piva}}', dimensione: 'piccola' }],
    logo: { png, larghezza: 80, altezza: 40 }, numeriPagina: true,
    corpo: [{ tipo: 'p', runs: [{ t: 'Spett.le ' }, { t: '{{destina', b: true }, { t: 'tario.nome}}', i: true }] }, { tipo: 'p', runs: [{ t: 'Importo: {{ importo }} – ricorda {{campo vuoto}}' }] }],
  })
  const info = word.importa(carta, 'Carta intestata.docx')
  assert.equal(info.nome, 'Carta intestata'); assert.match(info.id, /^word-/)
  assert.deepEqual(info.campi.sort(), ['campo vuoto', 'destinatario.nome', 'importo', 'studio.nome', 'studio.piva'].sort())
  assert.ok(info.anteprima.includes('Spett.le {{destinatario.nome}}'))
  ok('importazione: file conservato nell’archivio, campi trovati in corpo, intestazione e piè di pagina (anche spezzati)')

  const r = word.compila(info.id, { 'destinatario.nome': 'Ezio Zanichelli', importo: '€ 1.250,00', 'studio.nome': 'Studio Legale Prova', 'studio.piva': '12345678903', 'pratica.numero': '2026/007' })
  const t = testo(r.buf)
  assert.ok(t.includes('Spett.le Ezio Zanichelli') && t.includes('Importo: € 1.250,00') && t.includes('Studio Legale Prova') && t.includes('P.IVA 12345678903'), t)
  assert.ok(t.includes('{{campo vuoto}}')); assert.deepEqual(r.mancanti, ['campo vuoto'])
  const z = leggiZip(r.buf), originale = leggiZip(carta)
  assert.deepEqual(z.nomi, originale.nomi)
  assert.ok(z.leggi('word/media/logo.png').equals(originale.leggi('word/media/logo.png')))
  assert.ok(z.leggi('word/footer1.xml').toString().includes('NUMPAGES') && z.leggi('word/styles.xml').equals(originale.leggi('word/styles.xml')))
  assert.ok(/<w:b\/>[\s\S]*Ezio Zanichelli/.test(z.leggi('word/document.xml').toString()), 'il campo eredita la formattazione del primo frammento')
  ok('compilazione: campi sostituiti, quelli senza valore restano tra graffe; stili, logo, intestazione e numeri di pagina intatti')

  const copia = word.duplica(info.id, 'word-copia-di-prova'); assert.equal(copia.campi.length, 5)
  const nuova = documento.genera('docx', { titolo: 'x', intestazione: [], footer: [], corpo: [{ tipo: 'p', runs: [{ t: 'Solo {{oggi}}' }] }] })
  assert.deepEqual(word.sostituisci(info.id, nuova).campi, ['oggi'])
  assert.equal(word.info('word-copia-di-prova').campi.length, 5)
  word.elimina(info.id); assert.throws(() => word.info(info.id), /non trovato/)
  assert.throws(() => word.importa(Buffer.from('non sono un docx'), 'x.docx'))
  ok('duplica, sostituisci ed elimina; un file che non è Word viene rifiutato')
} finally { db.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10 }) }
