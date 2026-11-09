// Novità 1.0.2: scadenzario e torta dei pagamenti, recapiti multipli in anagrafica, testo incollato con capitoli e tabelle,
// nuove colonne dell'archivio (titolo, SDI, recapiti, tariffa da decidere, contabile) e compressione dei PDF.
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'

const require = createRequire(import.meta.url)
// fileURLToPath e non URL.pathname: su Windows pathname dà «/D:/…» e il percorso diventa «D:\D:\…»
const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-102-'))
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: { pagamenti: 'src/lib/pagamenti.ts', recapiti: 'src/lib/recapiti.ts', documento: 'src/lib/documento.ts' }, formats: ['es'], fileName: (_f, nome) => `${nome}.mjs` }, outDir: out, emptyOutDir: false, minify: false } })
const pag = await import(pathToFileURL(path.join(out, 'pagamenti.mjs')).href)
const rec = await import(pathToFileURL(path.join(out, 'recapiti.mjs')).href)
const doc = await import(pathToFileURL(path.join(out, 'documento.mjs')).href)
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)
try {
  // ---------- scadenzario
  const fattura = (o) => ({ id: 1, tipo: 'parcella', stato: 'emessa', numero: '1/2026', data: '2026-10-01', netto: 1000, incassato: 0, incassi_dettagliati: 0, pratica_id: 7, cliente_id: 3, ...o })
  const parcelle = [
    fattura({ id: 1 }), // da incassare entro il 31/10 (30 giorni)
    fattura({ id: 2, numero: '2/2026', stato: 'pagata', data_pagamento: '2026-11-05', netto: 500 }),
    fattura({ id: 3, numero: '3/2026', incassato: 200, scadenza_pagamento: '2026-12-15', data_pagamento: '2026-11-20' }), // acconto + residuo
    fattura({ id: 4, numero: '4/2026', incassi_dettagliati: 1, incassato: 300, netto: 900, scadenza_pagamento: '2026-11-30' }),
    fattura({ id: 5, stato: 'bozza' }), fattura({ id: 6, tipo: 'preventivo' }), fattura({ id: 9, stato: 'annullata' }),
  ]
  const costi = [
    { id: 1, pratica_id: 7, fornitore_id: null, data: '2026-11-02', descrizione: 'Perizia', categoria: 'Consulenti', importo: 400, scadenza: '2026-11-10', pagata: 0 },
    { id: 2, pratica_id: null, fornitore_id: null, data: '2026-11-03', descrizione: 'Affitto', categoria: 'Affitto', importo: 700, scadenza: null, pagata: 1 },
  ]
  const pagamenti = [{ id: 1, parcella_id: 4, data: '2026-11-12', importo: 300, metodo: 'Bonifico' }]
  const m = pag.movimenti(parcelle, costi, pagamenti, '2026-11-09')
  assert.deepEqual(m.map((x) => `${x.data}:${x.stato}:${x.importo}${x.scaduto ? '!' : ''}`), ['2026-10-31:da_incassare:1000!', '2026-11-03:pagate:700', '2026-11-05:incassate:500', '2026-11-10:da_pagare:400', '2026-11-12:incassate:300', '2026-11-20:incassate:200', '2026-11-30:da_incassare:600', '2026-12-15:da_incassare:800'])
  assert.ok(m.some((x) => x.stato === 'da_incassare' && x.data === '2026-12-15' && x.importo === 800), 'residuo dopo l’acconto alla scadenza')
  assert.ok(m.find((x) => x.data === '2026-10-31').scaduto, 'da incassare scaduto')
  assert.ok(!m.some((x) => [5, 6, 9].includes(x.parcella?.id)), 'bozze, preventivi e annullati esclusi')
  const mesi = pag.perMese(m)
  assert.deepEqual(mesi.map((x) => x.mese), ['2026-10', '2026-11', '2026-12'])
  const nov = mesi[1]
  assert.deepEqual(nov.totali, { incassate: 1000, da_incassare: 600, pagate: 700, da_pagare: 400 })
  assert.equal(nov.saldo, 300); assert.equal(nov.previsto, 500)
  ok('scadenzario: incassi dal registro o dalla data di pagamento, residui alla scadenza, voci da pagare, totali e saldo per mese')
  const t = pag.ripartizione(m.filter((x) => x.pratica_id === 7))
  const fette = pag.spicchi(t)
  assert.equal(Math.round(fette[fette.length - 1].a), 360)
  assert.ok(fette.every((f) => f.a > f.da))
  assert.match(pag.arco(0, 90), /^M50\.000 4\.000A46 46 0 0 1 96\.000 50\.000L76\.000 50\.000A26 26 0 0 0 50\.000 24\.000Z$/)
  assert.match(pag.arco(0, 360), /^M50 4A46/)
  assert.deepEqual(pag.coloriMovimento({ colori_pagamenti: { incassate: '#112233', pagate: 'rosso' } }), { ...pag.COLORI_MOVIMENTO, incassate: '#112233' })
  ok('torta della pratica: spicchi fino a 360°, percorso SVG, colori personalizzati con quelli predefiniti come riserva')

  // ---------- recapiti
  const r = rec.leggiRecapiti({ telefono: '333 1', email: 'a@b.it', recapiti: JSON.stringify({ telefoni: [{ etichetta: 'Cellulare', valore: '333 1' }, { etichetta: 'Studio', valore: '059 2' }], email: [{ etichetta: 'Personale', valore: 'a@b.it' }] }) })
  assert.deepEqual(r.telefoni.map((x) => x.etichetta), ['Cellulare', 'Studio'])
  assert.deepEqual(rec.leggiRecapiti({ telefono: '0591', email: '' }), { telefoni: [{ etichetta: 'Cellulare', valore: '0591' }], email: [] }, 'contatti delle versioni precedenti')
  const scritto = rec.scriviRecapiti({ telefoni: [{ etichetta: 'Fisso', valore: ' 059 3 ' }, { etichetta: 'X', valore: '' }], email: [{ etichetta: 'Amministrazione', valore: 'amm@x.it' }, { etichetta: 'PEC privata', valore: 'p@x.it' }] })
  assert.equal(scritto.telefono, '059 3'); assert.equal(scritto.email, 'amm@x.it')
  assert.deepEqual(JSON.parse(scritto.recapiti), { telefoni: [{ etichetta: 'Fisso', valore: '059 3' }], email: [{ etichetta: 'Amministrazione', valore: 'amm@x.it' }, { etichetta: 'PEC privata', valore: 'p@x.it' }] })
  assert.deepEqual(rec.scriviRecapiti({ telefoni: [], email: [] }), { recapiti: null, telefono: '', email: '' })
  assert.equal(rec.nomeConTitolo({ tipo: 'persona', titolo: 'Ing.', denominazione: 'Mario Rossi' }), 'Ing. Mario Rossi')
  assert.equal(rec.nomeConTitolo({ tipo: 'azienda', titolo: 'Ing.', denominazione: 'Rossi S.r.l.' }), 'Rossi S.r.l.')
  const L = { cliente: 'Cliente', controparte: 'Fornitore / Altro' }
  assert.deepEqual(rec.ruoliAnagrafica('ditta', L).map((x) => x.id), ['cliente', 'fornitore', 'collaboratore', 'altro'])
  assert.deepEqual(rec.ruoliAnagrafica('avvocato', { cliente: 'Cliente', controparte: 'Controparte' }).map((x) => x.id), ['cliente', 'controparte', 'altro'])
  assert.equal(rec.nomeRuolo('controparte', 'ditta', L), 'Fornitore / Altro')
  ok('anagrafica: più telefoni ed email con etichetta, campi principali compatibili, titolo, ruoli per profilo')

  // ---------- testo incollato
  const b = doc.blocchiDaTestoStrutturato(['CAPITOLO 1', 'Premesse generali', '', '1.1 Oggetto del contratto', 'Il presente contratto', 'disciplina la fornitura.', '', '- primo punto', '- secondo **importante**', 'a) lettera', '', 'Voce\tImporto', 'Consulenza\t1.000', 'Spese\t50', '', 'ART. 2 - DURATA', '> citazione', '# Titolo md'].join('\n'))
  assert.deepEqual(b.map((x) => x.tipo), ['h1', 'p', 'h3', 'p', 'ul', 'ul', 'ol', 'table', 'h2', 'quote', 'h1'])
  assert.equal(b[3].runs.map((x) => x.t).join(''), 'Il presente contratto disciplina la fornitura.')
  assert.deepEqual(b[5].runs, [{ t: 'secondo ' }, { t: 'importante', b: true }])
  assert.equal(b[7].celle.length, 3); assert.equal(b[7].celle[1][1][0].t, '1.000')
  const md = doc.blocchiDaTestoStrutturato('| A | B |\n| --- | --- |\n| 1 | 2 |')
  assert.equal(md[0].tipo, 'table'); assert.equal(md[0].intestazione, true); assert.equal(md[0].celle.length, 2)
  assert.equal(doc.nomeCampoValido('n.giorni'), true); assert.equal(doc.nomeCampoValido('a{b'), false); assert.equal(doc.nomeCampoValido(''), false)
  assert.equal(doc.ptDa('18px'), 13.5); assert.equal(doc.ptDa('x-large'), 18); assert.equal(doc.ptDa('200pt'), undefined)
  assert.equal(doc.coloreDa('rgb(255, 0, 0)'), '#ff0000'); assert.equal(doc.coloreDa('#000'), undefined); assert.equal(doc.coloreDa('rgba(0,0,0,0)', true), undefined)
  ok('testo incollato: capitoli, titoli numerati, elenchi, tabelle con tabulazioni o Markdown, citazioni, grassetto; campi personalizzati, dimensioni e colori')

  // ---------- archivio: colonne nuove
  const db = require(path.join(radice, 'electron/db'))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-102-db-'))
  db.open(path.join(tmp, 'dati'))
  const a = db.save('anagrafica', { denominazione: 'Mario Rossi', ruolo: 'collaboratore', titolo: 'Ing.', sdi: 'M5UXCR1', recapiti: scritto.recapiti, telefono: scritto.telefono })
  assert.equal(a.titolo, 'Ing.'); assert.equal(a.sdi, 'M5UXCR1'); assert.equal(a.ruolo, 'collaboratore'); assert.equal(JSON.parse(a.recapiti).email.length, 2)
  const pr = db.save('pratiche', { titolo: 'Commessa', colore: '#000000' })
  const ora = db.save('ore', { pratica_id: pr.id, data: '2026-11-09', minuti: 90, descrizione: 'Sopralluogo', tariffa_oraria: 0, tariffa_da_decidere: 1 })
  assert.equal(ora.tariffa_da_decidere, 1)
  assert.ok(db.getDb().prepare('PRAGMA table_info(costi)').all().some((c) => c.name === 'contabile'))
  assert.equal(db.getDb().prepare('PRAGMA user_version').get().user_version, 6)
  db.close()
  ok('archivio: titolo, SDI, recapiti, ruolo collaboratore, tariffa da decidere e contabile; schema 6')

  // ---------- Comprimi PDF
  const { PDFDocument, StandardFonts } = require('pdf-lib')
  const { createCanvas } = require('@napi-rs/canvas')
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
  const c = createCanvas(2400, 1600), g = c.getContext('2d')
  for (let i = 0; i < 3000; i++) { g.fillStyle = `hsl(${(i * 37) % 360},70%,${30 + (i % 40)}%)`; g.fillRect((i * 97) % 2400, (i * 53) % 1600, 70, 50) }
  const img = await pdf.embedJpg(await c.encode('jpeg', 97))
  const pagina = pdf.addPage([595, 842]); pagina.drawText('Atto di citazione, pagina di prova', { x: 50, y: 780, size: 16, font }); pagina.drawImage(img, { x: 50, y: 300, width: 495, height: 330 })
  const file = path.join(tmp, 'atto.pdf'); fs.writeFileSync(file, await pdf.save({ useObjectStreams: false }))
  const comprimi = (livello, uscita) => new Promise((res, rej) => { const w = new Worker(path.join(radice, 'electron/pdf-comprimi-worker.js'), { workerData: { file, uscita, livello } }); w.on('message', (x) => { if (x.avanzamento) return; w.terminate(); x.error ? rej(new Error(x.error)) : res(x.esito) }); w.on('error', rej) })
  const esiti = {}
  for (const l of ['minima', 'media', 'massima']) esiti[l] = await comprimi(l, path.join(tmp, `atto-${l}.pdf`))
  assert.ok(esiti.minima.dopo < esiti.minima.prima && esiti.media.dopo < esiti.minima.dopo && esiti.massima.dopo < esiti.media.dopo, JSON.stringify(esiti))
  assert.ok(esiti.massima.dopo < esiti.massima.prima / 3)
  const pdfjs = await import(pathToFileURL(path.join(radice, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href)
  const letto = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(tmp, 'atto-massima.pdf'))), standardFontDataUrl: path.join(radice, 'node_modules/pdfjs-dist/standard_fonts') + '/', verbosity: 0 }).promise
  assert.match((await (await letto.getPage(1)).getTextContent()).items.map((x) => x.str).join(''), /Atto di citazione/)
  assert.ok(fs.readFileSync(file).length === esiti.media.prima, 'originale intatto')
  // un PDF già leggero non diventa più pesante
  const vuoto = await PDFDocument.create(); vuoto.addPage(); const fv = path.join(tmp, 'leggero.pdf'); fs.writeFileSync(fv, await vuoto.save())
  const ev = await new Promise((res, rej) => { const w = new Worker(path.join(radice, 'electron/pdf-comprimi-worker.js'), { workerData: { file: fv, uscita: path.join(tmp, 'leggero-c.pdf'), livello: 'massima' } }); w.on('message', (x) => { if (x.avanzamento) return; w.terminate(); x.error ? rej(new Error(x.error)) : res(x.esito) }); w.on('error', rej) })
  assert.ok(ev.dopo <= ev.prima)
  // un file che non è un PDF
  fs.writeFileSync(path.join(tmp, 'finto.pdf'), 'non sono un pdf')
  await assert.rejects(new Promise((res, rej) => { const w = new Worker(path.join(radice, 'electron/pdf-comprimi-worker.js'), { workerData: { file: path.join(tmp, 'finto.pdf'), uscita: path.join(tmp, 'x.pdf'), livello: 'media' } }); w.on('message', (x) => { if (x.avanzamento) return; w.terminate(); x.error ? rej(new Error(x.error)) : res(x.esito) }); w.on('error', rej) }), /non è un PDF/)
  ok(`Comprimi PDF: ${Math.round(esiti.minima.prima / 1024)} KB → minima ${Math.round(esiti.minima.dopo / 1024)}, media ${Math.round(esiti.media.dopo / 1024)}, massima ${Math.round(esiti.massima.dopo / 1024)} KB; testo leggibile, originale intatto, mai più pesante, file non PDF rifiutati`)
  fs.rmSync(tmp, { recursive: true, force: true })
} finally { fs.rmSync(out, { recursive: true, force: true }) }
