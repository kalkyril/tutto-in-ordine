'use strict'
// Misura della copertura delle prove: quali righe di src/lib ed electron esegue `npm test`. Per ora solo informativa
// (nessuna soglia): serve a vedere dove mancano prove, non blocca la CI.
//
// Come funziona, senza dipendenze in più:
//  1. esegue tutte le prove di `npm test` (scripts/run-tests.js) con NODE_V8_COVERAGE: ogni processo Node scrive le righe
//     eseguite, misurate dal motore V8 stesso;
//  2. le prove che compilano src/lib con Vite ricevono le mappe dei sorgenti (scripts/lib/copertura-hook.mjs), così le righe
//     dei file temporanei compilati si riportano ai file .ts;
//  3. compila una volta tutto src/lib con le mappe, per sapere quali righe contengono codice (le righe di soli tipi
//     TypeScript spariscono nella compilazione e non contano), anche nei file che nessuna prova carica;
//  4. una riga è coperta se almeno un processo l'ha eseguita. Per electron contano le righe con codice (non vuote e non
//     solo commento); una riga è scoperta se sta tutta in un blocco mai eseguito, come fanno c8 e v8-to-istanbul.
//
// Scrive nella cartella del rapporto: riepilogo.txt (per file, con le righe scoperte), copertura.json e lcov.info
// (si apre con le estensioni «Coverage Gutters» degli editor). I processi Electron (sito, prove nell'app) non sono misurati.
// I tempi delle prove di prestazioni sono falsati dalla misura: scripts/test-prestazioni.mjs li stampa senza bloccare.
//
// Uso: node scripts/copertura.js [cartella del rapporto]      (predefinita: <cartella temporanea>/tio-copertura)
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { spawnSync } = require('node:child_process')
const { fileURLToPath, pathToFileURL } = require('node:url')

const radice = path.resolve(__dirname, '..')
const uscita = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'tio-copertura'))
const grezzi = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-copertura-v8-'))
const CARTELLE = ['src/lib', 'electron']

const norma = (p) => p.replace(/\\/g, '/').replace(/^[a-z]:/i, '').replace(/^\/private\//, '/').toLowerCase()
const radiceNorma = norma(radice).replace(/\/$/, '') + '/'
/** Percorso relativo alla radice del progetto ('src/lib/budget.ts') di un URL o percorso, oppure null se è fuori. */
function relativo(url) {
  let p
  try { p = url.startsWith('file:') ? fileURLToPath(url) : url } catch { return null }
  const n = norma(p), i = n.indexOf(radiceNorma)
  if (i < 0 || n.includes('/node_modules/')) return null
  // stessa lunghezza del percorso normalizzato: si ritaglia il percorso vero, con le maiuscole originali
  const resto = p.replace(/\\/g, '/').slice(p.replace(/\\/g, '/').length - (n.length - i - radiceNorma.length))
  return CARTELLE.some((c) => resto.startsWith(c + '/')) ? resto : null
}

// ---------- mappe dei sorgenti (formato standard, codifica VLQ base64) ----------
const B64 = Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]))
/** Segmenti di una mappa: [riga generata, colonna generata, indice del sorgente, riga originale] (da 0). */
function segmenti(mappings) {
  const out = []
  let src = 0, rigaOrig = 0, colOrig = 0
  mappings.split(';').forEach((riga, r) => {
    let col = 0
    for (const seg of riga.split(',')) {
      if (!seg) continue
      const v = []
      let valore = 0, shift = 0
      for (const c of seg) {
        const d = B64[c]; valore += (d & 31) << shift
        if (d & 32) shift += 5
        else { v.push(valore & 1 ? -(valore >>> 1) : valore >>> 1); valore = 0; shift = 0 }
      }
      col += v[0]
      if (v.length >= 4) { src += v[1]; rigaOrig += v[2]; colOrig += v[3]; out.push([r, col, src, rigaOrig]) }
    }
  })
  return out
}

