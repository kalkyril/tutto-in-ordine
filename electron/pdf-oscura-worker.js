'use strict'
// Anonimizza sui PDF: testo con la posizione di ogni parola, poi copia oscurata con l'impaginazione originale.
// Ogni pagina della copia è l'immagine della pagina originale con riquadri neri sui dati personali e il segnaposto
// scritto dentro. Il file nuovo non contiene il livello di testo, i metadati, i moduli o gli allegati dell'originale:
// nessun dato oscurato può essere recuperato copiando, cercando o rimuovendo i riquadri.
const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')

const SCALA = 2 // 144 dpi: testo leggibile e file di dimensioni ragionevoli
const MAX_PAGINE = 300

async function apriPdf(file) {
  if (fs.statSync(file).size > 60 * 1024 * 1024) throw new Error('Documento troppo grande (massimo 60 MB)')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // font standard (Helvetica, Times… non incorporati) e CMap: senza, pdf.js disegnerebbe con font sostitutivi di larghezza diversa
  // e il testo sull'immagine non starebbe dove dicono le posizioni, cioè sotto i riquadri
  const base = path.dirname(require.resolve('pdfjs-dist/package.json')).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1') + path.sep
  const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, maxImageSize: 40000000,
    // pdf.js vuole la barra «/» in fondo anche su Windows (con «\» rifiuta l'indirizzo): Node legge comunque i percorsi misti
    standardFontDataUrl: base + 'standard_fonts/', cMapUrl: base + 'cmaps/', cMapPacked: true })
  const doc = await task.promise
  if (doc.numPages > MAX_PAGINE) { await task.destroy(); throw new Error('Il PDF supera le 300 pagine: dividilo in parti più piccole') }
  return { pdfjs, task, doc }
}

/** Motore OCR italiano, creato solo se serve (come in document-worker.js). */
async function ocr() {
  const { createWorker } = require('tesseract.js')
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-ocr-modelli-'))
  const data = require('@tesseract.js-data/ita')
  fs.copyFileSync(path.join(data.langPath, 'ita.traineddata.gz'), path.join(cartella, 'ita.traineddata.gz'))
  const engine = await createWorker('ita', 1, { cacheMethod: 'none', langPath: cartella, workerPath: require.resolve('tesseract.js/src/worker-script/node/index.js') })
  return { engine, chiudi: async () => { await engine.terminate(); fs.rmSync(cartella, { recursive: true, force: true }) } }
}

async function disegna(page, viewport, pdfjs) {
  const { createCanvas } = require('@napi-rs/canvas')
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  // i moduli compilati vengono disegnati con il loro valore: anche quel testo entra nella mappa (vedi mappa())
  await page.render({ canvasContext: ctx, viewport, annotationMode: pdfjs.AnnotationMode.ENABLE }).promise
  return { canvas, ctx }
}

/**
 * Testo del PDF e, per ogni tratto di testo, il riquadro sulla pagina (in punti, origine in alto a sinistra).
 * pagine: [{ larghezza, altezza, pezzi: [{ s, e, x, y, w, h }] }]  — s/e sono posizioni nel testo restituito.
 */
