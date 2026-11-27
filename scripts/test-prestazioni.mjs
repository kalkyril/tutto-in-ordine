// Budget di prestazioni: tempi massimi per le operazioni che rallentano per prime quando l'archivio cresce.
// Una prova che supera il suo limite fa fallire `npm test` (e la CI su Mac e Windows): una regressione di velocità si
// vede prima del rilascio, come un errore di calcolo.
//
//  1. apertura di un archivio con 3.000 pratiche, 12.000 scadenze e 12.000 attività: apertura del file, controllo di
//     integrità (come electron/main.js) e lettura delle tabelle che la finestra carica all'avvio (le stesse di src/store.tsx,
//     lette dal sorgente), più la copia verso la finestra (serializzazione come l'IPC di Electron);
//  2. calcoli della sezione Budget (src/lib/pagamenti.ts, src/lib/budget.ts, src/lib/indicatori.ts) e dei report
//     (src/lib/report.ts) su 4.000 documenti di vendita, 8.000 voci da pagare, 12.000 ore;
//  3. esportazione di un documento lungo (circa 300 pagine) in Word, OpenDocument, RTF, HTML, Markdown e testo
//     (electron/documento.js) e in PDF con la stampa isolata dell'app (electron/print-pdf.js, in un processo Electron);
//  4. crescita: con il doppio dei dati il tempo dei calcoli deve circa raddoppiare. Un algoritmo quadratico (tempo × 4)
//     fallisce anche su un computer velocissimo, dove i limiti assoluti non lo noterebbero.
//
// Ogni tempo è il migliore di alcuni giri: sui runner condivisi di GitHub il primo giro e i disturbi di altri processi
// pesano molto più della variazione del codice. I limiti sono 5-8 volte i tempi misurati su un Mac con Apple M
// (vedi LIMITI): abbastanza larghi per i runner Windows; la prova di crescita copre i rallentamenti che i margini nascondono.
// Con TIO_PRESTAZIONI_FATTORE=2 i limiti raddoppiano (computer lento); con NODE_V8_COVERAGE (misura della copertura)
// i tempi sono falsati dagli strumenti e si stampano senza bloccare. TIO_PRESTAZIONI_RISULTATI=<file.json> salva le misure.
//
// Uso: node scripts/test-prestazioni.mjs
import { build } from 'vite'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import v8 from 'node:v8'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const db = require('../electron/db')
const documento = require('../electron/documento')
const { leggiZip } = require('../electron/zip')

const FATTORE = Math.max(1, Number(process.env.TIO_PRESTAZIONI_FATTORE) || 1)
const SOLO_MISURA = !!process.env.NODE_V8_COVERAGE

// limiti in millisecondi; tra parentesi il tempo su un Mac con Apple M (novembre 2026). Margine circa 5 volte per i calcoli,
// circa 8 per le operazioni sul file dell'archivio (su Windows l'antivirus controlla anche i file temporanei).
const LIMITI = {
  'archivio: apertura e controllo di integrità': 400, // (49)
  'archivio: tabelle della prima schermata': 600, // (75)
  'archivio: copia verso la finestra': 500, // (67)
  'archivio: rubrica, note e allegati (dopo la prima schermata)': 150, // (10)
  'budget: movimenti e uscite ricorrenti': 150, // (22)
  'budget: saldi dei conti': 60, // (7)
  'budget: stima di tasse e contributi': 60, // (6)
  'budget: budget dell’anno e previsione a 12 mesi': 60, // (7)
  'budget: indicatori': 100, // (12)
  'report: prima nota CSV': 60, // (5)
  'report: solleciti': 120, // (14)
  'report: redditività per pratica e CSV': 100, // (750: eccezione nota più sotto; con il raggruppamento per pratica pochi ms)
  'report: dati di fatturazione CSV': 30, // (0,3)
  'documento lungo: Word (.docx)': 120, // (15)
  'documento lungo: OpenDocument (.odt)': 120, // (12)
  'documento lungo: RTF': 200, // (28)
  'documento lungo: HTML': 60, // (6)
  'documento lungo: Markdown': 50, // (5)
  'documento lungo: testo': 40, // (3)
  'documento lungo: PDF': 5000, // (690, 169 pagine)
}
const CRESCITA_MAX = 3 // tempo con il doppio dei dati / tempo con i dati di base: lineare ≈ 2, quadratico ≈ 4

