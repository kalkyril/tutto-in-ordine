// Calcolo dei termini processuali: casi calcolati a mano con il calendario (21/10/2026). Il test non usa la rete.
import { build } from 'vite'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const out = path.join(os.tmpdir(), `mngmnt-termini-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/termini.ts', formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(out).href)
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
const t = (data, quantita, extra = {}) => m.calcolaTermine({ data, quantita, verso: 'avanti', unita: 'giorni', sospensione: true, libero: false, rito: 'civile', ...extra }).scadenza

const iso = (g) => new Date(g * 86_400_000).toISOString().slice(0, 10)
assert.equal(iso(m.pasqua(2025)), '2025-04-20'); assert.equal(iso(m.pasqua(2026)), '2026-04-05'); assert.equal(iso(m.pasqua(2027)), '2027-03-28'); ok('Pasqua 2025, 2026, 2027')

assert.equal(t('2026-06-15', 30), '2026-07-15'); ok('30 giorni senza agosto: 15/06 → mercoledì 15/07')
assert.equal(t('2026-07-20', 30), '2026-09-21'); ok('30 giorni attraverso agosto: 11 a luglio + 19 a settembre = sabato 19/09 → lunedì 21/09')
assert.equal(t('2026-03-10', 6, { unita: 'mesi' }), '2026-10-12'); ok('6 mesi: 10/09 + 31 giorni feriali = domenica 11/10 → lunedì 12/10')
assert.equal(t('2026-08-10', 40), '2026-10-12'); ok('partenza in agosto: si conta dal 1° settembre, sabato 10/10 → lunedì 12/10')
assert.equal(t('2026-11-25', 30), '2026-12-28'); ok('Natale, Santo Stefano e domenica: 25/12 → lunedì 28/12')
assert.equal(t('2027-09-04', 30), '2027-10-05'); ok("4 ottobre 2027 (San Francesco, L. 151/2025) → martedì 5/10")
assert.equal(t('2027-01-31', 1, { unita: 'mesi', sospensione: false }), '2027-03-01'); ok('31 gennaio + 1 mese = 28 febbraio (manca il 31), domenica → lunedì 1/03')
assert.equal(t('2014-07-20', 30), '2014-10-06'); ok('prima del 2015 la sospensione arriva al 15 settembre: sabato 4/10/2014 → lunedì 6/10')
assert.equal(t('2026-07-20', 30, { rito: 'penale' }), '2026-09-19'); ok('penale: il sabato non proroga')
assert.equal(t('2026-07-20', 30, { sospensione: false }), '2026-08-19'); ok('materia esclusa dalla sospensione feriale (es. cautelare): 19/08')

const r = (data, quantita, extra = {}) => t(data, quantita, { verso: 'ritroso', ...extra })
assert.equal(r('2026-11-20', 70), '2026-09-11'); ok('costituzione 70 giorni prima dell\'udienza del 20/11 → venerdì 11/09')
assert.equal(r('2026-09-15', 40), '2026-07-06'); ok('40 giorni prima del 15/09 saltando agosto: 14 a settembre + 26 a luglio → lunedì 6/07')
assert.equal(r('2026-12-02', 10), '2026-11-20'); ok('a ritroso di domenica 22/11: si anticipa al venerdì 20/11 (sabato non utile)')
assert.equal(r('2027-03-01', 120, { libero: true }), '2026-10-30'); ok('termine libero di 120 giorni (art. 163-bis): sabato 31/10 → venerdì 30/10')

const passi = m.calcolaTermine({ data: '2026-07-20', quantita: 30, verso: 'avanti', unita: 'giorni', sospensione: true, libero: false, rito: 'civile' }).passi.join(' ')
assert.ok(passi.includes('esclusi i 31 giorni di sospensione feriale (1–31 agosto 2026)') && passi.includes('cade di sabato') && passi.includes('lunedì 21 settembre 2026')); ok('i passaggi spiegano sospensione, sabato e risultato')
assert.equal(m.calcolaTermine({ data: '', quantita: 30, verso: 'avanti', unita: 'giorni', sospensione: true, libero: false, rito: 'civile' }).scadenza, ''); ok('senza data nessun risultato')
console.log(`\n${n} prove sui termini superate`)