async function mappa({ file, conOcr }) {
  const { pdfjs, task, doc } = await apriPdf(file)
  let motore = null
  try {
    let testo = ''
    const pagine = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), vp = page.getViewport({ scale: 1 })
      const pagina = { larghezza: vp.width, altezza: vp.height, pezzi: [] }
      const aggiungi = (str, box, aCapo) => {
        if (str) { pagina.pezzi.push({ s: testo.length, e: testo.length + str.length, ...box }); testo += str }
        testo += aCapo ? '\n' : ' '
      }
      const contenuto = await page.getTextContent()
      const conTesto = contenuto.items.some((it) => (it.str || '').trim())
      if (conTesto && !conOcr) {
        for (const it of contenuto.items) {
          const t = pdfjs.Util.transform(vp.transform, it.transform)
          const alt = Math.hypot(t[2], t[3]) || it.height || 10
          const w = Math.max(it.width * vp.scale, 1), str = it.str || ''
          aggiungi(str, { x: t[4], y: t[5] - alt, w, h: alt * 1.25, o: posizioni(str, w, contenuto.styles[it.fontName]?.fontFamily) }, it.hasEOL)
        }
      } else if (conOcr) {
        // pagina scansionata: si riconoscono le parole con la loro posizione sull'immagine
        motore ||= await ocr()
        const vpo = page.getViewport({ scale: SCALA })
        const { canvas } = await disegna(page, vpo, pdfjs)
        const r = await motore.engine.recognize(canvas.toBuffer('image/png'), {}, { blocks: true })
        for (const blocco of r.data.blocks || []) for (const par of blocco.paragraphs || []) {
          for (const riga of par.lines || []) {
            const parole = riga.words || []
            parole.forEach((w, i) => {
              // il riquadro dell'OCR aderisce alle lettere: un po' di margine copre ascendenti e discendenti
              const h = (w.bbox.y1 - w.bbox.y0) / SCALA
              aggiungi(w.text, { x: w.bbox.x0 / SCALA, y: w.bbox.y0 / SCALA - h * 0.2, w: (w.bbox.x1 - w.bbox.x0) / SCALA, h: h * 1.4 }, i === parole.length - 1)
            })
          }
          testo += '\n'
        }
      }
      // valori dei moduli e note: compaiono sulla pagina, quindi vanno analizzati come il resto del testo
      for (const a of await page.getAnnotations()) {
        const v = typeof a.fieldValue === 'string' ? a.fieldValue : Array.isArray(a.fieldValue) ? a.fieldValue.join(' ') : a.contentsObj?.str || ''
        if (!v.trim() || !a.rect) continue
        const [x1, y1, x2, y2] = vp.convertToViewportRectangle(a.rect)
        aggiungi(v.replace(/\s+/g, ' '), { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }, true)
      }
      testo += '\n'
      pagine.push(pagina)
      page.cleanup()
    }
    return { testo, pagine, stato: conOcr ? 'ocr' : pagine.some((p) => p.pezzi.length) ? 'testo' : 'scansione' }
  } finally { await task.destroy(); if (motore) await motore.chiudi() }
}

// Posizione di ogni carattere dentro un tratto di testo. Il PDF dà solo la larghezza dell'intero tratto: con una
// media uguale per tutti i caratteri il riquadro scivolerebbe e lascerebbe visibili pezzi del dato. Si misurano i
// caratteri in un font della stessa famiglia e si riportano le misure alla larghezza vera del tratto.
let misura = null
const cacheLarghezze = new Map()
function posizioni(str, larghezza, famiglia = 'sans-serif') {
  if (!str || str.length > 4000) return undefined
  if (!misura) misura = require('@napi-rs/canvas').createCanvas(8, 8).getContext('2d')
  // font con le metriche standard dei documenti (Arial e Helvetica coincidono; Liberation ha le stesse misure):
  // il generico «sans-serif» della libreria canvas ha maiuscole molto più strette e sposterebbe i riquadri
  const fam = /mono/i.test(famiglia) ? '"Courier New", Courier, "Liberation Mono", monospace'
    : /serif/i.test(famiglia) && !/sans/i.test(famiglia) ? '"Times New Roman", Times, "Liberation Serif", serif' : 'Arial, Helvetica, "Liberation Sans", sans-serif'
  const larghe = [...str].map((c) => {
    const k = fam + c
    if (!cacheLarghezze.has(k)) { misura.font = `100px ${fam}`; cacheLarghezze.set(k, misura.measureText(c).width || 50) }
    return cacheLarghezze.get(k)
  })
  const tot = larghe.reduce((a, b) => a + b, 0) || 1
  const o = [0]; let x = 0
  // un carattere fuori dal piano base (emoji) vale due unità di str: stessa posizione per entrambe
  for (const [i, c] of [...str].entries()) { x += larghe[i] * larghezza / tot; for (let k = 0; k < c.length; k++) o.push(Math.round(x * 10) / 10) }
  return o
}