// Rallentamenti già noti, da correggere nel codice dell'app: la prova li misura e li stampa senza bloccare fino alla
// scadenza; dopo blocca di nuovo, così non restano dimenticati (come le eccezioni di scripts/controlla-audit.js).
// Quando la correzione arriva, la prova lo dice («eccezione non necessaria su questo computer»): se vale su Mac e Windows, la voce va tolta.
// Sui computer più veloci la parte quadratica di solleciti() può restare sotto il limite: conta il risultato di tutti i sistemi.
const ECCEZIONI = [
  {
    prove: ['report: redditività per pratica e CSV', 'crescita redditività per pratica'], scade: '2027-01-31',
    motivo: 'redditivita() in src/lib/report.ts filtra tutte le ore, le spese e i documenti per ogni pratica (pratiche × righe): ' +
      'con 4.000 pratiche e 12.000 ore circa 0,75 s al primo calcolo. Correzione: raggruppare una volta per pratica_id con una Map.',
  },
  {
    prove: ['crescita solleciti'], scade: '2027-01-31',
    motivo: 'solleciti() in src/lib/report.ts filtra tutte le rate per ogni documento aperto (documenti × rate). ' +
      'Correzione: raggruppare le rate per parcella_id una volta sola, come fa movimenti() in src/lib/pagamenti.ts.',
  },
]
const OGGI_ISO = new Date().toISOString().slice(0, 10)
const eccezione = (nome) => ECCEZIONI.find((e) => e.prove.includes(nome))
for (const e of ECCEZIONI) assert.ok(e.scade >= OGGI_ISO, `eccezione scaduta il ${e.scade} per ${e.prove.join(', ')}: ${e.motivo}`)
/** Esito di una misura: superata, eccezione nota (stampata, non blocca) o fallita. */
function esito(nome, superata, riga) {
  const e = eccezione(nome)
  if (superata) { ok(riga + (e ? ' — eccezione non necessaria su questo computer: se il limite è rispettato anche sugli altri sistemi, togli la voce da ECCEZIONI' : '')); return }
  if (e) { console.log(`ok ${++n} - NOTA ${riga} — rallentamento noto, eccezione fino al ${e.scade}: ${e.motivo}`); return }
  assert.fail(riga)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-prestazioni-'))
const misure = []
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)
const ora = () => process.hrtime.bigint()
const durata = (t0) => Number(process.hrtime.bigint() - t0) / 1e6

