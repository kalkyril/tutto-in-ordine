// Fattura elettronica FatturaPA (FPR12): file validati contro lo schema ufficiale 1.2.3 e coerenti come richiede lo SdI.
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { genera, latino, progressivo } = require('../electron/fatturapa.js')
const out = path.join(os.tmpdir(), `mngmnt-calc-fpa-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/calc.ts', formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const { calcolaParcella } = await import(pathToFileURL(out).href)
fs.rmSync(out, { force: true })
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)

const SCHEMA = path.join('scripts', 'fixtures', 'fatturapa', 'Schema_VFPR12_v1.2.3.xsd')
let xmllint = true
try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }) } catch { xmllint = false }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-fatturapa-'))
const valida = (x, nome) => {
  if (!xmllint) return
  const f = path.join(dir, nome); fs.writeFileSync(f, x)
  try { execFileSync('xmllint', ['--noout', '--nonet', '--schema', SCHEMA, f], { stdio: 'pipe' }) } catch (e) { throw new Error(`${nome} non valido:\n${e.stderr}`) }
}
const valori = (x, tag) => [...x.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1])
const num = (x, tag) => valori(x, tag).map(Number)
const somma = (a) => Math.round(a.reduce((s, v) => s + v, 0) * 100) / 100

const studio = { nome: 'Studio Legale Prova', intestazione: '', piva: '12345678903', cf: 'PRVNNA80A41F257K', indirizzo: 'Via Emilia 1', cap_citta: '41121 Modena (MO)', iban: 'IT60X0542811101000000123456' }
const cliente = { denominazione: 'Edilnord S.r.l.', tipo: 'azienda', partita_iva: '01234567890', codice_fiscale: '01234567890', indirizzo: 'Via Roma 3', cap: '41012', citta: 'Carpi', provincia: 'MO', pec: 'edilnord@pec.it' }
const documento = (voci, a, extra = {}) => ({ id: 1, anno: 2026, progressivo: 7, numero: '7/2026', tipo: 'parcella', stato: 'emessa', data: '2026-10-28', oggetto: 'Assistenza stragiudiziale — recupero credito “Edilnord”', sg_perc: a.sg, cpa_perc: a.cpa, iva_perc: a.iva, rit_perc: a.rit, contributo_ritenuta: a.contributo_ritenuta ? 1 : 0, ...calcolaParcella(voci, a), ...extra })

try {
  // 1. studio legale in regime ordinario: compensi, spese generali 15%, CPA 4%, IVA 22%, ritenuta 20%, spese esenti art. 15
  const v1 = [{ tipo: 'compenso', descrizione: 'Fase di studio', quantita: 1, importo: 750 }, { tipo: 'compenso', descrizione: 'Fase introduttiva', quantita: 1, importo: 250 }, { tipo: 'spesa_esente', descrizione: 'Contributo unificato', quantita: 1, importo: 98 }]
  const p1 = documento(v1, { sg: 15, cpa: 4, iva: 22, rit: 20, bollo: 2 })
  const r1 = genera({ parcella: p1, voci: v1, cliente, studio, opzioni: { tipoDocumento: 'TD01', regime: 'RF01', tipoCassa: 'TC01', codiceDestinatario: 'M5UXCR1' } })
  assert.deepEqual(r1.errori, [])
  valida(r1.xml, r1.nomeFile)
  assert.equal(r1.nomeFile, `IT${studio.cf}_${progressivo(p1)}.xml`)
  const imponibile = num(r1.xml, 'ImponibileImporto'), imposte = num(r1.xml, 'Imposta')
  assert.equal(imponibile[0], p1.imponibile); assert.equal(imposte[0], p1.iva); assert.equal(imponibile[1], 98)
  assert.equal(somma(num(r1.xml, 'PrezzoTotale').slice(0, 3)) + Number(valori(r1.xml, 'ImportoContributoCassa')[0]), p1.imponibile)
  assert.equal(Number(valori(r1.xml, 'ImportoTotaleDocumento')[0]), p1.totale)
  assert.equal(Number(valori(r1.xml, 'ImportoPagamento')[0]), p1.netto)
  assert.ok(/<DatiRitenuta><TipoRitenuta>RT01<\/TipoRitenuta><ImportoRitenuta>230\.00<\/ImportoRitenuta><AliquotaRitenuta>20\.00<\/AliquotaRitenuta><CausalePagamento>A<\/CausalePagamento>/.test(r1.xml))
  assert.ok(/<TipoCassa>TC01<\/TipoCassa><AlCassa>4\.00<\/AlCassa><ImportoContributoCassa>46\.00<\/ImportoContributoCassa><ImponibileCassa>1150\.00<\/ImponibileCassa><AliquotaIVA>22\.00<\/AliquotaIVA><\/DatiCassaPrevidenziale>/.test(r1.xml), 'la CPA degli avvocati non è soggetta a ritenuta')
  assert.ok(/Contributo unificato<\/Descrizione><PrezzoUnitario>98\.00<\/PrezzoUnitario><PrezzoTotale>98\.00<\/PrezzoTotale><AliquotaIVA>0\.00<\/AliquotaIVA><Natura>N1<\/Natura>/.test(r1.xml))
  assert.ok(/Causale>Assistenza stragiudiziale - recupero credito "Edilnord"</.test(r1.xml))
  ok('studio legale ordinario: schema valido; CPA, ritenuta, spese esenti N1 e totali coerenti con il documento')

  // 2. libero professionista forfettario: rivalsa INPS 4% (TC22), niente IVA (N2.2), bollo addebitato, nessuna ritenuta
  const v2 = [{ tipo: 'compenso', descrizione: 'Progettazione impianto elettrico', quantita: 1, importo: 1200 }]
  const p2 = documento(v2, { sg: 0, cpa: 4, iva: 0, rit: 0, bollo: 2 }, { numero: 'FPR 12/26', progressivo: 12 })
  const privato = { denominazione: 'Mario Rossi', tipo: 'persona', codice_fiscale: 'RSSMRA85T10A562S', indirizzo: 'Via Garibaldi 10', cap: '41121', citta: 'Modena', provincia: 'MO' }
  const r2 = genera({ parcella: p2, voci: v2, cliente: privato, studio, opzioni: { regime: 'RF19', tipoCassa: 'TC22', cessionario: { nome: 'Mario', cognome: 'Rossi' } } })
  assert.deepEqual(r2.errori, [])
  valida(r2.xml, r2.nomeFile)
  assert.ok(/<RegimeFiscale>RF19<\/RegimeFiscale>/.test(r2.xml) && /<CodiceDestinatario>0000000<\/CodiceDestinatario>/.test(r2.xml) && /<Nome>Mario<\/Nome><Cognome>Rossi<\/Cognome>/.test(r2.xml))
  assert.ok(/<DatiBollo><BolloVirtuale>SI<\/BolloVirtuale><ImportoBollo>2\.00<\/ImportoBollo><\/DatiBollo>/.test(r2.xml))
  assert.ok(/<AliquotaIVA>0\.00<\/AliquotaIVA><Natura>N2\.2<\/Natura><ImponibileImporto>1248\.00<\/ImponibileImporto><Imposta>0\.00<\/Imposta><RiferimentoNormativo>Operazione in franchigia/.test(r2.xml))
  assert.ok(!/DatiRitenuta/.test(r2.xml) && /<TipoCassa>TC22<\/TipoCassa>.*<Natura>N2\.2<\/Natura><\/DatiCassaPrevidenziale>/.test(r2.xml))
  assert.equal(Number(valori(r2.xml, 'ImportoTotaleDocumento')[0]), 1250)
  ok('professionista forfettario: rivalsa INPS, natura N2.2 con riferimento normativo, bollo virtuale; persona con nome e cognome')

  // 3. ditta in regime ordinario: quantità e prezzi con decimali, solo IVA
  const v3 = [{ tipo: 'compenso', descrizione: 'Cavo FG16OR16 3G2,5 (al metro)', quantita: 37.5, importo: 1.234567 }, { tipo: 'compenso', descrizione: 'Manodopera', quantita: 3, importo: 35 }, { tipo: 'spesa_imponibile', descrizione: 'Trasferta', quantita: 1, importo: 20 }]
  const p3 = documento(v3, { sg: 0, cpa: 0, iva: 22, rit: 0, bollo: 2 }, { numero: '45', progressivo: 45 })
  const r3 = genera({ parcella: p3, voci: v3, cliente, studio: { ...studio, cf: '' }, opzioni: { pecDestinatario: 'edilnord@pec.it' } })
  assert.deepEqual(r3.errori, [])
  valida(r3.xml, r3.nomeFile)
  assert.ok(/<Quantita>37\.50<\/Quantita><PrezzoUnitario>1\.234567<\/PrezzoUnitario><PrezzoTotale>46\.30<\/PrezzoTotale>/.test(r3.xml), r3.xml.match(/<DettaglioLinee>.*?<\/DettaglioLinee>/)[0])
  assert.ok(/<PECDestinatario>edilnord@pec\.it<\/PECDestinatario>/.test(r3.xml) && !/DatiCassaPrevidenziale|DatiBollo/.test(r3.xml) && r3.nomeFile.startsWith('IT12345678903_'))
  assert.equal(num(r3.xml, 'ImponibileImporto')[0], p3.imponibile); assert.equal(num(r3.xml, 'Imposta')[0], p3.iva)
  ok('ditta ordinaria: quantità e prezzi con decimali, PEC del destinatario, nome del file dalla partita IVA')

  // 4. errori che impediscono il file
  const errori = (o) => genera({ parcella: p1, voci: v1, cliente, studio, opzioni: { tipoCassa: 'TC01' }, ...o }).errori.join(' | ')
  assert.match(errori({ studio: { ...studio, piva: '' } }), /Partita IVA dell’attività/)
  assert.match(errori({ cliente: { ...cliente, indirizzo: '' } }), /Indirizzo del cliente/)
  assert.match(errori({ cliente: { ...cliente, partita_iva: '', codice_fiscale: '' } }), /codice fiscale o la partita IVA/)
  assert.match(errori({ parcella: { ...p1, tipo: 'preventivo' } }), /non sono fatture/)
  assert.match(errori({ opzioni: {} }), /tipo di cassa/)
  assert.match(errori({ opzioni: { tipoCassa: 'TC01', codiceDestinatario: 'abc' } }), /7 caratteri/)
  assert.match(errori({ voci: v1.slice(1) }), /non corrispondono all’imponibile/)
  assert.match(genera({ parcella: p2, voci: v2, cliente: privato, studio, opzioni: { tipoCassa: 'TC22' } }).errori.join(), /natura/)
  ok('dati mancanti o incoerenti: nessun file e messaggi che dicono dove intervenire')

  // 5. caratteri: solo quelli ammessi dallo schema
  assert.equal(latino('Città d’Arte – € 1.000 “ok” … Łódź 東京'), 'Città d\'Arte - EUR 1.000 "ok" ... Lódz ??')
  const r5 = genera({ parcella: { ...p3, oggetto: 'Fornitura “speciale” – 😀 Łódź' }, voci: [{ ...v3[0], descrizione: 'Prezzo in € con l’apostrofo' }, ...v3.slice(1)], cliente, studio, opzioni: {} })
  valida(r5.xml, 'caratteri.xml')
  ok('testi convertiti nei caratteri latini ammessi: «€», apostrofi, virgolette, lettere straniere ed emoji')
  if (!xmllint) console.log('# xmllint non disponibile: validazione contro lo schema saltata')
} finally { fs.rmSync(dir, { recursive: true, force: true }) }