/** Riquadri da coprire: per ogni dato, la parte di ogni tratto di testo che contiene. */
function riquadri(pagine, spans) {
  const out = pagine.map(() => [])
  pagine.forEach((p, i) => {
    for (const pz of p.pezzi) {
      const len = pz.e - pz.s
      for (const sp of spans) {
        const a = Math.max(sp.start, pz.s), b = Math.min(sp.end, pz.e)
        if (a >= b) continue
        // larghezza dei caratteri stimata in proporzione: si allarga di un carattere per lato per non lasciare pezzi di lettere
        const car = pz.w / Math.max(1, len)
        // margine di quasi un carattere per lato (di più con la stima media): meglio coprire uno spazio che lasciare un pezzo di lettera
        const x0 = pz.x + (pz.o ? pz.o[a - pz.s] - car * 0.9 : car * (a - pz.s) - car * 1.2) - 1
        const x1 = pz.x + (pz.o ? pz.o[b - pz.s] + car * 0.9 : car * (b - pz.s) + car * 1.2) + 1
        out[i].push({ x: x0, y: pz.y - 1, w: x1 - x0, h: pz.h + 2, ph: sp.ph, span: sp, primo: a === sp.start })
      }
    }
  })
  // le parole dello stesso dato sulla stessa riga diventano un solo riquadro: il segnaposto ha lo spazio per essere letto
  return out.map((zone) => {
    const unite = []
    for (const z of zone) {
      const u = unite.find((x) => x.span === z.span && Math.min(x.y + x.h, z.y + z.h) - Math.max(x.y, z.y) > Math.min(x.h, z.h) * 0.5 && z.x <= x.x + x.w + x.h * 1.5)
      if (!u) { unite.push({ ...z }); continue }
      const r = Math.max(u.x + u.w, z.x + z.w), b = Math.max(u.y + u.h, z.y + z.h)
      u.x = Math.min(u.x, z.x); u.y = Math.min(u.y, z.y); u.w = r - u.x; u.h = b - u.y; u.primo ||= z.primo
    }
    return unite.map(({ span, ...z }) => z)
  })
}

/** PDF minimo con una immagine JPEG per pagina, alle dimensioni originali. */
function scriviPdf(pagine) {
  const parti = [], offset = []
  let pos = 0
  const push = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1'); parti.push(buf); pos += buf.length }
  const obj = (n, corpo, flusso) => { offset[n] = pos; push(`${n} 0 obj\n${corpo}\n`); if (flusso) { push('stream\n'); push(flusso); push('\nendstream\n') } push('endobj\n') }
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  const n = pagine.length, kids = pagine.map((_, i) => `${4 + i * 3} 0 R`).join(' ')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`)
  obj(3, '<< /Producer (TIO) /Title (Documento anonimizzato) >>')
  pagine.forEach((p, i) => {
    const pg = 4 + i * 3, im = pg + 1, ct = pg + 2
    const w = p.larghezza.toFixed(2), h = p.altezza.toFixed(2)
    const contenuto = Buffer.from(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`)
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`)
    obj(im, `<< /Type /XObject /Subtype /Image /Width ${p.px} /Height ${p.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`, p.jpeg)
    obj(ct, `<< /Length ${contenuto.length} >>`, contenuto)
  })
  const xref = pos, tot = 4 + n * 3
  push(`xref\n0 ${tot}\n0000000000 65535 f \n${offset.slice(1, tot).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`)
  push(`trailer\n<< /Size ${tot} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return Buffer.concat(parti)
}

async function oscura({ file, mappa: m, spans }) {
  const { pdfjs, task, doc } = await apriPdf(file)
  try {
    if (doc.numPages !== m.pagine.length) throw new Error('Il PDF è cambiato dopo l’apertura: aprilo di nuovo in Anonimizza')
    const zone = riquadri(m.pagine, spans)
    const uscita = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), vp = page.getViewport({ scale: SCALA })
      const { canvas, ctx } = await disegna(page, vp, pdfjs)
      for (const z of zone[n - 1]) {
        const x = z.x * SCALA, y = z.y * SCALA, w = z.w * SCALA, h = z.h * SCALA
        ctx.fillStyle = '#111111'; ctx.fillRect(x, y, w, h)
        if (!z.primo || h < 9) continue
        // il segnaposto dentro il riquadro: chi legge sa che cosa c'era e può ripristinarlo con la chiave
        let corpo = Math.min(h * 0.72, 26)
        ctx.font = `${corpo}px sans-serif`
        while (corpo > 7 && ctx.measureText(z.ph).width > w - 4) { corpo -= 1; ctx.font = `${corpo}px sans-serif` }
        if (ctx.measureText(z.ph).width > w - 2) continue
        ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(z.ph, x + 2, y + h / 2)
      }
      uscita.push({ larghezza: page.getViewport({ scale: 1 }).width, altezza: page.getViewport({ scale: 1 }).height, px: canvas.width, py: canvas.height, jpeg: canvas.toBuffer('image/jpeg', 85) })
      page.cleanup()
    }
    return { pdf: scriviPdf(uscita), riquadri: zone.reduce((a, z) => a + z.length, 0) }
  } finally { await task.destroy() }
}

if (parentPort) {
  const azione = workerData.azione === 'oscura' ? oscura : mappa
  azione(workerData).then((r) => parentPort.postMessage(r)).catch((e) => parentPort.postMessage({ error: e.message }))
}
module.exports = { riquadri, scriviPdf }
