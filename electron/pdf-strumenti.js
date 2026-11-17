'use strict'
// Editor PDF: unire, dividire e modificare i PDF, tutto sul computer. Si leggono solo i file scelti dall'utente e si
// scrivono file nuovi: gli originali non vengono mai toccati.
// I PDF che pdf-lib non sa aprire (protetti, con o senza password, o danneggiati) vengono letti da pdf.js e ricostruiti
// come immagini delle pagine: così ogni PDF che si riesce a vedere si riesce anche a unire, dividere e modificare.
// In quel caso il testo delle pagine non resta selezionabile, e l'interfaccia lo dice.
const fs = require('node:fs')
const path = require('node:path')

const MAX_BYTE = 2 * 1024 * 1024 * 1024 // oltre non si riesce a tenere il file in memoria
const SCALA_IMMAGINE = 2 // 144 dpi per le pagine ricostruite come immagini

/** Errore con un codice che l'interfaccia riconosce (PDF_PASSWORD: chiedere la password; PDF_PASSWORD_ERRATA: richiederla). */
function errore(codice, messaggio) { const e = new Error(`${codice}: ${messaggio}`); e.codice = codice; return e }

function leggi(file) {
  let st
  try { st = fs.statSync(file) } catch { throw new Error(`Il file «${path.basename(file)}» non si trova più`) }
  if (!st.isFile()) throw new Error('Non è un file')
  if (st.size > MAX_BYTE) throw new Error(`«${path.basename(file)}» supera i 2 GB`)
  const dati = fs.readFileSync(file)
  if (dati.subarray(0, 1024).indexOf('%PDF') < 0) throw new Error(`«${path.basename(file)}» non è un PDF`)
  return dati
}

/** pdf.js con i font standard e le CMap dell'app (come per Anonimizza): il disegno delle pagine è fedele anche senza font incorporati. */
async function apriPdfjs(dati, password) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const base = path.dirname(require.resolve('pdfjs-dist/package.json')).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1') + path.sep
  const task = pdfjs.getDocument({ data: new Uint8Array(dati), password: password || undefined, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, maxImageSize: 40000000,
    standardFontDataUrl: base + 'standard_fonts/', cMapUrl: base + 'cmaps/', cMapPacked: true })
  try { return { task, doc: await task.promise } }
  catch (e) {
    await task.destroy().catch(() => {})
    if (e?.name === 'PasswordException') throw errore(password ? 'PDF_PASSWORD_ERRATA' : 'PDF_PASSWORD', 'il PDF è protetto da password')
    throw new Error('PDF non leggibile: ' + (e?.message || e))
  }
}

/** Disegna una pagina: `larghezza` in pixel (oppure `scala`), `rotazione` in più rispetto a quella della pagina. */
async function disegnaPagina(doc, numero, { larghezza = 0, scala = 1, rotazione = 0, maxPixel = 24e6 } = {}) {
  const { createCanvas } = require('@napi-rs/canvas')
  const page = await doc.getPage(numero)
  const rot = (((page.rotate || 0) + rotazione) % 360 + 360) % 360
  const base = page.getViewport({ scale: 1, rotation: rot })
  let s = larghezza ? larghezza / base.width : scala
  if (base.width * base.height * s * s > maxPixel) s = Math.sqrt(maxPixel / (base.width * base.height))
  const viewport = page.getViewport({ scale: s, rotation: rot })
  const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  page.cleanup()
  return { canvas, larghezzaPt: base.width, altezzaPt: base.height }
}

/**
 * Apre un PDF con pdf-lib. Se è protetto o pdf-lib non riesce a leggerlo, lo ricostruisce come immagini con pdf.js
 * (`rasterizzato: true`). `avanza(fatto, totale, fase)` segue la ricostruzione, che su documenti lunghi richiede tempo.
 */
