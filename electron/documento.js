'use strict'
// Documenti creati da TIO a partire da un modello (sezione Documenti) o da un testo anonimizzato (sezione Anonimizza).
// Un solo formato intermedio, già pulito dall'interfaccia, diventa Word (.docx), OpenDocument (.odt), RTF, HTML,
// Markdown o testo. Intestazione e piè di pagina sono quelli veri del formato: si ripetono su ogni pagina e restano
// modificabili in Word, LibreOffice e Pages. Il PDF lo produce la stampa isolata già usata per le parcelle.
//
// doc = {
//   titolo, font: 'Arial',
//   intestazione: [riga], footer: [riga],            riga = { testo, dimensione, grassetto, corsivo, sottolineato, allineamento, font? }
//   logo, immagineFooter: { png: base64, larghezza, altezza, allineamento } | null   (pixel CSS, PNG già convertito)
//   corpo: [blocco], blocco = { tipo: 'p'|'h1'…'h4'|'ul'|'ol'|'quote'|'table'|'img'|'pagebreak', allineamento?, runs: [run] }
//     run = { t, b, i, u, s (barrato), pt (dimensione), c (colore #rrggbb), hl (evidenziatore #rrggbb) }
//     tabella: celle = [[[run]]] (righe → celle → pezzi), intestazione: prima riga d'intestazione; immagine: immagine = { png, larghezza, altezza, allineamento }
//   allineamento: disposizione dei blocchi che non ne hanno una propria; colonne: 1 | 2
//   numeriPagina: boolean, margini: { sopra, sotto, lati } (mm), corpoPt: dimensione del testo (8-16 pt, 11 se manca)
// }
const { creaZip } = require('./zip')

