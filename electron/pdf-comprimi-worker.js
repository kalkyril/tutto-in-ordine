'use strict'
// Comprimi PDF: copia più leggera di un PDF, tutto sul computer. Il testo resta testo (selezionabile e ricercabile):
// si ricomprimono le immagini (foto e scansioni) in JPEG con la qualità e la risoluzione del livello scelto, si
// comprimono i flussi lasciati senza compressione, si tolgono gli oggetti non più usati (vecchie versioni dopo
// salvataggi successivi) e si scrive il file con le strutture compatte di PDF 1.5. Con «massima» via anche miniature
// e metadati XMP. L'originale non viene mai modificato: si scrive un file nuovo accanto o dove sceglie l'utente.
const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs')
const zlib = require('node:zlib')

/** Livelli: lato lungo massimo delle immagini (pixel) e qualità JPEG. */
const LIVELLI = {
  minima: { lato: 2600, qualita: 85, soglia: 0.92, togliMetadati: false },
  media: { lato: 1800, qualita: 72, soglia: 0.95, togliMetadati: false },
  massima: { lato: 1200, qualita: 55, soglia: 0.98, togliMetadati: true },
}
const MAX_BYTE = 300 * 1024 * 1024

function avanza(fatto, totale, fase) { parentPort.postMessage({ avanzamento: { fatto, totale, fase } }) }

/** PNG predictors (DecodeParms /Predictor ≥ 10): righe filtrate come nel formato PNG. */
function togliPredittore(dati, colonne, colori, bpc) {
  const bpp = Math.max(1, Math.ceil(colori * bpc / 8)), riga = Math.ceil(colonne * colori * bpc / 8)
  const righe = Math.floor(dati.length / (riga + 1)), out = Buffer.alloc(righe * riga)
  for (let y = 0; y < righe; y++) {
    const tipo = dati[y * (riga + 1)], src = y * (riga + 1) + 1, dst = y * riga
    for (let x = 0; x < riga; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - riga + x] : 0, c = x >= bpp && y ? out[dst - riga + x - bpp] : 0
      let v = dati[src + x]
      if (tipo === 1) v += a; else if (tipo === 2) v += b; else if (tipo === 3) v += (a + b) >> 1
      else if (tipo === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      out[dst + x] = v & 255
    }
  }
  return out
}

