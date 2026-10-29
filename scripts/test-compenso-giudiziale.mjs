// Calcolo dei compensi civili e penali: i valori attesi sono quelli restituiti dal calcolatore di avvocatoandreani.it
// (registrati il 13/10/2026 con scripts/verifica-andreani.mjs). Il test non usa la rete.
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const out = path.join(os.tmpdir(), `mngmnt-giudiziale-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/compenso.ts', formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(out).href)
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)

const fase = (cod, medio, attiva = true) => ({ cod: String(cod), nome: 'x', attiva, scelta: 2, libero: 0, terna: [medio / 2, medio, medio * 1.5] })
const civile = (fasi, extra = {}) => ({ anno: 2022, competenza: 110, tipo: 'tabellare', scaglione: 30, valore: 0, metodo: 'F', pct: 0, variazione: [50, 50], fasi, ulteriorePct: 0, esitoPositivo: false, esitoImporto: 0, praticantePct: 0, speseEsenti: 0, speseTrasferta: 0, speseAltre: 0, sgOn: true, sgPct: 15, ...extra })
const F4 = [fase(10, 919), fase(20, 777), fase(30, 1680), fase(40, 1701)] // tribunale, scaglione 5.201-26.000, medi 2022
const imp = (r, tipo) => r[tipo].map((x) => x.importo)

let r = m.calcolaCompenso(civile(F4)); assert.equal(r.base, 5077); assert.equal(r.compenso, 5077); assert.equal(r.speseGenerali, 761.55); ok('civile: compenso tabellare = somma delle fasi (5.077) e spese generali')
r = m.calcolaCompenso(civile(F4, { variazioni: { piuParti: { pct: 40 } } })); assert.deepEqual(imp(r, 'aumenti'), [2030.8]); assert.equal(r.compenso, 7107.8); ok('più parti 40% → +2.030,80')
r = m.calcolaCompenso(civile(F4, { variazioni: { piuParti: { pct: 40 }, classAction: { pct: 100 } } })); assert.equal(r.maggiorato, 12184.8); ok('più parti + class action: percentuali sommate sul compenso (12.184,80)')
r = m.calcolaCompenso(civile(F4, { variazioni: { fondatezza: { pct: 10 }, predisposizioni: { pct: 15 } } })); assert.equal(r.aumentoEsito, 1269.25); ok('fondatezza 10% + PCT 15% = +25%')
r = m.calcolaCompenso(civile(F4, { variazioni: { fondatezza: { pct: 10 }, assenzaQfd: { pct: 30 } } })); assert.deepEqual(imp(r, 'riduzioni'), [1675.41]); assert.equal(r.compenso, 3909.29); ok('le riduzioni si calcolano sul compenso già aumentato')
r = m.calcolaCompenso(civile(F4, { variazioni: { assenzaQfd: { pct: 30 }, ritardo: { pct: 25 } } })); assert.deepEqual(imp(r, 'riduzioni'), [1523.1, 888.48]); assert.equal(r.compenso, 2665.42); ok('riduzioni a scalare: 30% poi 25% sul residuo, mezzo centesimo per eccesso (2.665,42)')
r = m.calcolaCompenso(civile(F4, { variazioni: { gp: { pct: 50 } }, praticantePct: 30 })); assert.equal(r.compenso, 1776.95); assert.equal(r.riduzionePraticante, 3300.05); ok('gratuito patrocinio 50% + praticante 30% (1.776,95)')
r = m.calcolaCompenso(civile(F4, { ulteriorePct: 20, variazioni: { fondatezza: { pct: 10 } } })); assert.equal(r.baseUlteriore, 6092.4); assert.deepEqual(imp(r, 'aumenti'), [609.24]); assert.equal(r.compenso, 6701.64); ok('ulteriore valutazione 20% poi aumenti sul compenso aumentato (6.701,64)')
const F3 = [fase(10, 919), fase(20, 777), fase(30, 1680), fase(40, 1701, false)]
r = m.calcolaCompenso(civile(F3, { variazioni: { conciliazione: { pct: 40, importo: 1701 } } })); assert.equal(r.base, 3376); assert.deepEqual(imp(r, 'aumenti'), [2381.4]); assert.equal(r.compenso, 5757.4); ok('conciliazione 2022: la fase decisionale è sostituita da 1.701 + 40% (5.757,40)')
r = m.calcolaCompenso(civile(F4, { anno: 2014, variazioni: { conciliazione: { pct: 10, importo: 1701 } } })); assert.deepEqual(imp(r, 'aumenti'), [170.1]); ok('conciliazione 2014: +10% di 1.701, la fase resta')
r = m.calcolaCompenso(civile(F4, { anno: 2014, variazioni: { responsabilita: { pct: 0 } } })); assert.equal(r.compenso, 2538.5); ok('2014: responsabilità art. 96 c.p.c. o pronunce in rito −50%')
r = m.calcolaCompenso(civile(F4, { anno: 2014, variazioni: { respProc: { pct: 0 }, pronunce: { pct: 0 } } })); assert.equal(r.compenso, 5077); ok('riduzioni valide solo dal 2022 ignorate nelle tabelle 2014')
// tutte le variazioni insieme (prospetto reale del sito)
r = m.calcolaCompenso(civile(F3, { ulteriorePct: 5, variazioni: { piuParti: { pct: 30 }, conciliazione: { pct: 20, importo: 1701 }, classAction: { pct: 100 }, fondatezza: { pct: 10 }, predisposizioni: { pct: 10 }, respProc: { pct: 0 }, pronunce: { pct: 0 }, gp: { pct: 0 } }, praticantePct: 10 }))
assert.equal(r.aumentoUlteriore, 168.8); assert.equal(r.baseUlteriore, 3544.8); assert.deepEqual(imp(r, 'aumenti'), [1063.44, 2143.26, 3544.8, 354.48, 354.48]); assert.equal(r.maggiorato, 11005.26)
assert.deepEqual(imp(r, 'riduzioni'), [8253.95, 1375.66, 687.83, 68.78]); assert.equal(r.compenso, 619.04); ok('tutte le variazioni: 11.005,26 → 8.253,95 + 1.375,66 + 687,83 + 68,78 → 619,04 (come il sito)')
assert.equal(r.aumenti[1].testo, 'Aumento di € 1.786,05 + 20 % per conciliazione giudiziale o transazione della controversia ( art. 4, comma 6 )')
assert.equal(r.riduzioni[0].testo, 'Riduzione del 75 % su € 11.005,26 resp. art 96 c.p.c. ( art. 4, comma 9 )'); assert.equal(r.riduzioni[3].testo, 'Riduzione del 10 % su € 687,82 per compenso liquidato al praticante abilitato ( art. 9 )')
assert.equal(r.aumenti[0].testo, 'Aumento del 30 % per presenza di più parti aventi stessa posizione processuale ( art. 4, comma 2 )'); ok('testi delle righe identici a quelli del sito')
// T.A.R. e Cassazione
const TAR = [fase(10, 1134), fase(20, 1103), fase(30, 992), fase(40, 1911), fase('72', 1061), fase('74', 530)]
r = m.calcolaCompenso(civile(TAR, { competenza: 320, variazioni: { motiviAggiunti: { pct: 20, importo: 1000 }, ricorsoIncidentale: { pct: 10, importo: 1000 } } })); assert.deepEqual(imp(r, 'aumenti'), [200, 100]); assert.equal(r.compenso, 7031); ok('T.A.R.: motivi aggiunti 20% e ricorso incidentale 10% su 1.000')
r = m.calcolaCompenso(civile(TAR, { competenza: 320, ulteriorePct: 10, variazioni: { motiviAggiunti: { pct: 20, importo: 1000 } } })); assert.deepEqual(imp(r, 'aumenti'), [220]); assert.equal(r.aumenti[0].testo, 'Aumento del 20 % su € 1.100,00 per proposizione di motivi aggiunti ( art. 4, comma 10 bis )'); assert.equal(r.compenso, 7624.1); ok('con ulteriore 10% la base degli aumenti collegati alla fase è 1.100 (7.624,10)')
const CASS = [fase(10, 1276), fase(20, 1134), fase(40, 672)]
r = m.calcolaCompenso(civile(CASS, { competenza: 220, variazioni: { memoria378: { pct: 30, importo: 2000 } } })); assert.deepEqual(imp(r, 'aumenti'), [600]); ok('Cassazione: memoria ex art. 378 c.p.c. 30% su 2.000')
r = m.calcolaCompenso(civile(CASS, { competenza: 110, variazioni: { memoria378: { pct: 30, importo: 2000 }, motiviAggiunti: { pct: 20, importo: 1000 } } })); assert.deepEqual(imp(r, 'aumenti'), []); ok('memoria 378 e motivi aggiunti non si applicano alle altre competenze')
// penale
const PEN = [fase(10, 473), fase(20, 567), fase(60, 1134), fase(90, 1418)]
const pen = (extra = {}) => civile(PEN, { competenza: 570, scaglione: 0, ...extra })
r = m.calcolaCompenso(pen({ variazioni: { piuParti: { pct: 60 } } })); assert.equal(r.base, 3592); assert.deepEqual(imp(r, 'aumenti'), [2155.2]); assert.equal(r.aumenti[0].testo, 'Aumento del 60 % per presenza di più parti aventi stessa posizione processuale ( art. 12, comma 2 )'); ok('penale: più parti 60% su 3.592 (art. 12, comma 2)')
r = m.calcolaCompenso(pen({ variazioni: { gp: { pct: 50 } } })); assert.deepEqual(imp(r, 'riduzioni'), [1197.33]); assert.equal(r.compenso, 2394.67); assert.equal(r.riduzioni[0].testo, 'Riduzione di 1/3 su € 3.592,00 per gratuito patrocinio ( art. 106 bis Dpr 115/02 )'); ok('penale: il gratuito patrocinio riduce di un terzo (2.394,67)')
r = m.calcolaCompenso(pen({ ulteriorePct: 10, praticantePct: 7, variazioni: { piuParti: { pct: 60 }, assenzaQfd: { pct: 20 }, gp: { pct: 50 } } }))
assert.equal(r.baseUlteriore, 3951.2); assert.deepEqual(imp(r, 'aumenti'), [2370.72]); assert.equal(r.maggiorato, 6321.92); assert.deepEqual(imp(r, 'riduzioni'), [1264.38, 1685.85, 236.02]); assert.equal(r.compenso, 3135.67); ok('penale: ulteriore 10%, più parti 60%, assenza questioni 20%, gratuito patrocinio, praticante 7% → 3.135,67')
r = m.calcolaCompenso(pen({ variazioni: { conciliazione: { pct: 20, importo: 100 }, classAction: { pct: 100 }, ritardo: { pct: 20 } } })); assert.equal(r.compenso, 3592); ok('penale: le variazioni del solo civile vengono ignorate')
// strumenti per il form
assert.equal(m.ambitoDi(360), 'stragiudiziale'); assert.equal(m.ambitoDi(380), 'stragiudiziale'); assert.equal(m.ambitoDi(370), 'civile'); assert.equal(m.ambitoDi(390), 'civile'); assert.equal(m.ambitoDi(500), 'penale'); assert.equal(m.ambitoDi(640), 'penale')
assert.equal(m.maxPctPiuParti(1), 0); assert.equal(m.maxPctPiuParti(3), 60); assert.equal(m.maxPctPiuParti(10), 270); assert.equal(m.maxPctPiuParti(12), 290); assert.deepEqual(m.opzioniPctPiuParti(3), [0, 10, 20, 30, 40, 50, 60]); assert.deepEqual(m.opzioniPctPiuParti(12).slice(-6), [260, 270, 275, 280, 285, 290]); ok('numero di parti: percentuali selezionabili come nel sito')
assert.deepEqual(m.variazioniValide('civile', 2022, 110, 'aumento').map((v) => v.id), ['piuParti', 'conciliazione', 'classAction', 'fondatezza', 'predisposizioni'])
assert.deepEqual(m.variazioniValide('civile', 2022, 320, 'aumento').map((v) => v.id), ['piuParti', 'conciliazione', 'classAction', 'fondatezza', 'predisposizioni', 'motiviAggiunti', 'ricorsoIncidentale'])
assert.deepEqual(m.variazioniValide('civile', 2014, 320, 'aumento').map((v) => v.id), ['piuParti', 'conciliazione', 'classAction', 'fondatezza', 'predisposizioni', 'motiviAggiunti'])
assert.deepEqual(m.variazioniValide('civile', 2022, 110, 'riduzione').map((v) => v.id), ['assenzaQfd', 'respProc', 'pronunce', 'ritardo', 'gp']); assert.deepEqual(m.variazioniValide('civile', 2014, 110, 'riduzione').map((v) => v.id), ['assenzaQfd', 'responsabilita', 'ritardo', 'gp'])
assert.deepEqual(m.variazioniValide('penale', 2022, 570, 'aumento').map((v) => v.id), ['piuParti']); assert.deepEqual(m.variazioniValide('penale', 2022, 570, 'riduzione').map((v) => v.id), ['assenzaQfd', 'gp']); assert.deepEqual(m.variazioniValide('stragiudiziale', 2022, 360, 'aumento'), []); ok('variazioni disponibili per ambito, anno e competenza (T.A.R./Consiglio di Stato, Cassazione, 2014/2022)')
const d = m.costruisciDettaglio(civile(F4, { competenzaNome: 'Giudizi di cognizione innanzi al tribunale' }), m.calcolaCompenso(civile(F4)), 'Da € 5.201 a € 26.000', false, 1)
assert.deepEqual(d.intestazione, ['Liquidazione giudiziale compenso avvocati in ambito Civile', 'Artt. 1 - 11 D.M. 55/2014']); assert.equal(d.competenza, 'giudizi di cognizione innanzi al tribunale'); assert.equal(d.etichettaValore, 'Valore della causa'); assert.deepEqual(d.fasi.map((f) => f.nome), ['Fase di studio della controversia', 'Fase introduttiva del giudizio', 'Fase istruttoria e/o di trattazione', 'Fase decisionale'])
const dp = m.costruisciDettaglio(pen(), m.calcolaCompenso(pen()), '', false, 1); assert.equal(dp.intestazione[1], 'Artt. 1 - 3 e 12 - 17 D.M. 55/2014'); assert.equal(dp.etichettaValore, ''); ok('prospetto: intestazione, competenza e nomi delle fasi come nel sito (civile e penale)')
fs.rmSync(out, { force: true })
console.log(`\n${n} prove superate`)