// ---------- 1. prove con la misura attiva ----------
fs.rmSync(uscita, { recursive: true, force: true })
fs.mkdirSync(uscita, { recursive: true })
const hook = pathToFileURL(path.join(__dirname, 'lib', 'copertura-hook.mjs')).href
const env = { ...process.env, NODE_V8_COVERAGE: grezzi, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${hook}`.trim() }
console.log(`Misura della copertura: esecuzione di tutte le prove (dati grezzi in ${grezzi})`)
const t0 = Date.now()
const prove = spawnSync(process.execPath, [path.join(__dirname, 'run-tests.js')], { cwd: radice, env, stdio: 'inherit' })
const minuti = ((Date.now() - t0) / 60000).toFixed(1)

// ---------- 2. righe con codice ----------
/** file → { righe: Set delle righe con codice (da 1), testo? } */
const file = new Map()
const voce = (rel) => { if (!file.has(rel)) file.set(rel, { righe: new Set(), coperte: new Set(), caricato: false }); return file.get(rel) }

// electron: righe non vuote e non di solo commento (dentro un commento /* */ contano come commento)
const tuttiJs = (dir) => fs.readdirSync(path.join(radice, dir), { withFileTypes: true }).flatMap((d) => d.isDirectory() ? tuttiJs(`${dir}/${d.name}`) : /\.(c?js|mjs)$/.test(d.name) ? [`${dir}/${d.name}`] : [])
const offsetRighe = (testo) => { const o = [0]; for (let i = 0; i < testo.length; i++) if (testo[i] === '\n') o.push(i + 1); return o }
const testi = new Map()
for (const rel of tuttiJs('electron')) {
  const testo = fs.readFileSync(path.join(radice, rel), 'utf8'), v = voce(rel)
  testi.set(rel, testo)
  let inCommento = false
  testo.split('\n').forEach((r, i) => {
    const t = r.trim()
    if (inCommento) { if (t.includes('*/')) inCommento = false; return }
    if (!t || t.startsWith('//')) return
    if (t.startsWith('/*')) { if (!t.includes('*/')) inCommento = true; return }
    v.righe.add(i + 1)
  })
}

// src/lib: compilazione di tutti i file con le mappe (le dipendenze esterne restano fuori)
const tuttiTs = fs.readdirSync(path.join(radice, 'src/lib')).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
const compilati = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-copertura-lib-'))
;(async () => {
  const { build } = await import('vite')
  await build({
    configFile: false, logLevel: 'silent', root: radice,
    build: {
      lib: { entry: Object.fromEntries(tuttiTs.map((f) => [f.replace(/\.tsx?$/, ''), path.join(radice, 'src/lib', f)])), formats: ['es'], fileName: (_f, n) => `${n}.mjs` },
      outDir: compilati, emptyOutDir: false, minify: false, sourcemap: true,
      rollupOptions: { external: (id) => !id.startsWith('.') && !path.isAbsolute(id) && !id.startsWith('\0') },
    },
  })
  for (const f of fs.readdirSync(compilati).filter((x) => x.endsWith('.map'))) {
    const m = JSON.parse(fs.readFileSync(path.join(compilati, f), 'utf8'))
    const fonti = m.sources.map((s) => relativo(path.resolve(compilati, s)))
    for (const [, , s, riga] of segmenti(m.mappings)) if (fonti[s]) voce(fonti[s]).righe.add(riga + 1)
  }
  fs.rmSync(compilati, { recursive: true, force: true })
  for (const f of tuttiTs) voce(`src/lib/${f}`) // anche un file senza codice eseguibile compare nell'elenco

  // ---------- 3. righe eseguite ----------
  const dentro = (zeri, o) => zeri.some(([a, b]) => o >= a && o < b)
  const zeriDi = (functions) => functions.flatMap((f) => f.ranges.filter((r) => r.count === 0).map((r) => [r.startOffset, r.endOffset]))
  let processi = 0
  for (const nome of fs.readdirSync(grezzi).filter((f) => f.endsWith('.json'))) {
    let dati
    try { dati = JSON.parse(fs.readFileSync(path.join(grezzi, nome), 'utf8')) } catch { continue }
    processi++
    const mappe = dati['source-map-cache'] || {}
    for (const s of dati.result || []) {
      const zeri = zeriDi(s.functions)
      const rel = relativo(s.url)
      if (rel && testi.has(rel)) { // file di electron eseguito direttamente
        const v = voce(rel), testo = testi.get(rel), o = offsetRighe(testo)
        v.caricato = true
        for (const r of v.righe) {
          const inizio = o[r - 1], fine = (o[r] ?? testo.length + 1) - 1, riga = testo.slice(inizio, fine)
          const a = inizio + (riga.length - riga.trimStart().length), b = inizio + riga.trimEnd().length
          if (!zeri.some(([x, y]) => a >= x && b <= y)) v.coperte.add(r)
        }
        continue
      }
      const sm = mappe[s.url]
      if (!sm?.data?.mappings) continue // file compilato da Vite: righe riportate ai sorgenti con la mappa
      const fonti = sm.data.sources.map((x) => relativo(new URL(x, sm.url || s.url).href))
      if (!fonti.some(Boolean)) continue
      const inizioRiga = [0]; for (const l of sm.lineLengths) inizioRiga.push(inizioRiga.at(-1) + l + 1)
      for (const [r, c, si, riga] of segmenti(sm.data.mappings)) {
        const rel2 = fonti[si]; if (!rel2) continue
        const v = voce(rel2); v.caricato = true
        if (!dentro(zeri, inizioRiga[r] + c)) v.coperte.add(riga + 1)
      }
    }
  }

  // ---------- 4. rapporto ----------
  const intervalli = (righe) => {
    const out = []
    for (const r of [...righe].sort((a, b) => a - b)) { const u = out.at(-1); if (u && r === u[1] + 1) u[1] = r; else out.push([r, r]) }
    return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`))
  }
  const pct = (c, t) => (t ? (100 * c) / t : 100)
  const fmt = (x) => x.toFixed(1).replace('.', ',').padStart(5) + '%'
  const elenco = [...file].map(([rel, v]) => {
    const coperte = [...v.righe].filter((r) => v.coperte.has(r)).length
    return { file: rel, righe: v.righe.size, coperte, caricato: v.caricato, scoperte: [...v.righe].filter((r) => !v.coperte.has(r)) }
  }).filter((x) => x.righe > 0).sort((a, b) => a.file.localeCompare(b.file))
  const totali = Object.fromEntries(CARTELLE.map((c) => {
    const f = elenco.filter((x) => x.file.startsWith(c + '/'))
    const righe = f.reduce((s, x) => s + x.righe, 0), coperte = f.reduce((s, x) => s + x.coperte, 0)
    return [c, { file: f.length, righe, coperte, percentuale: Math.round(pct(coperte, righe) * 10) / 10, maiCaricati: f.filter((x) => !x.caricato).map((x) => x.file) }]
  }))
  const testa = [
    `Copertura delle prove di TIO — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} — ${os.platform()} ${os.arch()}, Node ${process.version}`,
    `Prove: ${prove.status === 0 ? 'tutte superate' : 'ALCUNE FALLITE (la copertura può essere incompleta)'}, ${minuti} minuti, ${processi} processi misurati.`,
    'Righe coperte = righe con codice eseguite almeno una volta da `npm test`. Solo informativa: nessuna soglia.',
    '',
    ...CARTELLE.map((c) => `${fmt(totali[c].percentuale)}  ${String(totali[c].coperte).padStart(6)}/${String(totali[c].righe).padEnd(6)} ${c} (${totali[c].file} file${totali[c].maiCaricati.length ? `, ${totali[c].maiCaricati.length} mai caricati da nessuna prova` : ''})`),
  ]
  const corpo = elenco.map((x) => {
    const r = intervalli(x.scoperte)
    return `${fmt(pct(x.coperte, x.righe))}  ${String(x.coperte).padStart(6)}/${String(x.righe).padEnd(6)} ${x.file}${x.caricato ? '' : '  (mai caricato)'}` +
      (r.length && x.caricato ? `\n${' '.repeat(23)}scoperte: ${r.slice(0, 40).join(', ')}${r.length > 40 ? ` … (+${r.length - 40} intervalli)` : ''}` : '')
  })
  fs.writeFileSync(path.join(uscita, 'riepilogo.txt'), [...testa, '', 'Per file:', ...corpo, ''].join('\n'))
  fs.writeFileSync(path.join(uscita, 'copertura.json'), JSON.stringify({ data: new Date().toISOString(), sistema: `${os.platform()} ${os.arch()}`, node: process.version, proveSuperate: prove.status === 0, totali, file: elenco.map((x) => ({ ...x, scoperte: intervalli(x.scoperte) })) }, null, 1))
  fs.writeFileSync(path.join(uscita, 'lcov.info'), elenco.map((x) => {
    const v = file.get(x.file)
    return [`SF:${x.file}`, ...[...v.righe].sort((a, b) => a - b).map((r) => `DA:${r},${v.coperte.has(r) ? 1 : 0}`), `LF:${x.righe}`, `LH:${x.coperte}`, 'end_of_record'].join('\n')
  }).join('\n') + '\n')
  fs.rmSync(grezzi, { recursive: true, force: true })

  console.log('\n' + testa.join('\n'))
  const meno = elenco.filter((x) => x.righe >= 30).sort((a, b) => pct(a.coperte, a.righe) - pct(b.coperte, b.righe)).slice(0, 10)
  console.log('\nI dieci file meno coperti (almeno 30 righe):\n' + meno.map((x) => `${fmt(pct(x.coperte, x.righe))}  ${x.file}`).join('\n'))
  console.log(`\nRapporto completo: ${path.join(uscita, 'riepilogo.txt')} (anche copertura.json e lcov.info)`)
  if (prove.status !== 0) console.log('ATTENZIONE: alcune prove sono fallite durante la misura (vedi sopra); la copertura è solo informativa e non blocca.')
})().catch((e) => { console.error(e); fs.rmSync(grezzi, { recursive: true, force: true }); process.exit(1) })
