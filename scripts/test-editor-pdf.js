'use strict'
// Editor PDF: unire, dividire e modificare (ordine, rotazione, pagine bianche, testo, riquadri, immagini, numeri di pagina),
// intervalli di pagine, coordinate con le pagine ruotate, PDF che pdf-lib non legge ricostruiti come immagini, compressione.
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { Worker } = require('node:worker_threads')
const { PDFDocument, StandardFonts, degrees } = require('pdf-lib')
const strumenti = require('../electron/pdf-strumenti')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-editor-pdf-'))
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)

async function crea(nome, pagine, opzioni = {}) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pagine; i++) { const p = doc.addPage(opzioni.formato || [595, 842]); p.drawText(`${nome} pagina ${i}`, { x: 60, y: 760, size: 18, font }); if (opzioni.rot) p.setRotation(degrees(opzioni.rot)) }
  const file = path.join(dir, `${nome}.pdf`); fs.writeFileSync(file, await doc.save()); return file
}
async function testi(file) {
  const { task, doc } = await strumenti.apriPdfjs(fs.readFileSync(file))
  const out = []
  for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); out.push((await p.getTextContent()).items.map((x) => x.str).join(' ')) }
  await task.destroy(); return out
}
const pagineDi = async (file) => (await PDFDocument.load(fs.readFileSync(file))).getPages()