/** Il migliore di `giri` esecuzioni di f (sincrona); restituisce [ms, risultato dell'ultimo giro]. */
function migliore(f, giri = 3) {
  let best = Infinity, r
  for (let i = 0; i < giri; i++) { const t0 = ora(); r = f(); best = Math.min(best, durata(t0)) }
  return [best, r]
}
function registra(nome, ms, extra = '') {
  const limite = LIMITI[nome]
  assert.ok(limite, `limite mancante per «${nome}»`)
  const max = limite * FATTORE
  misure.push({ nome, ms: Math.round(ms * 10) / 10, limite: max })
  const riga = `${nome}: ${ms.toFixed(1)} ms (limite ${max} ms, ${Math.round((ms / max) * 100)}%)${extra ? ' · ' + extra : ''}`
  if (SOLO_MISURA) { console.log('misura ' + riga); return }
  esito(nome, ms <= max, ms <= max ? riga : `troppo lento — ${riga}`)
}
const misura = (nome, f, giri = 3) => { const [ms, r] = migliore(f, giri); registra(nome, ms); return r }
// Pulizia della memoria prima di ogni misura di crescita: senza, una raccolta lasciata a metà dai giri precedenti cade
// a caso su una delle due misure (sui runner macOS di GitHub ha portato un calcolo lineare a × 3,2).
const raccogli = (() => { try { v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc'); return typeof gc === 'function' ? gc : () => {} } catch { return () => {} } })()
const TENTATIVI = 3 // un runner disturbato può sforare una volta; un algoritmo quadratico resta oltre il limite a ogni tentativo
function crescita(nome, f, base, giri = 5) {
  f(base); f(base * 2) // riscaldamento: il compilatore JIT ottimizza dopo le prime chiamate e falserebbe il primo tempo
  let t1, t2, rapporto, tentativo = 0
  do {
    tentativo++; t1 = Infinity; t2 = Infinity
    for (let i = 0; i < giri; i++) { // giri alternati: un disturbo del runner pesa allo stesso modo sulle due misure
      raccogli(); let t0 = ora(); f(base); t1 = Math.min(t1, durata(t0))
      raccogli(); t0 = ora(); f(base * 2); t2 = Math.min(t2, durata(t0))
    }
    rapporto = t2 / Math.max(t1, 0.001)
  } while (rapporto > CRESCITA_MAX && t1 >= 5 && tentativo < TENTATIVI && !SOLO_MISURA)
  const riga = `crescita ${nome}: ${t1.toFixed(1)} ms → ${t2.toFixed(1)} ms con il doppio dei dati (× ${rapporto.toFixed(2)}, massimo × ${CRESCITA_MAX})` +
    (tentativo > 1 ? ` al tentativo ${tentativo} di ${TENTATIVI}` : '')
  misure.push({ nome: 'crescita ' + nome, ms: Math.round(t2 * 10) / 10, rapporto: Math.round(rapporto * 100) / 100 })
  if (SOLO_MISURA) { console.log('misura ' + riga); return }
  // sotto i 5 ms il rumore del timer conta più dell'algoritmo: la crescita non si giudica
  if (t1 < 5) { ok(riga + ' (tempi troppo brevi per giudicare)'); return }
  esito('crescita ' + nome, rapporto <= CRESCITA_MAX, rapporto <= CRESCITA_MAX ? riga : `crescita più che lineare — ${riga}`)
}

try {
  // ---------- 1. archivio grande ----------
  const store = fs.readFileSync(path.join(radice, 'src/store.tsx'), 'utf8')
  const blocco = store.match(/const TABLES: Record<string, string> = \{([\s\S]*?)\n\}/)
  const differiteSrc = store.match(/const differite = \[([^\]]*)\]/)
  assert.ok(blocco && differiteSrc, 'tabelle caricate all’avvio non trovate in src/store.tsx: aggiorna questa prova')
  const TABELLE = Object.fromEntries([...blocco[1].matchAll(/(\w+): '([^']*)'/g)].map((m) => [m[1], m[2]]))
  const differite = [...differiteSrc[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
  const avvio = Object.keys(TABELLE).filter((t) => !differite.includes(t))
  assert.ok(avvio.includes('pratiche') && avvio.includes('scadenze') && differite.includes('anagrafica'), 'tabelle di src/store.tsx inattese')

  const dir = path.join(tmp, 'archivio')
  db.open(dir)
  const oggi = new Date()
  const iso = (dd, h = 9) => { const x = new Date(oggi); x.setDate(x.getDate() + dd); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:00` }
  const t0 = ora()
  db.transaction(() => {
    const clienti = [], pratiche = []
    for (let i = 0; i < 3000; i++) clienti.push(db.save('anagrafica', { denominazione: `Cliente ${i} Srl`, email: `c${i}@esempio.it`, codice_fiscale: `CF${i}`, telefono: `059 ${100000 + i}` }).id)
    for (let i = 0; i < 3000; i++) pratiche.push(db.save('pratiche', { numero: `2026/${String(i).padStart(4, '0')}`, titolo: `Pratica ${i} — risarcimento danni e questioni accessorie`, cliente_id: clienti[i], stato: i % 7 ? 'In corso' : 'Chiusa', colore: ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6'][i % 4], descrizione: 'Descrizione della pratica '.repeat(4) }).id)
    for (let i = 0; i < 12000; i++) db.save('scadenze', { pratica_id: pratiche[i % 3000], titolo: `Scadenza ${i}`, tipo: 'scadenza', data_ora: iso((i % 400) - 100, 9 + (i % 8)), promemoria: [1440, 60], completata: i % 3 === 0 ? 1 : 0 })
    for (let i = 0; i < 12000; i++) db.save('todos', { pratica_id: pratiche[i % 3000], titolo: `Attività ${i}`, scadenza: iso((i % 300) - 50), completata: i % 4 === 0 ? 1 : 0, ordine: i })
    for (let i = 0; i < 9000; i++) db.save('ore', { pratica_id: pratiche[i % 3000], data: iso(-(i % 700)).slice(0, 10), minuti: 30 + (i % 8) * 15, descrizione: `Studio degli atti ${i}`, tariffa_oraria: 150 })
    for (let i = 0; i < 3000; i++) db.save('spese', { pratica_id: pratiche[i], data: iso(-(i % 500)).slice(0, 10), descrizione: `Contributo unificato ${i}`, importo: 98 + (i % 5) })
    for (let i = 0; i < 6000; i++) db.save('note', { pratica_id: pratiche[i % 3000], testo: `Nota ${i}: ` + 'telefonata con il cliente e aggiornamento sullo stato della causa. '.repeat(3) })
    for (let i = 0; i < 2000; i++) db.saveParcella({ data: iso(-(i % 600)).slice(0, 10), cliente_id: clienti[i], pratica_id: pratiche[i], compensi: 1000, voci: [{ tipo: 'compenso', descrizione: 'Compenso', quantita: 1, importo: 1000 }, { tipo: 'spesa_esente', descrizione: 'Contributo unificato', quantita: 1, importo: 98 }] })
  })
  const righe = Object.fromEntries(['pratiche', 'scadenze', 'todos', 'anagrafica'].map((t) => [t, db.list(t).length]))
  assert.deepEqual(righe, { pratiche: 3000, scadenze: 12000, todos: 12000, anagrafica: 3000 })
  db.close()
  console.log(`# archivio di prova creato in ${(durata(t0) / 1000).toFixed(1)} s: 3.000 pratiche, 12.000 scadenze, 12.000 attività, 9.000 ore, 6.000 note, 2.000 parcelle`)

  misura('archivio: apertura e controllo di integrità', () => { db.close(); db.open(dir); assert.ok(db.verificaIntegrita()) })
  const prima = misura('archivio: tabelle della prima schermata', () => Object.fromEntries([...avvio.map((t) => [t, db.list(t, {}, TABELLE[t])]), ['settings', db.getSettings()]]))
  assert.equal(prima.scadenze.length, 12000)
  misura('archivio: copia verso la finestra', () => { for (const v of Object.values(prima)) v8.deserialize(v8.serialize(v)) })
  misura('archivio: rubrica, note e allegati (dopo la prima schermata)', () => differite.map((t) => db.list(t, {}, TABELLE[t])))
  db.close()

  // ---------- 2. calcoli di Budget e report ----------
  const out = path.join(tmp, 'lib')
  await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: { pagamenti: 'src/lib/pagamenti.ts', budget: 'src/lib/budget.ts', indicatori: 'src/lib/indicatori.ts', report: 'src/lib/report.ts' }, formats: ['es'], fileName: (_f, nome) => `${nome}.mjs` }, outDir: out, emptyOutDir: false, minify: false } })
  const imp = (nome) => import(pathToFileURL(path.join(out, `${nome}.mjs`)).href)
  const [pag, bud, ind, rep] = await Promise.all(['pagamenti', 'budget', 'indicatori', 'report'].map(imp))

  const OGGI = '2026-11-20', ANNO = 2026
  const giorno = (i) => { const t = new Date(Date.UTC(2024, 0, 1) + (i % 1050) * 86400000); return t.toISOString().slice(0, 10) }
  /** Dati sintetici della gestione di uno studio con `n` documenti di vendita (deterministici: stessa n, stessi dati). */
  function gestione(n) {
    const clienti = Array.from({ length: Math.ceil(n / 2) }, (_, i) => ({ id: i + 1, denominazione: `Cliente ${i} Srl`, codice_fiscale: `CF${i}`, partita_iva: String(10000000000 + i), email: `c${i}@esempio.it` }))
    const pratiche = Array.from({ length: n }, (_, i) => ({ id: i + 1, numero: `${2024 + (i % 3)}/${i}`, titolo: `Pratica ${i}`, colore: '#3b82f6', cliente_id: 1 + (i % clienti.length) }))
    const stati = ['emessa', 'pagata', 'pagata', 'emessa', 'bozza', 'annullata', 'pagata', 'emessa']
    const parcelle = Array.from({ length: n }, (_, i) => {
      const data = giorno(i * 7), stato = stati[i % stati.length], comp = 500 + (i % 20) * 100
      const imponibile = Math.round(comp * 1.15 * 1.04 * 100) / 100, iva = Math.round(imponibile * 22) / 100, ritenuta = Math.round(comp * 1.15 * 20) / 100
      return { id: i + 1, anno: Number(data.slice(0, 4)), progressivo: i + 1, numero: `${i + 1}/${data.slice(0, 4)}`, pratica_id: 1 + (i % n), cliente_id: 1 + (i % clienti.length), tipo: i % 25 === 0 ? 'nota_credito' : i % 13 === 0 ? 'preventivo' : 'parcella', data, oggetto: `Attività stragiudiziale ${i}`, stato,
        incassato: stato === 'emessa' && i % 3 === 0 ? 200 : 0, scadenza_pagamento: i % 4 === 0 ? giorno(i * 7 + 60) : null, data_pagamento: stato === 'pagata' ? giorno(i * 7 + 20) : null, incassi_dettagliati: i % 5 === 0 ? 1 : 0,
        sg_perc: 15, cpa_perc: 4, iva_perc: 22, rit_perc: 20, bollo: 0, compensi: comp, spese_generali: comp * 0.15, cpa: imponibile - comp * 1.15, imponibile, iva, spese_esenti: 0, ritenuta, totale: imponibile + iva, netto: imponibile + iva - ritenuta }
    })
    const categorie = ['Affitto', 'Utenze', 'Software', 'Formazione', 'Cancelleria', 'Imposte e contributi', 'Assicurazioni']
    const costi = Array.from({ length: 2 * n }, (_, i) => ({ id: i + 1, pratica_id: i % 3 ? null : 1 + (i % n), fornitore_id: null, data: giorno(i * 3), descrizione: `Spesa ${i}`, categoria: categorie[i % categorie.length], importo: 20 + (i % 50) * 7, scadenza: i % 2 ? giorno(i * 3 + 30) : null, pagata: i % 3 ? 1 : 0, pagata_il: i % 3 ? giorno(i * 3 + 10) : null,
      ripeti: i % 40 === 0 ? ['mensile', 'trimestrale', 'annuale'][(i / 40) % 3] : null, serie: i % 40 === 0 ? i + 1 : null, ripeti_giorno: i % 40 === 0 ? 1 + (i % 28) : null, conto_id: 1 + (i % 3) }))
    const pagamenti = parcelle.filter((p) => p.incassi_dettagliati).flatMap((p, k) => [0, 1].map((j) => ({ id: k * 2 + j + 1, parcella_id: p.id, data: giorno(p.id * 7 + 10 + j * 20), importo: Math.round(p.netto * 0.4 * 100) / 100, metodo: 'bonifico', conto_id: 1 + (j % 3) })))
    const rate = parcelle.filter((p) => p.stato === 'emessa' && p.id % 6 === 0).flatMap((p, k) => [1, 2, 3].map((j) => ({ id: k * 3 + j, parcella_id: p.id, data: giorno(p.id * 7 + 30 * j), importo: Math.round((p.netto / 3) * 100) / 100 })))
    const fatture = Array.from({ length: n }, (_, i) => ({ id: i + 1, verso: i % 3 ? 'ricevuta' : 'emessa', tipo: 'TD01', numero: i % 6 === 0 ? `${i + 1}/${giorno(i * 7).slice(0, 4)}` : `F${i}`, data: giorno(i * 5), controparte: `Fornitore ${i % 90}`, piva: String(20000000000 + i), cf: null, descrizione: 'Servizi',
      imponibile: 300 + (i % 30) * 10, iva: 66, ritenuta: 0, cassa: 0, bollo: 0, totale: 366 + (i % 30) * 10, netto: 366 + (i % 30) * 10, scadenza: giorno(i * 5 + 30), file: null, regolata_il: i % 2 ? giorno(i * 5 + 25) : null, conto_id: null, categoria: null, nascosta: i % 50 === 0 ? 1 : 0 }))
    const conti = [1, 2, 3].map((id) => ({ id, nome: `Conto ${id}`, tipo: 'banca', iban: null, saldo_iniziale: 5000 * id, data_saldo: '2024-01-01', predefinito: id === 1 ? 1 : 0, archiviato: 0, note: null }))
    const manuali = Array.from({ length: Math.ceil(n / 4) }, (_, i) => ({ id: i + 1, conto_id: 1 + (i % 3), data: giorno(i * 11), importo: i % 2 ? -150 : 400, descrizione: `Movimento ${i}`, categoria: i % 2 ? 'Prelievi' : null, verso_conto_id: i % 17 === 0 ? 1 + ((i + 1) % 3) : null }))
    const ore = Array.from({ length: 3 * n }, (_, i) => ({ id: i + 1, pratica_id: 1 + (i % n), data: giorno(i * 2), minuti: 30 + (i % 8) * 15, descrizione: `Studio ${i}`, tariffa_oraria: 150, parcella_id: i % 4 ? 1 + (i % n) : null }))
    const spese = Array.from({ length: n }, (_, i) => ({ id: i + 1, pratica_id: 1 + (i % n), data: giorno(i * 4), descrizione: `Contributo ${i}`, importo: 98, esente: 1, parcella_id: i % 2 ? 1 + (i % n) : null }))
    return { clienti, pratiche, parcelle, costi, pagamenti, rate, fatture, conti, manuali, ore, spese, cli: new Map(clienti.map((c) => [c.id, c])), pr: new Map(pratiche.map((p) => [p.id, p])) }
  }
  // la stessa catena di src/components/budget/contesto.ts
  const tuttiMovimenti = (g) => [...pag.movimenti(g.parcelle, g.costi, g.pagamenti, OGGI, 30, g.fatture, g.rate), ...pag.usciteRicorrentiPreviste(g.costi, '2027-11-20')].sort((a, c) => a.data.localeCompare(c.data) || a.chiave.localeCompare(c.chiave))
  const documentiFiscali = (g) => {
    const doppie = pag.fattureDoppie(g.fatture, g.parcelle)
    return [...g.parcelle.filter((p) => (p.tipo === 'parcella' || p.tipo === 'nota_credito') && p.stato !== 'bozza' && p.stato !== 'annullata').map((p) => ({ data: p.data, imponibile: p.imponibile, iva: p.iva, ritenuta: p.ritenuta, verso: 'emesso' })),
      ...g.fatture.filter((f) => !f.nascosta && !doppie.has(f.id)).map((f) => ({ data: f.data, imponibile: f.imponibile, iva: f.iva, ritenuta: f.ritenuta, verso: f.verso === 'emessa' ? 'emesso' : 'ricevuto' }))]
  }

  const g = gestione(4000)
  const tutti = misura('budget: movimenti e uscite ricorrenti', () => tuttiMovimenti(g))
  assert.ok(tutti.length > 10000, `movimenti: ${tutti.length}`)
  const saldi = misura('budget: saldi dei conti', () => bud.saldiConti(g.conti, g.manuali, tutti, OGGI))
  const saldoOggi = saldi.reduce((t, s) => t + s.saldo, 0)
  misura('budget: stima di tasse e contributi', () => [bud.stimaFiscale(tutti, documentiFiscali(g), ANNO, { regime: 'forfettario' }, 0), bud.stimaFiscale(tutti, documentiFiscali(g), ANNO, { regime: 'ordinario' }, 0)])
  misura('budget: budget dell’anno e previsione a 12 mesi', () => [bud.calcolaBudget(tutti, ANNO, { categorie: { Affitto: 12000, Software: 2000 }, accantonamento: 25 }), bud.previsione(tutti.filter((x) => x.stato === 'da_incassare' || x.stato === 'da_pagare'), saldoOggi, OGGI, 12)])
  misura('budget: indicatori', () => ind.calcolaIndicatori({ anno: ANNO, oggi: OGGI, parcelle: g.parcelle, movimenti: tutti, fatture: g.fatture, costi: g.costi, spese: g.spese, pratiche: g.pratiche, nomeCliente: (id) => g.cli.get(id)?.denominazione }))
  const csv = misura('report: prima nota CSV', () => rep.primaNotaCsv(g.parcelle, g.cli, g.pr, ANNO))
  assert.ok(csv.split('\r\n').length > 500)
  misura('report: solleciti', () => rep.solleciti(g.parcelle, g.cli, new Date(2026, 10, 20), 30, g.rate))
  misura('report: redditività per pratica e CSV', () => rep.csvPratiche(rep.redditivita(g.pratiche, g.ore, g.spese, g.parcelle)))
  misura('report: dati di fatturazione CSV', () => rep.datiFatturazioneCsv(g.parcelle, g.cli))

  const generati = new Map([[4000, g]])
  const dati = (k) => { if (!generati.has(k)) generati.set(k, gestione(k)); return generati.get(k) }
  crescita('movimenti e saldi del Budget', (k) => { const d = dati(k), m = tuttiMovimenti(d); return bud.saldiConti(d.conti, d.manuali, m, OGGI) }, 2000)
  crescita('indicatori', (k) => { const d = dati(k); return ind.calcolaIndicatori({ anno: ANNO, oggi: OGGI, parcelle: d.parcelle, movimenti: tuttiMovimenti(d), fatture: d.fatture, costi: d.costi, spese: d.spese, pratiche: d.pratiche, nomeCliente: (id) => d.cli.get(id)?.denominazione }) }, 2000)
  crescita('redditività per pratica', (k) => { const d = dati(k); return rep.redditivita(d.pratiche, d.ore, d.spese, d.parcelle) }, 2000)
  crescita('solleciti', (k) => { const d = dati(k); return rep.solleciti(d.parcelle, d.cli, new Date(2026, 10, 20), 30, d.rate) }, 4000)
  generati.clear()

  // ---------- 3. documento lungo ----------
  const run = (t, o = {}) => ({ t, ...o })
  const paragrafo = (i) => ({ tipo: 'p', allineamento: 'giustificato', runs: [run(`${i}. `, { b: true }), run('Il sottoscritto difensore, richiamate le difese già svolte e le produzioni documentali in atti, '), run('rileva', { i: true }), run(' che la domanda avversaria è infondata in fatto e in diritto per le ragioni che seguono, con riserva di ulteriormente dedurre e produrre nei termini di legge. '.repeat(2))] })
  /** Un atto di `sezioni` capitoli: titolo, otto paragrafi, un elenco e ogni cinque capitoli una tabella. */
  function lungo(sezioni) {
    const corpo = []
    for (let s = 1; s <= sezioni; s++) {
      corpo.push({ tipo: 'h2', runs: [run(`${s}. Motivo di impugnazione n. ${s}`)] })
      for (let p = 0; p < 8; p++) corpo.push(paragrafo(s * 10 + p))
      for (const v of ['primo profilo', 'secondo profilo', 'terzo profilo']) corpo.push({ tipo: 'ul', runs: [run(`Sul ${v} del motivo ${s}`)] })
      if (s % 5 === 0) corpo.push({ tipo: 'table', intestazione: true, celle: [['Voce', 'Data', 'Importo'], ...Array.from({ length: 6 }, (_, r) => [`Voce ${r}`, '12/03/2026', `€ ${(r + 1) * 1000},00`])].map((riga) => riga.map((c) => [run(c)])) })
      if (s % 25 === 0) corpo.push({ tipo: 'pagebreak', runs: [] })
    }
    return {
      titolo: 'Atto di citazione in appello', font: 'Georgia', numeriPagina: true,
      intestazione: [{ testo: 'Studio Legale Esempio', dimensione: 'grande', grassetto: true, corsivo: false, allineamento: 'centro' }],
      footer: [{ testo: 'Via delle Prove 1 · Modena · tel. 059 000000', dimensione: 'piccola', grassetto: false, corsivo: false, allineamento: 'centro' }],
      corpo,
    }
  }
  const atto = lungo(150)
  console.log(`# documento lungo: ${atto.corpo.length} blocchi`)
  const nomi = { docx: 'Word (.docx)', odt: 'OpenDocument (.odt)', rtf: 'RTF', html: 'HTML', md: 'Markdown', txt: 'testo' }
  let html
  for (const f of documento.FORMATI) {
    const buf = misura(`documento lungo: ${nomi[f]}`, () => documento.genera(f, atto))
    // tutto il documento, fino all'ultimo capitolo, è nel file (.docx e .odt sono ZIP: si legge la parte con il testo)
    const testo = f === 'docx' ? leggiZip(buf).leggi('word/document.xml').toString() : f === 'odt' ? leggiZip(buf).leggi('content.xml').toString() : buf.toString('latin1')
    assert.ok(testo.length > 500000 && testo.toLowerCase().includes('motivo di impugnazione n. 150'), `${f}: documento incompleto (${testo.length} caratteri)`)
    if (f === 'html') html = buf.toString('utf8')
  }
  crescita('documento Word', (k) => documento.genera('docx', lungo(k)), 75)

  // PDF: processo Electron separato con la stampa dell'app (l'avvio di Electron non entra nel tempo)
  const fileHtml = path.join(tmp, 'atto.html'); fs.writeFileSync(fileHtml, html)
  const env = { ...process.env, TIO_PDF_HTML: fileHtml, TIO_PDF_PROFILO: path.join(tmp, 'profilo-electron'), TIO_PDF_GIRI: '2' }
  delete env.ELECTRON_RUN_AS_NODE
  const r = spawnSync(require('electron'), [path.join(radice, 'scripts/prestazioni-pdf.js')], { env, encoding: 'utf8', timeout: 180000 })
  const riga = String(r.stdout || '').trim().split('\n').filter((x) => x.startsWith('{')).pop()
  assert.ok(riga, `stampa PDF senza risultato (codice ${r.status}): ${String(r.stderr || '').slice(-2000)}`)
  const pdf = JSON.parse(riga)
  assert.ok(!pdf.errore, `stampa PDF non riuscita: ${pdf.errore}`)
  assert.ok(pdf.pagine >= 100, `PDF di sole ${pdf.pagine} pagine: il documento non è abbastanza lungo per la prova`)
  registra('documento lungo: PDF', Math.min(...pdf.tempi), `${pdf.pagine} pagine, ${(pdf.byte / 1e6).toFixed(1)} MB, primo giro ${pdf.tempi[0].toFixed(0)} ms`)

  if (process.env.TIO_PRESTAZIONI_RISULTATI) {
    fs.mkdirSync(path.dirname(process.env.TIO_PRESTAZIONI_RISULTATI), { recursive: true })
    fs.writeFileSync(process.env.TIO_PRESTAZIONI_RISULTATI, JSON.stringify({ sistema: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0]?.model, node: process.version, fattore: FATTORE, misure }, null, 2))
  }
  console.log(SOLO_MISURA ? `\n${misure.length} tempi misurati (misura della copertura in corso: limiti non applicati)` : `\n${n} prove di prestazioni superate`)
} finally {
  try { db.close() } catch { /* già chiuso */ }
  // su Windows i file del profilo di Electron possono restare bloccati qualche istante dopo l'uscita: si ritenta
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