async function apri(file, { password = '', avanza = () => {} } = {}) {
  const { PDFDocument } = require('pdf-lib')
  const dati = leggi(file)
  try { return { doc: await PDFDocument.load(dati, { updateMetadata: false, throwOnInvalidObject: false }), rasterizzato: false, byte: dati.length } }
  catch { /* protetto o non leggibile da pdf-lib: si passa da pdf.js */ }
  const { task, doc } = await apriPdfjs(dati, password)
  try {
    const out = await PDFDocument.create()
    for (let n = 1; n <= doc.numPages; n++) {
      avanza(n, doc.numPages, 'pagine')
      const { canvas, larghezzaPt, altezzaPt } = await disegnaPagina(doc, n, { scala: SCALA_IMMAGINE })
      const jpeg = await out.embedJpg(await canvas.encode('jpeg', 85))
      out.addPage([larghezzaPt, altezzaPt]).drawImage(jpeg, { x: 0, y: 0, width: larghezzaPt, height: altezzaPt })
    }
    return { doc: out, rasterizzato: true, byte: dati.length }
  } finally { await task.destroy().catch(() => {}) }
}

const salva = async (doc, uscita) => { const dati = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }); fs.writeFileSync(uscita, dati); return dati.length }

/** Unisce più PDF, nell'ordine dato, in un file solo. `file`: [{ percorso, password? }]. */
async function unisci({ file, uscita }, avanza = () => {}) {
  const { PDFDocument } = require('pdf-lib')
  if (!Array.isArray(file) || file.length < 2) throw new Error('Servono almeno due PDF da unire')
  const out = await PDFDocument.create()
  let pagine = 0, rasterizzati = 0
  for (const [i, f] of file.entries()) {
    avanza(i, file.length, 'unione')
    let src
    try { src = await apri(f.percorso, { password: f.password, avanza: (a, b) => avanza(i + a / b, file.length, 'pagine') }) }
    catch (e) { if (e.codice) { e.percorso = f.percorso; e.message = `${e.codice}: ${f.percorso}` } throw e }
    if (src.rasterizzato) rasterizzati++
    for (const p of await out.copyPages(src.doc, src.doc.getPageIndices())) { out.addPage(p); pagine++ }
  }
  avanza(file.length, file.length, 'scrittura')
  return { pagine, rasterizzati, byte: await salva(out, uscita) }
}

/** «1-3, 5, 8-» → [[1,3],[5,5],[8,totale]]: numeri di pagina da 1, estremi compresi. */
function leggiIntervalli(testo, totale) {
  const out = []
  for (const pezzo of String(testo || '').split(/[,;\s]+/).filter(Boolean)) {
    const m = pezzo.match(/^(\d+)?\s*(?:[-–—]\s*(\d+)?)?$/)
    if (!m || (!m[1] && !m[2])) throw new Error(`Intervallo non valido: «${pezzo}». Scrivi per esempio 1-3, 5, 8-10`)
    const solo = !/[-–—]/.test(pezzo)
    let da = m[1] ? Number(m[1]) : 1, a = solo ? da : m[2] ? Number(m[2]) : totale
    if (da > a) [da, a] = [a, da]
    if (da < 1 || da > totale) throw new Error(`La pagina ${da} non esiste: il documento ha ${totale} ${totale === 1 ? 'pagina' : 'pagine'}`)
    out.push([da, Math.min(a, totale)])
  }
  if (!out.length) throw new Error('Indica le pagine, per esempio 1-3, 5, 8-10')
  return out
}

/**
 * Divide un PDF. `modo`: 'pagine' (un file per pagina), 'ogni' (un file ogni `ogni` pagine), 'intervalli' (un file per
 * intervallo; con `unico` un file solo con tutte le pagine indicate). I file vanno in `cartella` con il nome dell'originale.
 */
