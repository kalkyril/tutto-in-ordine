'use strict'
// Novità della 1.0.3 nell'app vera (studio legale): orario mai a capo nel calendario del mese a ogni larghezza, panoramica
// annuale dello scadenzario, più persone e ruolo nella pratica, sottocartelle dei documenti, più indirizzi e pratiche
// collegate in anagrafica. Avvio: sh scripts/run-smoke.sh <cartella> smoke-103
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (c) => wc.executeJavaScript(c, true)
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-102'); fs.mkdirSync(out, { recursive: true })
  const shot = async (n) => { await sleep(400); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } }
  const setVal = (sel, v) => js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; const proto = el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); return true })()`)
  const text = () => js('document.body.innerText')
  const campo = (label) => `(() => { const l=[...document.querySelectorAll('.modal .field > label')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)})); return l && l.parentElement.querySelector('select,input,textarea') })()`
  const axe = async (nome) => {
    const src = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); await js(src + '; true')
    const v = await js(`axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: false } } }).then(r => r.violations.map(v => v.id + ':' + v.nodes.length + ' ' + v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' | ')))`)
    check(`accessibilità (axe-core): ${nome}`, v.length === 0, JSON.stringify(v))
  }

  const larghezze = async (nome, lista, controllo) => {
    const originali = getWindow().getSize()
    for (const w of lista) { getWindow().setSize(w, 900); await sleep(500); await controllo(w); await shot(`${nome}-${w}`) }
    getWindow().setSize(...originali); await sleep(300)
  }
  const senzaScorrimento = () => js('document.documentElement.scrollWidth <= innerWidth + 1')

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, tema: process.env.SMOKE_TEMA === 'scuro' ? 'scuro' : 'chiaro', studio: { nome: 'Studio Legale Verdi', cap_citta: '41121 Modena', titolare: 'Avv. Anna Verdi' } })
      const oggi = new Date(), anno = oggi.getFullYear(), ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const cli = db.save('anagrafica', { denominazione: 'Mario Rossi', ruolo: 'cliente', tipo: 'persona', indirizzo: 'Via Roma 3', cap: '41012', citta: 'Carpi', provincia: 'MO' })
      const cli2 = db.save('anagrafica', { denominazione: 'Lucia Rossi', ruolo: 'cliente', tipo: 'persona' })
      const ctr = db.save('anagrafica', { denominazione: 'Alfa Costruzioni S.r.l.', ruolo: 'controparte', tipo: 'azienda' })
      const coll = db.save('anagrafica', { denominazione: 'Paolo Neri', titolo: 'Avv.', ruolo: 'altro', tipo: 'persona' })
      const pr = db.save('pratiche', { numero: `${anno}/001`, titolo: 'Rossi c. Alfa Costruzioni', cliente_id: cli.id, controparte_id: ctr.id, stato: 'In corso', colore: '#3b82f6', tipo: 'Civile', ruolo: 'Difensore', persone: JSON.stringify([{ id: cli2.id, ruolo: 'cliente' }, { id: coll.id, ruolo: 'collaboratore' }]) })
      const pr2 = db.save('pratiche', { numero: `${anno}/002`, titolo: 'Recupero crediti Beta', stato: 'In corso', colore: '#16a34a', tipo: 'Civile' })
      // agenda: orari e titoli lunghi, quattro impegni nello stesso giorno, un impegno nel fine settimana
      const giorno = (n) => ymd(new Date(anno, oggi.getMonth(), n))
      const sabato = (() => { const d = new Date(anno, oggi.getMonth(), 1); while (d.getDay() !== 6) d.setDate(d.getDate() + 1); return ymd(d) })()
      for (const [d, h, t, p] of [[giorno(11), '11:00', 'Call con ass. Colla - Clust-ER Health e gruppo di lavoro', pr.id], [giorno(11), '15:30', 'Udienza Tribunale di Modena', pr.id], [giorno(11), '09:00', 'Deposito memoria', pr2.id], [giorno(11), '18:45', 'Riunione di studio', null], [giorno(18), '08:15', 'Supercalifragilistichespiralidoso_senza_spazi_lunghissimo', pr2.id], [sabato, '10:00', 'Sopralluogo con il consulente tecnico di parte', pr.id]])
        db.save('scadenze', { pratica_id: p, titolo: t, tipo: 'appuntamento', data_ora: `${d}T${h}`, tutto_il_giorno: 0, promemoria: '[]', completata: 0 })
      db.save('scadenze', { pratica_id: pr.id, titolo: 'Termine note scritte', tipo: 'scadenza', data_ora: giorno(20), tutto_il_giorno: 1, promemoria: '[]', completata: 0 })
      // scadenzario: fatture e costi su più mesi dell'anno
      const fattura = (mese, importo, stato, extra = {}) => db.saveParcella({ anno, tipo: 'parcella', data: `${anno}-${mese}-05`, pratica_id: pr.id, cliente_id: cli.id, stato, voci: [{ tipo: 'compenso', descrizione: 'Compenso', quantita: 1, importo }], sg_perc: 0, cpa_perc: 0, iva_perc: 0, rit_perc: 0, bollo: 0, compensi: importo, imponibile: importo, iva: 0, totale: importo, netto: importo, ...extra })
      fattura('01', 1250, 'pagata', { data_pagamento: `${anno}-01-20` }); fattura('03', 800, 'pagata', { data_pagamento: `${anno}-03-28` }); fattura('06', 123456.78, 'pagata', { data_pagamento: `${anno}-06-30` }); fattura('11', 2400, 'emessa', { scadenza_pagamento: `${anno}-12-15` })
      const g = require('../electron/gestione')
      for (const [mese, importo, pagata] of [['01', 1000, 1], ['02', 534.21, 1], ['03', 800, 1], ['06', 45000, 1], ['12', 3100.5, 0]]) g.esegui('costo', { pratica_id: pr.id, data: `${anno}-${mese}-10`, descrizione: `Spesa di ${mese}`, categoria: 'Servizi', importo, scadenza: `${anno}-${mese}-15`, pagata })
      // documenti: cartella della pratica con sottocartelle
      const cartella = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tio-103-')), 'Rossi-Alfa')
      for (const f of ['procura.txt', 'Atti/citazione.txt', 'Atti/Notifiche/relata.txt', 'Atti/Notifiche/pec.txt', 'Corrispondenza/lettera.txt']) { fs.mkdirSync(path.dirname(path.join(cartella, f)), { recursive: true }); fs.writeFileSync(path.join(cartella, f), 'Documento di prova ' + f) }
      await require('../electron/docfile').collegaCartella(pr.id, cartella)
      fs.mkdirSync(path.join(cartella, 'Perizie')); fs.mkdirSync(path.join(cartella, 'Atti', 'Bozze')); fs.mkdirSync(path.join(cartella, '.nascosta')) // cartelle senza file: le prime due si vedono, vuote
      await js('location.reload()'); await sleep(1500)

      // ---------- agenda: calendario del mese ----------
      await clickText('.nav-item', 'Agenda'); await sleep(500)
      await clickText('.segmented button', 'Mese'); await sleep(400)
      await larghezze('103-1-agenda', [1440, 1280, 1100, 980], async (w) => {
        const r = await js(`[...document.querySelectorAll('.cal-cell .ev b')].map(b => ({ t: b.textContent, righe: b.getClientRects().length, tagliato: b.scrollWidth > b.clientWidth + 1, alto: b.getBoundingClientRect().height }))`)
        check(`agenda a ${w}px: ogni orario è intero su una riga sola`, r.length >= 5 && r.every((x) => /^\d\d:\d\d$/.test(x.t) && x.righe === 1 && !x.tagliato && x.alto < 22), JSON.stringify(r.filter((x) => x.righe !== 1 || x.tagliato || x.alto >= 22)))
        const titoli = await js(`[...document.querySelectorAll('.cal-cell .ev span')].every(s => s.getBoundingClientRect().width >= 40)`)
        check(`agenda a ${w}px: il titolo ha spazio accanto o sotto l'orario, senza scorrimento orizzontale`, titoli && await senzaScorrimento())
      })
      await axe('Agenda, mese')

      // ---------- pagamenti: panoramica annuale ----------
      await clickText('.nav-item', 'Pagamenti'); await sleep(700)
      await larghezze('103-2-scadenzario', [1440, 1280, 1100, 980], async (w) => {
        const r = await js(`(() => { const li=[...document.querySelectorAll('.anno-griglia li')]; return { n: li.length, righe: new Set(li.map(x=>Math.round(x.getBoundingClientRect().top))).size, tagliati: [...document.querySelectorAll('.anno-voce b, .anno-saldo')].filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.textContent) } })()`)
        check(`scadenzario a ${w}px: dodici mesi in righe piene, nessun importo tagliato`, r.n === 12 && 12 % r.righe === 0 && !r.tagliati.length && await senzaScorrimento(), JSON.stringify(r))
      })
      const colonne = await js(`[...document.querySelectorAll('.anno-griglia li')].map(li => [li.querySelector('.anno-mese span').textContent, ...[...li.querySelectorAll('.anno-voce b')].map(b=>b.textContent), li.querySelector('.anno-saldo').textContent, li.querySelector('.anno-saldo').className.replace('anno-saldo ','')].join('|'))`)
      check('panoramica: gennaio in attivo (verde), febbraio in passivo (rosso), marzo pari (giallo), aprile vuoto', colonne[0] === 'gen|1.250|1.000|+250|pos' && colonne[1] === 'feb|—|534,21|−534,21|neg' && colonne[2] === 'mar|800|800|0|pari' && colonne[3] === 'apr|—|—|—|vuoto' && colonne[5] === 'giu|123.457|45.000|+78.457|pos', JSON.stringify(colonne.slice(0, 6)))
      await js(`document.querySelectorAll('.anno-box')[1].click()`)
      const inVista = () => js(`(() => { const el=document.getElementById('mese-${anno}-02'); if(!el) return false; const r=el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight })()`)
      let arrivato = false; for (let i = 0; i < 10 && !arrivato; i++) { await sleep(400); arrivato = await inVista() } // lo scorrimento è animato: si aspetta che finisca
      check('panoramica: il mese porta ai suoi movimenti', arrivato)
      await js('document.querySelector(".content, main, .page")?.scrollIntoView(); window.scrollTo(0,0); true')
      await axe('Pagamenti, scadenzario')

      // ---------- pratica: persone e ruolo ----------
      await clickText('.nav-item', 'Pratiche'); await sleep(500)
      await js(`[...document.querySelectorAll('.pcard, tr')].find(x=>x.textContent.includes('Rossi c. Alfa')).click()`); await sleep(700)
      let t = await text()
      check('pratica: due clienti, controparte, collaboratore e ruolo in testa e nei dettagli', /Clienti: Mario Rossi, Lucia Rossi/.test(t) && /Collaboratore: Paolo Neri/.test(t) && /Il tuo ruolo: Difensore/.test(t) && /Avv\. Paolo Neri/.test(t), t.slice(0, 600))
      await shot('103-3-pratica')
      await clickText('.detail-main .btn', 'Modifica'); await sleep(500)
      check('modifica pratica: altre persone con ruolo e «Il tuo ruolo»', await js(`document.querySelectorAll('.modal .persona-riga').length === 2`) && await js(`!!${campo('Il tuo ruolo')} && ${campo('Il tuo ruolo')}.value === 'Difensore'`))
      await clickText('.modal .recapiti button', 'Aggiungi una persona'); await sleep(300)
      await setVal('.modal .persona-riga:nth-of-type(3) select', String(ctr.id)); await sleep(200)
      check('nuova persona: il ruolo proposto è quello della rubrica', await js(`document.querySelectorAll('.modal .persona-riga')[2].querySelectorAll('select')[1].value`) === 'controparte')
      await js(`document.querySelector('.modal-body, .modal').scrollTop = 0; true`)
      await shot('103-4-modifica-pratica'); await axe('Modifica pratica')
      await clickText('.modal .btn', 'Salva'); await sleep(600)
      // la controparte principale non si ripete tra le altre persone
      check('pratica salvata: persone senza doppioni del principale', JSON.stringify(JSON.parse(db.get('pratiche', pr.id).persone)) === JSON.stringify([{ id: cli2.id, ruolo: 'cliente' }, { id: coll.id, ruolo: 'collaboratore' }]), db.get('pratiche', pr.id).persone)

      // ---------- documenti: sottocartelle ----------
      await clickText('.tabs button', 'Documenti'); await sleep(700)
      t = await text()
      check('documenti: alla radice le sottocartelle e solo i file della radice', await js(`[...document.querySelectorAll('.doc-sottocartella b')].map(x=>x.textContent).join()`) === 'Atti,Corrispondenza,Perizie' && /3 file/.test(t) && await js(`document.querySelectorAll('.doc-sottocartella')[2].textContent`) === 'PerizieVuota' && /procura\.txt/.test(t) && !/relata\.txt/.test(t), t.slice(0, 500))
      await shot('103-5-documenti')
      await clickText('.doc-sottocartella', 'Perizie'); await sleep(300)
      check('documenti: una cartella vuota si apre e risulta vuota', /Cartella vuota\./.test(await text()) && await js(`document.querySelectorAll('.doc-nome').length`) === 0)
      await clickText('.doc-percorso .link-btn', 'Rossi-Alfa'); await sleep(300)
      await clickText('.doc-sottocartella', 'Atti'); await sleep(300)
      check('documenti: dentro Atti la sottocartella vuota «Bozze» accanto a «Notifiche»', await js(`[...document.querySelectorAll('.doc-sottocartella')].map(x=>x.textContent).join()`) === 'BozzeVuota,Notifiche2 file')
      await clickText('.doc-sottocartella', 'Notifiche'); await sleep(300)
      t = await text()
      check('documenti: dentro Atti › Notifiche i due file e il percorso', /relata\.txt/.test(t) && /pec\.txt/.test(t) && !/citazione\.txt/.test(t) && await js(`[...document.querySelectorAll('.doc-percorso li')].map(x=>x.textContent).join('>')`) === 'Rossi-Alfa>Atti>Notifiche')
      await shot('103-6-sottocartella'); await axe('Documenti della pratica')
      await clickText('.doc-percorso .link-btn', 'Atti'); await sleep(300)
      check('documenti: dal percorso si risale', /citazione\.txt/.test(await text()) && !/relata\.txt/.test(await text()))
      await js(`document.querySelector('.doc-percorso input').click()`); await sleep(300)
      check('documenti: «Tutti i file insieme» li mostra tutti', await js(`document.querySelectorAll('.doc-nome').length`) === 5)

      // ---------- anagrafica: indirizzi e pratiche collegate ----------
      await clickText('.persone-elenco .link-btn, .nav-item', 'Anagrafica'); await sleep(500)
      await clickText('.contact', 'Mario Rossi'); await sleep(300)
      await clickText('.detail-pane .btn', 'Modifica'); await sleep(500)
      check('modifica anagrafica: la pratica del contatto è già elencata', /Rossi c\. Alfa Costruzioni · Cliente/.test(await js(`document.querySelector('.modal .collegate-lista')?.textContent || ''`)))
      await clickText('.modal .recapiti button', 'Aggiungi un indirizzo'); await sleep(300)
      await setVal('.modal .indirizzo-riga input[aria-label="Indirizzo 2"]', 'Corso Canalgrande 12'); await setVal('.modal .indirizzo-riga input[aria-label^="CAP"]', '41121'); await setVal('.modal .indirizzo-riga input[aria-label^="Città"]', 'Modena'); await setVal('.modal .indirizzo-riga input[aria-label^="Provincia"]', 'MO')
      await setVal('.modal select[aria-label$="da collegare"]', String(pr2.id)); await sleep(200)
      await clickText('.modal .recapiti .btn', 'Collega'); await sleep(300)
      await js(`document.querySelector('.modal .indirizzo-riga').scrollIntoView({ block: 'center' }); true`)
      await shot('103-7-modifica-anagrafica'); await axe('Modifica anagrafica')
      await clickText('.modal .btn', 'Salva'); await sleep(700)
      const a = db.get('anagrafica', cli.id), p2 = db.get('pratiche', pr2.id)
      check('contatto salvato: secondo indirizzo e collegamento alla seconda pratica come cliente principale', JSON.parse(a.indirizzi)[0].indirizzo === 'Corso Canalgrande 12' && JSON.parse(a.indirizzi)[0].citta === 'Modena' && a.indirizzo === 'Via Roma 3' && p2.cliente_id === cli.id, `${a.indirizzi} ${p2.cliente_id}`)
      t = await text()
      check('scheda del contatto: due indirizzi e due pratiche collegate', /Corso Canalgrande 12, 41121 Modena \(MO\)/.test(t) && /Via Roma 3/.test(t) && /Recupero crediti Beta/.test(t) && /collegate \(2\)/.test(t), t.slice(0, 700))
      await shot('103-8-anagrafica')
      // eliminando un contatto sparisce dalle altre persone delle pratiche
      db.remove('anagrafica', coll.id)
      check('contatto eliminato: tolto dalle altre persone della pratica', db.get('pratiche', pr.id).persone === JSON.stringify([{ id: cli2.id, ruolo: 'cliente' }]), db.get('pratiche', pr.id).persone)

      const bad = results.filter((x) => !x.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e, e && e.stack) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message) })
}
module.exports = { attach }
