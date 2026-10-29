'use strict'
// Pratiche ricavate dagli eventi di un calendario collegato (Cliens Cube e simili): riconoscimento, raggruppamento,
// anteprima, creazione, collegamento degli eventi, nessun doppione, nessuna sovrascrittura, scelte ricordate.
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const db = require('../electron/db')
const pe = require('../electron/pratiche-da-eventi')
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)

const a = pe.analizzaEvento
assert.deepEqual(a({ titolo: 'Udienza - Rossi Mario c/ Bianchi S.p.A. - RG 1234/2025', luogo: 'Tribunale di Modena, Aula 3' }),
  { intestazione: 'Rossi Mario c/ Bianchi S.p.A.', rg: '1234/2025', autorita: 'Tribunale di Modena', giudice: '', numero: '', oggetto: '' })
const conEtichette = a({ titolo: 'Udienza di prima comparizione – Verdi c. Neri', descrizione: 'Ruolo: 567/2026\nCuria: Tribunale di Bologna\nIstruttore: Dott.ssa Gialli' })
assert.equal(conEtichette.intestazione, 'Verdi c/ Neri'); assert.equal(conEtichette.rg, '567/2026'); assert.equal(conEtichette.autorita, 'Tribunale di Bologna'); assert.equal(conEtichette.giudice, 'Dott.ssa Gialli')
assert.equal(a({ titolo: 'Scadenza: deposito memoria 171-ter', descrizione: 'Fascicolo: Rossi Mario contro Bianchi SPA\nR.G. n. 1234/2025' }).rg, '1234/2025')
assert.equal(a({ titolo: "Termine per appello (art. 325 c.p.c.) - Ferrari c/ Allianz", descrizione: "N.R.G. 4321/2024 Corte d'Appello di Bologna" }).autorita, "Corte d'Appello di Bologna")
assert.equal(a({ titolo: 'Udienza Giudice di Pace di Carpi - Esposito Anna c/ Comune di Carpi' }).intestazione, 'Esposito Anna c/ Comune di Carpi')
assert.equal(a({ titolo: 'Udienza R.G. 999/2025', descrizione: 'Intestazione: Fallimento Alfa Srl' }).intestazione, 'Fallimento Alfa Srl')
assert.equal(a({ titolo: 'Udienza R.G. 77/2026' }).intestazione, 'Procedimento R.G. 77/2026')
assert.equal(a({ titolo: 'Scadenza memoria 171-ter - Verdi Anna contro Neri SRL' }).intestazione, 'Verdi Anna c/ Neri SRL')
assert.equal(a({ titolo: 'Deposito note scritte: Gallo c/ Fabbri' }).intestazione, 'Gallo c/ Fabbri')
ok('riconosce intestazione, numero di ruolo, ufficio e giudice dal titolo, dalle etichette della descrizione e dal luogo')

for (const t of ['Dentista', 'Riunione di studio', 'Pranzo con Mario', 'Telefonare a Rossi per art. 3 c. 2', 'Ferie', 'Corso di aggiornamento'])
  assert.equal(a({ titolo: t, descrizione: 'ordine del giorno: varie' }), null, t)
ok('gli eventi senza tracce di una pratica restano fuori (appuntamenti personali, promemoria, citazioni di articoli)')

assert.equal(pe.normIntestazione('Rossi Mario c/ Bianchi S.p.A.'), pe.normIntestazione('ROSSI MARIO contro BIANCHI SPA'))
const { gruppi, nonRiconosciuti } = pe.raggruppa([
  { id: 1, titolo: 'Udienza - Rossi Mario c/ Bianchi S.p.A. - RG 1234/2025', inizio: '2026-11-03T09:00' },
  { id: 2, titolo: 'Scadenza memoria - Rossi Mario contro Bianchi SPA', inizio: '2026-11-20T00:00' },
  { id: 3, titolo: 'Udienza Verdi c/ Neri', descrizione: 'Ruolo: 567/2026', inizio: '2026-12-01T10:00' },
  { id: 4, titolo: 'Dentista', inizio: '2026-11-05T15:00' },
])
assert.equal(gruppi.length, 2); assert.equal(gruppi.find((g) => g.rg === '1234/2025').eventi.length, 2); assert.equal(nonRiconosciuti.length, 1)
ok('raggruppa per numero di ruolo; un evento senza R.G. ma con la stessa intestazione va nella stessa pratica')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-pde-'))
db.open(tmp)
const cal = db.save('calendari', { nome: 'Cliens Cube', url: 'https://www.clienscube.it/agenda/abc.ics' })
const ev = (chiave, titolo, inizio, extra = {}) => db.save('eventi_esterni', { calendario_id: cal.id, chiave, titolo, inizio, ...extra })
ev('e1', 'Udienza - Rossi Mario c/ Bianchi S.p.A. - RG 1234/2025', '2026-11-03T09:00', { luogo: 'Tribunale di Modena' })
ev('e2', 'Scadenza memoria - Rossi Mario contro Bianchi SPA', '2026-11-20T00:00')
ev('e3', 'Udienza Verdi c/ Neri', '2026-12-01T10:00', { descrizione: 'Ruolo: 567/2026\nIstruttore: Dott. Gialli' })
ev('e4', 'Udienza Esposito c/ Comune di Carpi', '2026-12-10T09:30')
ev('e5', 'Dentista', '2026-11-05T15:00')
const esistente = db.save('pratiche', { numero: '2025/010', titolo: 'Verdi c. Neri', stato: 'Aperta', giudice: 'Dott. Scelto a mano' })
const manuale = db.save('pratiche', { numero: '2025/011', titolo: 'Altra pratica', stato: 'Aperta' })
db.save('eventi_esterni', { id: db.list('eventi_esterni', { chiave: 'e4' })[0].id, pratica_id: manuale.id }) // collegato a mano dall'utente

