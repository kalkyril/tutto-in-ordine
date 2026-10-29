'use strict'
// Motore per modificare i testi di un file Word (.docx) senza alterarne l'impaginazione.
// Un nome scritto in Word è spesso spezzato in più "pezzi" di testo con formattazioni diverse ("Mar" + "io Ros" + "si"):
// la ricerca avviene sul testo completo del paragrafo e la sostituzione mantiene la formattazione del primo pezzo.
const { leggiZip, creaZip } = require('./zip')

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&')

const PARTI_TESTO = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/
const BARRIERA = '\u0001' // testo cancellato (modifiche registrate), immagini, oggetti: le ricerche non lo attraversano

function apri(buf) {
  const zip = leggiZip(buf)
  if (!zip.nomi.includes('word/document.xml')) throw new Error('Il file non è un documento Word (.docx) valido')
  return { zip, nomi: zip.nomi, leggi: (n) => zip.leggi(n), testo: (n) => { const b = zip.leggi(n); return b ? b.toString('utf8') : null } }
}

/** Riscrive il documento sostituendo le parti indicate ({ nome: stringaXml }); tutte le altre parti restano identiche. */
function salva(doc, modificate) {
  return creaZip(doc.nomi.map((nome) => ({ nome, dati: modificate[nome] !== undefined ? Buffer.from(modificate[nome], 'utf8') : doc.leggi(nome) })))
}

/** Testo leggibile di una parte XML (paragrafi separati da a capo): serve per cercare dati e per controllare il risultato. */
function testoDi(xml, { conCancellato = true } = {}) {
  let s = xml
  if (!conCancellato) s = s.replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, '')
  s = s.replace(/<\/w:(?:del|ins)>/g, ' ').replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n')
  s = s.replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, '').replace(/<[^>]+>/g, '')
  return unesc(s)
}

// ---------------- scomposizione dei paragrafi ----------------
const RE_PARAGRAFO = /(<w:p(?=[\s>])(?:[^>/]|\/(?!>))*>)((?:(?!<w:p(?=[\s>])|<\/w:p>)[\s\S])*)(<\/w:p>)/g
const RE_RUN = /<w:r(?=[\s>])(?:[^>/]|\/(?!>))*>[\s\S]*?<\/w:r>/g
const RE_RUN_PARTI = /^(<w:r(?=[\s>])(?:[^>/]|\/(?!>))*>)([\s\S]*)<\/w:r>$/

function figliDelRun(corpo) {
  const out = []; let pos = 0
  while (pos < corpo.length) {
    const resto = corpo.slice(pos)
    let m
    if ((m = /^<w:t(?=[\s>])(?:[^>/]|\/(?!>))*>([\s\S]*?)<\/w:t>/.exec(resto))) out.push({ k: 't', testo: unesc(m[1]) })
    else if ((m = /^<w:t(?=[\s>])[^>]*\/>/.exec(resto))) out.push({ k: 't', testo: '' })
    else if ((m = /^<w:tab\b[^>]*\/>/.exec(resto))) out.push({ k: 'tab', xml: m[0] })
    else if ((m = /^<w:(?:br|cr)\b[^>]*\/>/.exec(resto))) out.push({ k: 'br', xml: m[0] })
    else if ((m = /^<w:noBreakHyphen\b[^>]*\/>/.exec(resto))) out.push({ k: 'trattino', xml: m[0] })
    else if ((m = /^<w:delText(?=[\s>])[^>]*>[\s\S]*?<\/w:delText>/.exec(resto))) out.push({ k: 'barriera', xml: m[0] })
    else if ((m = /^<w:instrText(?=[\s>])[^>]*>[\s\S]*?<\/w:instrText>/.exec(resto))) out.push({ k: 'x', xml: m[0] })
    else if ((m = /^<w:[A-Za-z]+\b[^>]*\/>/.exec(resto))) out.push({ k: /^<w:(drawing|pict|object)/.test(m[0]) ? 'barriera' : 'x', xml: m[0] })
    else if ((m = /^<w:([A-Za-z]+)\b[^>]*>[\s\S]*?<\/w:\1>/.exec(resto))) out.push({ k: /^(drawing|pict|object)$/.test(m[1]) ? 'barriera' : 'x', xml: m[0] })
    else return null // struttura non riconosciuta: il run resta intatto
    pos += m[0].length
  }
  return out
}