;(async () => {
  const a = await crea('Alfa', 3), b = await crea('Beta', 2), ruotato = await crea('Ruotato', 1, { rot: 90 })

  // ---- intervalli
  assert.deepEqual(strumenti.leggiIntervalli('1-3, 5, 8-', 10), [[1, 3], [5, 5], [8, 10]])
  assert.deepEqual(strumenti.leggiIntervalli('-2; 4–3', 10), [[1, 2], [3, 4]])
  assert.throws(() => strumenti.leggiIntervalli('12', 10), /non esiste/)
  assert.throws(() => strumenti.leggiIntervalli('abc', 10), /non valido/)
  ok('intervalli di pagine: singole, aperti, invertiti; errori chiari')

  // ---- unisci
  const unito = path.join(dir, 'unito.pdf')
  const u = await strumenti.unisci({ file: [{ percorso: a }, { percorso: b }], uscita: unito })
  assert.equal(u.pagine, 5)
  assert.deepEqual((await testi(unito)).map((t) => t.trim()), ['Alfa pagina 1', 'Alfa pagina 2', 'Alfa pagina 3', 'Beta pagina 1', 'Beta pagina 2'])
  await assert.rejects(strumenti.unisci({ file: [{ percorso: a }], uscita: unito }), /almeno due/)
  ok('unisci: pagine nell’ordine dei file, testo ancora selezionabile')

  // ---- dividi
  const parti = path.join(dir, 'parti'); fs.mkdirSync(parti)
  const d1 = await strumenti.dividi({ percorso: unito, modo: 'pagine', cartella: parti })
  assert.equal(d1.creati.length, 5); assert.ok(d1.creati.every((c) => c.pagine === 1 && fs.existsSync(c.percorso)))
  assert.equal(d1.creati[2].nome, 'unito (pagina 3).pdf')
  const d2 = await strumenti.dividi({ percorso: unito, modo: 'ogni', ogni: 2, cartella: parti })
  assert.deepEqual(d2.creati.map((c) => c.pagine), [2, 2, 1])
  const d3 = await strumenti.dividi({ percorso: unito, modo: 'intervalli', intervalli: '1-2, 5', cartella: parti })
  assert.deepEqual(d3.creati.map((c) => c.nome), ['unito (pagine 1-2) 2.pdf', 'unito (pagina 5) 3.pdf']) // nomi già usati: non si sovrascrive
  const d4 = await strumenti.dividi({ percorso: unito, modo: 'intervalli', intervalli: '4-5, 1', unico: true, cartella: parti })
  assert.equal(d4.creati.length, 1); assert.deepEqual((await testi(d4.creati[0].percorso)).map((t) => t.trim()), ['Beta pagina 1', 'Beta pagina 2', 'Alfa pagina 1'])
  ok('dividi: una pagina per file, ogni N pagine, intervalli, estratto in un file solo; nessun file sovrascritto')

  // ---- modifica: ordine, eliminazione, duplicato, pagina bianca, rotazione, inserimento da un altro file
  const mod = path.join(dir, 'modificato.pdf')
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const m = await strumenti.modifica({ uscita: mod, fonti: [{ percorso: a }, { percorso: b }], numeri: { posizione: 'basso-centro', formato: 'pagina', pt: 10, da: 1 }, pagine: [
    { fonte: 0, n: 2, rot: 0, elementi: [{ tipo: 'testo', x: 0.1, y: 0.2, testo: 'Nota aggiunta\nseconda riga → ok', pt: 14, colore: '#cc0000', grassetto: true }] },
    { fonte: 1, n: 0, rot: 90, elementi: [{ tipo: 'rett', x: 0.1, y: 0.1, w: 0.3, h: 0.05, colore: '#ffff00', opacita: 0.4 }, { tipo: 'immagine', x: 0.5, y: 0.5, w: 0.2, h: 0.1, dati: png }] },
    { bianca: true, w: 595, h: 842, elementi: [{ tipo: 'testo', x: 0.2, y: 0.4, testo: 'Pagina nuova', pt: 20, font: 'times' }] },
    { fonte: 0, n: 2, rot: 180, elementi: [] },
  ] })
  assert.equal(m.pagine, 4)
  const tm = await testi(mod)
  assert.match(tm[0], /Alfa pagina 3/); assert.match(tm[0], /Nota aggiunta/); assert.match(tm[0], /seconda riga \? ok/); assert.match(tm[0], /Pagina 1 di 4/)
  assert.match(tm[1], /Beta pagina 1/); assert.match(tm[2], /Pagina nuova/); assert.match(tm[3], /Alfa pagina 3/); assert.doesNotMatch(tm[3], /Nota aggiunta/)
  const pm = await pagineDi(mod)
  assert.deepEqual(pm.map((p) => p.getRotation().angle), [0, 90, 0, 180])
  ok('modifica: pagine riordinate, duplicate, ruotate, bianche, da più file; testo, riquadri, immagini e numeri di pagina')

  // ---- modifica senza cambiare le pagine: il documento resta quello (stesso numero di pagine, stesse rotazioni)
  const sulPosto = path.join(dir, 'annotato.pdf')
  await strumenti.modifica({ uscita: sulPosto, fonti: [{ percorso: ruotato }], numeri: null, pagine: [{ fonte: 0, n: 0, rot: 0, elementi: [{ tipo: 'testo', x: 0.05, y: 0.05, testo: 'In alto a sinistra', pt: 12 }] }] })
  assert.match((await testi(sulPosto))[0], /In alto a sinistra/)
  assert.equal((await pagineDi(sulPosto))[0].getRotation().angle, 90)
  ok('modifica sul documento così com’è: pagina ruotata, testo aggiunto')

  // ---- coordinate: l'angolo in alto a sinistra della pagina vista resta tale con ogni rotazione
  const box = { x: 0, y: 0, width: 600, height: 800 }
  assert.deepEqual(strumenti.puntoPdf(0, 0, box, 0), { x: 0, y: 800, W: 600, H: 800 })
  assert.deepEqual(strumenti.puntoPdf(0, 0, box, 90), { x: 0, y: 0, W: 800, H: 600 })
  assert.deepEqual(strumenti.puntoPdf(0, 0, box, 180), { x: 600, y: 0, W: 600, H: 800 })
  assert.deepEqual(strumenti.puntoPdf(0, 0, box, 270), { x: 600, y: 800, W: 800, H: 600 })
  assert.deepEqual(strumenti.puntoPdf(1, 1, box, 90), { x: 600, y: 800, W: 800, H: 600 })
  ok('coordinate della pagina vista → coordinate PDF con rotazioni di 0, 90, 180 e 270 gradi')

  // ---- un PDF che pdf-lib non apre (qui: senza tabella degli oggetti leggibile da pdf-lib ma letto da pdf.js) non blocca gli strumenti
  const nonPdf = path.join(dir, 'testo.pdf'); fs.writeFileSync(nonPdf, 'questo non è un PDF')
  await assert.rejects(strumenti.unisci({ file: [{ percorso: a }, { percorso: nonPdf }], uscita: unito }), /non è un PDF/)
  await assert.rejects(strumenti.dividi({ percorso: path.join(dir, 'assente.pdf'), modo: 'pagine', cartella: parti }), /non si trova/)
  ok('file che non sono PDF o che non ci sono più: messaggio chiaro, nessun file scritto a metà')

  // ---- anteprima delle pagine (miniature) e compressione nel processo separato
  const { task, doc } = await strumenti.apriPdfjs(fs.readFileSync(ruotato))
  const mini = await strumenti.disegnaPagina(doc, 1, { larghezza: 200 })
  assert.equal(mini.canvas.width, 200); assert.ok(mini.canvas.height < 200, 'la pagina ruotata di 90° si vede orizzontale')
  const girata = await strumenti.disegnaPagina(doc, 1, { larghezza: 200, rotazione: 90 })
  assert.ok(girata.canvas.height > 200); await task.destroy()
  const compresso = path.join(dir, 'compresso.pdf')
  const esito = await new Promise((resolve, reject) => { const w = new Worker(path.join(__dirname, '..', 'electron', 'pdf-comprimi-worker.js'), { workerData: { file: unito, uscita: compresso, livello: 'media' } }); w.on('message', (r) => { if (r.avanzamento) return; r.error ? reject(new Error(r.error)) : resolve(r.esito) }); w.once('error', reject) })
  assert.equal(esito.pagine, 5); assert.ok(fs.statSync(compresso).size <= fs.statSync(unito).size); assert.equal((await testi(compresso)).length, 5)
  ok('miniature con la rotazione giusta; il compressore lavora sui file prodotti dagli altri strumenti')

  fs.rmSync(dir, { recursive: true, force: true })
  console.log(`\n${n} prove superate`)
})().catch((e) => { console.error(e); process.exit(1) })