let prev = pe.anteprima(cal.id)
assert.equal(prev.pratiche.length, 3); assert.equal(prev.nonRiconosciuti, 1); assert.deepEqual(prev.esempiNonRiconosciuti, ['Dentista'])
assert.equal(prev.pratiche.find((p) => p.rg === '567/2026').stato, 'esistente')
assert.equal(prev.pratiche.find((p) => p.rg === '1234/2025').stato, 'nuova')
assert.equal(db.list('pratiche').length, 2)
ok('anteprima: pratiche nuove e già in TIO (abbinate per intestazione), eventi non riconosciuti contati, nessuna modifica')

const chiaveEsposito = prev.pratiche.find((p) => /Esposito/.test(p.intestazione)).chiave
const scelte = Object.fromEntries(prev.pratiche.map((p) => [p.chiave, p.chiave !== chiaveEsposito]))
let r = pe.applica(cal.id, scelte)
assert.deepEqual(r.create, ['Rossi Mario c/ Bianchi S.p.A.']); assert.deepEqual(r.collegate, ['Verdi c. Neri']); assert.equal(r.scartate, 1)
const rossi = db.list('pratiche').find((p) => p.rg === '1234/2025')
assert.equal(rossi.autorita, 'Tribunale di Modena'); assert.ok(/^\d{4}\/\d{3}$/.test(rossi.numero)); assert.match(rossi.descrizione, /calendario «Cliens Cube»/)
assert.equal(db.get('pratiche', esistente.id).rg, '567/2026'); assert.equal(db.get('pratiche', esistente.id).giudice, 'Dott. Scelto a mano')
assert.equal(db.list('eventi_esterni', { pratica_id: rossi.id }).length, 2)
assert.equal(db.list('eventi_esterni', { chiave: 'e4' })[0].pratica_id, manuale.id)
ok('importazione: crea la nuova pratica, collega gli eventi, completa i campi vuoti di quella esistente senza sovrascrivere, rispetta i collegamenti a mano')

db.save('pratiche', { id: rossi.id, titolo: 'Rossi / Bianchi (rinominata)' })
ev('e6', 'Udienza - Rossi Mario c/ Bianchi S.p.A. - RG 1234/2025', '2027-01-15T09:00')
ev('e7', 'Udienza - Esposito c/ Comune di Carpi', '2027-01-20T09:00')
ev('e8', 'Udienza - Gallo c/ Fabbri - RG 88/2026', '2027-02-02T09:00')
assert.equal(pe.applicaAutomatico(cal.id), null) // automatico spento
db.save('calendari', { id: cal.id, crea_pratiche: 1 })
r = pe.applicaAutomatico(cal.id)
assert.deepEqual(r.create, ['Gallo c/ Fabbri']); assert.equal(r.collegate.length, 0)
assert.equal(db.list('pratiche').filter((p) => /Rossi/.test(p.titolo)).length, 1); assert.equal(db.list('eventi_esterni', { chiave: 'e6' })[0].pratica_id, rossi.id)
assert.ok(!db.list('pratiche').some((p) => /Esposito/.test(p.titolo)))
ok('in automatico: nuove pratiche create, quelle rinominate ritrovate, quelle scartate non riproposte')

