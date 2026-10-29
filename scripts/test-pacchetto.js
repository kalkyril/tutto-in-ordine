'use strict'
// Il pacchetto esclude i file di PDF e OCR che l'app non usa (package.json › build.files). Questa prova controlla che i file
// caricati davvero in esecuzione NON siano tra gli esclusi: se un aggiornamento delle librerie cambia file, fallisce qui
// invece di rompere l'OCR o i PDF nell'app installata.
const assert = require('node:assert/strict'), path = require('node:path')
const mm = require('minimatch'), minimatch = mm.minimatch || mm // stessa libreria di confronto usata da electron-builder
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
const root = path.join(__dirname, '..')
const esclusioni = require('../package.json').build.files.filter((f) => f.startsWith('!')).map((f) => f.slice(1))
const relativo = (file) => path.relative(root, file).split(path.sep).join('/')
const escluso = (file) => esclusioni.some((p) => minimatch(relativo(file), p, { dot: true }))

;(async () => {
  // OCR: si carica il motore come fa tesseract.js in Node con createWorker('ita', 1) (lstmOnly vero)
  const prima = new Set(Object.keys(require.cache))
  await require('tesseract.js/src/worker-script/node/getCore')(true, undefined, { progress: () => {} })
  const caricati = Object.keys(require.cache).filter((f) => !prima.has(f) && /tesseract-core[^/\\]*\.js$/.test(f))
  assert.equal(caricati.length, 1, 'motore OCR caricato: ' + caricati)
  const motore = caricati[0], wasm = motore.replace(/\.js$/, '.wasm')
  assert.ok(!escluso(motore) && !escluso(wasm), `il motore OCR in uso (${path.basename(motore)}) è escluso dal pacchetto`)
  // anche le alternative per processori senza SIMD devono restare
  for (const variante of ['tesseract-core', 'tesseract-core-simd', 'tesseract-core-relaxedsimd'].map((v) => path.join(path.dirname(motore), v))) {
    if (path.basename(motore).includes('-lstm')) break // la libreria ha cambiato scelta: il controllo sopra basta a segnalarlo
    assert.ok(!escluso(variante + '.js') && !escluso(variante + '.wasm'), 'variante esclusa: ' + path.basename(variante))
  }
  ok(`OCR: il motore che Node carica (${path.basename(motore)}) e le sue alternative restano nel pacchetto`)

  const lingua = path.join(require('@tesseract.js-data/ita').langPath, 'ita.traineddata.gz')
  assert.ok(!escluso(lingua), 'modello italiano escluso: ' + relativo(lingua))
  ok('OCR: il modello della lingua italiana usato resta nel pacchetto')

  const pdf = require.resolve('pdfjs-dist/legacy/build/pdf.mjs'), worker = path.join(path.dirname(pdf), 'pdf.worker.mjs')
  for (const f of [pdf, worker]) assert.ok(!escluso(f), 'file PDF escluso: ' + relativo(f))
  for (const f of ['node_modules/pdfjs-dist/build/pdf.mjs', 'node_modules/tesseract.js-core/tesseract-core.wasm.js', 'node_modules/pdfjs-dist/legacy/build/pdf.mjs.map']) assert.ok(escluso(path.join(root, f)), 'dovrebbe essere escluso: ' + f)
  ok('PDF: lettore e worker usati restano; copie inutilizzate e file per sviluppatori esclusi')

  console.log(`\n${n} prove sul contenuto del pacchetto superate`)
})().catch((e) => { console.error(e); process.exit(1) })
