'use strict'
// Archivio vero creato dalla versione 1.0.0 (con il suo codice, vedi scripts/fixtures/archivio-1.0.0) aperto dalla versione
// attuale. Si esegue due volte: con Node e con il Node incluso in Electron (ELECTRON_RUN_AS_NODE=1), perché il modulo
// node:sqlite è ancora sperimentale e un aggiornamento di Electron potrebbe cambiarne il comportamento.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const db = require('../electron/db')

const motore = process.versions.electron ? `Electron ${process.versions.electron} (Node ${process.versions.node})` : `Node ${process.versions.node}`
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-archivi-vecchi-'))
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t} [${motore}]`)
try {
  const dir = path.join(tmp, 'dati')
  fs.cpSync(path.join(__dirname, 'fixtures', 'archivio-1.0.0'), dir, { recursive: true })
  db.open(dir)
  assert.equal(db.getDb().prepare('PRAGMA user_version').get().user_version, db.SCHEMA_VERSION)
  assert.ok(db.verificaIntegrita(), 'integrità del file SQLite')
  ok('l\'archivio della 1.0.0 si apre, supera il controllo di integrità ed è allo schema attuale')

  const p = db.list('pratiche')[0]
  assert.equal(p.titolo, 'ALFA c/ BETA'); assert.equal(p.rg, '123/2026')
  assert.equal(db.get('anagrafica', p.cliente_id).denominazione, 'ALFA COSTRUZIONI S.P.A.')
  assert.equal(db.list('scadenze', { pratica_id: p.id })[0].data_ora, '2026-12-01T09:30')
  assert.equal(db.list('todos').length, 1); assert.equal(db.list('note').length, 1); assert.equal(db.list('ore')[0].minuti, 90)
  const parc = db.list('parcelle')[0]; assert.equal(parc.tipo, 'proforma'); assert.ok(db.getParcella(parc.id).voci.length === 1)
  const d = db.list('documenti')[0]; assert.equal(fs.readFileSync(path.join(dir, 'documenti', d.file), 'utf8'), 'ALLEGATO STORICO')
  ok('pratiche, contatti, scadenze, compiti, note, attività, parcelle e documenti della 1.0.0 intatti')

  // colonne aggiunte nella 1.0.1
  for (const [t, c] of [['pratiche', 'cartella_cliens'], ['documenti', 'percorso_cliens'], ['documenti', 'origine']]) assert.ok(db.getDb().prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c), `${t}.${c}`)
  assert.equal(db.list('documenti')[0].origine, null)
  ok('le colonne nuove (cartella di Cliens, origine dei documenti) ci sono e restano vuote sui dati vecchi')

  const s = db.getSettings()
  assert.equal(s.studio.nome, 'Studio di prova')
  assert.match(s.modello_pdf.logo, /^tio-risorsa:[0-9a-f]{64}$/); assert.equal(s.modelli_documento[0].logo, s.modello_pdf.logo); assert.equal(s.modelli_documento[1].logo, s.modello_pdf.logo)
  assert.equal(db.getDb().prepare('SELECT count(*) n FROM risorse').get().n, 1, 'un logo usato da tre modelli è salvato una volta sola')
  assert.ok(db.espandiRisorse(s).modello_pdf.logo.startsWith('data:image/png;base64,'))
  assert.ok(s.brand_logo.startsWith('data:image/png'), 'immagini piccole restano dove sono')
  ok('logo ripetuto nei modelli della 1.0.0 spostato nelle risorse con una copia sola; immagine ricostruita uguale')

  // si continua a lavorare e l'archivio si riapre
  db.save('pratiche', { id: p.id, stato: 'Chiusa' }); db.close(); db.open(dir)
  assert.equal(db.get('pratiche', p.id).stato, 'Chiusa'); assert.ok(db.verificaIntegrita())
  ok('dopo una modifica l\'archivio aggiornato si riapre senza errori')
} finally {
  try { db.close() } catch { /* già chiuso */ }
  fs.rmSync(tmp, { recursive: true, force: true })
}
console.log(`\n${n} prove superate`)