db.remove('pratiche', db.list('pratiche').find((p) => /Gallo/.test(p.titolo)).id)
r = pe.applicaAutomatico(cal.id)
assert.equal(r.create.length, 0); assert.ok(!db.list('pratiche').some((p) => /Gallo/.test(p.titolo)))
assert.equal(pe.anteprima(cal.id).pratiche.find((p) => p.rg === '88/2026').stato, 'scartata')
r = pe.applica(cal.id, { [pe.anteprima(cal.id).pratiche.find((p) => p.rg === '88/2026').chiave]: true })
assert.deepEqual(r.create, ['Gallo c/ Fabbri'])
ok('una pratica eliminata non viene ricreata in automatico; si può reimportare a mano dall\'anteprima')

// Lo stesso numero di ruolo può esistere presso più uffici e con le stesse parti.
const collisione = db.save('calendari', { nome: 'Uffici distinti', url: 'https://example.test/uffici.ics', crea_pratiche: 1 })
const modena = db.save('pratiche', { titolo: 'Stesse Parti c/ Altra Parte', rg: '12/2026', autorita: 'Tribunale di Modena', stato: 'Aperta' })
const diversoTitolo = db.save('pratiche', { titolo: 'Procedimento a Firenze', rg: '12/2026', autorita: 'Tribunale di Firenze', stato: 'Aperta' })
const eModena = db.save('eventi_esterni', { calendario_id: collisione.id, chiave: 'm', titolo: 'Udienza - Stesse Parti c/ Altra Parte - RG 12/2026', luogo: 'Tribunale di Modena', inizio: '2026-11-01T09:00' })
const eBologna = db.save('eventi_esterni', { calendario_id: collisione.id, chiave: 'b', titolo: 'Udienza - Stesse Parti c/ Altra Parte - RG 12/2026', luogo: 'Tribunale di Bologna', inizio: '2026-11-02T09:00' })
prev = pe.anteprima(collisione.id)
assert.equal(prev.pratiche.length, 2)
assert.equal(prev.pratiche.find(p => p.autorita === 'Tribunale di Modena').pratica.id, modena.id)
assert.equal(prev.pratiche.find(p => p.autorita === 'Tribunale di Bologna').stato, 'nuova')
r = pe.applicaAutomatico(collisione.id)
assert.equal(r.create.length, 1)
const bolognaId = db.get('eventi_esterni', eBologna.id).pratica_id
assert.notEqual(bolognaId, modena.id); assert.notEqual(bolognaId, diversoTitolo.id)
assert.equal(db.get('pratiche', bolognaId).autorita, 'Tribunale di Bologna')
assert.equal(db.get('eventi_esterni', eModena.id).pratica_id, modena.id)
assert.equal(pe.applicaAutomatico(collisione.id).create.length, 0)
ok('stesso R.G. e stesse parti in due tribunali: gruppi e pratiche distinti, abbinamento esatto e nessun doppione al secondo aggiornamento')

const vecchioCal = db.save('calendari', { nome: 'Scelte precedenti', url: 'https://example.test/vecchio.ics' })
db.getDb().prepare('INSERT INTO pratiche_da_calendario(calendario_id,chiave,pratica_id) VALUES(?,?,?)').run(vecchioCal.id, 'rg:12/2026', modena.id)
db.save('eventi_esterni', { calendario_id: vecchioCal.id, chiave: 'vm', titolo: 'Udienza - Stesse Parti c/ Altra Parte - RG 12/2026', luogo: 'Tribunale di Modena', inizio: '2026-11-01T09:00' })
assert.equal(pe.anteprima(vecchioCal.id).pratiche[0].pratica.id, modena.id)
db.save('eventi_esterni', { calendario_id: vecchioCal.id, chiave: 'vb', titolo: 'Udienza - Altre Parti c/ Terza Parte - RG 12/2026', luogo: 'Tribunale di Torino', inizio: '2026-11-02T09:00' })
prev = pe.anteprima(vecchioCal.id)
assert.equal(prev.pratiche.find(p => p.autorita === 'Tribunale di Modena').pratica.id, modena.id)
assert.equal(prev.pratiche.find(p => p.autorita === 'Tribunale di Torino').pratica, null)
db.getDb().prepare('DELETE FROM eventi_esterni WHERE calendario_id=? AND chiave=?').run(vecchioCal.id, 'vm')
assert.equal(pe.anteprima(vecchioCal.id).pratiche[0].pratica, null)
ok('scelte delle beta precedenti conservate per il giusto ufficio; non trasferite a un altro tribunale quando cambia il feed')

db.close(); fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${n} prove sulle pratiche ricavate dal calendario superate`)