const FORMATI = ['docx', 'odt', 'rtf', 'html', 'md', 'txt']
const DIM_PT = { grandissima: 26, grande: 18, media: 13, normale: 10, piccola: 9 }
const CORPO_PT = 11
const TITOLI_PT = { h1: 18, h2: 14, h3: 12, h4: 11 }
const TIPI = ['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'quote', 'table', 'img', 'pagebreak']
const COLORE = /^#[0-9a-f]{6}$/i
const ALLINEA = ['sinistra', 'centro', 'destra', 'giustificato']
const MAX_BLOCCHI = 20000

const xml = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const testo = (v, max = 100000) => String(v ?? '').slice(0, max)

/** Valida e normalizza il documento ricevuto dall'interfaccia: nessun campo inatteso arriva ai generatori. */
function pulisci(d) {
  if (!d || typeof d !== 'object') throw new Error('Documento non valido')
  const riga = (r) => ({ testo: testo(r?.testo, 2000), dimensione: DIM_PT[r?.dimensione] ? r.dimensione : 'normale', grassetto: !!r?.grassetto, corsivo: !!r?.corsivo, sottolineato: !!r?.sottolineato, allineamento: ALLINEA.includes(r?.allineamento) ? r.allineamento : 'centro' })
  const immagine = (im, maxW = 1600, maxH = 400) => {
    if (!im || typeof im.png !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(im.png) || im.png.length > 6 * 1024 * 1024) return null
    const buf = Buffer.from(im.png, 'base64')
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null // soltanto PNG: l'interfaccia converte gli altri formati
    const w = Math.min(maxW, Math.max(8, Number(im.larghezza) || 120)), h = Math.min(maxH, Math.max(8, Number(im.altezza) || 60))
    return { png: buf, larghezza: w, altezza: h, allineamento: ALLINEA.includes(im.allineamento) ? im.allineamento : 'centro' }
  }
  const predefinito = ALLINEA.includes(d.allineamento) ? d.allineamento : 'sinistra'
  // le proprietà facoltative compaiono solo se usate: barrato, dimensione in punti, colore ed evidenziatore (senza «#»)
  const run = (r) => ({ t: testo(r?.t, 200000), b: !!r?.b, i: !!r?.i, u: !!r?.u, ...(r?.s && { s: true }), ...(Number(r?.pt) >= 6 && Number(r?.pt) <= 96 && { pt: Math.round(Number(r.pt) * 2) / 2 }), ...(COLORE.test(r?.c || '') && { c: r.c.slice(1).toLowerCase() }), ...(COLORE.test(r?.hl || '') && { hl: r.hl.slice(1).toLowerCase() }) })
  const runs = (l) => (Array.isArray(l) ? l : []).slice(0, 2000).map(run)
  let immagini = 0
  const corpo = (Array.isArray(d.corpo) ? d.corpo : []).slice(0, MAX_BLOCCHI).map((b) => {
    const tipo = TIPI.includes(b?.tipo) ? b.tipo : 'p'
    const base = { tipo, allineamento: ALLINEA.includes(b?.allineamento) ? b.allineamento : predefinito, colonne: b?.colonne === 2 ? 2 : 1, runs: runs(b?.runs) }
    if (tipo === 'table') {
      const celle = (Array.isArray(b?.celle) ? b.celle : []).slice(0, 500).map((r) => (Array.isArray(r) ? r : []).slice(0, 30).map(runs)).filter((r) => r.length)
      if (!celle.length) return null
      const n = Math.max(...celle.map((r) => r.length))
      return { ...base, celle: celle.map((r) => [...r, ...Array(n - r.length).fill([])]), colonneTabella: n, intestazione: !!b?.intestazione }
    }
    if (tipo === 'img') { const im = ++immagini <= 200 ? immagine(b?.immagine, 1600, 1200) : null; return im ? { ...base, immagine: im, allineamento: ALLINEA.includes(b?.allineamento) ? b.allineamento : 'centro', n: immagini } : null }
    return base
  }).filter(Boolean)
  const mm = (v, def) => Math.min(60, Math.max(5, Number(v) || def))
  return {
    titolo: testo(d.titolo, 300) || 'Documento',
    font: /^[\p{L}\p{N} -]{1,60}$/u.test(String(d.font || '')) ? String(d.font) : 'Arial',
    intestazione: (Array.isArray(d.intestazione) ? d.intestazione : []).slice(0, 40).map(riga).filter((r) => r.testo.trim()),
    footer: (Array.isArray(d.footer) ? d.footer : []).slice(0, 40).map(riga).filter((r) => r.testo.trim()),
    logo: immagine(d.logo), immagineFooter: immagine(d.immagineFooter),
    corpo, numeriPagina: !!d.numeriPagina, colonne: d.colonne === 2 ? 2 : 1,
    corpoPt: Math.min(28, Math.max(8, Math.round(Number(d.corpoPt) * 2) / 2 || CORPO_PT)),
    margini: { sopra: mm(d.margini?.sopra, 20), sotto: mm(d.margini?.sotto, 20), lati: mm(d.margini?.lati, 20) },
  }
}

const testoRun = (b) => b.runs.map((r) => r.t).join('')
const testoCella = (c) => c.map((r) => r.t).join('')
/** Il corpo diviso in sezioni consecutive a una o due colonne (tutto a due se lo chiede l'intero documento). */
function sezioni(d) {
  const out = []
  for (const b of d.corpo) {
    const c = d.colonne === 2 ? 2 : b.colonne
    if (!out.length || out[out.length - 1].colonne !== c) out.push({ colonne: c, blocchi: [] })
    out[out.length - 1].blocchi.push(b)
  }
  return out.length ? out : [{ colonne: d.colonne, blocchi: [] }]
}

// ------------------------------------------------------------------ Word (.docx)

const W_ALLINEA = { sinistra: 'left', centro: 'center', destra: 'right', giustificato: 'both' }
const emu = (px) => Math.round(px * 9525)

function wRun(r, { pt, font } = {}) {
  const size = r.pt || pt
  const pr = [font ? `<w:rFonts w:ascii="${xml(font)}" w:hAnsi="${xml(font)}" w:cs="${xml(font)}"/>` : '', r.b ? '<w:b/>' : '', r.i ? '<w:i/>' : '', r.s ? '<w:strike/>' : '', r.c ? `<w:color w:val="${r.c}"/>` : '', size ? `<w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/>` : '', r.u ? '<w:u w:val="single"/>' : '', r.hl ? `<w:shd w:val="clear" w:color="auto" w:fill="${r.hl}"/>` : ''].join('')
  // a capo dentro il paragrafo e tabulazioni restano tali
  const parti = r.t.split(/(\n|\t)/).map((p) => (p === '\n' ? '<w:br/>' : p === '\t' ? '<w:tab/>' : p ? `<w:t xml:space="preserve">${xml(p)}</w:t>` : '')).join('')
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${parti}</w:r>`
}
const wRiga = (r, font) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="${W_ALLINEA[r.allineamento]}"/></w:pPr>${wRun({ t: r.testo, b: r.grassetto, i: r.corsivo, u: r.sottolineato }, { pt: DIM_PT[r.dimensione], font })}</w:p>`
function wImmagine(im, rid, id) {
  const cx = emu(im.larghezza), cy = emu(im.altezza)
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="80"/><w:jc w:val="${W_ALLINEA[im.allineamento]}"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Immagine ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="immagine${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
const REL = (id, tipo, target) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${tipo}" Target="${target}"/>`

function docx(d) {
  const mmTw = (mm) => Math.round(mm * 56.6929)
  const larghezzaTesto = Math.round((210 - 2 * d.margini.lati) * 56.6929)
  // ogni elenco numerato riparte da 1: un'istanza di numerazione per elenco
  const numeriElenchi = []
  let elencoAperto = false
  const par = (b, sectPr = '') => {
    if (b.tipo !== 'ol') elencoAperto = false
    if (b.tipo === 'pagebreak') return `<w:p><w:pPr>${sectPr}</w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`
    if (b.tipo === 'img') return wImmagine(b.immagine, `rIdCorpo${b.n}`, 100 + b.n).replace('</w:pPr>', `${sectPr}</w:pPr>`)
    if (b.tipo === 'table') {
      const col = Math.floor(larghezzaTesto / b.colonneTabella)
      const bordi = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((x) => `<w:${x} w:val="single" w:sz="4" w:space="0" w:color="8A96A3"/>`).join('') + '</w:tblBorders>'
      const righe = b.celle.map((r, i) => `<w:tr>${i === 0 && b.intestazione ? '<w:trPr><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${r.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${col}" w:type="dxa"/>${i === 0 && b.intestazione ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF1F4"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${c.map((x) => wRun(i === 0 && b.intestazione ? { ...x, b: true } : x)).join('')}</w:p></w:tc>`).join('')}</w:tr>`).join('')
      return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${bordi}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="85" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array(b.colonneTabella).fill(`<w:gridCol w:w="${col}"/>`).join('')}</w:tblGrid>${righe}</w:tbl>${sectPr ? `<w:p><w:pPr>${sectPr}</w:pPr></w:p>` : '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>'}`
    }
    let numId = b.tipo === 'ul' ? 1 : 2
    if (b.tipo === 'ol') { if (!elencoAperto) { numeriElenchi.push(numeriElenchi.length + 3); elencoAperto = true } numId = numeriElenchi[numeriElenchi.length - 1] }
    const stile = /^h[1-4]$/.test(b.tipo) ? `<w:pStyle w:val="Titolo${b.tipo[1]}"/>` : b.tipo === 'quote' ? '<w:pStyle w:val="Citazione"/>' : b.tipo === 'ul' || b.tipo === 'ol' ? `<w:pStyle w:val="Elenco"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` : ''
    return `<w:p><w:pPr>${stile}<w:jc w:val="${W_ALLINEA[b.allineamento]}"/>${sectPr}</w:pPr>${b.runs.map((r) => wRun(r)).join('')}</w:p>`
  }
  const haTesta = d.intestazione.length || d.logo, haPiede = d.footer.length || d.immagineFooter || d.numeriPagina
  const numeri = d.numeriPagina ? `<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">Pagina </w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> di </w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p>` : ''
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${d.logo ? wImmagine(d.logo, 'rIdImg', 1) : ''}${d.intestazione.map((r) => wRiga(r)).join('')}<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p></w:hdr>`
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${d.immagineFooter ? wImmagine(d.immagineFooter, 'rIdImg', 2) : ''}${d.footer.map((r) => wRiga(r)).join('')}${numeri}</w:ftr>`
  // Word chiude ogni sezione nell'ultimo paragrafo: le sezioni dopo la prima iniziano sulla stessa pagina («continua»)
  const sectPr = (colonne, continua) => `<w:sectPr>${haTesta ? '<w:headerReference w:type="default" r:id="rIdTesta"/>' : ''}${haPiede ? '<w:footerReference w:type="default" r:id="rIdPiede"/>' : ''}${continua ? '<w:type w:val="continuous"/>' : ''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${mmTw(d.margini.sopra + (haTesta ? 18 : 0))}" w:right="${mmTw(d.margini.lati)}" w:bottom="${mmTw(d.margini.sotto + (haPiede ? 12 : 0))}" w:left="${mmTw(d.margini.lati)}" w:header="${mmTw(Math.max(8, d.margini.sopra / 2))}" w:footer="${mmTw(Math.max(8, d.margini.sotto / 2))}" w:gutter="0"/>${colonne === 2 ? '<w:cols w:num="2" w:space="510"/>' : ''}</w:sectPr>`
  const parti = sezioni(d)
  const corpo = parti.map((sez, k) => sez.blocchi.map((b, i) => par(b, k < parti.length - 1 && i === sez.blocchi.length - 1 ? sectPr(sez.colonne, k > 0) : '')).join('') || (k < parti.length - 1 ? `<w:p><w:pPr>${sectPr(sez.colonne, k > 0)}</w:pPr></w:p>` : '')).join('') || '<w:p/>'
  const sect = sectPr(parti[parti.length - 1].colonne, parti.length > 1)
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${corpo}${sect}</w:body></w:document>`
  const f = xml(d.font)
  const stileTitolo = (n) => `<w:style w:type="paragraph" w:styleId="Titolo${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${n === 1 ? 240 : 200}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${TITOLI_PT['h' + n] * 2}"/></w:rPr></w:style>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/><w:sz w:val="${d.corpoPt * 2}"/><w:szCs w:val="${d.corpoPt * 2}"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${stileTitolo(1)}${stileTitolo(2)}${stileTitolo(3)}${stileTitolo(4)}<w:style w:type="paragraph" w:styleId="Citazione"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="9AA5B1"/></w:pBdr><w:ind w:left="340"/></w:pPr><w:rPr><w:i/><w:color w:val="3D4B5C"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Elenco"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/></w:pPr></w:style></w:styles>`
  const livello = (fmt, lvl) => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${lvl}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>`
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1">${livello('bullet', '•')}</w:abstractNum><w:abstractNum w:abstractNumId="2">${livello('decimal', '%1.')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>${numeriElenchi.map((n) => `<w:num w:numId="${n}"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('')}</w:numbering>`
  const immaginiCorpo = d.corpo.filter((b) => b.tipo === 'img')
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL('rIdStili', 'styles', 'styles.xml')}${REL('rIdNum', 'numbering', 'numbering.xml')}${haTesta ? REL('rIdTesta', 'header', 'header1.xml') : ''}${haPiede ? REL('rIdPiede', 'footer', 'footer1.xml') : ''}${immaginiCorpo.map((b) => REL(`rIdCorpo${b.n}`, 'image', `media/corpo${b.n}.png`)).join('')}</Relationships>`
  const relsImg = (file) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL('rIdImg', 'image', 'media/' + file)}</Relationships>`
  const tipi = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${haTesta ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}${haPiede ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(d.titolo)}</dc:title><dc:creator>TIO</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`
  const voci = [
    { nome: '[Content_Types].xml', dati: tipi },
    { nome: '_rels/.rels', dati: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL('rId1', 'officeDocument', 'word/document.xml')}<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { nome: 'docProps/core.xml', dati: core },
    { nome: 'word/document.xml', dati: documento }, { nome: 'word/styles.xml', dati: styles }, { nome: 'word/numbering.xml', dati: numbering },
    { nome: 'word/_rels/document.xml.rels', dati: rels },
  ]
  for (const b of immaginiCorpo) voci.push({ nome: `word/media/corpo${b.n}.png`, dati: b.immagine.png })
  if (haTesta) { voci.push({ nome: 'word/header1.xml', dati: header }); if (d.logo) voci.push({ nome: 'word/_rels/header1.xml.rels', dati: relsImg('logo.png') }, { nome: 'word/media/logo.png', dati: d.logo.png }) }
  if (haPiede) { voci.push({ nome: 'word/footer1.xml', dati: footer }); if (d.immagineFooter) voci.push({ nome: 'word/_rels/footer1.xml.rels', dati: relsImg('piede.png') }, { nome: 'word/media/piede.png', dati: d.immagineFooter.png }) }
  return creaZip(voci.map((v) => ({ nome: v.nome, dati: Buffer.isBuffer(v.dati) ? v.dati : Buffer.from(v.dati, 'utf8') })))
}