async function dividi({ percorso, password, modo, ogni, intervalli, unico, cartella }, avanza = () => {}) {
  const { PDFDocument } = require('pdf-lib')
  const src = await apri(percorso, { password, avanza: (a, b) => avanza(a, b, 'pagine') })
  const totale = src.doc.getPageCount()
  let gruppi
  if (modo === 'pagine') gruppi = Array.from({ length: totale }, (_, i) => [[i + 1, i + 1]])
  else if (modo === 'ogni') {
    const n = Math.floor(Number(ogni)); if (!(n >= 1)) throw new Error('Indica ogni quante pagine dividere')
    gruppi = []; for (let i = 1; i <= totale; i += n) gruppi.push([[i, Math.min(totale, i + n - 1)]])
  } else if (modo === 'intervalli') { const l = leggiIntervalli(intervalli, totale); gruppi = unico ? [l] : l.map((x) => [x]) }
  else throw new Error('Modo di divisione non valido')
  if (gruppi.length > 5000) throw new Error('Troppi file da creare: scegli gruppi di pagine più grandi')
  const base = path.basename(percorso, path.extname(percorso)).slice(0, 120)
  const cifre = String(totale).length, n0 = (n) => String(n).padStart(cifre, '0')
  const nomeDi = (g) => (g.length > 1 ? `${base} (estratto)` : g[0][0] === g[0][1] ? `${base} (pagina ${n0(g[0][0])})` : `${base} (pagine ${n0(g[0][0])}-${n0(g[0][1])})`)
  const libero = (nome) => { for (let i = 1; i < 10000; i++) { const p = path.join(cartella, `${nome}${i > 1 ? ' ' + i : ''}.pdf`); if (!fs.existsSync(p)) return p } throw new Error('Troppi file con lo stesso nome nella cartella') }
  const creati = []
  for (const [k, g] of gruppi.entries()) {
    avanza(k, gruppi.length, 'divisione')
    const out = await PDFDocument.create()
    const indici = g.flatMap(([da, a]) => Array.from({ length: a - da + 1 }, (_, i) => da - 1 + i))
    for (const p of await out.copyPages(src.doc, indici)) out.addPage(p)
    const uscita = libero(nomeDi(g))
    creati.push({ percorso: uscita, nome: path.basename(uscita), pagine: indici.length, byte: await salva(out, uscita) })
  }
  return { creati, totale, rasterizzato: src.rasterizzato, cartella }
}

// ------------------------------------------------------------------ Modifica
const COLORE = /^#([0-9a-f]{6})$/i
const BASE_RIGA = { helvetica: 0.97, times: 0.96, courier: 0.89 }
const rgbDi = (hex, rgb) => { const m = COLORE.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0; return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) }
const tra = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0))
/** I font standard dei PDF scrivono solo i caratteri di Windows-1252: gli altri diventano «?» invece di far fallire il salvataggio. */
function scrivibile(font, testo) {
  let out = ''
  for (const c of String(testo).replace(/\t/g, '    ')) { try { font.encodeText(c); out += c } catch { out += '?' } }
  return out
}

/**
 * Punto della pagina come la si vede (frazioni 0-1 dall'angolo in alto a sinistra, con la rotazione applicata)
 * → coordinate PDF della pagina non ruotata (origine in basso a sinistra del riquadro visibile).
 */
function puntoPdf(u, v, box, rot) {
  const w = box.width, h = box.height
  const W = rot % 180 === 0 ? w : h, H = rot % 180 === 0 ? h : w
  const dx = u * W, dy = v * H
  const [x, y] = rot === 90 ? [dy, dx] : rot === 180 ? [w - dx, dy] : rot === 270 ? [w - dy, h - dx] : [dx, h - dy]
  return { x: box.x + x, y: box.y + y, W, H }
}

