// Misura di Anonimizza su un campione annotato: richiamo (dati trovati fra quelli da nascondere) e precisione
// (dati trovati che erano davvero da nascondere), in totale e per tipo. Il campione è in scripts/fixtures/campione-anonimizza
// (dati inventati, vedi LEGGIMI.md); si può indicare un'altra cartella con documenti propri annotati allo stesso modo.
// Stampa solo numeri, mai il contenuto dei documenti (con --dettagli anche i dati sfuggiti, per correggere il motore).
//
// Uso: node scripts/misura-anonimizza.mjs [cartella] [--minimo-richiamo 0.9] [--minimo-precisione 0.8] [--dettagli]
import { build } from 'vite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const qui = path.dirname(fileURLToPath(import.meta.url))
const argomenti = process.argv.slice(2)
const opzione = (nome) => { const i = argomenti.indexOf(nome); return i >= 0 ? Number(argomenti[i + 1]) : null }
const dettagli = argomenti.includes('--dettagli')
const cartella = argomenti.find((a, i) => !a.startsWith('--') && !(argomenti[i - 1] || '').startsWith('--minimo')) || path.join(qui, 'fixtures', 'campione-anonimizza')

const out = path.join(os.tmpdir(), `tio-misura-anonimizza-${process.pid}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: path.join(qui, '..', 'src', 'lib', 'anonimizza.ts'), formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(out).href)
fs.rmSync(out, { force: true })

/** Toglie i segni {{TIPO|testo}} e restituisce il testo e le posizioni attese. */
function leggiAnnotato(s) {
  const attesi = []; let testo = '', i = 0
  for (const x of s.matchAll(/\{\{([A-Z_]+)\|([^}]*)\}\}/g)) {
    testo += s.slice(i, x.index); attesi.push({ tag: x[1], start: testo.length, end: testo.length + x[2].length }); testo += x[2]; i = x.index + x[0].length
  }
  return { testo: testo + s.slice(i), attesi }
}
const sovrapposti = (a, b) => a.start < b.end && b.start < a.end

const file = fs.readdirSync(cartella).filter((f) => /\.txt$/i.test(f)).sort()
if (!file.length) { console.error(`Nessun file .txt annotato in ${cartella}`); process.exit(2) }
const perTipo = new Map(); let attesiTot = 0, trovatiAttesi = 0, trovatiTot = 0, trovatiGiusti = 0, tipoGiusto = 0
const conta = (tag) => perTipo.get(tag) || perTipo.set(tag, { attesi: 0, trovati: 0 }).get(tag)
for (const f of file) {
  const { testo, attesi } = leggiAnnotato(fs.readFileSync(path.join(cartella, f), 'utf8'))
  const r = m.anonimizza(testo)
  const trovati = []; let pos = 0
  for (const s of r.segmenti) { if (s.tag) trovati.push({ tag: s.tag, start: pos, end: pos + s.t.length }); pos += s.t.length }
  for (const a of attesi) {
    const c = conta(a.tag); c.attesi++; attesiTot++
    const t = trovati.filter((x) => sovrapposti(x, a))
    // trovato = interamente coperto da dati riconosciuti (anche se divisi in più pezzi)
    const coperti = t.reduce((n, x) => n + Math.min(x.end, a.end) - Math.max(x.start, a.start), 0)
    if (dettagli && coperti < a.end - a.start) console.log(`  sfuggito in ${f}: ${a.tag} «${testo.slice(a.start, a.end)}»`)
    if (coperti >= a.end - a.start) { c.trovati++; trovatiAttesi++; if (t.some((x) => x.tag === a.tag)) tipoGiusto++ }
  }
  for (const t of trovati) { trovatiTot++; if (attesi.some((a) => sovrapposti(a, t))) trovatiGiusti++; else if (dettagli) console.log(`  in più in ${f}: ${t.tag} «${testo.slice(t.start, t.end)}»`) }
}
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '—')
const richiamo = attesiTot ? trovatiAttesi / attesiTot : 1, precisione = trovatiTot ? trovatiGiusti / trovatiTot : 1
console.log(`Campione: ${file.length} documenti, ${attesiTot} dati da nascondere`)
console.log(`Richiamo:   ${pct(trovatiAttesi, attesiTot)} (${trovatiAttesi}/${attesiTot}; con il tipo giusto ${pct(tipoGiusto, attesiTot)})`)
console.log(`Precisione: ${pct(trovatiGiusti, trovatiTot)} (${trovatiGiusti}/${trovatiTot})`)
for (const [tag, c] of [...perTipo].sort((a, b) => b[1].attesi - a[1].attesi)) console.log(`  ${tag.padEnd(14)} ${pct(c.trovati, c.attesi).padStart(7)}  (${c.trovati}/${c.attesi})`)
const minR = opzione('--minimo-richiamo'), minP = opzione('--minimo-precisione')
let ko = false
if (minR != null && richiamo < minR) { console.log(`FAIL richiamo sotto il minimo ${pct(minR, 1)}`); ko = true }
if (minP != null && precisione < minP) { console.log(`FAIL precisione sotto il minimo ${pct(minP, 1)}`); ko = true }
process.exit(ko ? 1 : 0)