// ------------------------------------------------------------------ OpenDocument (.odt)

const O_ALLINEA = { sinistra: 'start', centro: 'center', destra: 'end', giustificato: 'justify' }
function odt(d) {
  const stiliAuto = new Map()
  const stileTesto = (r) => {
    const k = `T${r.b ? 'b' : ''}${r.i ? 'i' : ''}${r.u ? 'u' : ''}${r.s ? 's' : ''}${r.pt ? 'p' + String(r.pt).replace('.', '_') : ''}${r.c ? 'c' + r.c : ''}${r.hl ? 'h' + r.hl : ''}`
    if (k !== 'T') stiliAuto.set(k, `<style:style style:name="${k}" style:family="text"><style:text-properties${r.b ? ' fo:font-weight="bold"' : ''}${r.i ? ' fo:font-style="italic"' : ''}${r.u ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : ''}${r.s ? ' style:text-line-through-style="solid"' : ''}${r.pt ? ` fo:font-size="${r.pt}pt"` : ''}${r.c ? ` fo:color="#${r.c}"` : ''}${r.hl ? ` fo:background-color="#${r.hl}"` : ''}/></style:style>`)
    return k
  }
  const span = (r) => { const t = xml(r.t).replace(/\n/g, '<text:line-break/>').replace(/\t/g, '<text:tab/>').replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`); const k = stileTesto(r); return k === 'T' ? t : `<text:span text:style-name="${k}">${t}</text:span>` }
  const img = (im, file, nome) => `<text:p text:style-name="Img_${im.allineamento}"><draw:frame draw:name="${nome}" text:anchor-type="as-char" svg:width="${(im.larghezza * 0.026458).toFixed(3)}cm" svg:height="${(im.altezza * 0.026458).toFixed(3)}cm"><draw:image xlink:href="Pictures/${file}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`
  const larghezzaCm = (210 - 2 * d.margini.lati) / 10
  let nTabelle = 0
  const par = (b) => {
    if (b.tipo === 'pagebreak') return '<text:p text:style-name="Interruzione"/>'
    if (b.tipo === 'img') return img(b.immagine, `corpo${b.n}.png`, `Immagine${b.n}`).replace(/Img_\w+/, `Img_${b.allineamento}`)
    if (b.tipo === 'table') {
      const nome = `Tabella${++nTabelle}`
      return `<table:table table:name="${nome}" table:style-name="Tab"><table:table-column table:style-name="TabCol" table:number-columns-repeated="${b.colonneTabella}"/>${b.intestazione ? `<table:table-header-rows><table:table-row>${b.celle[0].map((c) => `<table:table-cell table:style-name="CellaTesta" office:value-type="string"><text:p text:style-name="P_sinistra">${c.map((r) => span({ ...r, b: true })).join('')}</text:p></table:table-cell>`).join('')}</table:table-row></table:table-header-rows>` : ''}${b.celle.slice(b.intestazione ? 1 : 0).map((r) => `<table:table-row>${r.map((c) => `<table:table-cell table:style-name="Cella" office:value-type="string"><text:p text:style-name="P_sinistra">${c.map(span).join('')}</text:p></table:table-cell>`).join('')}</table:table-row>`).join('')}</table:table>`
    }
    const h = /^h[1-4]$/.test(b.tipo)
    return `${h ? `<text:h text:style-name="H${b.tipo[1]}_${b.allineamento}" text:outline-level="${b.tipo[1]}">` : `<text:p text:style-name="${b.tipo === 'quote' ? 'Q' : 'P'}_${b.allineamento}">`}${b.runs.map(span).join('')}${h ? '</text:h>' : '</text:p>'}`
  }
  let corpo = '', n = 0
  for (const sez of sezioni(d)) {
    let pezzo = '', lista = null
    for (const b of sez.blocchi) {
      const tipoLista = b.tipo === 'ul' || b.tipo === 'ol' ? b.tipo : null
      if (lista && tipoLista !== lista) { pezzo += '</text:list>'; lista = null }
      if (tipoLista && !lista) { pezzo += `<text:list text:style-name="${tipoLista === 'ul' ? 'LPunti' : 'LNumeri'}">`; lista = tipoLista }
      pezzo += tipoLista ? `<text:list-item>${par({ ...b, tipo: 'p' })}</text:list-item>` : par(b)
    }
    if (lista) pezzo += '</text:list>'
    // a due colonne solo questa parte: una sezione; se lo è tutto il documento, ci pensa la pagina
    corpo += sez.colonne === 2 && d.colonne !== 2 ? `<text:section text:style-name="Colonne2" text:name="Colonne${++n}">${pezzo}</text:section>` : pezzo
  }
  const stiliPar = ALLINEA.map((a) => `<style:style style:name="P_${a}" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="${O_ALLINEA[a]}"/></style:style><style:style style:name="Q_${a}" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="${O_ALLINEA[a]}" fo:margin-left="0.6cm" fo:padding-left="0.25cm" fo:border-left="1.5pt solid #9aa5b1"/><style:text-properties fo:font-style="italic" fo:color="#3d4b5c"/></style:style><style:style style:name="Img_${a}" style:family="paragraph"><style:paragraph-properties fo:text-align="${O_ALLINEA[a]}"/></style:style>${[1, 2, 3, 4].map((n) => `<style:style style:name="H${n}_${a}" style:family="paragraph" style:parent-style-name="Heading_20_${n}"><style:paragraph-properties fo:text-align="${O_ALLINEA[a]}"/></style:style>`).join('')}`).join('')
  const riga = (r, i, pre) => `<text:p text:style-name="${pre}${i}">${xml(r.testo)}</text:p>`
  const stileRiga = (r, i, pre) => `<style:style style:name="${pre}${i}" style:family="paragraph"><style:paragraph-properties fo:text-align="${O_ALLINEA[r.allineamento]}" fo:margin-top="0cm" fo:margin-bottom="0cm"/><style:text-properties fo:font-size="${DIM_PT[r.dimensione]}pt"${r.grassetto ? ' fo:font-weight="bold"' : ''}${r.corsivo ? ' fo:font-style="italic"' : ''}${r.sottolineato ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : ''}/></style:style>`
  const ns = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" office:version="1.3"'
  const elenchi = `<text:list-style style:name="LPunti"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="1.27cm" fo:text-indent="-0.635cm" fo:margin-left="1.27cm"/></style:list-level-properties></text:list-level-style-bullet></text:list-style><text:list-style style:name="LNumeri"><text:list-level-style-number text:level="1" style:num-suffix="." style:num-format="1"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="1.27cm" fo:text-indent="-0.635cm" fo:margin-left="1.27cm"/></style:list-level-properties></text:list-level-style-number></text:list-style>`
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ns}><office:font-face-decls><style:font-face style:name="${xml(d.font)}" svg:font-family="'${xml(d.font)}'"/></office:font-face-decls><office:automatic-styles>${stiliPar}${[...stiliAuto.values()].join('')}${elenchi}<style:style style:name="Colonne2" style:family="section"><style:section-properties><style:columns fo:column-count="2" fo:column-gap="0.9cm"/></style:section-properties></style:style><style:style style:name="Interruzione" style:family="paragraph"><style:paragraph-properties fo:break-before="page"/></style:style><style:style style:name="Tab" style:family="table"><style:table-properties style:width="${larghezzaCm}cm" table:align="margins" fo:margin-bottom="0.25cm"/></style:style><style:style style:name="TabCol" style:family="table-column"/><style:style style:name="Cella" style:family="table-cell"><style:table-cell-properties fo:padding="0.12cm" fo:border="0.5pt solid #8a96a3"/></style:style><style:style style:name="CellaTesta" style:family="table-cell"><style:table-cell-properties fo:padding="0.12cm" fo:border="0.5pt solid #8a96a3" fo:background-color="#eef1f4"/></style:style></office:automatic-styles><office:body><office:text>${corpo || '<text:p/>'}</office:text></office:body></office:document-content>`
  // gli stili delle righe nascono durante la scrittura del corpo: content va costruito prima (stiliAuto viene letto sopra)
  const testa = `${d.logo ? img(d.logo, 'logo.png', 'Logo') : ''}${d.intestazione.map((r, i) => riga(r, i, 'Hd')).join('')}`
  const piede = `${d.immagineFooter ? img(d.immagineFooter, 'piede.png', 'Piede') : ''}${d.footer.map((r, i) => riga(r, i, 'Ft')).join('')}${d.numeriPagina ? '<text:p text:style-name="Num">Pagina <text:page-number text:select-page="current">1</text:page-number> di <text:page-count>1</text:page-count></text:p>' : ''}`
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${ns}><office:font-face-decls><style:font-face style:name="${xml(d.font)}" svg:font-family="'${xml(d.font)}'"/></office:font-face-decls><office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.21cm" fo:line-height="125%"/><style:text-properties style:font-name="${xml(d.font)}" fo:font-size="${d.corpoPt}pt" fo:language="it" fo:country="IT"/></style:default-style><style:style style:name="Standard" style:family="paragraph"/>${[1, 2, 3, 4].map((n) => `<style:style style:name="Heading_20_${n}" style:display-name="Heading ${n}" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="${n}"><style:paragraph-properties fo:margin-top="0.35cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="${TITOLI_PT['h' + n]}pt" fo:font-weight="bold"/></style:style>`).join('')}</office:styles><office:automatic-styles><style:page-layout style:name="Pagina"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="${d.margini.sopra / 10}cm" fo:margin-bottom="${d.margini.sotto / 10}cm" fo:margin-left="${d.margini.lati / 10}cm" fo:margin-right="${d.margini.lati / 10}cm">${d.colonne === 2 ? '<style:columns fo:column-count="2" fo:column-gap="0.9cm"/>' : ''}</style:page-layout-properties><style:header-style><style:header-footer-properties fo:min-height="0cm" fo:margin-bottom="0.5cm" fo:border-bottom="0.5pt solid #999999" fo:padding-bottom="0.15cm"/></style:header-style><style:footer-style><style:header-footer-properties fo:min-height="0cm" fo:margin-top="0.5cm"/></style:footer-style></style:page-layout>${d.intestazione.map((r, i) => stileRiga(r, i, 'Hd')).join('')}${d.footer.map((r, i) => stileRiga(r, i, 'Ft')).join('')}${ALLINEA.map((a) => `<style:style style:name="Img_${a}" style:family="paragraph"><style:paragraph-properties fo:text-align="${O_ALLINEA[a]}"/></style:style>`).join('')}<style:style style:name="Num" style:family="paragraph"><style:paragraph-properties fo:text-align="end"/><style:text-properties fo:font-size="8pt"/></style:style></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="Pagina">${testa ? `<style:header>${testa}</style:header>` : ''}${piede ? `<style:footer>${piede}</style:footer>` : ''}</style:master-page></office:master-styles></office:document-styles>`
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${ns}><office:meta><dc:title>${xml(d.titolo)}</dc:title><meta:generator>TIO</meta:generator></office:meta></office:document-meta>`
  const immagini = [d.logo && ['Pictures/logo.png', d.logo.png], d.immagineFooter && ['Pictures/piede.png', d.immagineFooter.png], ...d.corpo.filter((b) => b.tipo === 'img').map((b) => [`Pictures/corpo${b.n}.png`, b.immagine.png])].filter(Boolean)
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${immagini.map(([n]) => `<manifest:file-entry manifest:full-path="${n}" manifest:media-type="image/png"/>`).join('')}</manifest:manifest>`
  // «mimetype» deve essere la prima voce e non compressa: con 39 byte la compressione non conviene e creaZip la salva così com'è
  return creaZip([{ nome: 'mimetype', dati: Buffer.from('application/vnd.oasis.opendocument.text') }, ...[['content.xml', content], ['styles.xml', styles], ['meta.xml', meta], ['META-INF/manifest.xml', manifest]].map(([nome, dati]) => ({ nome, dati: Buffer.from(dati, 'utf8') })), ...immagini.map(([nome, dati]) => ({ nome, dati }))])
}

