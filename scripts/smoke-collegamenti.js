'use strict'
// Collegamenti di sola lettura dall'interfaccia vera: calendario (server locale che finge di essere Cliens/Google), importazione da file e da cartella.
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
const hms = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}00`
const plus = (g, h = 0, m = 0) => { const d = new Date(); d.setDate(d.getDate() + g); d.setHours(h, m, 0, 0); return d }

function attach({ getWindow, db, runAlertCheck }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (c) => wc.executeJavaScript(c, true)
  const text = () => js('document.body.innerText')
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-coll'); fs.mkdirSync(out, { recursive: true })
  const shot = async (n) => { await sleep(350); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } }
  const trova = (label) => `(() => { const l=[...document.querySelectorAll('.modal .field > label, .modal .srow .lbl')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)})); return l && l.parentElement.querySelector('input:not([type=checkbox]),textarea,select') })()`
  async function digita(nome, label, testo) { // digitazione reale: il cursore non deve saltare
    const ok = await js(`(() => { const el=${trova(label)}; if(!el) return false; el.focus(); window.__t=el; return document.activeElement===el })()`)
    wc.focus(); for (const ch of testo) { wc.sendInputEvent({ type: 'keyDown', keyCode: ch }); wc.sendInputEvent({ type: 'char', keyCode: ch }); wc.sendInputEvent({ type: 'keyUp', keyCode: ch }); await sleep(35) }
    await sleep(100); const r = await js(`({ stesso: document.activeElement===window.__t, valore: window.__t.value })`)
    check(`digitazione: ${nome}`, ok && r.stesso && r.valore.endsWith(testo))
  }
  const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') + fs.statSync(f).mtimeMs

  // ---- finto servizio di calendario ----
  const richieste = []; let feed = '', etag = 1, giu = false
  const ICS = (...ev) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//finto//IT', ...ev.flat(), 'END:VCALENDAR'].join('\r\n')
  const EV = (...r) => ['BEGIN:VEVENT', ...r, 'END:VEVENT']
  const costruisci = (titolo1 = 'Udienza Rossi c. Bianchi', extra = []) => {
    const imminente = new Date(Date.now() + 59 * 60000)
    return ICS(
      EV('UID:e1@cliens', `DTSTART:${ymd(plus(1))}T${hms(plus(1, 9, 30))}`, `DTEND:${ymd(plus(1))}T${hms(plus(1, 10, 30))}`, `SUMMARY:${titolo1}`, 'LOCATION:Aula 4\\, Tribunale di Modena', 'DESCRIPTION:Prima udienza\\nportare la procura'),
      EV('UID:e2@cliens', `DTSTART;VALUE=DATE:${ymd(plus(3))}`, `DTEND;VALUE=DATE:${ymd(plus(4))}`, 'SUMMARY:Termine deposito memorie'),
      EV('UID:e3@cliens', `DTSTART:${ymd(plus(0))}T${hms(plus(0, 15, 0))}`, 'RRULE:FREQ=WEEKLY;COUNT=8', 'SUMMARY:Riunione di studio'),
      EV('UID:e4@cliens', `DTSTART:${ymd(imminente)}T${hms(imminente)}`, 'SUMMARY:Colloquio imminente'),
      ...extra,
    )
  }
  const srv = http.createServer((req, res) => {
    let corpo = ''; req.on('data', (c) => (corpo += c))
    req.on('end', () => {
      richieste.push({ metodo: req.method, corpo: corpo.length, auth: !!req.headers.authorization || !!req.headers.cookie })
      if (req.method !== 'GET') { res.writeHead(405); return res.end() }
      if (giu) { res.writeHead(500); return res.end('errore') }
      res.writeHead(200, { 'content-type': 'text/calendar', ETag: `"${etag}"` }); res.end(feed)
    })
  })

  wc.once('did-finish-load', async () => {
    try {
      await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${srv.address().port}/agenda/privata-token-123456.ics`
      feed = costruisci()
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, studio: { nome: 'Studio Prova', titolare: '', intestazione: '', indirizzo: '', cap_citta: '', piva: '', cf: '', email: '', pec: '', telefono: '', iban: '', domicilio_fiscale: '', banca: '' } })
      const pr = db.save('pratiche', { numero: '2026/001', titolo: 'Rossi c. Bianchi', stato: 'Aperta', colore: '#3b82f6' })
      wc.send('data-changed', db.TABLES.concat(['settings'])); await sleep(700)

      // ---------- calendario collegato ----------
      await clickText('.nav-item', 'Impostazioni'); await sleep(400); await clickText('.tabs button', 'Integrazioni'); await sleep(500)
      let t = await text()
      check('integrazioni: il pannello dichiara che i collegamenti sono di sola lettura', t.includes('Collegamenti di sola lettura') && t.includes('non scrive, non modifica e non cancella'))
      await js(`document.querySelector('button[aria-label="Collega un calendario"]').click()`); await sleep(400)
      await digita('calendario › nome', 'Nome', 'Udienze Cliens')
      await digita('calendario › link', 'Link del calendario', url.slice(0, 20))
      await js(`(() => { const el=${trova('Link del calendario')}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(url)}); el.dispatchEvent(new Event('input',{bubbles:true})) })()`)
      await clickText('.modal button', 'Prova il link'); await sleep(1500)
      t = await text()
      check('calendario: "Prova il link" legge il calendario senza salvare', t.includes('Calendario letto correttamente') && t.includes('Udienza Rossi c. Bianchi') && db.list('eventi_esterni').length === 0)
      await shot('c01-collega-calendario')
      await clickText('.modal .btn-primary', 'Collega e importa'); await sleep(2200)
      const cal = db.list('calendari')[0]
      check('calendario: collegato e importato (eventi e ripetizioni)', cal && cal.ultimo_esito === 'ok' && db.list('eventi_esterni').length >= 10, `(${db.list('eventi_esterni').length} eventi)`)
      t = await text()
      check('calendario: la scheda mostra stato, numero di eventi e link mascherato', /Aggiornato .* eventi/.test(t) && !t.includes('privata-token-123456') && t.includes('Udienze Cliens'))
      check('aggiunta calendario: solo icona più, nome accessibile e spiegazione al passaggio del mouse', await js(`(() => { const b=document.querySelector('button[aria-label="Collega un calendario"]'); return !!b && !b.textContent.trim() && b.title==='Collega un calendario' && !!b.querySelector('svg') })()`))
      const misuraOriginale = getWindow().getSize()
      for (const larghezza of [1024, 1280, 1600]) {
        getWindow().setSize(larghezza, 900); await sleep(300)
        const geometria = await js(`(() => {
          const s=document.querySelector('#calendari-collegati'), h=s.querySelector('.card-head').getBoundingClientRect(), b=s.querySelector('.cal-toolbar').getBoundingClientRect(), n=s.querySelector('.nota-lettura').getBoundingClientRect();
          return { pulsantiContenuti:b.left>=h.left-1&&b.right<=h.right+1, nessunaSovrapposizione:b.right<=n.left||b.bottom<=n.top||b.top>=n.bottom,
            titoli:[...s.querySelectorAll('.cal-card')].every(c=>{const d=c.querySelector('.cal-name .dot'),t=c.querySelector('.cal-name'); if(!d||!t)return false;const r=document.createRange();r.selectNodeContents(t.querySelector('.cal-label'));const a=d.getBoundingClientRect(),z=r.getClientRects()[0],line=parseFloat(getComputedStyle(t).lineHeight),label=t.querySelector('.cal-label').getBoundingClientRect();return a.right<=z.left&&Math.abs((a.top+a.bottom)/2-(label.top+line/2))<1}), overflow:s.scrollWidth>s.clientWidth+1 }
        })()`)
        check(`calendari a ${larghezza}px: pulsanti nei limiti, nessuna sovrapposizione e colore accanto al titolo`, geometria.pulsantiContenuti && geometria.nessunaSovrapposizione && geometria.titoli && !geometria.overflow, JSON.stringify(geometria))
        await shot('c02-layout-' + larghezza)
      }
      getWindow().setSize(1024,900)
      db.save('calendari',{id:cal.id,nome:'Udienze Cliens · calendario di prova con un nome lungo per verificare la prima riga del titolo'})
      wc.send('data-changed',['calendari']);await sleep(400)
      const righe=await js(`(()=>{const t=document.querySelector('.cal-name'),d=t.querySelector('.dot').getBoundingClientRect(),l=t.querySelector('.cal-label').getBoundingClientRect(),h=parseFloat(getComputedStyle(t).lineHeight);return {righe:l.height/h,errore:Math.abs((d.top+d.bottom)/2-(l.top+h/2))}})()`)
      check('titolo calendario su più righe: pallino centrato sulla prima riga',righe.righe>1.1&&righe.errore<1,JSON.stringify(righe));await shot('c02-titolo-multiriga')
      db.save('calendari',{id:cal.id,nome:'Udienze Cliens'});wc.send('data-changed',['calendari'])
      getWindow().setSize(...misuraOriginale); await sleep(250)
      await shot('c02-calendario-collegato')

      // ---------- link di condivisione di Google al posto dell'indirizzo iCal, e file .ics già scaricato ----------
      await js(`document.querySelector('button[aria-label="Collega un calendario"]').click()`); await sleep(400)
      check('nuovo calendario: la guida «Dove trovo il link» è già aperta', await js(`document.querySelector('.modal details.guida')?.open === true`))
      await js(`(() => { const el=${trova('Link del calendario')}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, 'https://calendar.google.com/calendar/u/0?cid=YWJjQGdtYWlsLmNvbQ'); el.dispatchEvent(new Event('input',{bubbles:true})) })()`)
      await clickText('.modal button', 'Prova il link'); await sleep(900)
      check('link di condivisione di Google: spiega di copiare «Indirizzo segreto in formato iCal»', (await text()).includes('Indirizzo segreto in formato iCal'))
      const fileIcs = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tio-ics-')), 'Google basic.ics')
      const tra20 = new Date(Date.now() + 20 * 86400000), dtIcs = `${tra20.getFullYear()}${String(tra20.getMonth() + 1).padStart(2, '0')}${String(tra20.getDate()).padStart(2, '0')}T090000`
      fs.writeFileSync(fileIcs, ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:g-1', `DTSTART:${dtIcs}`, 'SUMMARY:Riunione dal file Google', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'))
      process.env.MNGMNT_TEST_ICS_FILE = fileIcs
      await clickText('.modal button', 'Usa il file'); await sleep(500)
      await clickText('.modal .btn-primary', 'Collega e importa'); await sleep(1800)
      const calFile = db.list('calendari').find((c) => /^file:/.test(c.url))
      check('file .ics: collegato con il nome del file, eventi importati, scheda «File: …»', calFile?.nome === 'Google basic' && calFile.ultimo_esito === 'ok' && db.list('eventi_esterni').some((e) => e.titolo === 'Riunione dal file Google') && (await text()).includes('File: Google basic.ics'), JSON.stringify(calFile))
      delete process.env.MNGMNT_TEST_ICS_FILE
      if (calFile) { db.remove('calendari', calFile.id); wc.send('data-changed', ['calendari', 'eventi_esterni']); await sleep(500) } // i controlli seguenti partono da un solo calendario

      // ---------- agenda ----------
      await clickText('.nav-item', 'Agenda'); await sleep(600)
      const chips = await js(`document.querySelectorAll('.ev.ext').length`)
      check('agenda: gli eventi del calendario compaiono (con lucchetto) accanto alle scadenze', chips >= 3)
      await shot('c03-agenda')
      await js(`[...document.querySelectorAll('.ev.ext')].find(e=>e.textContent.includes('Udienza Rossi')).click()`); await sleep(500)
      t = await text()
      check('evento esterno: finestra di sola lettura con titolo, luogo, note e calendario di origine', t.includes('Evento di sola lettura') && t.includes('Aula 4, Tribunale di Modena') && t.includes('portare la procura') && t.includes('Udienze Cliens'))
      check('evento esterno: nessun campo modificabile tranne il collegamento alla pratica', (await js(`document.querySelectorAll('.modal input:not([type=hidden]), .modal textarea').length`)) === 0 && (await js(`document.querySelectorAll('.modal select').length`)) === 1)
      await js(`(() => { const s=document.querySelector('.modal select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s, ${JSON.stringify(String(pr.id))}); s.dispatchEvent(new Event('change',{bubbles:true})) })()`); await sleep(600)
      check('evento esterno: collegamento locale alla pratica salvato', db.list('eventi_esterni').find((e) => e.titolo === 'Udienza Rossi c. Bianchi').pratica_id === pr.id)
      await shot('c04-evento-esterno')
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(300)
      await clickText('.segmented button', 'Elenco'); await sleep(500); await clickText('.segmented button', 'Mese')
      await clickText('.nav-item', 'Panoramica'); await sleep(600)
      t = await text()
      check('panoramica: gli impegni dei prossimi giorni includono quelli del calendario collegato', t.includes('Udienza Rossi c. Bianchi') && t.includes('Termine deposito memorie'))
      await shot('c05-panoramica')
      await clickText('.nav-item', 'Pratiche'); await sleep(400); await js(`document.querySelector('.pcard h2').click()`); await sleep(500); await clickText('.tabs button', 'Scadenze'); await sleep(400)
      check('scheda pratica: mostra l\'evento collegato dal calendario (sola lettura)', /dai calendari collegati/i.test(await text()) && (await text()).includes('Udienza Rossi c. Bianchi'))

      // ---------- avvisi ----------
      runAlertCheck()
      check('avvisi: gli eventi del calendario generano avvisi locali (nome del calendario nel titolo)', db.list('notifiche').some((n) => n.tipo === 'evento_esterno' && /Udienze Cliens/.test(n.titolo) && /Colloquio imminente/.test(n.titolo)), JSON.stringify(db.list('notifiche').filter((n) => n.tipo === 'evento_esterno').map((n) => n.titolo)))

      // ---------- aggiornamento: modifica, errore, ripresa ----------
      feed = costruisci('Udienza Rossi c. Bianchi (RINVIATA)'); etag++
      await clickText('.nav-item', 'Impostazioni'); await sleep(400); await clickText('.tabs button', 'Integrazioni'); await sleep(400)
      await js(`document.querySelector('button[aria-label^="Aggiorna Udienze"]').click()`); await sleep(1500)
      const ev = db.list('eventi_esterni').find((e) => e.titolo.includes('RINVIATA'))
      check('aggiornamento: la modifica fatta nel calendario arriva in TIO e il collegamento alla pratica resta', ev && ev.pratica_id === pr.id)
      const prima2 = db.list('eventi_esterni').length
      giu = true; feed = ''
      await js(`document.querySelector('button[aria-label^="Aggiorna Udienze"]').click()`); await sleep(1500)
      t = await text()
      check('servizio non disponibile: messaggio chiaro nella scheda, dati già importati intatti', t.includes('HTTP 500') && db.list('eventi_esterni').length === prima2 && db.list('calendari')[0].ultimo_esito === 'errore')
      await shot('c06-errore-calendario')
      giu = false; feed = costruisci(); etag++
      await js(`document.querySelector('button[aria-label^="Aggiorna Udienze"]').click()`); await sleep(1500)
      check('servizio tornato disponibile: la scheda torna a "Aggiornato"', (await text()).includes('Aggiornato') && db.list('calendari')[0].ultimo_esito === 'ok')

      // ---------- importazione da file ----------
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-origine-'))
      const csv = path.join(tmp, 'fascicoli-cliens.csv')
      fs.writeFileSync(csv, ['N. Fascicolo;Oggetto;Assistito;Controparte;Materia;Stato;Ufficio giudiziario;R.G.;Valore causa;Data apertura',
        '2024/010;Verdi c. Neri — locazione;Anna Verdi;Neri Immobiliare S.r.l.;Civile;In corso;Tribunale di Modena;55/2024;8.000,00;12/03/2024',
        '2024/011;Recupero crediti Delta;Delta Spa;;Recupero crediti;Chiuso;;;1.500,00;03/04/2024',
        '2025/001;Consulenza contrattuale Eta;Eta Srl;;Stragiudiziale;Aperto;;;;15/01/2025'].join('\n'), 'latin1')
      const hCsv = hash(csv); process.env.MNGMNT_TEST_IMPORT_FILE = csv
      await js(`[...document.querySelectorAll('.import-card')].find(c=>c.querySelector('h3').textContent==='Pratiche').querySelector('button').click()`); await sleep(500)
      await clickText('.modal button', 'Scegli il file'); await sleep(1500)
      t = await text()
      check('importazione: colonne riconosciute da sole (Oggetto, Assistito, Ufficio giudiziario…) e anteprima con i nuovi elementi', t.includes('fascicoli-cliens.csv') && /3\s*nuov/i.test(t) && (await js(`[...document.querySelectorAll('.modal .mappa select')].filter(s=>s.value!=='-1').length`)) >= 9, /3\s*nuov/i.test(t) ? '' : JSON.stringify(t.slice(t.indexOf('ANTEPRIMA'), t.indexOf('ANTEPRIMA') + 200)))
      await shot('c07-importazione-anteprima')
      await clickText('.modal .btn-primary', 'Importa 3 elementi'); await sleep(1500)
      check('importazione: completata (3 pratiche, clienti creati in rubrica)', (await text()).includes('Importazione completata') && db.list('pratiche').filter((p) => /^2024\/01|2025\/001/.test(p.numero)).length === 3 && db.list('anagrafica').some((a) => a.denominazione === 'Delta Spa'))
      const verdi = db.list('pratiche').find((p) => p.numero === '2024/010')
      check('importazione: valori e date interpretati (8.000,00 → 8000; 12/03/2024; stato Chiuso → Chiusa; autorità, RG)', verdi.valore === 8000 && verdi.data_apertura === '2024-03-12' && verdi.rg === '55/2024' && db.list('pratiche').find((p) => p.numero === '2024/011').stato === 'Chiusa')
      await clickText('.modal .btn-primary', 'Chiudi'); await sleep(300)
      await js(`[...document.querySelectorAll('.import-card')].find(c=>c.querySelector('h3').textContent==='Pratiche').querySelector('button').click()`); await sleep(500)
      await clickText('.modal button', 'Scegli il file'); await sleep(1500)
      t = await text()
      check('importazione ripetuta: nessun doppione (3 già presenti, nulla da importare)', /3\s*già presenti/i.test(t) && t.includes('Nulla da importare') && db.list('pratiche').length === 4, /3\s*già presenti/i.test(t) ? '' : JSON.stringify(t.slice(t.indexOf('ANTEPRIMA'), t.indexOf('ANTEPRIMA') + 200)))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(300)
      check('importazione: il file di origine non è stato modificato', hash(csv) === hCsv)
      delete process.env.MNGMNT_TEST_IMPORT_FILE

      // ---------- importazione di una cartella di documenti ----------
      const arch = path.join(tmp, 'Archivio'); const f1 = path.join(arch, '2024-010 Verdi c. Neri', 'Atti', 'citazione.pdf'); const f2 = path.join(arch, 'Contratto Zeta', 'bozza.docx')
      fs.mkdirSync(path.dirname(f1), { recursive: true }); fs.mkdirSync(path.dirname(f2), { recursive: true }); fs.writeFileSync(f1, 'PDF citazione'); fs.writeFileSync(f2, 'bozza contratto'); fs.writeFileSync(path.join(arch, '2024-010 Verdi c. Neri', '.DS_Store'), 'x')
      const h1 = hash(f1), h2 = hash(f2); process.env.MNGMNT_TEST_IMPORT_DIR = arch
      await js(`[...document.querySelectorAll('.import-card')].find(c=>c.querySelector('h3').textContent.startsWith('Documenti')).querySelector('button').click()`); await sleep(500)
      await clickText('.modal button', 'Scegli la cartella'); await sleep(1200)
      t = await text()
      check('cartella: ogni sottocartella è abbinata alla pratica (per numero) o proposta come nuova', t.includes('2024/010') && t.includes('abbinata') && t.includes('Crea una nuova pratica'))
      await shot('c08-importazione-cartella')
      await clickText('.modal .btn-primary', 'Importa 2 file'); await sleep(1500)
      check('cartella: file copiati tra i documenti delle pratiche', (await text()).includes('Documenti importati') && db.list('documenti', { pratica_id: verdi.id }).length === 1 && db.list('documenti').some((d) => d.nome === 'bozza.docx'))
      check('cartella: i file originali sono rimasti identici e al loro posto', hash(f1) === h1 && hash(f2) === h2 && fs.existsSync(f1))
      delete process.env.MNGMNT_TEST_IMPORT_DIR
      await clickText('.modal .btn-primary', 'Chiudi'); await sleep(300)

      // ---------- modello da compilare ----------
      await js(`[...document.querySelectorAll('.import-card')].find(c=>c.querySelector('h3').textContent.startsWith('Clienti')).querySelectorAll('button')[1].click()`); await sleep(700)
      check('modello: file CSV da compilare creato', fs.existsSync(path.join(out, 'modello-anagrafica.csv')) && fs.readFileSync(path.join(out, 'modello-anagrafica.csv'), 'utf8').includes('Codice fiscale'))

      // ---------- pratiche ricavate dagli eventi (udienze e scadenze in stile Cliens Cube) ----------
      const stileCliens = [
        EV('UID:p1@cliens', `DTSTART:${ymd(plus(5))}T${hms(plus(5, 9, 0))}`, 'SUMMARY:Udienza - Verdi Anna c/ Neri Srl - RG 567/2026', 'LOCATION:Tribunale di Bologna\\, Aula 2'),
        EV('UID:p2@cliens', `DTSTART;VALUE=DATE:${ymd(plus(9))}`, 'SUMMARY:Scadenza memoria 171-ter - Verdi Anna contro Neri SRL'),
        EV('UID:p3@cliens', `DTSTART:${ymd(plus(12))}T${hms(plus(12, 11, 0))}`, 'SUMMARY:Udienza R.G. 88/2026', 'DESCRIPTION:Fascicolo: Gallo c/ Fabbri\\nCuria: Giudice di pace di Carpi\\nIstruttore: Avv. Bassi'),
      ]
      giu = false; feed = costruisci('Udienza Rossi c. Bianchi (RINVIATA)', stileCliens); etag++
      await clickText('.nav-item', 'Impostazioni'); await sleep(300); await clickText('.tabs button', 'Integrazioni'); await sleep(400)
      await js(`document.querySelector('button[aria-label^="Aggiorna Udienze"]').click()`); await sleep(1500)
      await clickText('.cal-card button', 'Pratiche'); await sleep(900)
      t = await js('document.querySelector(".modal").innerText')
      check('pratiche dal calendario: anteprima con le pratiche riconosciute (nuove e già in TIO), senza creare nulla', t.includes('Verdi Anna c/ Neri Srl') && t.includes('567/2026') && t.includes('Tribunale di Bologna') && t.includes('Gallo c/ Fabbri') && /Collega a 2026\/001/i.test(t) && !db.list('pratiche').some((p) => ['Verdi Anna c/ Neri Srl', 'Gallo c/ Fabbri'].includes(p.titolo)), JSON.stringify(t))
      check('pratiche dal calendario: riunioni e colloqui restano solo in agenda', /eventi senza una pratica riconoscibile/.test(t) && !t.includes('Riunione di studio\nFascicolo'))
      await shot('c06-pratiche-dal-calendario')
      await clickText('.modal .btn-primary', 'Importa'); await sleep(1200)
      const pVerdi = db.list('pratiche').find((p) => p.titolo === 'Verdi Anna c/ Neri Srl'), pGallo = db.list('pratiche').find((p) => p.titolo === 'Gallo c/ Fabbri')
      check('pratiche dal calendario: create con R.G., ufficio e giudice; eventi collegati; scelta «in automatico» salvata', pVerdi?.rg === '567/2026' && pVerdi.autorita === 'Tribunale di Bologna' && pGallo?.giudice === 'Avv. Bassi' && db.list('eventi_esterni').filter((e) => e.pratica_id === pVerdi.id).length === 2 && db.list('calendari')[0].crea_pratiche === 1, JSON.stringify([pVerdi, pGallo]))
      feed = costruisci('Udienza Rossi c. Bianchi (RINVIATA)', [...stileCliens, EV('UID:p4@cliens', `DTSTART:${ymd(plus(15))}T${hms(plus(15, 9, 0))}`, 'SUMMARY:Udienza - Moretti c/ Banca Etica - RG 12/2026')]); etag++
      await js(`document.querySelector('button[aria-label^="Aggiorna Udienze"]').click()`); await sleep(1500)
      check('pratiche dal calendario: in automatico la nuova pratica arriva all\'aggiornamento, con avviso nel campanello', db.list('pratiche').some((p) => p.titolo === 'Moretti c/ Banca Etica' && p.rg === '12/2026') && db.list('notifiche').some((n) => /Nuova pratica dal calendario/.test(n.titolo)) && db.list('pratiche').filter((p) => p.titolo === 'Verdi Anna c/ Neri Srl').length === 1 && db.list('pratiche').some((p) => /^Verdi c\. Neri\W+locazione$/.test(p.titolo)), JSON.stringify(db.list('pratiche').map((p) => p.titolo)))

      // ---------- scollegare ----------
      await js(`document.querySelector('button[aria-label^="Scollega Udienze"]').click()`); await sleep(400)
      check('scollegare: chiede conferma e spiega che l\'originale non viene toccato', (await text()).includes('Il calendario originale non viene toccato'))
      await clickText('.modal .btn-danger', 'Scollega'); await sleep(900)
      check('scollegare: calendario ed eventi importati rimossi da TIO', db.list('calendari').length === 0 && db.list('eventi_esterni').length === 0 && db.list('pratiche').some((p) => p.id === pr.id))

      // ---------- SOLA LETTURA verso l'esterno ----------
      check(`sola lettura: il servizio ha ricevuto ${richieste.length} richieste, tutte GET, senza corpo, senza credenziali né cookie`, richieste.length >= 4 && richieste.every((r) => r.metodo === 'GET' && r.corpo === 0 && !r.auth))
      const bad = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e) } finally { srv.close(); setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}
module.exports = { attach }
