// Test del motore di calcolo dei compensi (esegue il TypeScript tramite esbuild di Vite).
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const out = path.join(os.tmpdir(), `mngmnt-compenso-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/compenso.ts', formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(out).href)
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)

// percentuale decrescente: oltre 520.000 (valori attesi = quelli del calcolatore online)
assert.equal(m.percentualeDecrescente(500000, 'F').compenso, 0); ok('sotto soglia: nessun calcolo automatico')
const f1 = m.percentualeDecrescente(1_000_000, 'F'); assert.deepEqual([f1.pct, f1.compenso], [3, 30000]); ok('secca 1.000.000 → 3% = 30.000')
const f2 = m.percentualeDecrescente(2_000_001, 'F'); assert.equal(f2.pct, 2.75); ok('secca oltre 2M → 2,75%')
const s1 = m.percentualeDecrescente(3_000_000, 'S'); assert.equal(s1.compenso, 2_000_000 * 0.03 + 1_000_000 * 0.0275); ok('a scaglioni 3M = 60.000 + 27.500')
const fmin = m.percentualeDecrescente(100_000_000, 'F'); assert.equal(fmin.pct, 0.25); ok('percentuale minima 0,25%')

assert.deepEqual(m.ternaDaMedio(1985, [50, 50]), [993, 1985, 2978]); ok('terna 2022 ±50% (993-1985-2978 come il calcolatore)')
assert.deepEqual(m.ternaDaMedio(1890, [50, 80]), [945, 1890, 3402]); ok('terna 2014 -50%/+80% (945-1890-3402)')

const base = { anno: 2022, competenza: 360, tipo: 'tabellare', scaglione: 30, valore: 0, metodo: 'F', pct: 0, variazione: [50, 50], ulteriorePct: 0, esitoPositivo: false, esitoImporto: 0, praticantePct: 0, speseEsenti: 0, speseTrasferta: 0, speseAltre: 0, sgOn: true, sgPct: 15,
  fasi: [{ cod: '99', nome: 'Compenso', attiva: true, scelta: 2, libero: 0, terna: [993, 1985, 2978] }] }
let r = m.calcolaCompenso(base); assert.deepEqual([r.compenso, r.speseGenerali], [1985, 297.75]); ok('compenso medio + spese generali 15%')
r = m.calcolaCompenso({ ...base, ulteriorePct: 20, praticantePct: 50 }); assert.equal(r.compenso, round(1985 * 1.2 * 0.5)); ok('aumento ulteriore valutazione e riduzione praticante')
r = m.calcolaCompenso({ ...base, fasi: [{ ...base.fasi[0], scelta: 'libero', libero: 200 }] }); assert.equal(r.compenso, 200); assert.equal(r.speseGenerali, 30); ok('compenso libero 200 → SG 30 (come nota pro forma di esempio)')
r = m.calcolaCompenso({ ...base, competenza: 380, esitoPositivo: true, esitoImporto: 1000 }); assert.equal(r.aumentoEsito, 300); ok('esito positivo +30%')
r = m.calcolaCompenso({ ...base, competenza: 380, esitoPositivo: true, esitoImporto: 1000, ulteriorePct: 20 }); assert.equal(r.esitoBase, 1200); assert.equal(r.aumentoEsito, 360); ok('esito positivo: importo maggiorato dell\'ulteriore valutazione (1.000 → 1.200, +30% = 360)')
r = m.calcolaCompenso({ ...base, fasi: [{ ...base.fasi[0], attiva: false }] }); assert.equal(r.compenso, 0); ok('fase disattivata')
const t = m.ternaCalcolata({ ...base, tipo: 'percentuale', valore: 100000, pct: 2 }); assert.deepEqual(t.terna, [1000, 2000, 3000]); ok('compenso in percentuale 2% di 100.000')
const t2 = m.ternaCalcolata({ ...base, tipo: 'percentuale', valore: 100000, pct: 9 }); assert.equal(t2.pctApplicata, 5); ok('percentuale limitata al 5%')
const t3 = m.ternaCalcolata({ ...base, scaglione: 140, valore: 1_000_000 }); assert.deepEqual(t3.terna, [15000, 30000, 45000]); ok('scaglione oltre 520.000 automatico')
function round(x) { return Math.round(x * 100) / 100 }
fs.rmSync(out, { force: true })
console.log(`\n${n} test superati`)