// ------------------------------------------------------------------ RTF

const R_ALLINEA = { sinistra: '\\ql', centro: '\\qc', destra: '\\qr', giustificato: '\\qj' }
// fuori dall’ASCII: \uN? con N a 16 bit con segno; i caratteri oltre U+FFFF come coppia surrogata
const rtfTesto = (s) => [...String(s)].map((c) => { const n = c.codePointAt(0); if (c === '\\' || c === '{' || c === '}') return '\\' + c; if (c === '\n') return '\\line '; if (c === '\t') return '\\tab '; if (n < 128) return c; if (n > 0xffff) return `\\u${c.charCodeAt(0) - 65536}?\\u${c.charCodeAt(1) - 65536}?`; return `\\u${n > 32767 ? n - 65536 : n}?` }).join('')
function rtf(d) {
  // tabella dei colori: testo ed evidenziatore usano un indice (1 = primo colore usato)
  const colori = []
  const indice = (hex) => { if (!hex) return 0; let i = colori.indexOf(hex); if (i < 0) { colori.push(hex); i = colori.length - 1 } return i + 1 }
  const run = (r, pt) => { const size = r.pt || pt; return `{${r.b ? '\\b' : ''}${r.i ? '\\i' : ''}${r.u ? '\\ul' : ''}${r.s ? '\\strike' : ''}${size ? `\\fs${Math.round(size * 2)}` : ''}${r.c ? `\\cf${indice(r.c)}` : ''}${r.hl ? `\\highlight${indice(r.hl)}\\chcbpat${indice(r.hl)}` : ''} ${rtfTesto(r.t)}}` }
  const img = (im) => `{\\pard${R_ALLINEA[im.allineamento]}{\\pict\\pngblip\\picwgoal${Math.round(im.larghezza * 15)}\\pichgoal${Math.round(im.altezza * 15)} ${im.png.toString('hex')}}\\par}`
  const riga = (r) => `{\\pard${R_ALLINEA[r.allineamento]}\\sa0${run({ t: r.testo, b: r.grassetto, i: r.corsivo, u: r.sottolineato }, DIM_PT[r.dimensione])}\\par}`
  let n = 0
  const parti = sezioni(d)
  const tw = (mm) => Math.round(mm * 56.6929)
  const larghezza = tw(210 - 2 * d.margini.lati)
  const blocco = (b) => {
    if (b.tipo !== 'ol') n = 0
    if (b.tipo === 'pagebreak') return '\\page'
    if (b.tipo === 'img') return img(b.immagine)
    if (b.tipo === 'table') {
      const col = Math.floor(larghezza / b.colonneTabella)
      const bordi = '\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10'
      return b.celle.map((r, i) => `\\trowd\\trgaph85${i === 0 && b.intestazione ? '\\trhdr' : ''}${r.map((_, k) => `${bordi}\\cellx${col * (k + 1)}`).join('')}\n${r.map((c) => `\\pard\\intbl\\ql ${c.map((x) => run(i === 0 && b.intestazione ? { ...x, b: true } : x)).join('')}\\cell`).join('')}\\row`).join('\n') + '\n\\pard\\sa60\\par'
    }
    const pt = TITOLI_PT[b.tipo]
    const prefisso = b.tipo === 'ul' ? '\\bullet\\tab ' : b.tipo === 'ol' ? `${++n}.\\tab ` : ''
    const rientro = b.tipo === 'ul' || b.tipo === 'ol' ? '\\fi-360\\li720' : b.tipo === 'quote' ? '\\li567' : ''
    return `{\\pard${R_ALLINEA[b.allineamento]}${rientro}\\sa120${pt ? '\\keepn' : ''} ${prefisso}${b.runs.map((r) => run(pt ? { ...r, b: true } : b.tipo === 'quote' ? { ...r, i: true } : r, pt)).join('')}\\par}`
  }
  // ogni cambio di colonne apre una nuova sezione che continua sulla stessa pagina
  const corpo = parti.map((sez, k) => (k ? `\\sect\\sectd\\sbknone${sez.colonne === 2 ? '\\cols2\\colsx510' : ''}\n` : '') + sez.blocchi.map(blocco).join('\n')).join('\n')
  const testa = d.logo || d.intestazione.length ? `{\\header ${d.logo ? img(d.logo) : ''}${d.intestazione.map(riga).join('')}}` : ''
  const numeri = d.numeriPagina ? '{\\pard\\qr{\\fs16 Pagina {\\field{\\*\\fldinst PAGE}{\\fldrslt 1}} di {\\field{\\*\\fldinst NUMPAGES}{\\fldrslt 1}}}\\par}' : ''
  const piede = d.immagineFooter || d.footer.length || numeri ? `{\\footer ${d.immagineFooter ? img(d.immagineFooter) : ''}${d.footer.map(riga).join('')}${numeri}}` : ''
  const tabColori = `{\\colortbl;${colori.map((h) => `\\red${parseInt(h.slice(0, 2), 16)}\\green${parseInt(h.slice(2, 4), 16)}\\blue${parseInt(h.slice(4, 6), 16)};`).join('')}}`
  return Buffer.from(`{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fnil ${rtfTesto(d.font)};}}${tabColori}{\\info{\\title ${rtfTesto(d.titolo)}}}\\paperw11906\\paperh16838\\margl${tw(d.margini.lati)}\\margr${tw(d.margini.lati)}\\margt${tw(d.margini.sopra + 15)}\\margb${tw(d.margini.sotto + 10)}\\f0\\fs${Math.round(d.corpoPt * 2)}\\sectd${parti[0].colonne === 2 ? '\\cols2\\colsx510' : ''}\n${testa}${piede}\n${corpo}\n}`, 'latin1')
}