function interpretaRun(xml) {
  const m = RE_RUN_PARTI.exec(xml); if (!m) return null
  const rPr = /^(?:<w:rPr>[\s\S]*?<\/w:rPr>|<w:rPr\/>)/.exec(m[2])?.[0] || ''
  const figli = figliDelRun(m[2].slice(rPr.length)); if (!figli) return null
  return { apertura: m[1], rPr, figli }
}

const ORDINE_DOPO_EVIDENZIATURA = ['u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath', 'rPrChange']
/** Aggiunge l'evidenziazione gialla al testo, rispettando l'ordine degli elementi richiesto da Word. */
function conEvidenziazione(rPr) {
  const h = '<w:highlight w:val="yellow"/>'
  if (!rPr) return `<w:rPr>${h}</w:rPr>`
  if (rPr === '<w:rPr/>') return `<w:rPr>${h}</w:rPr>`
  const senza = rPr.replace(/<w:highlight\b[^>]*\/>/g, '')
  const re = new RegExp(`<w:(?:${ORDINE_DOPO_EVIDENZIATURA.join('|')})(?=[\\s/>])`)
  const m = re.exec(senza)
  return m ? senza.slice(0, m.index) + h + senza.slice(m.index) : senza.replace(/<\/w:rPr>$/, h + '</w:rPr>')
}

const runTesto = (apertura, rPr, testo) => `${apertura}${rPr}<w:t xml:space="preserve">${esc(testo)}</w:t></w:r>`
const runFiglio = (apertura, rPr, f) => `${apertura}${rPr}${f.k === 't' ? `<w:t xml:space="preserve">${esc(f.testo)}</w:t>` : f.xml}</w:r>`

/**
 * Elabora una parte XML (corpo, intestazione, piè di pagina, note…).
 * regole: [{ id, varianti: [{ re: RegExp(globale, u, i), nuovo: (testoTrovato) => string }] }]
 * Restituisce il nuovo XML, il numero di sostituzioni per regola e l'elenco dei paragrafi modificati.
 */
