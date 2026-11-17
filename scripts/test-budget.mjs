// Sezione Budget (1.0.4): saldi dei conti, previsione di cassa, stima di tasse e contributi, lettura delle fatture
// esportate dal servizio di fatturazione (XML, .p7m, ZIP; mai scritte né inviate) e pacchetto per il commercialista.
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-budget-'))
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: { pagamenti: 'src/lib/pagamenti.ts', budget: 'src/lib/budget.ts', commercialista: 'src/lib/commercialista.ts', budgetPratica: 'src/lib/budgetPratica.ts', indicatori: 'src/lib/indicatori.ts', report: 'src/lib/report.ts' }, formats: ['es'], fileName: (_f, n) => `${n}.mjs` }, outDir: out, emptyOutDir: false, minify: false } })
const imp = (n) => import(pathToFileURL(path.join(out, `${n}.mjs`)).href)
const pag = await imp('pagamenti'), bud = await imp('budget'), com = await imp('commercialista'), bp = await imp('budgetPratica'), ind = await imp('indicatori'), rep = await imp('report')
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)

const fattura = ({ numero, data, cedente, committente, imponibile, iva = 0, ritenuta = 0, scadenza, tipo = 'TD01', prefisso = 'p:' }) => `<?xml version="1.0" encoding="UTF-8"?>
<${prefisso}FatturaElettronica versione="FPR12" xmlns:${prefisso.slice(0, -1) || 'x'}="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
<FatturaElettronicaHeader>
 <CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${cedente.piva}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>${cedente.nome}</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
 <CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${committente.piva}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>${committente.nome}</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
</FatturaElettronicaHeader>
<FatturaElettronicaBody>
 <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>${tipo}</TipoDocumento><Data>${data}</Data><Numero>${numero}</Numero>${ritenuta ? `<DatiRitenuta><ImportoRitenuta>${ritenuta.toFixed(2)}</ImportoRitenuta></DatiRitenuta>` : ''}<ImportoTotaleDocumento>${(imponibile + iva).toFixed(2)}</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
 <DatiBeniServizi><DettaglioLinee><Descrizione>Consulenza &amp; assistenza</Descrizione></DettaglioLinee><DatiRiepilogo><ImponibileImporto>${imponibile.toFixed(2)}</ImponibileImporto><Imposta>${iva.toFixed(2)}</Imposta></DatiRiepilogo></DatiBeniServizi>
 ${scadenza ? `<DatiPagamento><DettaglioPagamento><DataScadenzaPagamento>${scadenza}</DataScadenzaPagamento><ImportoPagamento>${(imponibile + iva - ritenuta).toFixed(2)}</ImportoPagamento></DettaglioPagamento></DatiPagamento>` : ''}
</FatturaElettronicaBody>
</${prefisso}FatturaElettronica>`