// ------------------------------------------------------------------ HTML, Markdown, testo

const H_ALLINEA = { sinistra: 'left', centro: 'center', destra: 'right', giustificato: 'justify' }
function html(d) {
  const run = (r) => { let t = xml(r.t).replace(/\n/g, '<br>'); const st = [r.pt ? `font-size:${r.pt}pt` : '', r.c ? `color:#${r.c}` : '', r.hl ? `background-color:#${r.hl}` : ''].filter(Boolean).join(';'); if (st) t = `<span style="${st}">${t}</span>`; if (r.s) t = `<s>${t}</s>`; if (r.u) t = `<u>${t}</u>`; if (r.i) t = `<em>${t}</em>`; if (r.b) t = `<strong>${t}</strong>`; return t }
  const riga = (r) => `<div style="text-align:${H_ALLINEA[r.allineamento]};font-size:${DIM_PT[r.dimensione]}pt;font-weight:${r.grassetto ? 700 : 400};font-style:${r.corsivo ? 'italic' : 'normal'}${r.sottolineato ? ';text-decoration:underline' : ''}">${xml(r.testo)}</div>`
  const img = (im) => `<div style="text-align:${H_ALLINEA[im.allineamento]}"><img src="data:image/png;base64,${im.png.toString('base64')}" width="${im.larghezza}" height="${im.altezza}" alt="" style="max-width:100%;height:auto"></div>`
  let corpo = ''
  for (const sez of sezioni(d)) {
    let pezzo = '', lista = null
    for (const b of sez.blocchi) {
      const l = b.tipo === 'ul' || b.tipo === 'ol' ? b.tipo : null
      if (lista && l !== lista) { pezzo += `</${lista}>`; lista = null }
      if (l && !lista) { pezzo += `<${l}>`; lista = l }
      if (b.tipo === 'pagebreak') { pezzo += '<div style="break-after:page"></div>'; continue }
      if (b.tipo === 'img') { pezzo += img({ ...b.immagine, allineamento: b.allineamento }); continue }
      if (b.tipo === 'table') { pezzo += `<table>${b.celle.map((r, i) => `<tr>${r.map((c) => { const tag = i === 0 && b.intestazione ? 'th' : 'td'; return `<${tag}>${c.map(run).join('')}</${tag}>` }).join('')}</tr>`).join('')}</table>`; continue }
      const tag = l ? 'li' : b.tipo === 'quote' ? 'blockquote' : b.tipo
      pezzo += `<${tag} style="text-align:${H_ALLINEA[b.allineamento]}">${b.runs.map(run).join('') || '<br>'}</${tag}>`
    }
    if (lista) pezzo += `</${lista}>`
    corpo += sez.colonne === 2 && d.colonne !== 2 ? `<div style="column-count:2;column-gap:9mm">${pezzo}</div>` : pezzo
  }
  return Buffer.from(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="generator" content="TIO"><title>${xml(d.titolo)}</title><style>body{font:${d.corpoPt}pt/1.5 '${xml(d.font)}',Arial,sans-serif;color:#111;max-width:210mm;margin:0 auto;padding:${d.margini.sopra}mm ${d.margini.lati}mm ${d.margini.sotto}mm}header{border-bottom:1px solid #999;padding-bottom:4mm;margin-bottom:8mm}${d.colonne === 2 ? 'main{column-count:2;column-gap:9mm}' : ''}footer{border-top:1px solid #ddd;margin-top:12mm;padding-top:3mm;color:#444}p{margin:0 0 .6em}h1{font-size:18pt}h2{font-size:14pt}h3{font-size:12pt}h4{font-size:11pt;font-style:italic}blockquote{margin:0 0 .6em;padding-left:5mm;border-left:2pt solid #9aa5b1;color:#3d4b5c;font-style:italic}table{width:100%;border-collapse:collapse;margin:0 0 .7em}td,th{border:1px solid #8a96a3;padding:4px 6px;vertical-align:top;text-align:left}th{background:#eef1f4}</style></head><body>${d.logo || d.intestazione.length ? `<header>${d.logo ? img(d.logo) : ''}${d.intestazione.map(riga).join('')}</header>` : ''}<main>${corpo}</main>${d.immagineFooter || d.footer.length ? `<footer>${d.immagineFooter ? img(d.immagineFooter) : ''}${d.footer.map(riga).join('')}</footer>` : ''}</body></html>`, 'utf8')
}

function markdown(d) {
  const esc = (s) => s.replace(/([\\`*_[\]#<>|~])/g, '\\$1')
  const run = (r) => { if (!r.t.trim()) return r.t; let t = esc(r.t).replace(/\n/g, '  \n'); if (r.s) t = `~~${t}~~`; if (r.i) t = `*${t}*`; if (r.b) t = `**${t}**`; return t }
  let n = 0
  const righe = (rr) => rr.map((r) => esc(r.testo)).join('  \n')
  const parti = d.corpo.map((b) => {
    if (b.tipo !== 'ol') n = 0
    if (b.tipo === 'pagebreak') return '---'
    if (b.tipo === 'img') return `![](data:image/png;base64,${b.immagine.png.toString('base64')})`
    if (b.tipo === 'table') {
      const cella = (c) => c.map(run).join('').replace(/\s*\n\s*/g, ' ') || ' '
      const [prima, ...altre] = b.celle
      return [`| ${prima.map(cella).join(' | ')} |`, `|${prima.map(() => ' --- ').join('|')}|`, ...altre.map((r) => `| ${r.map(cella).join(' | ')} |`)].join('\n')
    }
    const t = b.runs.map(run).join('')
    if (/^h[1-4]$/.test(b.tipo)) return `${'#'.repeat(Number(b.tipo[1]))} ${t}`
    if (b.tipo === 'quote') return `> ${t}`
    if (b.tipo === 'ul') return `- ${t}`
    if (b.tipo === 'ol') return `${++n}. ${t}`
    return t
  })
  // le voci consecutive dello stesso elenco restano attaccate; tutto il resto è separato da una riga vuota
  const corpo = parti.map((t, i) => (i === 0 ? '' : (d.corpo[i].tipo === 'ul' || d.corpo[i].tipo === 'ol') && d.corpo[i - 1].tipo === d.corpo[i].tipo ? '\n' : '\n\n') + t).join('')
  return Buffer.from([d.intestazione.length ? righe(d.intestazione) + '\n\n---\n' : '', corpo, d.footer.length ? '\n\n---\n\n' + righe(d.footer) : ''].filter(Boolean).join('\n') + '\n', 'utf8')
}

function testoSemplice(d) {
  let n = 0
  const corpo = d.corpo.map((b) => {
    if (b.tipo !== 'ol') n = 0
    if (b.tipo === 'pagebreak') return '\f'
    if (b.tipo === 'img') return '[immagine]'
    if (b.tipo === 'table') return b.celle.map((r) => r.map((c) => testoCella(c).replace(/\s*\n\s*/g, ' ')).join('\t')).join('\n')
    const t = testoRun(b)
    return b.tipo === 'ul' ? `• ${t}` : b.tipo === 'ol' ? `${++n}. ${t}` : b.tipo === 'quote' ? `    ${t}` : /^h[1-4]$/.test(b.tipo) ? (b.tipo === 'h1' || b.tipo === 'h2' ? t.toUpperCase() : t) : t
  }).join('\n\n')
  const righe = (rr) => rr.map((r) => r.testo).join('\n')
  return Buffer.from([d.intestazione.length ? righe(d.intestazione) + '\n' + '—'.repeat(40) : '', corpo, d.footer.length ? '—'.repeat(40) + '\n' + righe(d.footer) : ''].filter(Boolean).join('\n\n') + '\n', 'utf8')
}

/** Il file nel formato richiesto. */
function genera(formato, documento) {
  if (!FORMATI.includes(formato)) throw new Error('Formato non supportato')
  const d = pulisci(documento)
  return { docx, odt, rtf, html, md: markdown, txt: testoSemplice }[formato](d)
}

module.exports = { genera, pulisci, FORMATI }