function elabora(xml, regole, { evidenzia = true } = {}) {
  const usati = new Map(); const modifiche = []
  const nuovoXml = xml.replace(RE_PARAGRAFO, (tutto, apertura, interno, chiusura) => {
    // 1) nodi del paragrafo: tratti di XML "grezzo" e run interpretati
    const nodi = []; let ultimo = 0
    for (const m of interno.matchAll(RE_RUN)) {
      if (m.index > ultimo) nodi.push({ grezzo: interno.slice(ultimo, m.index) })
      const run = interpretaRun(m[0])
      nodi.push(run ? { run } : { grezzo: m[0], barriera: true })
      ultimo = m.index + m[0].length
    }
    if (ultimo < interno.length) nodi.push({ grezzo: interno.slice(ultimo) })
    if (!nodi.some((n) => n.run)) return tutto
    // 2) testo logico del paragrafo
    const elementi = [] // un elemento per figlio di run, con la posizione nel testo logico
    let L = ''
    nodi.forEach((n, ni) => {
      if (n.barriera) { elementi.push({ ni, tipo: 'barriera', a: L.length, b: L.length + 1 }); L += BARRIERA; return }
      if (!n.run) return
      n.run.figli.forEach((f, fi) => {
        let t = ''
        if (f.k === 't') t = f.testo; else if (f.k === 'tab') t = '\t'; else if (f.k === 'br') t = '\n'; else if (f.k === 'trattino') t = '-'; else if (f.k === 'barriera') t = BARRIERA
        elementi.push({ ni, fi, tipo: f.k, a: L.length, b: L.length + t.length }); L += t
      })
    })
    if (!L.trim()) return tutto
    // 3) ricerca (le corrispondenze più lunghe hanno la precedenza)
    const trovate = []
    for (const r of regole) for (const v of r.varianti) { v.re.lastIndex = 0; for (const m of L.matchAll(v.re)) if (m[0].length) trovate.push({ s: m.index, e: m.index + m[0].length, regola: r, testo: m[0], nuovo: v.nuovo(m[0]) }) }
    if (!trovate.length) return tutto
    trovate.sort((x, y) => x.s - y.s || (y.e - y.s) - (x.e - x.s))
    const scelte = []; let fine = -1
    for (const t of trovate) if (t.s >= fine) { scelte.push(t); fine = t.e }
    // 4) ricostruzione dei run
    const nuoviNodi = []
    nodi.forEach((n, ni) => {
      if (!n.run) { nuoviNodi.push(n.grezzo); return }
      const { apertura, rPr } = n.run
      n.run.figli.forEach((f, fi) => {
        const el = elementi.find((x) => x.ni === ni && x.fi === fi)
        // gli elementi che non sono testo (campi automatici, segnalibri…) non vengono mai eliminati
        const dentro = el.a === el.b || f.k === 'x' || f.k === 'barriera' ? [] : scelte.filter((c) => c.s < el.b && c.e > el.a)
        if (!dentro.length) { nuoviNodi.push(runFiglio(apertura, rPr, f)); return }
        if (f.k !== 't') { /* tab/a capo/trattino compresi in una corrispondenza: vengono assorbiti dalla sostituzione */ return }
        let pos = el.a
        for (const c of dentro) {
          const da = Math.max(c.s, el.a), a = Math.min(c.e, el.b)
          if (da > pos) nuoviNodi.push(runTesto(apertura, rPr, L.slice(pos, da)))
          if (!c.emesso) { c.emesso = true; nuoviNodi.push(runTesto(apertura, evidenzia ? conEvidenziazione(rPr) : rPr, c.nuovo)); usati.set(c.regola.id, (usati.get(c.regola.id) || 0) + 1) }
          pos = a
        }
        if (pos < el.b) nuoviNodi.push(runTesto(apertura, rPr, L.slice(pos, el.b)))
      })
    })
    // anteprima: paragrafo prima e dopo, con le parti sostituite segnalate
    const segmenti = []; let p = 0
    for (const c of scelte) { if (c.s > p) segmenti.push({ t: 'testo', s: L.slice(p, c.s) }); segmenti.push({ t: 'nuovo', s: c.nuovo, era: c.testo, regola: c.regola.id }); p = c.e }
    if (p < L.length) segmenti.push({ t: 'testo', s: L.slice(p) })
    modifiche.push({ prima: L.replace(/\u0001/g, ''), segmenti })
    return apertura + nuoviNodi.join('') + chiusura
  })
  return { xml: nuovoXml, usati, modifiche }
}

/** Sostituzione nel testo semplice (proprietà del file): come nel corpo del documento, a parità di posizione vince il testo più lungo. */
function sostituisciTesto(s, regole) {
  const testo = String(s); const usati = new Map(); const trovate = []
  for (const r of regole) for (const v of r.varianti) { v.re.lastIndex = 0; for (const m of testo.matchAll(v.re)) if (m[0].length) trovate.push({ s: m.index, e: m.index + m[0].length, regola: r, nuovo: v.nuovo(m[0]) }) }
  trovate.sort((x, y) => x.s - y.s || (y.e - y.s) - (x.e - x.s))
  let out = '', pos = 0
  for (const t of trovate) { if (t.s < pos) continue; out += testo.slice(pos, t.s) + t.nuovo; pos = t.e; usati.set(t.regola.id, (usati.get(t.regola.id) || 0) + 1) }
  return { testo: out + testo.slice(pos), usati }
}

module.exports = { apri, salva, elabora, testoDi, sostituisciTesto, esc, unesc, PARTI_TESTO, BARRIERA }
