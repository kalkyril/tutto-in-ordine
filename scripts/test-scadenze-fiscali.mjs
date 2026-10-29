// Scadenze fiscali ricorrenti: prossime date, rate e filtri per profilo e regime.
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const out = path.join(os.tmpdir(), `mngmnt-fisco-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/scadenzeFiscali.ts', formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(out).href); fs.rmSync(out, { force: true })
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
const oggi = new Date(2026, 9, 28) // 28 ottobre 2026
assert.equal(m.prossima('11-16', oggi), '2026-11-16'); assert.equal(m.prossima('05-16', oggi), '2027-05-16'); assert.equal(m.prossima('10-28', oggi), '2026-10-28')
assert.equal(m.prossima(16, oggi), '2026-11-16'); assert.equal(m.prossima(16, new Date(2026, 9, 10)), '2026-10-16'); assert.equal(m.prossima(31, new Date(2026, 1, 1)), '2026-02-28')
ok('prossima data: stesso giorno compreso, anno o mese successivo, fine mese sicura')
const titoli = (p, r) => m.scadenzePer(p, r).map((x) => x.id)
assert.ok(titoli('avvocato', 'trimestrale').includes('cassa-forense-minimi') && !titoli('avvocato', 'trimestrale').includes('inps-fissi'))
assert.ok(titoli('impresa', 'trimestrale').includes('inps-fissi') && titoli('impresa', 'trimestrale').includes('diritto-camerale'))
assert.ok(!titoli('professionista', 'forfettario').some((id) => id.startsWith('iva')) && titoli('professionista', 'forfettario').includes('inps-gs'))
assert.ok(titoli('impresa', 'mensile').includes('iva-mensile') && !titoli('impresa', 'mensile').includes('iva-trimestrale'))
ok('scadenze per profilo e regime: Cassa Forense agli avvocati, INPS e Camera di Commercio alle ditte, niente IVA ai forfettari')
const r = m.ricorrenzeDa(m.scadenzePer('avvocato', 'trimestrale').filter((x) => x.id === 'iva-trimestrale' || x.id === 'iva-mensile' || x.id === 'cassa-forense-minimi'), oggi)
assert.equal(r.length, 7); assert.ok(r.every((x) => x.titolo.startsWith('Fisco: ') && x.frequenza === 'annuale' && x.prossima >= '2026-10-28'))
assert.ok(r.some((x) => x.titolo === 'Fisco: Cassa Forense: contributi minimi – 1ª rata' && x.prossima === '2027-02-28'))
ok('rate e trimestri diventano ricorrenze annuali distinte con la prima data futura')

// Sabati e festivi: la scadenza slitta al primo giorno lavorativo, nel renderer e nel processo principale
const outT = path.join(os.tmpdir(), `mngmnt-termini-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/termini.ts', formats: ['es'], fileName: () => path.basename(outT) }, outDir: path.dirname(outT), emptyOutDir: false, minify: false } })
const t = await import(pathToFileURL(outT).href); fs.rmSync(outT, { force: true })
const { createRequire } = await import('node:module')
const main = createRequire(import.meta.url)('../electron/giorni-lavorativi.js')
for (const [da, a] of [['2026-05-16', '2026-05-18'], ['2026-08-15', '2026-08-17'], ['2026-12-26', '2026-12-28'], ['2027-03-29', '2027-03-30'], ['2027-10-04', '2027-10-05'], ['2026-11-16', '2026-11-16'], ['2027-05-01', '2027-05-03']]) {
  assert.equal(t.primoLavorativo(da), a, da); assert.equal(main.primoLavorativo(da), a, da)
}
for (let d = new Date(Date.UTC(2026, 0, 1)); d.getUTCFullYear() <= 2040; d.setUTCDate(d.getUTCDate() + 1)) {
  const iso = d.toISOString().slice(0, 10); assert.equal(main.primoLavorativo(iso), t.primoLavorativo(iso), iso)
}
ok('sabato, domenica, Ferragosto, Santo Stefano, Pasquetta e 4 ottobre slittano; stesse date nell’app e nel processo principale fino al 2040')
assert.equal(m.prossima('05-16', new Date(2026, 4, 17)), '2026-05-16') // sabato 16, valida fino a lunedì 18
assert.equal(m.prossima('05-16', new Date(2026, 4, 19)), '2027-05-16')
assert.ok(m.ricorrenzeDa(m.scadenzePer('impresa', 'trimestrale'), oggi).every((x) => x.lavorativo === true))
ok('una scadenza nominale passata ma spostata a domani resta la prossima; le ricorrenze fiscali slittano da sole')