async function disegnaElementi(doc, page, elementi, font) {
  const { rgb, degrees } = require('pdf-lib')
  const rot = ((page.getRotation().angle % 360) + 360) % 360
  const box = page.getCropBox()
  for (const el of elementi || []) {
    if (el.tipo === 'testo') {
      const f = font(el.font, el.grassetto), pt = tra(el.pt, 4, 200)
      const righe = scrivibile(f, String(el.testo || '').slice(0, 20000)).split('\n')
      const { H } = puntoPdf(0, 0, box, rot)
      // la prima riga sta dove la mostra l'editor (interlinea 1,25): distanza della linea di base dal bordo alto del riquadro
      const salita = pt * (BASE_RIGA[el.font] || BASE_RIGA.helvetica)
      righe.forEach((riga, i) => {
        if (!riga) return
        const dy = tra(el.y, -1, 2) * H + salita + i * pt * 1.25
        const p = puntoPdf(tra(el.x, -1, 2), dy / H, box, rot)
        page.drawText(riga, { x: p.x, y: p.y, size: pt, font: f, color: rgbDi(el.colore, rgb), rotate: degrees(rot) })
      })
    } else if (el.tipo === 'rett' || el.tipo === 'immagine') {
      const u = tra(el.x, -1, 2), v = tra(el.y, -1, 2), lw = tra(el.w, 0.001, 3), lh = tra(el.h, 0.001, 3)
      // l'angolo in basso a sinistra del riquadro come lo si vede: da lì larghezza e altezza seguono la rotazione
      const p = puntoPdf(u, v + lh, box, rot)
      if (el.tipo === 'rett') page.drawRectangle({ x: p.x, y: p.y, width: lw * p.W, height: lh * p.H, color: rgbDi(el.colore, rgb), opacity: tra(el.opacita ?? 1, 0.05, 1), rotate: degrees(rot) })
      else {
        const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(el.dati || ''); if (!m) continue
        const dati = Buffer.from(m[2], 'base64')
        const img = m[1] === 'png' ? await doc.embedPng(dati) : await doc.embedJpg(dati)
        page.drawImage(img, { x: p.x, y: p.y, width: lw * p.W, height: lh * p.H, rotate: degrees(rot) })
      }
    }
  }
}

const POSIZIONI_NUMERI = ['basso-centro', 'basso-destra', 'basso-sinistra', 'alto-centro', 'alto-destra', 'alto-sinistra']
function disegnaNumero(page, testo, n, f) {
  const { rgb, degrees } = require('pdf-lib')
  const rot = ((page.getRotation().angle % 360) + 360) % 360, box = page.getCropBox()
  const pt = tra(n.pt || 10, 6, 36), { W, H } = puntoPdf(0, 0, box, rot)
  const larga = f.widthOfTextAtSize(testo, pt), margine = 28
  const pos = POSIZIONI_NUMERI.includes(n.posizione) ? n.posizione : 'basso-centro'
  const dx = pos.endsWith('centro') ? (W - larga) / 2 : pos.endsWith('destra') ? W - margine - larga : margine
  const dy = pos.startsWith('alto') ? margine : H - margine + pt * 0.3
  const p = puntoPdf(dx / W, dy / H, box, rot)
  page.drawText(testo, { x: p.x, y: p.y, size: pt, font: f, color: rgb(0.2, 0.2, 0.2), rotate: degrees(rot) })
}

/**
 * Salva il documento modificato. `fonti`: [{ percorso, password? }]; `pagine`: nell'ordine finale,
 * { fonte, n (pagina da 0), rot (rotazione in più: 0, 90, 180, 270), elementi } oppure { bianca: true, w, h, elementi };
 * `numeri`: { posizione, formato ('n' | 'n/t' | 'pagina'), pt, da } oppure null.
 * Se le pagine sono quelle dell'unica fonte, nello stesso ordine, si modifica il documento com'è: restano segnalibri e moduli.
 */
