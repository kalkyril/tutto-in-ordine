// Fatture avvocati e conti (menu «Competenza»): fattura, scorporo dal totale, dal netto e dall'imponibile, forfettario, compenso a ore.
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const out = path.join(os.tmpdir(), `tio-conti-${Date.now()}`)
fs.mkdirSync(out, { recursive: true })
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: { conti: 'src/lib/conti.ts', calc: 'src/lib/calc.ts' }, formats: ['es'], fileName: (_f, nome) => `${nome}.mjs` }, outDir: out, emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(path.join(out, 'conti.mjs')).href)
const { calcolaParcella } = await import(pathToFileURL(path.join(out, 'calc.mjs')).href)
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)
const num = (x) => Number(String(x || '').replace(/\./g, '').replace(',', '.')) || 0
const base = { cpa: 4, iva: 22, rit: 20 }
const s = { onorari: '1000', speseEsenti: '100', speseImponibili: '50', sgOn: true, sgPct: '15', cpaOn: true, ivaOn: true, ritOn: true, ritPct: '20', cpaInRitenuta: false, regime: 'ordinario', bolloOn: true, importo: '', base: 'totale', ore: '2', minuti: '30', tariffa: '150' }
const tot = (r) => calcolaParcella(r.voci, r.aliquote)
try {
  const f = tot(m.calcolaConti(800, s, base, num))
  assert.equal(f.spese_generali, 150); assert.equal(f.cpa, 48); assert.equal(f.imponibile, 1248); assert.equal(f.iva, 274.56); assert.equal(f.totale, 1622.56); assert.equal(f.ritenuta, 240); assert.equal(f.netto, 1382.56)
  ok('fattura avvocato: spese generali, CPA, IVA, spese esenti e ritenuta')
  for (const b of ['totale', 'netto', 'imponibile']) {
    const r = m.calcolaConti(810, { ...s, importo: '1500', base: b }, base, num), t = tot(r)
    assert.ok(Math.abs((b === 'totale' ? t.totale : b === 'netto' ? t.netto : t.imponibile) - 1500) <= 0.01, `${b}: ${JSON.stringify(t)}`)
  }
  ok('scorporo dal totale, dal netto a pagare e dall’imponibile: il calcolo in avanti ritrova l’importo')
  const fo = m.calcolaConti(810, { ...s, importo: '1040', regime: 'forfettario', speseEsenti: '', speseImponibili: '' }, base, num)
  assert.equal(fo.aliquote.iva, 0); assert.equal(fo.aliquote.rit, 0); assert.ok(Math.abs(tot(fo).totale - 1040) <= 0.01)
  ok('regime forfettario: niente IVA né ritenuta, bollo addebitato')
  const ore = m.calcolaConti(830, s, base, num)
  assert.equal(ore.onorari, 375); assert.match(ore.voci[0].descrizione, /2 h 30 min/)
  const rit = m.calcolaConti(820, { ...s, ritOn: false, ritPct: '23' }, base, num)
  assert.equal(rit.aliquote.rit, 23)
  ok('compenso a ore e ritenuta d’acconto con aliquota scelta')
} finally { fs.rmSync(out, { recursive: true, force: true }) }