async function comprimi({ file, uscita, livello }) {
  const L = LIVELLI[livello] || LIVELLI.media
  const st = fs.statSync(file)
  if (st.size > MAX_BYTE) throw new Error('Il PDF supera i 300 MB')
  const { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFArray, PDFRef, PDFNumber, PDFStream } = require('pdf-lib')
  const { createCanvas, loadImage } = require('@napi-rs/canvas')
  const originale = fs.readFileSync(file)
  if (originale.subarray(0, 1024).indexOf('%PDF') < 0) throw new Error('Il file non è un PDF')
  avanza(0, 1, 'lettura')
  let doc
  try { doc = await PDFDocument.load(originale, { updateMetadata: false, throwOnInvalidObject: false }) }
  catch (e) { throw new Error(/encrypt/i.test(e.message) ? 'Il PDF è protetto da password: rimuovi la protezione e riprova' : 'PDF non leggibile: ' + e.message) }
  const ctx = doc.context
  const nome = (d, k) => { const v = d.get(PDFName.of(k)); const r = v instanceof PDFRef ? ctx.lookup(v) : v; return r }
  const nomeStr = (v) => (v && v.asString ? v.asString() : v && v.toString ? v.toString() : '')
  const numero = (d, k) => { const v = nome(d, k); return v instanceof PDFNumber ? v.asNumber() : Number(v?.toString?.()) }
  const filtri = (d) => { const f = nome(d, 'Filter'); if (!f) return []; if (f instanceof PDFArray) return f.asArray().map((x) => nomeStr(x instanceof PDFRef ? ctx.lookup(x) : x)); return [nomeStr(f)] }
  const esito = { immagini: 0, ricompresse: 0, flussi: 0, tolti: 0 }

  // 1) immagini
  const oggetti = ctx.enumerateIndirectObjects()
  const immagini = oggetti.filter(([, o]) => o instanceof PDFRawStream && nomeStr(nome(o.dict, 'Subtype')) === '/Image')
  esito.immagini = immagini.length
  let n = 0
  for (const [ref, o] of immagini) {
    avanza(++n, immagini.length, 'immagini')
    try {
      const d = o.dict, f = filtri(d), w = numero(d, 'Width'), h = numero(d, 'Height')
      if (!w || !h || w * h > 60e6 || nome(d, 'ImageMask')?.toString() === 'true' || nome(d, 'Decode')) continue
      // spazio colore: RGB o grigi (anche ICC con 1 o 3 componenti); CMYK, Lab, indicizzati e maschere restano come sono
      let cs = nome(d, 'ColorSpace'), comp = 0
      if (cs instanceof PDFArray) { const a = cs.asArray(); const t = nomeStr(a[0]); if (t === '/ICCBased') { const icc = ctx.lookup(a[1]); comp = icc ? numero(icc.dict, 'N') : 0 } else comp = 0 }
      else { const t = nomeStr(cs); comp = t === '/DeviceRGB' ? 3 : t === '/DeviceGray' ? 1 : 0 }
      if (comp !== 1 && comp !== 3) continue
      let immagine = null
      if (f.length === 1 && f[0] === '/DCTDecode') immagine = await loadImage(Buffer.from(o.contents)).catch(() => null)
      else if (f.length <= 1 && (f[0] === '/FlateDecode' || !f.length) && numero(d, 'BitsPerComponent') === 8) {
        let raw = f.length ? zlib.inflateSync(Buffer.from(o.contents)) : Buffer.from(o.contents)
        const parms = nome(d, 'DecodeParms'), pred = parms instanceof PDFDict ? numero(parms, 'Predictor') : 1
        if (pred >= 10) raw = togliPredittore(raw, w, comp, 8); else if (pred > 1) continue
        if (raw.length < w * h * comp) continue
        const rgba = new Uint8ClampedArray(w * h * 4)
        for (let i = 0, j = 0; i < w * h; i++, j += comp) { const k = i * 4; if (comp === 3) { rgba[k] = raw[j]; rgba[k + 1] = raw[j + 1]; rgba[k + 2] = raw[j + 2] } else rgba[k] = rgba[k + 1] = rgba[k + 2] = raw[j]; rgba[k + 3] = 255 }
        const c = createCanvas(w, h); const g = c.getContext('2d'); const id = g.createImageData(w, h); id.data.set(rgba); g.putImageData(id, 0, 0)
        immagine = c
      } else continue
      if (!immagine) continue
      const k = Math.min(1, L.lato / Math.max(w, h)), nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k))
      const c = createCanvas(nw, nh), g = c.getContext('2d')
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, nw, nh)
      g.drawImage(immagine, 0, 0, nw, nh)
      const jpeg = await c.encode('jpeg', L.qualita)
      if (jpeg.length >= o.contents.length * L.soglia) continue
      const nuovo = d.clone(ctx)
      for (const x of ['Filter', 'DecodeParms', 'Length', 'ColorSpace', 'BitsPerComponent', 'Width', 'Height']) nuovo.delete(PDFName.of(x))
      nuovo.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
      nuovo.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))
      nuovo.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
      nuovo.set(PDFName.of('Width'), PDFNumber.of(nw))
      nuovo.set(PDFName.of('Height'), PDFNumber.of(nh))
      ctx.assign(ref, PDFRawStream.of(nuovo, jpeg))
      esito.ricompresse++
    } catch { /* immagine non decodificabile: resta com'era */ }
  }

  // 2) flussi senza compressione (contenuto delle pagine, font, moduli): Deflate senza perdita
  avanza(0, 1, 'flussi')
  for (const [ref, o] of ctx.enumerateIndirectObjects()) {
    if (!(o instanceof PDFRawStream) || filtri(o.dict).length || o.contents.length < 256) continue
    const t = nomeStr(nome(o.dict, 'Type'))
    if (t === '/XRef' || t === '/ObjStm' || t === '/Metadata') continue
    const z = zlib.deflateSync(Buffer.from(o.contents), { level: 9 })
    if (z.length >= o.contents.length * 0.9) continue
    const nuovo = o.dict.clone(ctx); nuovo.delete(PDFName.of('Length')); nuovo.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
    ctx.assign(ref, PDFRawStream.of(nuovo, z)); esito.flussi++
  }

  // 3) con «massima»: miniature delle pagine e metadati XMP non servono a leggere il documento
  if (L.togliMetadati) {
    doc.catalog.delete(PDFName.of('Metadata'))
    doc.catalog.delete(PDFName.of('PieceInfo'))
    for (const p of doc.getPages()) { p.node.delete(PDFName.of('Thumb')); p.node.delete(PDFName.of('PieceInfo')) }
  }

  // 4) oggetti non raggiungibili dal documento (vecchie versioni lasciate dai salvataggi incrementali)
  const visti = new Set()
  const visita = (v) => {
    const pila = [v]
    while (pila.length) {
      const x = pila.pop()
      if (x instanceof PDFRef) { const k = x.toString(); if (visti.has(k)) continue; visti.add(k); const t = ctx.lookup(x); if (t) pila.push(t) }
      else if (x instanceof PDFDict) for (const [, y] of x.entries()) pila.push(y)
      else if (x instanceof PDFArray) for (const y of x.asArray()) pila.push(y)
      else if (x instanceof PDFStream) pila.push(x.dict)
    }
  }
  visita(ctx.trailerInfo.Root); if (ctx.trailerInfo.Info) visita(ctx.trailerInfo.Info)
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!visti.has(ref.toString())) { ctx.delete(ref); esito.tolti++ }

  avanza(1, 1, 'scrittura')
  const dati = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false })
  // se non si guadagna nulla si tiene una copia dell'originale: mai un file più pesante
  const piuLeggero = dati.length < originale.length
  fs.writeFileSync(uscita, piuLeggero ? dati : originale)
  return { prima: originale.length, dopo: piuLeggero ? dati.length : originale.length, pagine: doc.getPageCount(), ...esito, invariato: !piuLeggero }
}

comprimi(workerData).then((r) => parentPort.postMessage({ esito: r })).catch((e) => parentPort.postMessage({ error: e.message || String(e) }))