async function modifica({ fonti, pagine, numeri, uscita }, avanza = () => {}) {
  const { PDFDocument, StandardFonts, degrees } = require('pdf-lib')
  if (!Array.isArray(pagine) || !pagine.length) throw new Error('Il documento non ha pagine: aggiungine almeno una')
  if (pagine.length > 20000) throw new Error('Troppe pagine')
  const aperte = []
  for (const [i, f] of (fonti || []).entries()) {
    avanza(i, fonti.length, 'lettura')
    try { aperte.push(await apri(f.percorso, { password: f.password, avanza: (a, b) => avanza(i + a / b, fonti.length, 'pagine') })) }
    catch (e) { if (e.codice) e.message = `${e.codice}: ${f.percorso}`; throw e }
  }
  const stessa = aperte.length === 1 && pagine.length === aperte[0].doc.getPageCount() && pagine.every((p, i) => !p.bianca && p.fonte === 0 && p.n === i)
  const out = stessa ? aperte[0].doc : await PDFDocument.create()
  // font standard dei PDF, incorporati solo se usati
  const fontCache = new Map()
  const nomi = { helvetica: ['Helvetica', 'HelveticaBold'], times: ['TimesRoman', 'TimesRomanBold'], courier: ['Courier', 'CourierBold'] }
  const font = (nome, grassetto) => { const k = (nomi[nome] ? nome : 'helvetica') + (grassetto ? '-b' : ''); if (!fontCache.has(k)) fontCache.set(k, out.embedStandardFont(StandardFonts[nomi[k.replace(/-b$/, '')][grassetto ? 1 : 0]])); return fontCache.get(k) }
  // le pagine copiate si chiedono a gruppi per fonte: pdf-lib copia una volta sola le risorse in comune (font, immagini)
  const copie = new Map()
  if (!stessa) for (const [k, a] of aperte.entries()) {
    const indici = [...new Set(pagine.filter((p) => !p.bianca && p.fonte === k).map((p) => p.n))]
    if (indici.some((n) => !Number.isInteger(n) || n < 0 || n >= a.doc.getPageCount())) throw new Error('Pagina non valida')
    const copiate = indici.length ? await out.copyPages(a.doc, indici) : []
    copie.set(k, new Map(indici.map((n, i) => [n, copiate[i]])))
  }
  const usate = new Set()
  for (const [i, p] of pagine.entries()) {
    avanza(i, pagine.length, 'modifica')
    let page
    if (p.bianca) page = out.addPage([tra(p.w, 72, 14400), tra(p.h, 72, 14400)])
    else if (stessa) page = out.getPage(i)
    else {
      const chiave = `${p.fonte}:${p.n}`
      // la stessa pagina usata due volte (duplicata): la seconda è una copia a sé, così le modifiche non si sommano
      page = usate.has(chiave) ? (await out.copyPages(aperte[p.fonte].doc, [p.n]))[0] : copie.get(p.fonte)?.get(p.n)
      if (!page) throw new Error('Pagina non valida')
      usate.add(chiave); out.addPage(page)
    }
    const piu = [0, 90, 180, 270].includes(p.rot) ? p.rot : 0
    if (piu) page.setRotation(degrees((page.getRotation().angle + piu) % 360))
    await disegnaElementi(out, page, p.elementi, font)
    if (numeri) {
      const k = i + 1 + (Math.floor(Number(numeri.da)) || 1) - 1, t = pagine.length + (Math.floor(Number(numeri.da)) || 1) - 1
      disegnaNumero(page, numeri.formato === 'n/t' ? `${k} / ${t}` : numeri.formato === 'pagina' ? `Pagina ${k} di ${t}` : String(k), numeri, font('helvetica', false))
    }
  }
  avanza(1, 1, 'scrittura')
  return { pagine: pagine.length, rasterizzati: aperte.filter((a) => a.rasterizzato).length, byte: await salva(out, uscita) }
}

module.exports = { MAX_BYTE, leggi, apri, apriPdfjs, disegnaPagina, unisci, dividi, modifica, leggiIntervalli, puntoPdf, errore }