try {
  // ---------- saldi dei conti
  const conti = [
    { id: 1, nome: 'Banca', tipo: 'banca', iban: null, saldo_iniziale: 1000, data_saldo: '2026-01-01', predefinito: 1, archiviato: 0, note: null },
    { id: 2, nome: 'Contanti', tipo: 'contanti', iban: null, saldo_iniziale: 50, data_saldo: '2026-01-01', predefinito: 0, archiviato: 0, note: null },
  ]
  const mov = [
    { chiave: 'a', data: '2025-12-30', stato: 'incassate', importo: 999, descrizione: 'prima del saldo', pratica_id: null, scaduto: false },
    { chiave: 'b', data: '2026-02-01', stato: 'incassate', importo: 500, descrizione: 'Incasso senza conto', pratica_id: null, scaduto: false },
    { chiave: 'c', data: '2026-02-10', stato: 'pagate', importo: 120, descrizione: 'Affitto', pratica_id: null, scaduto: false, conto_id: 2 },
    { chiave: 'd', data: '2026-03-01', stato: 'da_incassare', importo: 700, descrizione: 'aperto', pratica_id: null, scaduto: false },
    { chiave: 'e', data: '2026-12-01', stato: 'incassate', importo: 10, descrizione: 'futuro', pratica_id: null, scaduto: false },
  ]
  const manuali = [
    { id: 1, conto_id: 1, data: '2026-02-15', importo: -8.5, descrizione: 'Spese di tenuta', categoria: 'Spese bancarie', verso_conto_id: null },
    { id: 2, conto_id: 1, data: '2026-02-20', importo: 200, descrizione: 'Prelievo', categoria: null, verso_conto_id: 2 },
  ]
  const s = bud.saldiConti(conti, manuali, mov, '2026-11-17')
  const banca = s.find((x) => x.conto.id === 1), cassa = s.find((x) => x.conto.id === 2)
  assert.equal(banca.saldo, 1000 + 500 - 8.5 - 200); assert.equal(cassa.saldo, 50 - 120 + 200)
  assert.ok(!banca.voci.some((v) => v.descrizione === 'prima del saldo' || v.descrizione === 'futuro' || v.descrizione === 'aperto'))
  ok('saldi: incassi senza conto sul predefinito, giroconto in uscita e in entrata, solo dopo la data del saldo e fino a oggi')

  // ---------- previsione
  const aperti = [
    { chiave: 'x1', data: '2026-08-01', stato: 'da_incassare', importo: 1000, descrizione: 'scaduto da oltre 60 giorni', pratica_id: null, scaduto: true },
    { chiave: 'x2', data: '2026-11-30', stato: 'da_incassare', importo: 500, descrizione: 'a fine mese', pratica_id: null, scaduto: false },
    { chiave: 'x3', data: '2026-12-10', stato: 'da_pagare', importo: 300, descrizione: 'affitto', pratica_id: null, scaduto: false },
    { chiave: 'x4', data: '2027-01-10', stato: 'da_pagare', importo: 3000, descrizione: 'F24', pratica_id: null, scaduto: false },
  ]
  const p = bud.previsione(aperti, 1000, '2026-11-17', 3)
  assert.deepEqual(p.map((m) => m.mese), ['2026-11', '2026-12', '2027-01'])
  assert.deepEqual(p.map((m) => m.saldo), [2500, 2200, -800]) // lo scaduto cade nel mese in corso
  assert.equal(p[0].saldoPrudente, 1000) // prudente: lo scaduto da oltre 60 giorni non arriva, quello di fine mese slitta
  assert.equal(p[1].saldoPrudente, 1200); assert.equal(p[2].saldoPrudente, -1800)
  ok('previsione: scaduti nel mese in corso, scenario prudente con 30 giorni di ritardo e senza i crediti vecchi')

  // ---------- stima fiscale
  const incassi = [
    { chiave: 'i1', data: '2026-03-01', stato: 'incassate', importo: 40000, descrizione: '', pratica_id: null, scaduto: false },
    { chiave: 'i2', data: '2026-06-01', stato: 'pagate', importo: 5000, descrizione: '', pratica_id: null, scaduto: false, categoria: 'Affitto' },
    { chiave: 'i3', data: '2026-06-16', stato: 'pagate', importo: 2000, descrizione: '', pratica_id: null, scaduto: false, categoria: bud.CATEGORIA_IMPOSTE },
  ]
  const forf = bud.stimaFiscale(incassi, [], 2026, { regime: 'forfettario', coefficiente: 78, aliquota: 15, contributi: 26.07 }, 2000)
  assert.equal(forf.reddito, 31200); assert.equal(forf.contributi, 8133.84); assert.equal(forf.imposta, Math.round((31200 - 8133.84) * 15) / 100)
  assert.equal(forf.daAccantonare, Math.round((forf.totale - 2000) * 100) / 100); assert.equal(forf.iva, 0)
  const docs = [{ data: '2026-03-01', imponibile: 40000, iva: 8800, ritenuta: 8000, verso: 'emesso' }, { data: '2026-06-01', imponibile: 5000, iva: 1100, ritenuta: 0, verso: 'ricevuto' }]
  const ord = bud.stimaFiscale(incassi, docs, 2026, { regime: 'ordinario', contributi: 10, irpef: 30 })
  assert.equal(ord.costi, 5000); assert.equal(ord.reddito, 35000); assert.equal(ord.contributi, 3500)
  assert.equal(ord.imposta, Math.round(31500 * 0.3 * 100) / 100 - 8000); assert.equal(ord.iva, 7700)
  ok('stima fiscale: forfettario con coefficiente e contributi deducibili; ordinario con costi, ritenute subite e IVA a debito meno credito')

  // ---------- fatture del servizio nei movimenti
  const fs1 = { id: 7, verso: 'ricevuta', tipo: 'TD01', numero: 'A/12', data: '2026-10-01', controparte: 'Fornitore Srl', piva: '01234567890', cf: null, descrizione: null, imponibile: 100, iva: 22, ritenuta: 0, cassa: 0, bollo: 0, totale: 122, netto: 122, scadenza: '2026-10-31', file: 'a.xml', regolata_il: null, conto_id: null, categoria: null, nascosta: 0 }
  const fs2 = { ...fs1, id: 8, verso: 'emessa', numero: '5', controparte: 'Cliente', regolata_il: '2026-11-02', conto_id: 2, netto: 500, totale: 500 }
  const fs3 = { ...fs1, id: 9, nascosta: 1 }
  const m2 = pag.movimenti([], [], [], '2026-11-17', 30, [fs1, fs2, fs3])
  assert.equal(m2.length, 2)
  const r = m2.find((x) => x.chiave === 'fs-7'), e = m2.find((x) => x.chiave === 'fs-8')
  assert.deepEqual([r.stato, r.scaduto, r.importo, r.categoria], ['da_pagare', true, 122, pag.CATEGORIA_FATTURE_RICEVUTE])
  assert.deepEqual([e.stato, e.data, e.conto_id], ['incassate', '2026-11-02', 2])
  const doppie = pag.fattureDoppie([fs2], [{ id: 1, tipo: 'parcella', stato: 'emessa', numero: '5', data: '2026-10-20' }])
  assert.ok(doppie.has(8))
  ok('fatture del servizio: ricevute da pagare con la loro categoria, emesse incassate sul conto scelto, nascoste escluse, doppioni con TIO riconosciuti')

  // ---------- lettura dei file: XML con e senza prefisso, .p7m, ZIP, verso dai propri codici
  const lettura = require('../electron/fatture-lettura')
  const io = { nome: 'Studio Bianchi', piva: '11122233344' }, cliente = { nome: 'Rossi &amp; C. Srl', piva: '55566677788' }
  const emessa = fattura({ numero: '12', data: '2026-04-10', cedente: io, committente: cliente, imponibile: 1000, iva: 220, ritenuta: 200, scadenza: '2026-05-10' })
  const [f1] = lettura.leggiFatture(emessa, ['IT11122233344'])
  assert.deepEqual([f1.verso, f1.numero, f1.controparte, f1.imponibile, f1.iva, f1.ritenuta, f1.netto, f1.scadenza], ['emessa', '12', 'Rossi & C. Srl', 1000, 220, 200, 1020, '2026-05-10'])
  const [f2] = lettura.leggiFatture(fattura({ numero: 'NC1', data: '2026-04-11', cedente: cliente, committente: io, imponibile: 100, iva: 22, tipo: 'TD04', prefisso: '' }), ['11122233344'])
  assert.equal(f2.verso, 'ricevuta'); assert.ok(f2.totale < 0, 'nota di credito in negativo')
  // busta firmata minima: SEQUENCE { OCTET STRING costruito a lunghezza indefinita, spezzato in due blocchi }
  const x = Buffer.from(emessa), a = x.subarray(0, 300), b = x.subarray(300)
  const ottetto = (buf) => { const l = buf.length; return Buffer.concat([Buffer.from([0x04, 0x82, l >> 8, l & 255]), buf]) }
  const interno = Buffer.concat([Buffer.from([0x24, 0x80]), ottetto(a), ottetto(b), Buffer.from([0, 0])])
  const p7m = Buffer.concat([Buffer.from([0x30, 0x80]), interno, Buffer.from([0, 0])])
  assert.equal(lettura.leggiFile('f.xml.p7m', p7m, ['11122233344'])[0].numero, '12')
  assert.equal(lettura.leggiFile('f.xml.p7m', Buffer.from(p7m.toString('base64')), ['11122233344'])[0].numero, '12')
  assert.throws(() => lettura.leggiFile('x.xml', Buffer.from('<html>no</html>'), []), /fattura elettronica/i)
  ok('lettura: XML con e senza prefisso, nota di credito, .p7m (anche base64, contenuto spezzato), verso dalla propria partita IVA')

  // ---------- archivio: lettura da cartella, niente doppioni, scelte TIO, file mai modificati
  process.env.MNGMNT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-budget-db-'))
  const db = require('../electron/db'); db.open(process.env.MNGMNT_DATA_DIR)
  const budget = require('../electron/budget')
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-budget-xml-'))
  fs.mkdirSync(path.join(cartella, '2026'))
  fs.writeFileSync(path.join(cartella, '2026', 'IT11122233344_00012.xml'), emessa)
  fs.writeFileSync(path.join(cartella, 'IT11122233344_00012_MT_001.xml'), '<ricevuta/>') // ricevuta dello SdI: ignorata
  fs.writeFileSync(path.join(cartella, 'nota.txt'), 'altro')
  const prima = Object.fromEntries(fs.readdirSync(cartella, { recursive: true }).map((f) => [f, fs.statSync(path.join(cartella, f)).mtimeMs]))
  const file = await budget.fileFatture(cartella)
  assert.deepEqual(file.map((f) => path.basename(f)), ['IT11122233344_00012.xml'])
  assert.deepEqual(await budget.leggiFatture(file, ['11122233344']), { nuove: 1, gia: 0, errori: [] })
  assert.deepEqual(await budget.leggiFatture(file, ['11122233344']), { nuove: 0, gia: 1, errori: [] })
  assert.deepEqual(Object.fromEntries(fs.readdirSync(cartella, { recursive: true }).map((f) => [f, fs.statSync(path.join(cartella, f)).mtimeMs])), prima)
  const c1 = budget.esegui('conto', { nome: 'Banca', saldo_iniziale: 1000, data_saldo: '2026-01-01' })
  const c2 = budget.esegui('conto', { nome: 'Carta', tipo: 'carta', saldo_iniziale: 0, data_saldo: '2026-01-01', predefinito: true })
  let dati = budget.leggi()
  assert.deepEqual(dati.conti.filter((c) => c.predefinito).map((c) => c.id), [c2]) // un solo predefinito
  assert.throws(() => budget.esegui('movimento', { conto_id: c1, verso_conto_id: c1, data: '2026-02-01', importo: 10, descrizione: 'x' }), /due conti diversi/)
  budget.esegui('movimento', { conto_id: c1, verso_conto_id: c2, data: '2026-02-01', importo: -50, descrizione: 'Ricarica' })
  assert.equal(budget.leggi().movimenti[0].importo, 50) // giroconto sempre positivo
  const fid = dati.fatture[0].id
  budget.esegui('fattura', { id: fid, regolata_il: '2026-05-12', conto_id: c1 })
  dati = budget.leggi()
  assert.deepEqual([dati.fatture[0].regolata_il, dati.fatture[0].conto_id, dati.fatture[0].imponibile, dati.fatture[0].numero], ['2026-05-12', c1, 1000, '12'])
  budget.esegui('fattura', { id: fid, regolata_il: null })
  assert.equal(budget.leggi().fatture[0].conto_id, null)
  budget.esegui('eliminaConto', { id: c2 })
  assert.deepEqual(budget.leggi().conti.map((c) => [c.id, c.predefinito]), [[c1, 1]])
  ok('archivio: cartella letta senza ricevute SdI né doppioni, file intatti, un solo conto predefinito, giroconti, incasso segnato e tolto')

  // ---------- pacchetto per il commercialista
  const settings = { profilo: 'ditta', etichette: { pratica: 'Commessa', pratiche: 'Commesse', parcella: 'Documento', parcelle: 'Documenti' }, studio: { nome: 'Studio Bianchi', piva: '11122233344', cf: '', cap_citta: '' } }
  const parcelle = [{ id: 1, tipo: 'parcella', stato: 'pagata', numero: '3', data: '2026-02-01', imponibile: 1000, iva: 220, ritenuta: 200, netto: 1020, totale: 1220, incassato: 1020, data_pagamento: '2026-02-20', cliente_id: 1, pratica_id: null, incassi_dettagliati: 0 },
    { id: 2, tipo: 'parcella', stato: 'bozza', numero: '', data: '2026-02-02', imponibile: 1, iva: 0, ritenuta: 0, netto: 1, totale: 1, incassato: 0, cliente_id: 1, pratica_id: null, incassi_dettagliati: 0 }]
  const costi = [{ id: 1, pratica_id: null, fornitore_id: null, data: '2026-03-01', descrizione: 'Affitto; marzo', categoria: 'Affitto', importo: 600, scadenza: '2026-03-05', pagata: 1, pagata_il: '2026-03-04', contabile: JSON.stringify({ file: 'contabili/x.pdf', nome: 'bonifico.pdf' }) }]
  const movPac = pag.movimenti(parcelle, costi, [], '2026-11-17', 30, [fs1])
  const pac = com.pacchettoCommercialista({ anno: 2026, periodo: 'T1', settings, parcelle, costi, fatture: [fs1], movimenti: movPac, conti, manuali, saldi: s, anagraficaById: new Map([[1, { id: 1, denominazione: 'Rossi Srl', partita_iva: '555' }]]), praticaById: new Map(), stima: null })
  assert.match(pac.nome, /2026/); assert.ok(pac.riepilogo.includes('Studio Bianchi'))
  const nomi = pac.file.map((f) => f.nome)
  assert.ok(nomi.some((x) => /Documenti emessi/.test(x)) && nomi.some((x) => /Incassi/.test(x)) && nomi.some((x) => /Uscite/.test(x)))
  assert.ok(!nomi.some((x) => /Prima nota/.test(x)), 'la prima nota solo per l’anno intero')
  assert.ok(!nomi.some((x) => /Fatture ricevute/.test(x)), 'la fattura ricevuta di ottobre non è nel primo trimestre')
  const emessi = pac.file.find((f) => /Documenti emessi/.test(f.nome)).testo
  assert.ok(emessi.startsWith('\uFEFF') && emessi.includes('01/02/2026;3;Fattura;Rossi Srl;555;;1000,00;0,00;220,00;200,00;'))
  assert.ok(!emessi.includes('2026-02-02'), 'le bozze non vanno al commercialista')
  const uscite = pac.file.find((f) => /Uscite/.test(f.nome)).testo
  assert.ok(uscite.includes('"Affitto; marzo"') || uscite.includes('Affitto; marzo'))
  assert.equal(pac.contabili.length, 1); assert.deepEqual([pac.conteggi.emessi, pac.conteggi.incassi, pac.conteggi.uscite], [1, 1, 1])
  const anno = com.pacchettoCommercialista({ anno: 2026, periodo: 'anno', settings, parcelle, costi, fatture: [fs1], movimenti: movPac, conti, manuali, saldi: s, anagraficaById: new Map(), praticaById: new Map(), stima: null })
  assert.ok(anno.file.some((f) => /Prima nota/.test(f.nome)) && anno.file.some((f) => /Fatture ricevute/.test(f.nome)))
  ok('pacchetto: CSV per Excel (BOM, punto e virgola), periodo rispettato, bozze escluse, prima nota solo per l’anno, contabili allegate')


  // ---------- budget della pratica: avvisi all'80% e oltre il 100%, consegna vicina o passata
  const consumi = bp.consumoPratiche([{ pratica_id: 1, minuti: 60 * 9, tariffa_oraria: 50 }, { pratica_id: 2, minuti: 120, tariffa_oraria: 0 }], [{ pratica_id: 1, importo: 100 }], [{ pratica_id: 1, importo: 400 }, { pratica_id: null, importo: 999 }])
  assert.deepEqual(consumi.get(1), { ore: 9, valoreOre: 450, costi: 500 })
  const p1 = { id: 1, titolo: 'Impianto', budget_ore: 10, budget_importo: 900, consegna: '2026-11-20', stato: 'In corso' }
  const av = bp.avvisiPratica(p1, consumi.get(1), '2026-11-17')
  assert.deepEqual(av.map((a) => [a.tipo, a.livello]), [['ore', 'attenzione'], ['importo', 'superato'], ['consegna', 'attenzione']])
  assert.match(av[1].testo, /950,00/); assert.match(av[2].testo, /tra 3 giorni/)
  assert.deepEqual(bp.avvisiPratica({ ...p1, consegna: '2026-11-10' }, consumi.get(1), '2026-11-17', true).map((a) => a.tipo), ['ore', 'importo']) // chiusa: niente avviso sulla consegna
  assert.equal(bp.avvisiPratica({ ...p1, consegna: '2026-11-10' }, consumi.get(1), '2026-11-17').find((a) => a.tipo === 'consegna').testo, 'consegna passata da 7 giorni')
  assert.deepEqual(bp.avvisiPratica({ id: 3, titolo: 'Senza budget' }, undefined, '2026-11-17'), [])
  const tutti = bp.avvisiPratiche([p1, { id: 2, titolo: 'Chiusa', budget_ore: 1, stato: 'Chiusa' }], consumi, '2026-11-17', new Set(['Chiusa']))
  assert.equal(tutti[0].livello, 'superato'); assert.ok(tutti.every((a) => a.pratica_id === 1))
  ok('budget della pratica: ore, costi più valore delle ore, consegna; pratiche chiuse escluse, i più gravi prima')

  // ---------- rate: l'incassato copre le rate in ordine, il resto alla scadenza normale, mai oltre il residuo
  const rate3 = [{ id: 11, parcella_id: 9, data: '2026-10-15', importo: 400 }, { id: 12, parcella_id: 9, data: '2026-11-15', importo: 400 }, { id: 13, parcella_id: 9, data: '2026-12-15', importo: 400 }]
  assert.deepEqual(rep.rateAperte(rate3, 800, 400, '2026-10-31').map((r) => [r.id, r.data, r.importo, r.numero]), [[12, '2026-11-15', 400, 2], [13, '2026-12-15', 400, 3]])
  assert.deepEqual(rep.rateAperte(rate3, 1000, 200, '2026-10-31').map((r) => [r.id, r.importo]), [[11, 200], [12, 400], [13, 400]])
  assert.deepEqual(rep.rateAperte(rate3.slice(0, 2), 1200, 0, '2026-10-31').map((r) => [r.id, r.importo]), [[11, 400], [12, 400], [null, 400]]) // piano più corto del netto
  assert.deepEqual(rep.rateAperte(rate3, 500, 0, '2026-10-31').map((r) => [r.id, r.importo]), [[11, 400], [12, 100]]) // non oltre il residuo
  const doc9 = { id: 9, tipo: 'parcella', stato: 'emessa', numero: '9', data: '2026-10-01', netto: 1200, incassato: 400, pratica_id: null, cliente_id: 1, incassi_dettagliati: 0, scadenza_pagamento: '2026-10-31' }
  const m9 = pag.movimenti([doc9], [], [], '2026-11-20', 30, [], rate3)
  assert.deepEqual(m9.filter((m) => m.stato === 'da_incassare').map((m) => [m.chiave, m.data, m.importo, m.scaduto, m.rata]), [['rata-12', '2026-11-15', 400, true, 'rata 2 di 3'], ['rata-13', '2026-12-15', 400, false, 'rata 3 di 3']])
  assert.equal(pag.movimenti([doc9], [], [], '2026-11-20').filter((m) => m.stato === 'da_incassare').length, 1) // senza piano: una sola scadenza
  const [s9] = rep.solleciti([doc9], new Map([[1, { id: 1, denominazione: 'Rossi' }]]), new Date(2026, 10, 20), 30, rate3)
  assert.deepEqual([s9.scadenza, s9.rata, s9.importo, s9.giorni], ['2026-11-15', 'rata 2 di 3', 400, 5])
  assert.match(rep.testoSollecito(s9, { titolare: 'Luca' }).corpo, /per la rata 2 di 3 \(€ 400,00\), risulta ancora da saldare \(scadenza 15\/11\/2026\)/)
  ok('rate: incassato sulle rate in ordine, residuo oltre le rate alla scadenza, scadenzario e solleciti per rata')

  // ---------- indicatori
  const docInd = [
    { id: 1, tipo: 'parcella', stato: 'pagata', numero: '1', data: '2026-02-01', data_pagamento: '2026-03-03', scadenza_pagamento: '2026-03-01', imponibile: 1000, netto: 1000, pratica_id: 1, cliente_id: 1 },
    { id: 2, tipo: 'parcella', stato: 'pagata', numero: '2', data: '2026-04-01', data_pagamento: '2026-04-11', imponibile: 3000, netto: 3000, pratica_id: 2, cliente_id: 2 },
    { id: 3, tipo: 'nota_credito', stato: 'emessa', numero: '3', data: '2026-05-01', imponibile: 200, netto: 200, pratica_id: 2, cliente_id: 2 },
    { id: 4, tipo: 'parcella', stato: 'bozza', numero: '', data: '2026-05-02', imponibile: 9999, netto: 9999, pratica_id: 1, cliente_id: 1 },
  ]
  const movInd = [
    { chiave: 'a', data: '2026-03-03', stato: 'incassate', importo: 1000 }, { chiave: 'b', data: '2026-04-11', stato: 'incassate', importo: 3000 },
    { chiave: 'c', data: '2025-03-01', stato: 'incassate', importo: 2000 }, { chiave: 'd', data: '2025-12-01', stato: 'incassate', importo: 5000 },
    { chiave: 'e', data: '2026-09-01', stato: 'da_incassare', importo: 600, scaduto: true }, { chiave: 'f', data: '2026-06-01', stato: 'pagate', importo: 300 },
  ]
  const I = ind.calcolaIndicatori({ anno: 2026, oggi: '2026-11-17', parcelle: docInd, movimenti: movInd, costi: [{ pratica_id: 1, data: '2026-02-10', importo: 1300 }], spese: [{ pratica_id: 2, data: '2026-04-02', importo: 100 }],
    pratiche: [{ id: 1, titolo: 'Lavoro A', cliente_id: 1 }, { id: 2, titolo: 'Lavoro B', cliente_id: 2 }], nomeCliente: (id) => ({ 1: 'Alfa', 2: 'Beta' })[id] })
  assert.equal(I.incasso.giorniMedi, Math.round((30 * 1000 + 10 * 3000) / 4000)); assert.equal(I.incasso.puntuali, 0.5)
  assert.deepEqual([I.incasso.scaduti, I.incasso.etaScaduti], [600, 77])
  assert.deepEqual([I.andamento.incassato, I.andamento.incassatoPrima, Math.round(I.andamento.variazione * 100)], [4000, 2000, 100]) // lo stesso periodo dell'anno prima esclude dicembre
  assert.deepEqual(I.clienti.map((c) => [c.nome, c.fatturato, c.costi, c.margine]), [['Beta', 2800, 100, 2700], ['Alfa', 1000, 1300, -300]]) // nota di credito sottratta, bozza esclusa
  assert.equal(Math.round(I.primoCliente * 100), 74)
  assert.deepEqual(I.lavori.map((l) => [l.nome, l.margine]), [['Lavoro A', -300], ['Lavoro B', 2700]]); assert.equal(I.inPerdita, 1)
  ok('indicatori: giorni medi di incasso pesati, puntualità, crediti scaduti, stesso periodo dell’anno prima, clienti e lavori con margine')

  // ---------- archivio: piano di pagamento salvato, controllato e tolto
  const gestione = require('../electron/gestione')
  const doc = db.saveParcella({ anno: 2026, tipo: 'parcella', stato: 'emessa', data: '2026-10-01', voci: [{ tipo: 'compenso', descrizione: 'Lavoro', quantita: 1, importo: 1000 }], compensi: 1000, imponibile: 1000, iva: 0, totale: 1000, netto: 1000, iva_perc: 0, sg_perc: 0, cpa_perc: 0, rit_perc: 0, bollo: 0 })
  assert.equal(gestione.esegui('rate', { parcella_id: doc.id, rate: [{ data: '2026-12-01', importo: 500 }, { data: '2026-11-01', importo: 500 }] }), 2)
  assert.deepEqual(gestione.esegui('leggi').rate.map((r) => [r.data, r.importo]), [['2026-11-01', 500], ['2026-12-01', 500]])
  assert.throws(() => gestione.esegui('rate', { parcella_id: doc.id, rate: [{ data: '2026-11-01', importo: 1000.01 }] }), /superano il netto/)
  assert.throws(() => gestione.esegui('rate', { parcella_id: doc.id, rate: [{ data: '', importo: 10 }] }))
  gestione.esegui('rate', { parcella_id: doc.id, rate: [] }); assert.equal(gestione.esegui('leggi').rate.length, 0)
  gestione.esegui('rate', { parcella_id: doc.id, rate: [{ data: '2026-11-01', importo: 300 }] }); db.remove('parcelle', doc.id)
  assert.equal(db.getDb().prepare('SELECT COUNT(*) n FROM rate_documento').get().n, 0) // se ne vanno con il documento
  ok('archivio: piano di pagamento ordinato per data, mai oltre il netto, tolto con un elenco vuoto o con il documento')

  // ---------- promemoria delle rate: il giorno della rata, solo se ancora aperta, una volta sola; e nel riepilogo del giorno
  const alerts = require('../electron/alerts')
  db.setSettings({ riepilogo_giornaliero: true, ora_default_giornata: 9 })
  const cliRate = db.save('anagrafica', { denominazione: 'Bianchi Srl', ruolo: 'cliente' })
  const docR = db.saveParcella({ anno: 2030, tipo: 'parcella', stato: 'emessa', data: '2030-01-10', cliente_id: cliRate.id, incassato: 300, voci: [{ tipo: 'compenso', descrizione: 'Lavoro', quantita: 1, importo: 900 }], compensi: 900, imponibile: 900, iva: 0, totale: 900, netto: 900, iva_perc: 0, sg_perc: 0, cpa_perc: 0, rit_perc: 0, bollo: 0 })
  gestione.esegui('rate', { parcella_id: docR.id, rate: [{ data: '2030-02-15', importo: 300 }, { data: '2030-03-15', importo: 300 }, { data: '2030-04-15', importo: 300 }] })
  assert.deepEqual(alerts.rateAperte(db.getDb()).filter((r) => r.parcella_id === docR.id).map((r) => [r.data, r.aperto, r.n]), [['2030-03-15', 300, 2], ['2030-04-15', 300, 3]]) // la prima è coperta dall'incassato
  const quando = new Date(2030, 2, 15, 10, 0)
  const avvisi = alerts.collectDue(quando).filter((x) => x.rif_tipo === 'rata')
  assert.deepEqual(avvisi.map((x) => [x.titolo, x.corpo]), [[`Rata da incassare oggi: documento n. ${docR.numero}`, 'Rata 2 di 3 · € 300,00 · Bianchi Srl']])
  assert.equal(alerts.collectDue(quando).filter((x) => x.rif_tipo === 'rata').length, 0) // non si ripete
  assert.equal(alerts.collectDue(new Date(2030, 1, 15, 10, 0)).filter((x) => x.rif_tipo === 'rata').length, 0) // la rata coperta non avvisa
  assert.match(alerts.dailyDigest(quando).corpo, /1 rata da incassare/)
  db.saveParcella({ ...db.getParcella(docR.id), stato: 'pagata', data_pagamento: '2030-03-20' })
  assert.equal(alerts.rateAperte(db.getDb()).filter((r) => r.parcella_id === docR.id).length, 0) // documento saldato: nessuna rata aperta
  ok('promemoria delle rate: il giorno della rata aperta, una volta sola, non per le rate già coperte; nel riepilogo del giorno')
  console.log(`\n${n} gruppi di controlli superati`)
} finally { fs.rmSync(out, { recursive: true, force: true }) }
