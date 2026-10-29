'use strict'
// Calendari collegati: lettura iCal, sincronizzazione a senso unico, e prova che l'app non scrive mai verso l'esterno.
process.env.TZ = 'Europe/Rome' // risultati deterministici su qualunque computer
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const ical = require('../electron/ical')
const db = require('../electron/db')
const calendari = require('../electron/calendari')

let n = 0
const ok = (t, extra = '') => console.log(`ok ${++n} - ${t}${extra ? ' ' + extra : ''}`)
const ICS = (...ev) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//prova//IT', ...ev.flat(), 'END:VCALENDAR'].join('\r\n')
const EV = (...r) => ['BEGIN:VEVENT', ...r, 'END:VEVENT']
const FINESTRA = [new Date(2026, 9, 12), new Date(2027, 10, 16)]
const occ = (testo) => ical.occorrenze(testo, ...FINESTRA)

// ---------- 1. lettura del formato iCal ----------
{
  const r = occ(ICS(
    EV('UID:u1', 'DTSTART:20261020T073000Z', 'DTEND:20261020T083000Z', 'SUMMARY:UTC estate'),
    EV('UID:u2', 'DTSTART:20261110T083000Z', 'SUMMARY:UTC inverno'),
    EV('UID:u3', 'DTSTART;TZID=America/New_York:20261020T090000', 'DTEND;TZID=America/New_York:20261020T100000', 'SUMMARY:New York'),
    EV('UID:u4', 'DTSTART;TZID=W. Europe Standard Time:20261020T093000', 'SUMMARY:Outlook'),
    EV('UID:u5', 'DTSTART:20261020T093000', 'SUMMARY:Fluttante'),
    EV('UID:u6', 'DTSTART:20261020T233000Z', 'SUMMARY:Oltre mezzanotte'),
    EV('UID:u7', 'DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261022', 'SUMMARY:Due giorni'),
    EV('UID:u8', 'DTSTART:20261020T100000', 'DURATION:PT90M', 'SUMMARY:Durata'),
    EV('UID:u9', 'DTSTART:20261020T100000', 'STATUS:CANCELLED', 'SUMMARY:Annullato'),
    EV('UID:u10', 'DTSTART;VALUE=DATE:20261020', 'SUMMARY:Un giorno'),
  ))
  const per = Object.fromEntries(r.map((o) => [o.titolo, o]))
  assert.equal(per['UTC estate'].inizio, '2026-10-20T09:30'); assert.equal(per['UTC estate'].fine, '2026-10-20T10:30')
  assert.equal(per['UTC inverno'].inizio, '2026-11-10T09:30')
  assert.equal(per['New York'].inizio, '2026-10-20T15:00'); assert.equal(per['New York'].fine, '2026-10-20T16:00')
  assert.equal(per['Outlook'].inizio, '2026-10-20T09:30'); assert.equal(per['Fluttante'].inizio, '2026-10-20T09:30')
  assert.equal(per['Oltre mezzanotte'].inizio, '2026-10-21T01:30')
  assert.deepEqual([per['Due giorni'].inizio, per['Due giorni'].fine, per['Due giorni'].tutto_il_giorno], ['2026-10-20', '2026-10-21', 1])
  assert.equal(per['Durata'].fine, '2026-10-20T11:30'); assert.ok(!per['Annullato'])
  assert.deepEqual([per['Un giorno'].inizio, per['Un giorno'].fine], ['2026-10-20', '2026-10-20'])
  ok('iCal: fusi orari (UTC, IANA, nomi di Outlook, ora fluttante), giorni interi, durata, annullati — convertiti nell\'ora locale')
}
{
  const r = occ(ICS(EV('UID:t1', 'DTSTART:20261020T090000', 'SUMMARY:Udienza civile\\, sez. II\\nAula 3\; piano 2', 'DESCRIPTION:riga uno\\nriga due con \\\\ barra', 'LOCATION:Tribunale di Modena',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Promemoria', 'TRIGGER:-PT15M', 'END:VALARM')))
  assert.equal(r[0].titolo, 'Udienza civile, sez. II\nAula 3; piano 2'); assert.equal(r[0].descrizione, 'riga uno\nriga due con \\ barra'); assert.equal(r[0].luogo, 'Tribunale di Modena')
  const lungo = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:f1', 'DTSTART:20261020T090000', 'SUMMARY:Titolo molto lun', ' go ripiegato su più righe', '\tcon tabulazione', 'END:VEVENT', 'END:VCALENDAR'].join('\n')
  assert.equal(occ(lungo)[0].titolo, 'Titolo molto lungo ripiegato su più righecon tabulazione')
  assert.equal(occ('﻿' + ICS(EV('UID:b', 'DTSTART:20261020T090000', 'SUMMARY:Con BOM')))[0].titolo, 'Con BOM')
  ok('iCal: testo con escape, righe ripiegate, BOM, allarmi interni ignorati')
}
{
  const settimanale = EV('UID:w', 'DTSTART:20261019T090000', 'DTEND:20261019T100000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6', 'EXDATE:20261026T090000', 'SUMMARY:Riunione')
  const spostata = EV('UID:w', 'RECURRENCE-ID:20261028T090000', 'DTSTART:20261028T100000', 'DTEND:20261028T110000', 'SUMMARY:Riunione spostata')
  const annullata = EV('UID:w', 'RECURRENCE-ID:20261102T090000', 'DTSTART:20261102T090000', 'STATUS:CANCELLED', 'SUMMARY:Riunione')
  const r = occ(ICS(settimanale, spostata, annullata))
  assert.deepEqual(r.map((o) => `${o.inizio} ${o.titolo}`), ['2026-10-19T09:00 Riunione', '2026-10-21T09:00 Riunione', '2026-10-28T10:00 Riunione spostata', '2026-11-04T09:00 Riunione'])
  ok('ripetizioni: settimanale con BYDAY/COUNT, occorrenza esclusa (EXDATE), spostata e annullata')
  const f = (rr, start = '20261030T150000') => occ(ICS(EV('UID:r', `DTSTART:${start}`, `RRULE:${rr}`, 'SUMMARY:R'))).map((o) => o.inizio.slice(0, 10))
  assert.deepEqual(f('FREQ=MONTHLY;BYDAY=-1FR;COUNT=4'), ['2026-10-30', '2026-11-27', '2026-12-25', '2027-01-29'])
  assert.deepEqual(f('FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3', '20261115T090000'), ['2026-11-15', '2026-12-15', '2027-01-15'])
  assert.deepEqual(f('FREQ=DAILY;INTERVAL=2;COUNT=3', '20261013T090000'), ['2026-10-13', '2026-10-15', '2026-10-17'])
  assert.deepEqual(f('FREQ=WEEKLY;UNTIL=20261101T000000Z', '20261019T090000'), ['2026-10-19', '2026-10-26'])
  assert.deepEqual(f('FREQ=MONTHLY;BYDAY=2TU;COUNT=3', '20261110T090000'), ['2026-11-10', '2026-12-08', '2027-01-12'])
  assert.deepEqual(f('FREQ=YEARLY', '20261208T090000'), ['2026-12-08'])
  assert.ok(f('FREQ=DAILY', '20261013T090000').length >= 399 && f('FREQ=DAILY', '20261013T090000').length <= 401)
  ok('ripetizioni: mensile (ultimo venerdì, giorno del mese, secondo martedì), giornaliera a intervalli, UNTIL, annuale, senza fine limitata alla finestra')
}
{
  for (const brutto of ['<html><body>Accedi a Cliens</body></html>', '', 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nDTSTART:20261020T090000\nSUMMARY:troncato', 'null']) assert.throws(() => occ(brutto), /calendario/i)
  assert.deepEqual(occ(ICS(EV('UID:senza-data', 'SUMMARY:senza data'), EV('UID:ok', 'DTSTART:20261020T090000'))).map((o) => o.titolo), ['(senza titolo)'])
  assert.doesNotThrow(() => occ(ICS(EV('UID:strano', 'DTSTART:NONVALIDO', 'SUMMARY:x'), EV('UID:strano2', 'DTSTART:20261020T090000', 'RRULE:FREQ=SECONDLY', 'SUMMARY:y'))))
  ok('iCal: pagine HTML, file vuoti o troncati rifiutati; eventi senza data o con regole sconosciute non bloccano il resto')
}

;(async () => {
  // ---------- 2. sincronizzazione contro un server locale ----------
  const richieste = []
  let feed = ICS(
    EV('UID:p1', 'DTSTART:20261014T090000', 'SUMMARY:Udienza A', 'LOCATION:Aula 1'),
    EV('UID:p2', 'DTSTART:20261020T100000', 'SUMMARY:Udienza B'),
    EV('UID:old', 'DTSTART:20260920T100000', 'SUMMARY:Udienza passata'),
  )
  let etag = '"v1"', modo = 'ok'
  const srv = http.createServer((req, res) => {
    let corpo = ''; req.on('data', (c) => (corpo += c))
    req.on('end', () => {
      richieste.push({ metodo: req.method, url: req.url, corpo: corpo.length, intestazioni: req.headers })
      if (req.method !== 'GET') { res.writeHead(405); return res.end('solo lettura') }
      if (req.url.startsWith('/redirect')) { res.writeHead(302, { Location: '/feed.ics' }); return res.end() }
      if (req.url.startsWith('/500')) { res.writeHead(500); return res.end('errore') }
      if (req.url.startsWith('/403')) { res.writeHead(403); return res.end('no') }
      if (req.url.startsWith('/404')) { res.writeHead(404); return res.end('no') }
      if (req.url.startsWith('/html')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>Effettua il login</html>') }
      if (req.url.startsWith('/lento')) return setTimeout(() => res.end(''), 30000)
      if (modo === 'giu') { res.writeHead(503); return res.end('manutenzione') }
      if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end() }
      res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8', ETag: etag }); res.end(feed)
    })
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-cal-')); db.open(tmp)
  const adesso = new Date(2026, 9, 12, 10, 0)
  const nuovo = (url, extra = {}) => db.save('calendari', { nome: 'Agenda prova', url, ...extra })
  const lista = () => db.list('eventi_esterni', {}, 'inizio').map((e) => `${e.inizio} ${e.titolo}`)

  const cal = nuovo(`${base}/feed.ics`)
  let r = await calendari.sincronizza(cal.id, adesso)
  assert.deepEqual([r.nuovi, r.aggiornati, r.rimossi, r.totali], [3, 0, 0, 3]); assert.equal(db.get('calendari', cal.id).ultimo_esito, 'ok')
  ok('sincronizzazione: eventi importati dal calendario (3), esito registrato')
  r = await calendari.sincronizza(cal.id, adesso)
  assert.equal(r.invariato, true); assert.equal(db.list('eventi_esterni').length, 3)
  assert.equal(richieste[richieste.length - 1].intestazioni['if-none-match'], '"v1"')
  ok('seconda sincronizzazione: nessun doppione, il servizio risponde "non modificato" (304)')

  const ev1 = db.list('eventi_esterni').find((e) => e.titolo === 'Udienza A'); const pr = db.save('pratiche', { titolo: 'Rossi c. Bianchi', colore: '#3b82f6' })
  db.save('eventi_esterni', { id: ev1.id, pratica_id: pr.id })
  feed = ICS(EV('UID:p1', 'DTSTART:20261014T113000', 'SUMMARY:Udienza A (rinviata)', 'LOCATION:Aula 2'), EV('UID:p2', 'DTSTART:20261020T100000', 'SUMMARY:Udienza B'), EV('UID:p3', 'DTSTART:20261105T090000', 'SUMMARY:Udienza C')); etag = '"v2"'
  r = await calendari.sincronizza(cal.id, adesso)
  assert.deepEqual([r.nuovi, r.aggiornati, r.rimossi], [1, 1, 0])
  const dopo = db.get('eventi_esterni', ev1.id)
  assert.equal(dopo.titolo, 'Udienza A (rinviata)'); assert.equal(dopo.inizio, '2026-10-14T11:30'); assert.equal(dopo.luogo, 'Aula 2'); assert.equal(dopo.pratica_id, pr.id)
  assert.ok(lista().includes('2026-09-20T10:00 Udienza passata'))
  ok('modifica nel calendario: titolo, ora e luogo aggiornati; il collegamento locale alla pratica resta; lo storico passato non si perde')
  feed = ICS(EV('UID:p1', 'DTSTART:20261014T113000', 'SUMMARY:Udienza A (rinviata)')); etag = '"v3"'
  r = await calendari.sincronizza(cal.id, adesso)
  assert.equal(r.rimossi, 2); assert.deepEqual(lista(), ['2026-09-20T10:00 Udienza passata', '2026-10-14T11:30 Udienza A (rinviata)'])
  ok('eventi futuri cancellati dal calendario: rimossi; quelli passati restano')

  // errori: i dati già importati non si toccano
  const prima = lista().join('|')
  for (const [percorso, atteso] of [['/500', /HTTP 500/], ['/403', /Accesso negato/], ['/404', /non trovato/], ['/html', /non è un calendario valido/]]) {
    const c = nuovo(`${base}${percorso}`, { nome: percorso })
    await assert.rejects(() => calendari.sincronizza(c.id, adesso), atteso)
    assert.equal(db.get('calendari', c.id).ultimo_esito, 'errore'); assert.match(db.get('calendari', c.id).ultimo_errore, atteso)
  }
  modo = 'giu'; etag = '"v4"'
  await assert.rejects(() => calendari.sincronizza(cal.id, adesso), /HTTP 503/)
  assert.equal(lista().join('|'), prima); assert.equal(db.get('calendari', cal.id).ultimo_esito, 'errore'); modo = 'ok'
  feed = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:z\r\nDTSTART:20261201T090000\r\nSUMMARY:troncato'; etag = '"v5"'
  await assert.rejects(() => calendari.sincronizza(cal.id, adesso), /incompleto/); assert.equal(lista().join('|'), prima)
  await assert.rejects(() => calendari.sincronizza(nuovo('http://127.0.0.1:1/non-esiste').id, adesso), /rifiutata|raggiungibile|fetch/i)
  await assert.rejects(() => calendari.sincronizza(nuovo('ftp://esempio.it/c.ics').id, adesso), /http, https o webcal/)
  ok('errori (HTTP 500/503/403/404, pagina di login, file troncato, server spento, protocollo non valido): messaggio chiaro e dati già importati intatti')

  feed = ICS(EV('UID:p1', 'DTSTART:20261014T113000', 'SUMMARY:Udienza A (rinviata)')); etag = '"v6"'
  const viaWebcal = nuovo(`webcal://127.0.0.1:${srv.address().port}/feed.ics`)
  assert.equal(calendari.normalizzaUrl(viaWebcal.url).startsWith('https://'), true)
  const rd = nuovo(`${base}/redirect`); r = await calendari.sincronizza(rd.id, adesso); assert.equal(r.totali, 1)
  ok('indirizzo webcal:// convertito in https://; reindirizzamenti HTTP seguiti')

  // pianificazione
  const cp = nuovo(`${base}/feed.ics`, { intervallo_min: 30, nome: 'pianificato' })
  assert.ok((await calendari.sincronizzaScaduti(adesso)).includes(cp.id))
  assert.ok(!(await calendari.sincronizzaScaduti(new Date(adesso.getTime() + 10 * 60000))).includes(cp.id))
  assert.ok((await calendari.sincronizzaScaduti(new Date(adesso.getTime() + 31 * 60000))).includes(cp.id))
  const ce = nuovo(`${base}/500`, { nome: 'in errore' }); await calendari.sincronizzaScaduti(adesso)
  assert.ok(!(await calendari.sincronizzaScaduti(new Date(adesso.getTime() + 3 * 60000))).includes(ce.id))
  assert.ok((await calendari.sincronizzaScaduti(new Date(adesso.getTime() + 6 * 60000))).includes(ce.id))
  db.save('calendari', { id: cp.id, attivo: 0 }); assert.ok(!(await calendari.sincronizzaScaduti(new Date(adesso.getTime() + 600 * 60000))).includes(cp.id))
  ok('pianificazione: aggiorna ogni 30 minuti, riprova dopo 5 minuti se c\'è stato un errore, ignora i calendari disattivati')

  // volumi
  const molti = []; for (let i = 0; i < 5000; i++) molti.push(EV(`UID:m${i}`, `DTSTART:2026${String(10 + (i % 3)).padStart(2, '0')}${String(1 + (i % 28)).padStart(2, '0')}T${String(8 + (i % 9)).padStart(2, '0')}0000`, `SUMMARY:Evento ${i}`))
  molti.push(EV('UID:ric', 'DTSTART:20261019T090000', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Settimanale'))
  feed = ICS(...molti); etag = '"grande"'
  const cg = nuovo(`${base}/feed.ics`, { nome: 'grande' }); const t0 = Date.now(); r = await calendari.sincronizza(cg.id, adesso)
  assert.ok(r.totali > 5000 && Date.now() - t0 < 5000, `${r.totali} eventi in ${Date.now() - t0} ms`)
  const tImport = Date.now() - t0
  feed = ICS(...molti); etag = '"grande2"'; r = await calendari.sincronizza(cg.id, adesso)
  assert.deepEqual([r.nuovi, r.aggiornati, r.rimossi], [0, 0, 0])
  ok(`volumi: calendario con 5.000 eventi + ripetizione settimanale importato in ${tImport} ms; risincronizzazione senza modifiche`)

  // ---------- 3. SOLA LETTURA: nessuna scrittura verso l'esterno ----------
  assert.ok(richieste.length > 20)
  assert.ok(richieste.every((x) => x.metodo === 'GET'), 'metodi usati: ' + [...new Set(richieste.map((x) => x.metodo))])
  assert.ok(richieste.every((x) => x.corpo === 0), 'nessun corpo inviato')
  assert.ok(richieste.every((x) => !x.intestazioni.authorization && !x.intestazioni.cookie), 'nessuna credenziale né cookie')
  ok(`sola lettura: ${richieste.length} richieste ricevute dal server, tutte GET, senza corpo, senza credenziali né cookie`)
  const codice = fs.readdirSync(path.join(__dirname, '..', 'electron')).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(__dirname, '..', 'electron', f), 'utf8')])
  const conRete = codice.filter(([, t]) => /\bfetch\(|https?\.request|net\.request|XMLHttpRequest/.test(t)).map(([f]) => f).sort()
  // calendari: indirizzi scelti dall'utente; aggiornamenti: controllo facoltativo, solo verso api.github.com (vedi test-nuove-versioni.js)
  assert.deepEqual(conRete, ['aggiornamenti.js', 'calendari.js'], 'moduli che usano la rete: ' + conRete)
  const indirizziAggiornamenti = codice.find(([f]) => f === 'aggiornamenti.js')[1].match(/https:\/\/[a-z0-9.-]+/gi)
  assert.deepEqual([...new Set(indirizziAggiornamenti)].sort(), ['https://api.github.com', 'https://github.com'], 'indirizzi nel controllo aggiornamenti: ' + indirizziAggiornamenti)
  for (const [f, t] of codice) assert.ok(!/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(t), `${f}: metodo di scrittura HTTP trovato`)
  ok('verifica del codice: solo il modulo calendari usa la rete e nessuno contiene richieste POST/PUT/PATCH/DELETE')
  const secret = fs.readFileSync(path.join(__dirname, '..', 'src', 'api.ts'), 'utf8'); const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.ok(!/['"]authorization['"]|access_token|refresh_token|client_secret|clientSecret|setPassword|['"]cookie['"]/i.test(senzaCommenti(secret + codice.map(([, t]) => t).join(''))))
  ok('nessuna autenticazione OAuth, nessun token né password in tutto il codice di collegamento')

  // prova() non salva nulla
  feed = ICS(EV('UID:q1', 'DTSTART:20261201T090000', 'SUMMARY:Anteprima')); etag = '"p"'
  const prima2 = db.list('eventi_esterni').length; const pv = await calendari.prova(`${base}/feed.ics`, adesso)
  assert.equal(pv.futuri, 1); assert.equal(db.list('eventi_esterni').length, prima2)
  ok('anteprima di un indirizzo: mostra gli eventi senza salvare nulla')

  // link che sembrano giusti ma non lo sono: si spiega quale copiare, senza provare a leggerli
  assert.throws(() => calendari.normalizzaUrl('https://calendar.google.com/calendar/u/0?cid=YWJjQGdtYWlsLmNvbQ'), /Indirizzo segreto in formato iCal/)
  assert.throws(() => calendari.normalizzaUrl('https://calendar.google.com/calendar/embed?src=abc%40gmail.com'), /Integra il calendario/)
  assert.ok(calendari.normalizzaUrl('https://calendar.google.com/calendar/ical/abc%40gmail.com/private-123/basic.ics').endsWith('basic.ics'))
  assert.throws(() => calendari.normalizzaUrl('https://outlook.office365.com/owa/calendar/abc/def/calendar.html'), /link ICS/)
  ok('link di condivisione di Google e pagina HTML di Outlook riconosciuti, con la spiegazione di quale link copiare')

  // file .ics già scaricato (per esempio cliccando l'indirizzo di Google): letto come un link, riletto solo se cambia
  const fileIcs = path.join(tmp, 'basic.ics')
  fs.writeFileSync(fileIcs, ICS(['BEGIN:VEVENT', 'UID:file-1', 'DTSTART:20261215T100000', 'SUMMARY:Udienza dal file', 'END:VEVENT']))
  const calFile = db.save('calendari', { nome: 'Da file', url: calendari.urlDaFile(fileIcs) })
  let rf = await calendari.sincronizza(calFile.id, adesso)
  assert.equal(rf.nuovi, 1); assert.equal(db.list('eventi_esterni', { calendario_id: calFile.id })[0].titolo, 'Udienza dal file')
  rf = await calendari.sincronizza(calFile.id, adesso); assert.equal(rf.invariato, true)
  fs.writeFileSync(fileIcs, ICS(['BEGIN:VEVENT', 'UID:file-1', 'DTSTART:20261215T100000', 'SUMMARY:Udienza dal file (rinviata)', 'END:VEVENT']))
  fs.utimesSync(fileIcs, new Date(), new Date(Date.now() + 5000))
  rf = await calendari.sincronizza(calFile.id, adesso); assert.equal(rf.aggiornati, 1)
  fs.rmSync(fileIcs)
  await assert.rejects(calendari.sincronizza(calFile.id, adesso), /non trovato.*Scegli di nuovo il file/)
  assert.equal(db.list('eventi_esterni', { calendario_id: calFile.id }).length, 1) // gli eventi già importati restano
  ok('file .ics: importato, ignorato se non cambia, riletto se cambia; se sparisce errore chiaro e dati intatti')

  // Risposta sintetica con struttura Google, senza contattare account o usare indirizzi segreti reali.
  const fetchReale = globalThis.fetch
  const googleUrl = 'https://calendar.google.com/calendar/ical/prova%40example.test/private-token-di-prova/basic.ics'
  const googleIcs = ['BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-TIMEZONE:Europe/Rome',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Rome', 'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE',
    ...EV('UID:google-prova', 'DTSTART;TZID=Europe/Rome:20261020T090000', 'DTEND;TZID=Europe/Rome:20261020T100000', 'RRULE:FREQ=WEEKLY;COUNT=2', 'SUMMARY:Evento Google di prova'), 'END:VCALENDAR'].join('\r\n')
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, googleUrl); assert.equal(options.method, 'GET'); assert.equal(options.body, undefined)
      assert.ok(!Object.keys(options.headers).some(h => /authorization|cookie/i.test(h)))
      return new Response(googleIcs, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', ETag: 'google-prova' } })
    }
    const googleCal = nuovo(googleUrl, { nome: 'Google Calendar (simulato)' })
    const rg = await calendari.sincronizza(googleCal.id, adesso)
    assert.equal(rg.nuovi, 2)
    assert.deepEqual(db.list('eventi_esterni', { calendario_id: googleCal.id }, 'inizio').map(e => e.inizio), ['2026-10-20T09:00', '2026-10-27T09:00'])
    ok('feed Google simulato: indirizzo iCal privato letto con GET senza credenziali, ricorrenze alle 09:00 anche dopo il cambio di ora')
  } finally { globalThis.fetch = fetchReale }

  srv.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`\n${n} prove superate`)
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
