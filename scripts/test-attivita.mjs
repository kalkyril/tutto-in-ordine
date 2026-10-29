// Prove su durata e riepilogo delle attività svolte (TypeScript eseguito tramite esbuild di Vite).
import { build } from 'vite'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const out = path.join(os.tmpdir(), `mngmnt-attivita-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/attivita.ts', formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(out).href)
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
for (const [s, min] of [['1:30', 90], ['0:05', 5], ['90', 5400], ['90m', 90], ['90 min', 90], ['1,5', 90], ['1.5', 90], ['2h', 120], ['1h 30', 90], ['1h30m', 90], ['1 h 15 min', 75], ['0,25', 15], [' 45m ', 45], ['', 0], ['abc', 0], ['1:', 0], ['-5', 0], ['h', 0]]) assert.equal(m.parseDurata(s), min, `"${s}"`)
ok('durata: 1:30, 90m, 1h 30, 1,5 ore, 2h… letti come minuti; testo non valido = 0'); // "90" senza unità = ore decimali (come ore)
assert.equal(m.testoDurata(90), '1 h 30 min'); assert.equal(m.testoDurata(120), '2 h'); assert.equal(m.testoDurata(5), '5 min'); assert.equal(m.testoDurata(0), '0 min'); ok('testo della durata')
const ore = [
  { id: 1, descrizione: 'Invio PEC', minuti: 20, tariffa_oraria: 150, data: '2026-03-02', parcella_id: null },
  { id: 2, descrizione: 'invio  pec', minuti: 10, tariffa_oraria: 150, data: '2026-03-09', parcella_id: 5 },
  { id: 3, descrizione: 'Studio del fascicolo', minuti: 120, tariffa_oraria: 100, data: '2026-02-20', parcella_id: null },
  { id: 4, descrizione: 'Telefonata', minuti: 0, tariffa_oraria: 100, data: '2026-03-10', parcella_id: null },
]
const docs = [{ id: 1, ora_id: 1 }, { id: 2, ora_id: 1 }, { id: 3, ora_id: 2 }, { id: 4, ora_id: null }, { id: 5, ora_id: 3 }]
const r = m.riepilogoAttivita(ore, docs)
assert.equal(r.minuti, 150); assert.equal(r.attivita, 4); assert.equal(r.allegati, 4); assert.equal(Math.round(r.valore * 100) / 100, 275); assert.equal(Math.round(r.daFatturare * 100) / 100, 250)
assert.deepEqual(r.gruppi.map((g) => [g.titolo, g.volte, g.minuti, g.allegati]), [['Studio del fascicolo', 1, 120, 1], ['Invio PEC', 2, 30, 3], ['Telefonata', 1, 0, 0]])
assert.equal(Math.round(r.gruppi[0].quota * 100), 80); assert.equal(r.primaData, '2026-02-20'); assert.equal(r.ultimaData, '2026-03-10')
ok('riepilogo: «Invio PEC» ripetuta (anche scritta in modo diverso) in una riga con volte, tempo e allegati; allegati non collegati ad attività esclusi; valore e quota')
const v = m.riepilogoAttivita([], []); assert.deepEqual([v.minuti, v.valore, v.attivita, v.gruppi.length, v.primaData], [0, 0, 0, 0, undefined]); ok('pratica senza attività')
console.log(`\n${n} prove superate`)
