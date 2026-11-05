'use strict'
// Pratiche da Cliens: importazione dall'elenco esportato (cliente, controparte e colonne in più) e vista unica dei documenti
// della cartella di Cliens e della cartella locale, senza doppioni; nessun file di origine viene toccato.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const db = require('../electron/db')
const imp = require('../electron/importer')
const cliens = require('../electron/cliens')

let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-cliens-'))
const scrivi = (rel, contenuto) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, contenuto); return f }
const impronta = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') + ':' + fs.statSync(f).mtimeMs

;(async () => {
try {
  db.open(path.join(tmp, 'dati'))

  // ---- importazione dell'elenco delle pratiche esportato da Cliens ----
  const csv = scrivi('cliens.csv', '﻿Codice pratica;Descrizione;Cliente/i;Controparte/i;Autorità;R.G.;Giudice;Stato;Avvocato responsabile;Data apertura\r\n'
    + '2024/015;Risarcimento danni;Rossi Mario; Bianchi Srl;Tribunale di Modena;1234/2024;Dott. Verdi;In corso;Avv. Neri;12/03/2024\r\n'
    + '2024/016;FERRARI LUCA c/ CONDOMINIO VIA EMILIA - decreto ingiuntivo;;;Giudice di pace;;;Aperta;Avv. Neri;\r\n'
    + '2024/017;Successione;Gialli Anna; Gialli Paolo;;;;;;Chiusa;Avv. Blu;\r\n')
  const prima = impronta(csv)
  const p = imp.proponi('pratiche', csv)
  assert.equal(p.intestazioni[p.mappatura.cliente], 'Cliente/i'); assert.equal(p.intestazioni[p.mappatura.controparte], 'Controparte/i'); assert.equal(p.intestazioni[p.mappatura.numero], 'Codice pratica')
  const e = imp.importa('pratiche', csv, p.mappatura, {})
  assert.equal(e.creati, 3, JSON.stringify(e.errori))
  const pr = (num) => db.list('pratiche').find((x) => x.numero === num)
  const nome = (id) => db.get('anagrafica', id)?.denominazione
  assert.equal(nome(pr('2024/015').cliente_id), 'Rossi Mario'); assert.equal(nome(pr('2024/015').controparte_id), 'Bianchi Srl')
  assert.equal(pr('2024/015').rg, '1234/2024'); assert.match(pr('2024/015').descrizione || '', /Avvocato responsabile: Avv\. Neri/)
  assert.equal(nome(pr('2024/016').cliente_id), 'FERRARI LUCA'); assert.equal(nome(pr('2024/016').controparte_id), 'CONDOMINIO VIA EMILIA')
  assert.equal(impronta(csv), prima)
  ok('elenco di Cliens: cliente e controparte (anche dall’oggetto «X c/ Y»), RG, giudice e colonne in più nelle note; file intatto')

  // formato di Cliens Cube («Esporta fascicoli»): parti nell'intestazione, numero di ruolo, codici di materia, ufficio
  const cube = scrivi('EXPORT_FASCICOLI.csv', 'Intestazione,Numero fascicolo,Ruolo,Materia,Tipo ufficio,Descrizione ufficio,Responsabile,Ruolo consultazione Polisweb,Oggetto,Annotazioni\n'
    + 'ALFA COSTRUZIONI S.P.A. / BETA & GAMMA S.N.C. +3,,1594/2017,CIV,Ufficio PCT,Tribunale Ordinario - Modena,Avv. Prova,Avvocato,Accertamento tecnico preventivo,\n'
    + 'DELTA SRL/EPSILON YACHTS SRL,,,CIV,Ufficio PCT,Tribunale Ordinario - Isernia,Avv. Prova,,RICORSO PER DECRETO INGIUNTIVO,\n'
    + 'DELTA S.R.L. / ZETA - CANTIERI SRL,,808/2024,CIV,Ufficio PCT,Tribunale Ordinario - Isernia,Avv. Prova,Avvocato,,\n'
    + 'AMMINISTRAZIONE DI SOSTEGNO ETA ANNA,,2349/2020,VG,Ufficio PCT,Tribunale Ordinario - Modena,Avv. Prova,,AMMINISTRAZIONE DI SOSTEGNO,\n'
    + ',,141/2017,IMMO,Ufficio PCT,Tribunale Ordinario - Modena,Avv. Prova,Avvocato,,\n'
    + 'TETA / IOTA,,,GdP,Ufficio PCT,Giudice di Pace - Modena,Avv. Prova,,Opposizione a sanzione,\n'
    + 'TETA / IOTA,,,GdP,Ufficio PCT,Giudice di Pace - Modena,Avv. Prova,,Opposizione a sanzione,\n'
    + 'KAPPA / LAMBDA,,99/2025,LAV,Ufficio PCT,Tribunale Ordinario - Modena,Avv. Prova,Avvocato,,\n'
    + 'MU / NU,,1/2025,CIV,Ufficio PCT,Tribunale Ordinario - Modena,Avv. Prova,Avvocato,,\n'
    + 'XI / OMICRON,,2/2025,CIV,Curia,Tribunale Ordinario - Modena,Avv. Prova,Avvocato,,\n')
  const pc = imp.proponi('pratiche', cube)
  const col = (k) => pc.intestazioni[pc.mappatura[k]]
  assert.deepEqual([col('titolo'), col('rg'), col('autorita'), col('tipo')], ['Intestazione', 'Ruolo', 'Descrizione ufficio', 'Materia'])
  const prima2 = db.list('pratiche').length
  const ec = imp.importa('pratiche', cube, pc.mappatura, {})
  assert.equal(ec.creati, 10, JSON.stringify(ec.errori))
  const tit = (t) => db.list('pratiche').filter((x) => x.titolo === t)
  const alfa = tit('ALFA COSTRUZIONI S.P.A. / BETA & GAMMA S.N.C. +3')[0]
  assert.equal(nome(alfa.cliente_id), 'ALFA COSTRUZIONI S.P.A.'); assert.equal(nome(alfa.controparte_id), 'BETA & GAMMA S.N.C.')
  assert.equal(alfa.rg, '1594/2017'); assert.equal(alfa.tipo, 'Civile'); assert.equal(alfa.autorita, 'Tribunale Ordinario - Modena')
  assert.match(alfa.descrizione, /Oggetto: Accertamento tecnico preventivo/); assert.match(alfa.descrizione, /Altre controparti: 3/)
  assert.doesNotMatch(alfa.descrizione, /Ufficio PCT|Responsabile|Polisweb/)
  assert.equal(nome(tit('DELTA S.R.L. / ZETA - CANTIERI SRL')[0].controparte_id), 'ZETA - CANTIERI SRL')
  assert.equal(tit('DELTA SRL/EPSILON YACHTS SRL')[0].cliente_id, tit('DELTA S.R.L. / ZETA - CANTIERI SRL')[0].cliente_id) // DELTA SRL = DELTA S.R.L.
  assert.equal(nome(tit('AMMINISTRAZIONE DI SOSTEGNO ETA ANNA')[0].cliente_id), 'ETA ANNA'); assert.equal(tit('AMMINISTRAZIONE DI SOSTEGNO ETA ANNA')[0].tipo, 'Volontaria giurisdizione')
  assert.equal(tit('Fascicolo R.G. 141/2017').length, 1); assert.equal(tit('Fascicolo R.G. 141/2017')[0].cliente_id, null)
  assert.equal(tit('TETA / IOTA').length, 2) // due fascicoli identici restano due pratiche
  assert.match(tit('XI / OMICRON')[0].descrizione || '', /Tipo ufficio: Curia/) // il valore diverso dagli altri si annota
  const rc = imp.importa('pratiche', cube, pc.mappatura, {})
  assert.equal(rc.creati, 0); assert.equal(db.list('pratiche').length, prima2 + 10)
  ok('Cliens Cube: parti dall’intestazione («+N»), RG dal ruolo, materia e ufficio; oggetto nelle note; riimportazione senza doppioni')

  // chi è il cliente: la seconda parte per tutte, oppure riga per riga (solo anteprima: nulla viene scritto)
  {
    const righeParti = (o) => imp.anteprima('pratiche', cube, pc.mappatura, o).parti
    const base = righeParti({}), kappa = base.find((x) => x.titolo === 'KAPPA / LAMBDA')
    assert.ok(base.length >= 7 && kappa && kappa.prima === 'KAPPA' && kappa.seconda === 'LAMBDA' && !kappa.invertita)
    assert.ok(righeParti({ cliente: 'seconda' }).every((x) => x.invertita))
    const unaSola = righeParti({ invertite: [kappa.riga] })
    assert.ok(unaSola.find((x) => x.riga === kappa.riga).invertita && unaSola.filter((x) => x.invertita).length === 1)
    assert.equal(db.list('pratiche').length, prima2 + 10)
    // in un archivio nuovo l'inversione arriva fino alla pratica salvata
    const dir2 = path.join(tmp, 'inversione'); db.close(); db.open(dir2)
    imp.importa('pratiche', cube, pc.mappatura, { invertite: [kappa.riga] })
    const k = db.list('pratiche').find((x) => x.titolo === 'KAPPA / LAMBDA'), mu = db.list('pratiche').find((x) => x.titolo === 'MU / NU')
    assert.equal(nome(k.cliente_id), 'LAMBDA'); assert.equal(nome(k.controparte_id), 'KAPPA'); assert.equal(nome(mu.cliente_id), 'MU')
    db.close(); db.open(path.join(tmp, 'dati'))
  }
  ok('Cliens Cube: il cliente può essere la seconda parte, per tutte le pratiche o riga per riga')

  // una pratica importata prima senza cliente si completa alla riimportazione, senza doppioni
  db.save('pratiche', { id: pr('2024/015').id, cliente_id: null })
  const r2 = imp.importa('pratiche', csv, p.mappatura, {})
  assert.equal(r2.creati, 0); assert.equal(nome(pr('2024/015').cliente_id), 'Rossi Mario'); assert.equal(db.list('pratiche').length, prima2 + 10)
  assert.equal(db.list('anagrafica').filter((a) => a.denominazione === 'Rossi Mario').length, 1)
  ok('riimportazione: completa i campi vuoti delle pratiche esistenti, nessuna pratica o anagrafica doppia')

  // ---- vista unica: cartella di Cliens + cartella locale ----
  const id = pr('2024/015').id
  const radiceCliens = path.join(tmp, 'Cliens'), cartellaCliens = path.join(radiceCliens, '2024-015 Risarcimento danni'), locale = path.join(tmp, 'Locale', 'Rossi')
  const comune = 'Contenuto della citazione'
  const fCit = scrivi('Cliens/2024-015 Risarcimento danni/Atti/Citazione.pdf', comune)
  const fSoloCliens = scrivi('Cliens/2024-015 Risarcimento danni/Verbale udienza.pdf', 'verbale')
  scrivi('Locale/Rossi/Citazione.pdf', comune) // stesso file anche sul computer
  scrivi('Locale/Rossi/Appunti.docx', 'appunti')
  scrivi('Locale/Rossi/~$Appunti.docx', 'temporaneo di Word')
  const originali = [fCit, fSoloCliens].map(impronta)
  db.save('pratiche', { id, cartella: locale })
  const ab = cliens.abbinaCartelle(radiceCliens)
  assert.equal(ab.find((a) => a.nome === '2024-015 Risarcimento danni')?.pratica?.id, id)
  ok('la cartella principale di Cliens abbina le sottocartelle alle pratiche per numero o titolo')

  const s1 = await cliens.impostaCartella(id, cartellaCliens)
  const docs = () => db.list('documenti', { pratica_id: id })
  const sez = () => Object.fromEntries(docs().map((d) => [d.nome, cliens.sezione(d, db.get('pratiche', id))]))
  assert.deepEqual(sez(), { 'Citazione.pdf': 'condivisa', 'Verbale udienza.pdf': 'cliens', 'Appunti.docx': 'locale' }, JSON.stringify(sez()))
  assert.equal(s1.condivisi, 1); assert.equal(s1.cliens, 1); assert.equal(s1.locali, 1)
  const cit = docs().find((d) => d.nome === 'Citazione.pdf')
  assert.equal(cit.percorso, path.join(locale, 'Citazione.pdf')); assert.equal(cit.percorso_cliens, fCit)
  ok('un file in entrambe le cartelle è un documento solo («In comune»), si apre dalla copia locale; i temporanei sono ignorati')

  // nuova sincronizzazione: nessun doppione; un documento collegato prima al file di Cliens si unisce al gemello locale
  const s2 = await cliens.sincronizzaPratica(id)
  assert.equal(s2.nuovi, 0); assert.equal(docs().length, 3)
  const fNuovo = scrivi('Cliens/2024-015 Risarcimento danni/Memoria.pdf', 'memoria')
  db.save('documenti', { pratica_id: id, nome: 'Memoria.pdf', file: '', percorso: fNuovo, impronta: require('../electron/docfile').impronta(fNuovo), dimensione: 7 })
  scrivi('Locale/Rossi/Memoria.pdf', 'memoria')
  const s3 = await cliens.sincronizzaPratica(id)
  assert.equal(docs().filter((d) => d.nome === 'Memoria.pdf').length, 1, JSON.stringify(docs().map((d) => d.nome)))
  assert.equal(sez()['Memoria.pdf'], 'condivisa'); assert.ok(s3.uniti >= 1)
  ok('sincronizzazioni ripetute senza doppioni; i doppioni già presenti vengono uniti')

  // un file tolto da Cliens: il documento resta, come solo locale
  fs.rmSync(fCit)
  const s4 = await cliens.sincronizzaPratica(id)
  assert.equal(s4.toltiDaCliens, 1); assert.equal(sez()['Citazione.pdf'], 'locale')
  assert.equal(impronta(fSoloCliens), originali[1])
  ok('file tolto da Cliens: il documento torna «solo sul computer»; i file di Cliens non vengono modificati')

  // impronte ricordate: i file di Cliens non cambiati non si rileggono
  const dbi = db.getDb()
  const ricordate = () => dbi.prepare('SELECT count(*) n FROM impronte').get().n
  assert.ok(ricordate() >= 2)
  dbi.prepare("UPDATE impronte SET impronta = 'finta' WHERE percorso = ?").run(path.resolve(fSoloCliens))
  await cliens.sincronizzaPratica(id)
  assert.equal(dbi.prepare('SELECT impronta FROM impronte WHERE percorso = ?').get(path.resolve(fSoloCliens)).impronta, 'finta', 'file non cambiato: impronta riusata senza rileggerlo')
  fs.writeFileSync(fSoloCliens, 'verbale corretto'); const t = new Date(Date.now() + 5000); fs.utimesSync(fSoloCliens, t, t)
  await cliens.sincronizzaPratica(id)
  assert.match(dbi.prepare('SELECT impronta FROM impronte WHERE percorso = ?').get(path.resolve(fSoloCliens)).impronta, /-sha256-/, 'file modificato: impronta ricalcolata')
  fs.rmSync(fSoloCliens); await cliens.sincronizzaPratica(id)
  assert.equal(dbi.prepare('SELECT count(*) n FROM impronte WHERE percorso = ?').get(path.resolve(fSoloCliens)).n, 0, 'file tolto: impronta dimenticata')
  ok('impronte dei file di Cliens ricordate: si rileggono solo i file nuovi o modificati')

  const avanzamenti = []
  const tutte = await cliens.sincronizzaTutte(radiceCliens, { avanza: (x) => avanzamenti.push(x) })
  assert.ok(avanzamenti.length >= 1 && avanzamenti.some((x) => x.pratica), 'avanzamento segnalato durante la sincronizzazione')
  assert.ok(tutte.pratiche >= 1 && !tutte.errori.length, JSON.stringify(tutte))
  await cliens.impostaCartella(id, null)
  assert.ok(!docs().some((d) => d.origine === 'condivisa'))
  ok('sincronizzazione di tutte le pratiche e scollegamento della cartella di Cliens')
} finally {
  db.close(); fs.rmSync(tmp, { recursive: true, force: true })
}
console.log(`\n${n} prove superate`)
})().catch((e) => { console.error(e); process.exit(1) })
