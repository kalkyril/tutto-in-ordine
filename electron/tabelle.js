'use strict'
// Lettura di tabelle da file CSV e Excel (.xlsx) per l'importazione guidata. Sola lettura: i file di origine non vengono mai modificati.
const fs = require('node:fs')
const path = require('node:path')
const { leggiZip } = require('./zip')

const MAX_BYTES = 60 * 1024 * 1024
const MAX_RIGHE = 200000

function decodifica(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1252').decode(buf) } // file salvati da Excel in Windows
}

/** CSV con campi tra virgolette, a capo dentro i campi e delimitatore riconosciuto (; , tabulazione |). */
function leggiCsv(testo) {
  const campione = testo.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8)
  const conta = (d) => campione.reduce((s, l) => { let q = false, c = 0; for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) c++ } return s + c }, 0)
  const delimitatore = [';', ',', '\t', '|'].map((d) => [d, conta(d)]).sort((a, b) => b[1] - a[1])[0]
  const d = delimitatore[1] > 0 ? delimitatore[0] : ';'
  const righe = []; let riga = [], cella = '', q = false
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i]
    if (q) { if (c === '"') { if (testo[i + 1] === '"') { cella += '"'; i++ } else q = false } else cella += c }
    else if (c === '"' && cella === '') q = true
    else if (c === d) { riga.push(cella); cella = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && testo[i + 1] === '\n') i++; riga.push(cella); cella = ''; righe.push(riga); riga = []; if (righe.length > MAX_RIGHE) throw new Error('Il file ha troppe righe (oltre 200.000)') }
    else cella += c
  }
  if (cella !== '' || riga.length) { riga.push(cella); righe.push(riga) }
  return { righe, delimitatore: d }
}

const decodeXml = (s) => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const testoXml = (frag) => [...frag.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('')
const colIndice = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1 }
const pad = (n) => String(n).padStart(2, '0')
const FORMATI_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function serialeADataStringa(v) {
  const giorni = Math.floor(v), frac = v - giorni
  const d = new Date(Date.UTC(1899, 11, 30) + giorni * 86400000)
  const data = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  if (frac < 1e-6) return data
  const min = Math.round(frac * 1440)
  return `${data}T${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`
}

/** Primo foglio di un file .xlsx → righe di testo (le date di Excel vengono convertite in YYYY-MM-DD). */
function leggiXlsx(buf) {
  const zip = leggiZip(buf)
  const get = (n) => { const b = zip.leggi(n); return b ? b.toString('utf8') : null }
  const wb = get('xl/workbook.xml'); if (!wb) throw new Error('Il file non sembra un foglio Excel valido (.xlsx)')
  const rels = get('xl/_rels/workbook.xml.rels') || ''
  const primo = wb.match(/<sheet\b[^>]*>/)?.[0] || ''
  const nomeFoglio = decodeXml(primo.match(/name="([^"]*)"/)?.[1] || 'Foglio1')
  const rid = primo.match(/r:id="([^"]*)"/)?.[1]
  let target = 'worksheets/sheet1.xml'
  if (rid) { const r = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`Id="${rid}"`)); const t = r?.match(/Target="([^"]*)"/)?.[1]; if (t) target = t.replace(/^\/?(xl\/)?/, '') }
  const xmlFoglio = get('xl/' + target); if (!xmlFoglio) throw new Error('Foglio di calcolo non trovato nel file')
  const condivise = []
  const ss = get('xl/sharedStrings.xml'); if (ss) for (const m of ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) condivise.push(testoXml(m[1]))
  const stili = get('xl/styles.xml') || ''
  const formatiPers = new Map([...stili.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map((m) => [+m[1], decodeXml(m[2])]))
  const xfs = [...(stili.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '').matchAll(/<xf\b[^>]*>/g)].map((m) => +(m[0].match(/numFmtId="(\d+)"/)?.[1] || 0))
  const eData = (stile) => { const id = xfs[stile]; if (FORMATI_DATA.has(id)) return true; const f = formatiPers.get(id); return !!f && /[dmyh]/i.test(f.replace(/\[[^\]]*\]|"[^"]*"/g, '')) && !/[#0]/.test(f.replace(/\[[^\]]*\]|"[^"]*"/g, '')) }
  const righe = []
  for (const mr of xmlFoglio.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const riga = []
    for (const mc of (mr[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attr = mc[1], corpo = mc[2] || ''
      const ref = attr.match(/\br="([A-Z]+\d+)"/)?.[1]; const tipo = attr.match(/\bt="([^"]*)"/)?.[1]; const stile = +(attr.match(/\bs="(\d+)"/)?.[1] || 0)
      const v = corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let valore = ''
      if (tipo === 's') valore = condivise[+v] ?? ''
      else if (tipo === 'inlineStr') valore = testoXml(corpo)
      else if (tipo === 'str') valore = decodeXml(v ?? '')
      else if (tipo === 'b') valore = v === '1' ? 'Sì' : 'No'
      else if (v !== undefined) valore = eData(stile) && isFinite(+v) ? serialeADataStringa(+v) : decodeXml(v).replace(/^(-?\d+\.\d*?)0{6,}\d*$/, '$1')
      const i = ref ? colIndice(ref) : riga.length
      while (riga.length < i) riga.push('')
      riga[i] = valore
    }
    righe.push(riga)
    if (righe.length > MAX_RIGHE) throw new Error('Il foglio ha troppe righe (oltre 200.000)')
  }
  return { righe, foglio: nomeFoglio }
}

/** Legge un file e restituisce { intestazioni, righe:[[...]], delimitatore?, foglio? }. La prima riga non vuota è l'intestazione. */
function leggiTabella(file) {
  const st = fs.statSync(file)
  if (!st.isFile()) throw new Error('Seleziona un file')
  if (st.size > MAX_BYTES) throw new Error('Il file è troppo grande (oltre 60 MB)')
  const ext = path.extname(file).toLowerCase()
  const buf = fs.readFileSync(file)
  let out
  if (['.xlsx', '.xlsm'].includes(ext)) out = leggiXlsx(buf)
  else if (['.csv', '.txt', '.tsv'].includes(ext)) out = leggiCsv(decodifica(buf))
  else if (ext === '.xls') throw new Error('Il vecchio formato .xls non è supportato: in Excel scegli File → Salva con nome → "CSV UTF-8" oppure "Cartella di lavoro di Excel (.xlsx)" e riprova')
  else if (ext === '.ods') throw new Error('Il formato .ods non è supportato: salva il file come .xlsx o come CSV e riprova')
  else throw new Error('Formato non riconosciuto: usa un file CSV o Excel (.xlsx)')
  const pulite = out.righe.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c !== ''))
  if (!pulite.length) throw new Error('Il file è vuoto')
  const n = Math.max(...pulite.map((r) => r.length))
  const norm = pulite.map((r) => { const x = [...r]; while (x.length < n) x.push(''); return x })
  return { intestazioni: norm[0].map((h, i) => h || `Colonna ${i + 1}`), righe: norm.slice(1), delimitatore: out.delimitatore, foglio: out.foglio }
}

module.exports = { leggiTabella, leggiCsv, leggiXlsx, decodifica, serialeADataStringa }
