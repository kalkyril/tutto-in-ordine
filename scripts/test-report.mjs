// Prove di prima nota CSV, solleciti e redditività per pratica (TypeScript eseguito tramite esbuild di Vite).
import { build } from 'vite'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const out = path.join(os.tmpdir(), `mngmnt-report-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/report.ts', formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(out).href)
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
const cli = new Map([[1, { id: 1, denominazione: 'Mario "Rossi"; Figli', codice_fiscale: 'RSSMRA80B01F205X', email: 'm@x.it' }], [2, { id: 2, denominazione: '=CMD|calc', partita_iva: '01234567897' }]])
const pr = new Map([[1, { id: 1, numero: '2026/001', titolo: 'Rossi c. Bianchi', colore: '#000' }]])
const P = (o) => ({ id: 1, anno: 2026, progressivo: 1, numero: '1/2026', pratica_id: 1, cliente_id: 1, tipo: 'parcella', data: '2026-03-10', oggetto: 'Causa\nmultilinea', stato: 'emessa', compensi: 1000, spese_generali: 150, cpa: 46, imponibile: 1196, iva: 263.12, spese_esenti: 0, bollo: 0, ritenuta: 230, totale: 1459.12, netto: 1229.12, ...o })
const parcelle = [P({}), P({ id: 2, progressivo: 2, numero: '2/2026', cliente_id: 2, data: '2026-04-01', stato: 'pagata', data_pagamento: '2026-05-02' }), P({ id: 3, progressivo: 3, numero: '3/2026', stato: 'annullata' }), P({ id: 4, progressivo: 4, numero: '4/2026', stato: 'bozza' }), P({ id: 5, anno: 2025, numero: '1/2025', data: '2025-12-01' })]
const csv = m.primaNotaCsv(parcelle, cli, pr, 2026)
const righe = csv.replace('﻿', '').trim().split('\r\n')
assert.ok(csv.startsWith('﻿Numero;Data;Tipo;Stato')); assert.equal(righe.length, 1 + 4 + 1)
assert.match(righe[1], /^1\/2026;10\/03\/2026;Parcella;emessa;"Mario ""Rossi""; Figli";RSSMRA80B01F205X;;2026\/001 Rossi c\. Bianchi;Causa multilinea;1000,00;150,00;46,00;1196,00;263,12;0,00;0,00;230,00;1459,12;1229,12;$/)
assert.ok(righe[4].includes("'=CMD|calc")); assert.ok(righe[4].endsWith(';02/05/2026'))
assert.match(righe[2], /annullata;.*;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;$/)
assert.match(righe[5], /^;;;;;;;;TOTALE parcelle emesse e pagate;2000,00;300,00;92,00;2392,00;526,24;0,00;0,00;460,00;2918,24;2458,24;$/)
ok('prima nota: solo l\'anno scelto, ordinata per data, virgolette e punto e virgola protetti, formule di Excel neutralizzate, annullate a zero, totali di emesse e pagate (bozze e annullate escluse)')
const s = m.solleciti(parcelle, cli, new Date(2026, 4, 20))
assert.deepEqual(s.map((x) => x.parcella.id), [5, 1]); assert.equal(s[1].scadenza, '2026-04-09'); assert.equal(s[1].giorni, 41)
const d9 = m.solleciti(parcelle.filter((x) => x.id === 1), cli, new Date(2026, 3, 9)); assert.equal(d9[0].giorni, 0); assert.ok(m.solleciti(parcelle.filter((x) => x.id === 1), cli, new Date(2026, 3, 1))[0].giorni < 0)
ok('solleciti: solo parcelle emesse non pagate (di qualunque anno), scadenza a 30 giorni, giorni di ritardo corretti (anche 0 e negativi), la più vecchia per prima')
const t = m.testoSollecito(s[1], { iban: 'IT60X0542811101000000123456', titolare: 'Avv. Verdi', nome: 'Studio' }, new Date(2026, 4, 20))
assert.match(t.corpo, /nota n\. 1\/2026 del 10\/03\/2026 \(Causa multilinea\), dell'importo di € 1\.229,12.*ancora da saldare \(scadenza 09\/04\/2026\)/); assert.match(t.corpo, /IT60X0542811101000000123456/); assert.match(t.corpo, /Avv\. Verdi$/)
assert.match(m.testoSollecito(m.solleciti(parcelle.filter((x) => x.id === 1), cli, new Date(2026, 3, 1))[0], {}).corpo, /scade il 09\/04\/2026/)
ok('testo del sollecito: importo, scadenza, IBAN e firma; formula diversa se non ancora scaduta')
const ore = [{ pratica_id: 1, minuti: 90, tariffa_oraria: 100, parcella_id: null }, { pratica_id: 1, minuti: 60, tariffa_oraria: 100, parcella_id: 1 }]
const r = m.redditivita([{ id: 1, numero: '2026/001', titolo: 'A', colore: '#000' }, { id: 2, numero: 'x', titolo: 'vuota' }], ore, [{ pratica_id: 1, importo: 40 }], parcelle)
assert.equal(r.length, 1); assert.equal(r[0].minuti, 150); assert.equal(r[0].valoreOre, 250); assert.equal(r[0].oreNonFatturate, 150); assert.equal(r[0].spese, 40)
assert.equal(r[0].fatturato, 3588); assert.equal(r[0].incassato, 1196); assert.equal(r[0].daIncassare, 2458.24)
assert.match(m.csvPratiche(r), /2026\/001;A;2,50;250,00;40,00;3588,00;1196,00;2458,24;150,00/)
ok('redditività per pratica: ore, valore, spese, fatturato (emesse e pagate), incassato, da incassare, ore non fatturate; pratiche senza movimenti escluse')
const partial = P({ incassato: 200, scadenza_pagamento: '2026-05-01' }); assert.equal(m.residuo(partial), 1029.12); assert.equal(m.incassatoNetto(partial), 200); assert.equal(m.solleciti([partial], cli, new Date(2026,4,20))[0].scadenza, '2026-05-01'); assert.match(m.testoSollecito(m.solleciti([partial],cli)[0],{}).corpo,/1\.029,12/); ok('acconti sottratti dai solleciti e scadenza esplicita rispettata')
console.log(`\n${n} prove superate`)
