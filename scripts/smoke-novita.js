'use strict'
// Novità dall'interfaccia vera: conflitto di interessi, esito udienza, attività con allegati, stampa agenda, report, blocco con password. Avvio: sh scripts/run-smoke.sh <cartella> smoke-novita
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (c) => wc.executeJavaScript(c, true)
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-novita'); fs.mkdirSync(out, { recursive: true })
  const shot = async (n) => { await sleep(350); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } console.log('(schermata non catturata: ' + n + ')') }
  const setVal = (sel, v) => js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; const proto = el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); return true })()`)
  const text = () => js('document.body.innerText')
  async function digita(testo) { wc.focus(); for (const ch of testo) { wc.sendInputEvent({ type: 'keyDown', keyCode: ch }); wc.sendInputEvent({ type: 'char', keyCode: ch }); wc.sendInputEvent({ type: 'keyUp', keyCode: ch }); await sleep(30) } await sleep(100) }
  const modalSelect = (label) => `(() => { const l=[...document.querySelectorAll('.modal .field > label')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)})); return l && l.parentElement.querySelector('select,input,textarea') })()`

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, studio: { nome: 'Studio Prova', iban: 'IT60X0542811101000000123456' } })
      const rossi = db.save('anagrafica', { denominazione: 'Mario Rossi', ruolo: 'cliente', tipo: 'persona', codice_fiscale: 'RSSMRA80B01F205X' })
      const neri = db.save('anagrafica', { denominazione: 'Luigi Neri', ruolo: 'altro', tipo: 'persona' })
      const pA = db.save('pratiche', { numero: '2025/001', titolo: 'Rossi c. Neri', cliente_id: rossi.id, controparte_id: neri.id, stato: 'In corso', priorita: 'media', colore: '#3b82f6' })
      const domani = new Date(); domani.setDate(domani.getDate() + 1)
      const ud = db.save('scadenze', { pratica_id: pA.id, titolo: 'Udienza di prima comparizione', tipo: 'udienza', data_ora: `${ymd(domani)}T09:30`, tutto_il_giorno: 0, luogo: 'Aula 4', promemoria: [60], completata: 0 })
      await js('location.reload()'); await sleep(1500)

      // ---------- conflitto di interessi ----------
      await clickText('.nav-item', 'Pratiche'); await sleep(400)
      await clickText('button', 'Nuova'); await sleep(500)
      await setVal(`#${await js(`${modalSelect('Cliente')}.id`)}`, String(neri.id)); await sleep(300)
      const t1 = await text()
      check('conflitto: "Luigi Neri" è controparte altrove → avviso quando lo scelgo come cliente', /Possibile conflitto di interessi/.test(t1) && t1.includes('2025/001'))
      await shot('novita-1-conflitto')
      await setVal(`#${await js(`${modalSelect('Cliente')}.id`)}`, String(rossi.id)); await sleep(300)
      check('nessun avviso per un cliente senza conflitti', !/Possibile conflitto di interessi/.test(await text()))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(300)

      // ---------- esito udienza ----------
      await js(`[...document.querySelectorAll('.pcard h2')].find(h=>h.textContent.includes('Rossi')).click()`); await sleep(600)
      await clickText('.tabs button', 'Scadenze'); await sleep(400)
      await js(`document.querySelector('.row-item input.round').click()`); await sleep(500)
      check('chiudendo un\'udienza si apre "Udienza svolta"', /Udienza svolta/.test(await text()))
      await setVal(`#${await js(`${modalSelect('Esito')}.id`)}`, 'Rinvio per precisazione delle conclusioni'); await sleep(150)
      await js(`${modalSelect('Prossima udienza')}.click()`); await sleep(300)
      const prossima = new Date(); prossima.setDate(prossima.getDate() + 40)
      await setVal(`#${await js(`${modalSelect('Data')}.id`)}`, ymd(prossima)); await sleep(150)
      await setVal(`#${await js(`${modalSelect('Compito da fare')}.id`)}`, 'Preparare memoria di replica'); await sleep(150)
      await shot('novita-2-esito')
      await clickText('.modal .btn-primary', 'Salva esito'); await sleep(1000)
      check('udienza completata', db.get('scadenze', ud.id).completata === 1)
      check('esito annotato nel diario della pratica', db.list('note', { pratica_id: pA.id }).some((x) => /Rinvio per precisazione/.test(x.testo)))
      const nuova = db.list('scadenze', { pratica_id: pA.id }).find((x) => x.id !== ud.id)
      check('prossima udienza creata con la data scelta, stessa pratica e luogo', nuova && nuova.tipo === 'udienza' && nuova.data_ora.startsWith(ymd(prossima)) && /rinvio$/.test(nuova.titolo) && nuova.luogo === 'Aula 4')
      check('attività creata', db.list('todos', { pratica_id: pA.id }).some((x) => x.titolo === 'Preparare memoria di replica'))

      // ---------- attività svolte con allegati e ore impiegate ----------
      const pec1 = path.join(out, 'PEC-invio-1.pdf'), pec2 = path.join(out, 'PEC-invio-2.pdf')
      fs.writeFileSync(pec1, '%PDF-1.4 prima PEC'); fs.writeFileSync(pec2, '%PDF-1.4 seconda PEC'); process.env.MNGMNT_TEST_ALLEGATI = [pec1, pec2].join('|')
      await clickText('.nav-item', 'Pratiche'); await sleep(400); await js(`[...document.querySelectorAll('.pcard h2')].find(h=>h.textContent.includes('Rossi')).click()`); await sleep(600)
      await clickText('.tabs button', 'Attività e spese'); await sleep(400)
      check('pratica senza attività: invito a registrarne una', /Nessuna attività registrata/.test(await text()))
      await clickText('button', 'Nuova attività'); await sleep(500)
      await setVal(`#${await js(`${modalSelect('Attività')}.id`)}`, 'Invio PEC'); await setVal(`#${await js(`${modalSelect('Tempo dedicato')}.id`)}`, '1:30'); await sleep(200)
      await js(`${modalSelect('Note')}`.replace('input,', '').replace(".querySelector('select,input,textarea')", ".querySelector('textarea')") + `; (() => { const l=[...document.querySelectorAll('.modal .field > label')].find(x=>x.textContent.trim().startsWith('Note')); const el=l.parentElement.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Notifica alla controparte e al giudice'); el.dispatchEvent(new Event('input',{bubbles:true})) })()`)
      await clickText('.modal button', 'Aggiungi file'); await sleep(600)
      check('allegati scelti in attesa di essere aggiunti', (await js('document.querySelector(".modal").innerText')).match(/da aggiungere/g)?.length === 2)
      const axeSrc0 = fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8'); await js(axeSrc0 + '; true')
      const violA = await js(`axe.run(document.querySelector('.modal'), { resultTypes: ['violations'] }).then(r => r.violations.map(v => v.id + ':' + v.nodes.length))`)
      check('accessibilità (axe-core) del modulo attività', violA.length === 0, JSON.stringify(violA))
      await shot('novita-attivita-modulo')
      await clickText('.modal .btn-primary', 'Salva'); await sleep(1000)
      const ora1 = db.list('ore', { pratica_id: pA.id })[0]
      check('attività salvata con tempo totale e note', ora1 && ora1.descrizione === 'Invio PEC' && ora1.minuti === 90 && /controparte/.test(ora1.dettagli || '') && ora1.tariffa_oraria > 0)
      const alleg = db.list('documenti', { ora_id: ora1.id })
      check('due PDF allegati all\'attività e presenti tra i documenti della pratica (file copiati)', alleg.length === 2 && alleg.every((d) => d.pratica_id === pA.id && d.categoria === 'Allegato attività' && fs.existsSync(path.join(db.getDataDir(), 'documenti', d.file))))
      await clickText('button', 'Nuova attività'); await sleep(400)
      await setVal(`#${await js(`${modalSelect('Attività')}.id`)}`, 'Invio PEC'); await clickText('.modal .chip', '30 min'); await sleep(200)
      process.env.MNGMNT_TEST_ALLEGATI = ''
      await clickText('.modal .btn-primary', 'Salva'); await sleep(900)
      const rt = await js(`document.querySelector('.riepilogo-ore')?.innerText || ''`)
      check('riepilogo "Ore impiegate": Invio PEC 2 volte, 2 h in totale, 2 allegati', /Ore impiegate/.test(rt) && /2 h/.test(rt) && /2 volte/.test(rt) && /2 allegati/.test(rt), rt.replace(/\n/g, ' | ').slice(0, 200))
      check('un\'unica riga di riepilogo per l\'attività ripetuta', (await js(`document.querySelectorAll('.riepilogo-gruppi li').length`)) === 1)
      await shot('novita-attivita-riepilogo')
      await clickText('.tabs button', 'Documenti'); await sleep(400)
      check('nei documenti l\'allegato indica a quale attività appartiene', /Attività: Invio PEC/.test(await text()))
      await clickText('.tabs button', 'Attività e spese'); await sleep(300)
      await js(`[...document.querySelectorAll('.attivita')].find((r) => r.querySelector('.allegato-chip')).querySelector('.attivita-azioni button[aria-label^="Elimina"]').click()`); await sleep(400)
      await sleep(400)
      check('eliminata subito con «Annulla» (nessuna finestra di conferma)', /Attività eliminata/.test(await text()) && !(await js('!!document.querySelector(".modal")')))
      check('eliminando un\'attività si perde solo la registrazione: gli allegati restano nei documenti', db.list('ore', { pratica_id: pA.id }).length === 1 && db.list('documenti', { pratica_id: pA.id }).filter((d) => d.categoria === 'Allegato attività').length === 2 && db.list('documenti', { pratica_id: pA.id }).every((d) => d.ora_id !== ora1.id) && !db.get('ore', ora1.id))

      // ---------- stampa agenda ----------
      await clickText('.nav-item', 'Agenda'); await sleep(600)
      await clickText('button', 'Stampa'); await sleep(500)
      await shot('novita-3-stampa')
      await clickText('.modal .segmented button', 'Settimana prossima'); await sleep(200)
      await clickText('.modal .segmented button', 'Questa settimana'); await sleep(200)
      await clickText('.modal .btn-primary', 'Crea PDF'); await sleep(2500)
      const pdf = fs.readdirSync(out).find((f) => /^Agenda-.*\.pdf$/.test(f))
      check('PDF dell\'agenda creato', pdf && fs.readFileSync(path.join(out, pdf)).subarray(0, 4).toString() === '%PDF', pdf)

      // ---------- report ----------
      const anno = new Date().getFullYear()
      db.saveParcella({ data: `${anno}-03-10`, pratica_id: pA.id, cliente_id: rossi.id, oggetto: 'Fase di studio', stato: 'emessa', compensi: 1000, netto: 1000, totale: 1000, voci: [{ tipo: 'compenso', descrizione: 'Studio', quantita: 1, importo: 1000 }] })
      db.saveParcella({ data: `${anno}-04-10`, pratica_id: pA.id, cliente_id: rossi.id, oggetto: 'Saldo', stato: 'pagata', compensi: 500, netto: 500, totale: 500, voci: [{ tipo: 'compenso', descrizione: 'Saldo', quantita: 1, importo: 500 }] })
      await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Parcelle'); await sleep(700)
      await clickText('button', 'Prima nota'); await sleep(900)
      const csv = fs.readdirSync(out).find((f) => /^Prima-nota-\d+\.csv$/.test(f))
      check('prima nota CSV salvata', csv && /^\uFEFFNumero;Data;Tipo/.test(fs.readFileSync(path.join(out, csv), 'utf8')), csv)
      await clickText('.segmented button', 'Da incassare'); await sleep(400)
      const tS = await text(); check('"Da incassare": parcella emessa con sollecito', /Prepara email/.test(tS) && tS.includes('Mario Rossi'))
      await shot('novita-4-solleciti')
      await clickText('.segmented button', 'Redditività'); await sleep(400)
      check('redditività per pratica', (await text()).includes('Rossi c. Neri'))
      await shot('novita-5-redditivita')

      // ---------- ricerca nel contenuto dei documenti ----------
      const dd = path.join(db.getDataDir(), 'documenti', String(pA.id)); fs.mkdirSync(dd, { recursive: true }); fs.writeFileSync(path.join(dd, 'appunti.txt'), 'Riunione con il perito: parola chiave Ornitorinco blu.')
      db.save('documenti', { pratica_id: pA.id, nome: 'appunti.txt', file: `${pA.id}/appunti.txt`, dimensione: 50 })
      const hit = await js(`window.mngmnt.invoke('db:search','ornitorinco')`)
      check('ricerca globale trova il testo dentro un documento, con il brano', hit.some((h) => h.kind === 'documento' && /Ornitorinco blu/.test(h.sub) && h.pratica_id === pA.id), JSON.stringify(hit.map((h) => h.sub)))

      // ---------- errore di interfaccia: la pagina non resta bianca ----------
      const palette = ['#ef4444', '#3b82f6', '#22c55e']
      db.setSettings({ palette: null }); await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Pratiche'); await sleep(500); await clickText('button', 'Nuova pratica'); await sleep(700)
      const te = await text()
      check('errore di disegno: messaggio chiaro al posto della pagina, menu ancora utilizzabile', /Qualcosa non ha funzionato/.test(te) && await js(`!!document.querySelector('.sidebar')`))
      db.setSettings({ palette }); await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Pratiche'); await sleep(500)
      // Attende il caricamento reale della pagina dopo il reload, senza supporre che 500 ms bastino.
      let recovered = false
      for(let attempt=0;attempt<50;attempt++) {
        recovered = !/Qualcosa non ha funzionato/.test(await text()) && await js(`!!document.querySelector('.pcard')`)
        if(recovered) break
        await sleep(100)
      }
      check('dopo la correzione tutto torna a funzionare', recovered)
      if(!recovered) { fs.writeFileSync(path.join(out,'recupero-errore.txt'),await text()); await shot('recupero-errore') }

      // ---------- blocco con password ----------
      await clickText('.nav-item', 'Impostazioni'); await sleep(400); await clickText('.tabs button', 'Backup e sicurezza'); await sleep(400)
      check('impostazioni: sezione blocco con password con avviso sulla cifratura', /Blocco con password/.test(await text()) && /Non cifra il file dei dati/.test(await text()))
      await shot('novita-6-sicurezza')
      await js(`window.mngmnt.invoke('app:impostaBlocco', 'segreta-123', 0).then(() => window.mngmnt.invoke('app:blocca'))`)
      await js('location.reload()'); await sleep(1500)
      check('con password attiva si parte dalla schermata di blocco, senza dati', await js(`!!document.querySelector('.lock-screen') && !document.querySelector('.sidebar') && !document.body.innerText.includes('Rossi')`))
      const rifiutato = await js(`window.mngmnt.invoke('db:list','pratiche').then(()=>false,()=>true)`); check('da bloccata nessun dato esce dai canali interni', rifiutato)
      await shot('novita-7-blocco')
      await js(`document.getElementById('lock-pw').focus()`); await digita('sbagliata'); await clickText('.lock-card button', 'Sblocca'); await sleep(900)
      check('password errata: messaggio e resta bloccata', /Password errata/.test(await text()) && await js(`!!document.querySelector('.lock-screen')`))
      await sleep(1200)
      await js(`document.getElementById('lock-pw').value=''`); await js(`(() => { const el=document.getElementById('lock-pw'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,''); el.dispatchEvent(new Event('input',{bubbles:true})); el.focus() })()`)
      check('digitazione reale nel campo password: il cursore non salta', await js(`document.activeElement === document.getElementById('lock-pw')`)); await digita('segreta-123'); check('password digitata per intero', (await js(`document.getElementById('lock-pw').value`)) === 'segreta-123'); await clickText('.lock-card button', 'Sblocca'); await sleep(1500)
      check('password giusta: l\'app si apre', await js(`!!document.querySelector('.sidebar') && !document.querySelector('.lock-screen')`))
      await clickText('button[aria-label="Blocca TIO"]', ''); await sleep(500)
      check('pulsante "Blocca" in alto: torna la schermata di blocco', await js(`!!document.querySelector('.lock-screen')`))
      const axeSrc = fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8'); await js(axeSrc + '; true')
      const viol = await js(`axe.run(document, { resultTypes: ['violations'] }).then(r => r.violations.map(v => v.id + ':' + v.nodes.length))`)
      check('accessibilità (axe-core) della schermata di blocco', viol.length === 0, JSON.stringify(viol))
      await sleep(1200); await js(`window.mngmnt.invoke('app:sblocca','segreta-123')`)
      await js(`window.mngmnt.invoke('app:rimuoviBlocco','segreta-123')`)
      check('blocco rimosso', !(await js(`window.mngmnt.invoke('app:statoBlocco')`)).attivo)

      const bad = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e, e && e.stack) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}
module.exports = { attach }
