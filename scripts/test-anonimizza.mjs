// Test del motore di anonimizzazione (sezione Anonimizza): checksum, rete regex, formule degli atti, archivio, ripristino.
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const out = path.join(os.tmpdir(), `mngmnt-anonimizza-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/anonimizza.ts', formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(out).href)
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)
const trovati = (r) => r.segmenti.filter((s) => s.tag).map((s) => `${s.tag}:${s.t}`)
const ha = (r, tag, testo) => assert.ok(trovati(r).includes(`${tag}:${testo}`), `manca ${tag}:${testo} in ${JSON.stringify(trovati(r))}`)
const nonHa = (r, testo) => assert.ok(!r.segmenti.some((s) => s.tag && s.t.includes(testo)), `«${testo}» non doveva essere anonimizzato: ${JSON.stringify(trovati(r))}`)

try {
  // checksum, gli stessi di rizzo-pii
  assert.equal(m.cfOk('RSSMRA85T10A562S'), true)
  assert.equal(m.cfOk('RSSMRA85T10A562T'), false)
  assert.equal(m.cfOk('RSSMRAURTMLARSNL'), true) // omocodico
  assert.equal(m.pivaOk('12345678903'), true)
  assert.equal(m.pivaOk('12345678901'), false)
  assert.equal(m.ibanOk('IT60X0542811101000000123456'), true)
  assert.equal(m.ibanOk('IT60 X054 2811 1010 0000 0123 456'), true)
  assert.equal(m.ibanOk('IT61X0542811101000000123456'), false)
  assert.equal(m.luhnOk('4111 1111 1111 1111'), true)
  assert.equal(m.luhnOk('4111 1111 1111 1112'), false)
  ok('checksum di codice fiscale (anche omocodico), partita IVA, IBAN e carte')

  const atto = `TRIBUNALE DI MODENA
Ricorso per decreto ingiuntivo — R.G. n. 1234/2025
Il sottoscritto Mario Rossi, nato a Carpi (MO) il 12/06/1985, C.F. RSSMRA85H12B819I, residente in Via Garibaldi n. 10, 41012 Carpi (MO),
rappresentato dall'Avv. Giulia Bianchi del Foro di Modena (PEC giulia.bianchi@pec.avvocatimodena.it, tel. 059 123456),
premesso che la Edilnord S.r.l. (P.IVA 12345678903), con sede legale in Bologna, deve al ricorrente € 12.500,00
come da fattura n. 45/2024, da pagare sul conto IT60 X054 2811 1010 0000 0123 456 intestato al sig. Rossi.
L'immobile è censito al foglio 12, particella 345, sub. 6. Il ricorrente, di anni 40, si è presentato alle ore 15:30
con carta d'identità n. CA12345AB e targa AB 123 CD. Rossi chiede che il giudice dott. Paolo Verdi accolga il ricorso.
Per comunicazioni: www.studiobianchi.it o 333 1234567. Modena, 3 marzo 2025.`
  const r = m.anonimizza(atto)
  ha(r, 'FULLNAME', 'Mario Rossi'); ha(r, 'FULLNAME', 'Giulia Bianchi'); ha(r, 'FULLNAME', 'Paolo Verdi')
  ha(r, 'CITY', 'Carpi'); ha(r, 'PROVINCE', 'MO'); ha(r, 'DATE', '12/06/1985')
  ha(r, 'CF', 'RSSMRA85H12B819I'); ha(r, 'STREET', 'Via Garibaldi n. 10'); ha(r, 'ZIPCODE', '41012')
  ha(r, 'EMAIL', 'giulia.bianchi@pec.avvocatimodena.it'); ha(r, 'TELEPHONENUM', '059 123456'); ha(r, 'TELEPHONENUM', '333 1234567')
  ha(r, 'ORG', 'Edilnord S.r.l.'); ha(r, 'PIVA', '12345678903'); ha(r, 'AMOUNT', '€ 12.500,00')
  ha(r, 'IBAN', 'IT60 X054 2811 1010 0000 0123 456'); ha(r, 'CATASTO', 'foglio 12, particella 345, sub. 6')
  ha(r, 'AGE', 'di anni 40'); ha(r, 'TIME', '15:30'); ha(r, 'ID_DOC', 'CA12345AB'); ha(r, 'TARGA', 'AB 123 CD')
  ha(r, 'URL', 'www.studiobianchi.it'); ha(r, 'DOCID', 'R.G. n. 1234/2025'); ha(r, 'DOCID', 'fattura n. 45/2024'); ha(r, 'DATE', '3 marzo 2025')
  ok('atto di esempio: nomi, luoghi, codici, recapiti, importi, catasto, documenti e numeri degli atti')

  // propagazione: il cognome da solo e la stessa persona hanno lo stesso segnaposto
  const rossi = r.segmenti.filter((s) => s.tag === 'FULLNAME' && /Rossi/.test(s.t))
  assert.ok(rossi.length >= 3, JSON.stringify(rossi))
  assert.equal(new Set(rossi.map((s) => s.ph)).size, 1)
  ok('la stessa persona, anche col solo cognome («Rossi», «sig. Rossi»), ha un solo segnaposto')

  // casi del confronto con Rizzo PII 1.2.0 installato: nomi senza titolo, cognomi ripetuti più avanti
  const rz = m.anonimizza('Ezio Zanichelli e Ottavia Brambilla hanno firmato; poi Zanichelli ha chiamato Brambilla.')
  const ph = (t) => rz.segmenti.filter((s) => s.tag === 'FULLNAME' && s.t.includes(t)).map((s) => s.ph)
  assert.equal(new Set(ph('Zanichelli')).size, 1); assert.equal(ph('Zanichelli').length, 2)
  assert.equal(new Set(ph('Brambilla')).size, 1); assert.equal(ph('Brambilla').length, 2)
  ok('nomi senza titolo riconosciuti dai nomi propri; il cognome ripetuto riceve lo stesso segnaposto')

  nonHa(r, 'TRIBUNALE'); nonHa(r, 'Foro di Modena'); nonHa(r, 'Ricorso'); nonHa(r, 'premesso')
  assert.ok(!r.testo.includes('Mario') && !r.testo.includes('Garibaldi') && !r.testo.includes('Edilnord') && !r.testo.includes('RSSMRA'))
  assert.ok(r.testo.includes('TRIBUNALE DI MODENA'))
  ok('enti pubblici, titoli e parole degli atti restano in chiaro')

  // falsi positivi da evitare
  const prosa = m.anonimizza('Le invio via email il documento. In via preliminare si osserva che l’art. 1234/2024 non si applica. Versione 2.3.55.987. Da 5 anni lavoriamo insieme.')
  assert.equal(prosa.entita, 0, JSON.stringify(trovati(prosa)))
  ok('nessun falso positivo su «via email», «in via preliminare», articoli, versioni e durate')

  // 1.0.4: forme che prima sfuggivano
  const nascosto = (testo, ...dati) => { const r = m.anonimizza(testo); for (const d of dati) assert.ok(!r.testo.includes(d), `«${d}» è rimasto in chiaro in: ${r.testo}`); return r }
  nascosto('nato a Carpi il 12.06.85; il 12 giu 1985; scadenza 2024-03-15; udienza del 5 marzo; nato nel 1985', '12.06.85', '12 giu 1985', '2024-03-15', '5 marzo', '1985')
  nascosto('Tel. 02/12345678, cell. 333-12 34 567, 0039 347 1234567, numero verde 800 123 456', '12345678', '333-12', '347 1234567', '800 123')
  nascosto('ROSSI Mario; Rossi, Mario; il minore L.B.; la sig.ra G. Verdi; Giovanni D’Angelo; Maria Grazia Lo Presti; la Sig.ra Anna ha detto', 'Rossi', 'Mario', 'L.B.', 'Verdi', 'Angelo', 'Presti', 'Anna')
  nascosto('12.500 euro; 500€; €1000; importo di 2.340,50; lire 1.000.000', '12.500', '500€', '1000', '2.340,50', '1.000.000')
  nascosto('C.F. 80012345678; P.IVA IT12345678901; c/c n. 000012345678; ABI 05428 CAB 11101; BIC BPMOIT22XXX', '80012345678', '12345678901', '000012345678', '05428', '11101', 'BPMOIT22')
  nascosto('targato MO 123456; motociclo AB 12345; telaio ZFA31200000123456; tessera sanitaria 80380000300012345678', '123456', 'AB 12345', 'ZFA312', '8038000030')
  nascosto('polizza n. 123456789; sinistro n. 2024/000123; REA MO-123456; matricola INPS 1234567890; codice SDI M5UXCR1', '123456789', '2024/000123', 'MO-123456', '1234567890', 'M5UXCR1')
  nascosto('email mario.rossi[at]gmail.com; @mariorossi su Instagram; password: Pippo123!; nome utente: mrossi85; coordinate 44.6471, 10.9252', 'mario.rossi', 'mariorossi', 'Pippo123', 'mrossi85', '44.6471')
  nascosto('la Rossi & Figli s.n.c., la Banca Popolare dell’Emilia, il Condominio Aurora; CAP 41121; prov. di Reggio Emilia; nato/a a Carpi (MO)', 'Figli', 'Emilia', 'Aurora', '41121', 'Reggio', 'Carpi')
  const sesso = m.anonimizza('Il paziente, di sesso maschile, sesso: F')
  ha(sesso, 'GENDER', 'di sesso maschile'); ha(sesso, 'GENDER', 'sesso: F')
  const cred = m.anonimizza('Nome utente: mrossi85, password: Segreta!9')
  ha(cred, 'ACCOUNT', 'mrossi85'); ha(cred, 'ACCOUNT', 'Segreta!9') // l'etichetta resta, il valore no
  const quieto = m.anonimizza('Come da art. 12.3.21 e versione 1.0.4. L’utente ha dichiarato che il login è avvenuto. Contratto 4+4 e pratica edilizia. Chiamare il tel. dell’ufficio.')
  assert.equal(quieto.entita, 0, JSON.stringify(trovati(quieto)))
  ok('date abbreviate e ISO, telefoni a gruppi, iniziali e cognomi con particella, importi senza decimali, conti e codici bancari, targhe e telai, numeri di polizze e sinistri, credenziali, sesso, coordinate; nessun falso positivo in più')

  // archivio di TIO: nomi senza titolo né contesto, codici con separatori diversi
  const voci = m.vociArchivio({ anagrafica: [{ tipo: 'persona', denominazione: 'Ezio Zanichelli', codice_fiscale: 'ZNCZEI70A01F257X', telefono: '3351234567' }, { tipo: 'azienda', denominazione: 'Acme Costruzioni' }], pratiche: [{ rg: '987/2023', giudice: 'dott.ssa Laura Neri' }] })
  const ra = m.anonimizza('Incontro con ezio zanichelli e Acme Costruzioni; tel. 335 123 4567. Causa 987/2023, giudice Laura Neri.', { archivio: voci })
  ha(ra, 'FULLNAME', 'ezio zanichelli'); ha(ra, 'ORG', 'Acme Costruzioni'); ha(ra, 'TELEPHONENUM', '335 123 4567'); ha(ra, 'DOCID', '987/2023'); ha(ra, 'FULLNAME', 'Laura Neri')
  ok('l’archivio riconosce clienti, società, telefoni, numeri di ruolo e giudici scritti in qualsiasi forma')

  // scelte dell'utente
  const ri = m.anonimizza(atto, { esclusi: ['AMOUNT', 'DATE'], ignorati: ['Paolo Verdi'], manuali: [{ testo: 'Foro di Modena', tag: 'ORG' }] })
  assert.ok(ri.testo.includes('€ 12.500,00') && ri.testo.includes('12/06/1985') && ri.testo.includes('Paolo Verdi') && !ri.testo.includes('Foro di Modena'))
  ok('categorie escluse, valori lasciati in chiaro e aggiunte manuali')

  // ripristino della risposta dell'IA, con segnaposto riscritti
  const risposta = `Gentile ${Object.keys(r.mappa).find((k) => r.mappa[k] === 'Mario Rossi')}, il debitore EDIL è SOCIETA_1 e il codice è [ CODICE FISCALE_1 ]. [NOME_COMPLETO_99] non esiste.`
  const back = m.ripristina(risposta, r.mappa)
  assert.ok(back.testo.includes('Gentile Mario Rossi') && back.testo.includes('Edilnord S.r.l.') && back.testo.includes('RSSMRA85H12B819I') && back.testo.includes('[NOME_COMPLETO_99]'), back.testo)
  // chiavi salvate con la versione 1.0.0 (segnaposto in inglese): si ripristinano ancora
  assert.equal(m.ripristina('Gentile [FULLNAME_1], codice CF_1.', { '[FULLNAME_1]': 'Mario Rossi', '[CF_1]': 'RSSMRA85H12B819I' }).testo, 'Gentile Mario Rossi, codice RSSMRA85H12B819I.')
  assert.ok(Object.keys(r.mappa).every((k) => /^\[(?:NOME_COMPLETO|SOCIETA|CODICE_FISCALE|PARTITA_IVA|IBAN|CARTA_PAGAMENTO|EMAIL|TELEFONO|INDIRIZZO|CAP|CITTA|PROVINCIA|DATA|ORARIO|ETA|IMPORTO|TARGA|DOCUMENTO_IDENTITA|NUMERO_ATTO|DATI_CATASTALI|SITO_WEB|INDIRIZZO_IP)_\d+\]$/.test(k)), Object.keys(r.mappa).join(' '))
  ok('ripristino dei valori originali anche da segnaposto senza parentesi o con spazi')

  // un nome in un modulo non prende l'etichetta della riga dopo: «MIROLO ALESSANDRO» a capo «Nome»
  const modulo = m.anonimizza('Cognome e nome: MIROLO ALESSANDRO\nNome del padre: Giuseppe\nIl sig. Mario Rossi\nNome utente: mrossi')
  for (const x of modulo.segmenti.filter((x) => x.tag)) assert.ok(!x.t.includes('\n'), `il dato «${x.t}» va su più righe`)
  ha(modulo, 'FULLNAME', 'MIROLO ALESSANDRO'); nonHa(modulo, 'Nome del'); nonHa(modulo, 'Nome utente')
  ok('i nomi restano su una riga e le etichette «Nome», «Cognome» restano in chiaro')

  const def = m.anonimizza(atto, { reversibile: false })
  assert.deepEqual(def.mappa, {})
  assert.equal(def.testo, r.testo)
  ok('anonimizzazione definitiva: stesso testo, nessun dizionario di ripristino')

  // prestazioni: un documento di circa 1 MB
  const grande = atto.repeat(500)
  const t0 = Date.now(); const rg = m.anonimizza(grande)
  assert.ok(Date.now() - t0 < 15000 && rg.entita > 10000, `${Date.now() - t0} ms`)
  ok(`documento di ${(grande.length / 1024).toFixed(0)} KB analizzato in ${Date.now() - t0} ms`)
} finally { fs.rmSync(out, { force: true }) }

// Anonimizza in blocco: stessa persona, stesso segnaposto in documenti diversi; una sola chiave
{
  const u = new m.Uniformatore()
  const a = u.applica(m.anonimizza('Il sig. Mario Rossi (C.F. RSSMRA85T10A562S) scrive a Giulia Bianchi.'))
  const b = u.applica(m.anonimizza('Risponde Giulia Bianchi a Mario Rossi; presente anche Paolo Verdi.'))
  const ph = (r, t) => r.segmenti.find((s) => s.tag && s.t === t)?.ph
  assert.equal(ph(a, 'Mario Rossi'), ph(b, 'Mario Rossi')); assert.equal(ph(a, 'Giulia Bianchi'), ph(b, 'Giulia Bianchi'))
  assert.notEqual(ph(b, 'Paolo Verdi'), ph(a, 'Mario Rossi'))
  assert.equal(u.mappa[ph(b, 'Paolo Verdi')], 'Paolo Verdi'); assert.equal(u.mappa[ph(a, 'Mario Rossi')], 'Mario Rossi')
  assert.ok(!b.testo.includes('Rossi') && b.testo.includes(ph(a, 'Mario Rossi')))
  assert.equal(m.ripristina(`${ph(a, 'Mario Rossi')} e ${ph(b, 'Paolo Verdi')}`, u.mappa).testo, 'Mario Rossi e Paolo Verdi')
  console.log('ok - in blocco: stessa persona con lo stesso segnaposto in tutti i documenti, una chiave per tutti')
}
