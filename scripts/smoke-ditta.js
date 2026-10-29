'use strict'
// Scenario end-to-end per il profilo "ditta individuale / libero professionista" e per i flussi di modifica/eliminazione.
// Avvio: MNGMNT_TEST=1 MNGMNT_TEST_SCENARIO=smoke-ditta npx electron .   (vedi scripts/run-smoke.sh ditta)
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-smoke-ditta')
fs.mkdirSync(out, { recursive: true })
let sleep = (ms) => new Promise((r) => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (code) => wc.executeJavaScript(code, true)
  const text = () => js('document.body.innerText')
  const shot = async (n) => { await sleep(350); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } } // la cattura può non riuscire senza scheda grafica (es. Linux senza schermo): non è un errore dell'app
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const setVal = (selector, value) => js(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
  const setSelect = (labelText, value) => js(`(() => { const lab=[...document.querySelectorAll('.modal .field > label, .modal .srow .lbl')].find(l=>l.textContent.trim().startsWith(${JSON.stringify(labelText)})); const el=lab && lab.parentElement.querySelector('select'); if(!el) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`)
  const blurSet = (selector, value) => js(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new FocusEvent('focusout',{bubbles:true})); return true })()`)
  const dnd = (fromSel, toSel, mime, data) => js(`(() => { const a=document.querySelector(${JSON.stringify(fromSel)}), b=document.querySelector(${JSON.stringify(toSel)}); if(!a||!b) return false; const dt=new DataTransfer(); ${data !== undefined ? `dt.setData(${JSON.stringify(mime)}, ${JSON.stringify(String(data))});` : ''} a.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt})); b.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt})); b.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt})); return true })()`)

  wc.once('did-finish-load', async () => {
    try {
      await sleep(1000)
      // ---- A. benvenuto come ditta individuale ----
      await setVal('.modal input', 'Rossi Impianti'); await clickText('.modal .scelta', 'Ditta individuale'); await sleep(200)
      await clickText('.modal .btn-primary', 'Inizia'); await sleep(900)
      const st = db.getSettings()
      check('ditta: profilo e aliquote predefinite (IVA 22, niente CPA/ritenuta)', st.profilo === 'ditta' && st.aliquote.iva === 22 && st.aliquote.cpa === 0 && st.aliquote.rit === 0)
      let t = await text()
      check('ditta: menu con etichette "Documenti"', t.includes('Documenti') && t.includes('Rossi Impianti'))
      await shot('d01-ditta-dashboard')

      // ---- B. anagrafica ----
      await clickText('.nav-item', 'Anagrafica'); await sleep(400)
      await clickText('button', 'Nuovo contatto'); await sleep(300)
      check('anagrafica: salvataggio disabilitato senza nome', await js(`document.querySelector('.modal .btn-primary').disabled`))
      await setVal('.modal input[required]', 'Bianchi SRL'); await sleep(100)
      await clickText('.modal .btn-primary', 'Salva'); await sleep(700)
      const cli = db.list('anagrafica').find((a) => a.denominazione === 'Bianchi SRL')
      check('anagrafica: contatto creato', !!cli)

      // ---- C. pratica (commessa) con cliente ----
      await clickText('.nav-item', 'Commesse'); await sleep(300)
      await clickText('button', 'Nuova commessa'); await sleep(300)
      t = await text()
      check('ditta: modulo pratica con campi generici (Ente / Ufficio, Referente) e senza "Autorità giudiziaria"', t.includes('Ente / Ufficio') && t.includes('Referente') && !t.includes('Autorità giudiziaria'))
      await setVal('.modal input[required]', 'Impianto fotovoltaico Via Roma'); await setSelect('Cliente', cli.id); await sleep(150)
      await clickText('.modal .btn-primary', 'Salva'); await sleep(900)
      const pr = db.list('pratiche').find((p) => p.titolo === 'Impianto fotovoltaico Via Roma')
      check('pratica: creata con cliente collegato e numero progressivo', pr && pr.cliente_id === cli.id && /^\d{4}\/001$/.test(pr.numero), pr ? pr.numero : '')
      await shot('d02-ditta-pratica')

      // ---- D. to-do: aggiunta e riordino con trascinamento ----
      await clickText('.tabs button', 'Compiti'); await sleep(300)
      for (const titolo of ['Ordinare materiali', 'Prenotare la gru']) { await setVal('.quick-add input', titolo); await js(`document.querySelector('.quick-add').requestSubmit()`); await sleep(500) }
      let ord = db.list('todos', { pratica_id: pr.id }, 'ordine').map((x) => x.titolo)
      check('to-do: due attività nell\'ordine di inserimento', ord.join('|') === 'Ordinare materiali|Prenotare la gru', ord.join('|'))
      await dnd('.drag-row:nth-of-type(2)', '.drag-row:nth-of-type(1)'); await sleep(700)
      ord = db.list('todos', { pratica_id: pr.id }, 'ordine').map((x) => x.titolo)
      check('to-do: riordino con trascinamento', ord.join('|') === 'Prenotare la gru|Ordinare materiali', ord.join('|'))

      // ---- E. scadenza: crea con promemoria predefiniti, poi elimina con conferma ----
      await clickText('.tabs button', 'Scadenze'); await sleep(300)
      await clickText('button', 'Nuova scadenza'); await sleep(300)
      await setVal('.modal input[required]:not([type=date])', 'Sopralluogo cantiere'); await sleep(100)
      await clickText('.modal .btn-primary', 'Salva'); await sleep(700)
      const sc = db.list('scadenze').find((x) => x.titolo === 'Sopralluogo cantiere')
      check('scadenza: creata con i promemoria predefiniti', sc && JSON.parse(sc.promemoria).length === 2)
      await js(`document.querySelector('.row-item .icon-btn[aria-label="Elimina"]').click()`); await sleep(400)
      check('scadenza: eliminata subito, con avviso «Annulla» (nessuna finestra di conferma)', !db.list('scadenze').some((x) => x.titolo === 'Sopralluogo cantiere') && /Scadenza eliminata/.test(await text()) && !(await js('!!document.querySelector(".modal")')))
      await clickText('.toast-azione', 'Annulla'); await sleep(700)
      check('scadenza: «Annulla» la ripristina uguale (stessi promemoria)', db.list('scadenze').some((x) => x.titolo === 'Sopralluogo cantiere' && JSON.parse(x.promemoria).length === 2))

      // ---- F. documenti allegati e rimozione dal disco ----
      const tmpFile = path.join(os.tmpdir(), 'preventivo-fornitore.txt'); fs.writeFileSync(tmpFile, 'prova')
      const doc = (await js(`window.mngmnt.invoke('documenti:addPaths', ${pr.id}, [${JSON.stringify(tmpFile)}])`))[0]
      check('documenti: collegato al file originale, nessuna copia nell\'app', doc.percorso === tmpFile && !doc.file)
      const bad = await js(`window.mngmnt.invoke('documenti:open', 99999).then(()=> 'ok', e => String(e.message))`)
      check('documenti: apertura di un id inesistente rifiutata', /non trovato/.test(bad))
      await js(`window.mngmnt.invoke('db:delete','documenti', ${doc.id})`); await sleep(300)
      check('documenti: la rimozione toglie solo il collegamento, il file dell\'utente resta', fs.existsSync(tmpFile) && fs.readFileSync(tmpFile, 'utf8') === 'prova')

      // ---- G. fattura (editor classico, senza calcolo forense) ----
      await clickText('.nav-item', 'Documenti'); await sleep(400)
      await clickText('button', 'Nuovo documento'); await sleep(500)
      t = await text()
      check('ditta: editor fatture senza calcolo dei parametri forensi', !t.toLowerCase().includes('parametri forensi') && t.toLowerCase().includes('aliquote'))
      await clickText('.modal button', 'Aggiungi voce'); await sleep(200)
      await setVal('.modal input[aria-label="Descrizione"]', 'Installazione impianto'); await blurSet('.modal input[aria-label="Importo"]', '1000'); await sleep(300)
      t = await text()
      check('fattura: totale con IVA 22% (1.220,00)', t.includes('1.220,00'))
      await setSelect('Cliente', cli.id)
      await clickText('.modal .btn-primary', 'Salva'); await sleep(800)
      const fa = db.list('parcelle')[0]
      check('fattura: salvata (imponibile 1000, IVA 220, totale 1220, nessuna ritenuta)', fa && fa.imponibile === 1000 && fa.iva === 220 && fa.totale === 1220 && fa.ritenuta === 0 && fa.cliente_id === cli.id, fa ? JSON.stringify({ n: fa.numero, i: fa.imponibile, iva: fa.iva, t: fa.totale }) : '')
      await shot('d03-ditta-fatture')

      // ---- H. input non validi ----
      await clickText('.nav-item', 'Collegamenti'); await sleep(400)
      await clickText('.tile-add', 'Aggiungi'); await sleep(300)
      await setVal('.modal input[required]:not([placeholder])', 'Sito pericoloso'); await setVal('.modal input[placeholder="https://…"]', 'javascript:alert(1).x'); await sleep(100)
      await clickText('.modal .btn-primary', 'Salva'); await sleep(600)
      check('collegamenti: indirizzo con protocollo non consentito rifiutato', (await text()).includes('Indirizzo non valido') && !db.list('link').length)
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(200)
      const rif = await js(`window.mngmnt.invoke('shell:openExternal','file:///etc/passwd').then(()=>'ok', e=>String(e.message))`)
      check('sicurezza: apertura di file:// bloccata', /non consentito/.test(rif))
      const rif2 = await js(`window.mngmnt.invoke('db:list','sqlite_master').then(()=>'ok', e=>String(e.message))`)
      check('sicurezza: tabelle non consentite rifiutate', /non valida/.test(rif2))
      const rif3 = await js(`(async()=>{ try { window.mngmnt.invoke('fs:readFile','/etc/passwd'); return 'ok' } catch(e) { return String(e.message) } })()`)
      check('sicurezza: canali IPC non previsti bloccati dal preload', /non consentito/.test(rif3))

      // ---- I. kanban: sposta una pratica di stato con il trascinamento ----
      await clickText('.nav-item', 'Commesse'); await sleep(300)
      await js(`document.querySelector('.segmented button[title="Per stato"]').click()`); await sleep(400)
      const colonne = await js(`[...document.querySelectorAll('.kcol header b')].map(b=>b.textContent)`)
      const idx = colonne.indexOf('In corso')
      await dnd('.kcard', `.kcol:nth-child(${idx + 1})`, 'text/pratica', pr.id); await sleep(700)
      check('kanban: trascinando la scheda lo stato diventa "In corso"', db.get('pratiche', pr.id).stato === 'In corso')
      await shot('d04-ditta-kanban')

      // ---- J. eliminazione della pratica: cascata e pulizia dei file ----
      const tmp2 = path.join(os.tmpdir(), 'altro.txt'); fs.writeFileSync(tmp2, 'x')
      await js(`window.mngmnt.invoke('documenti:addPaths', ${pr.id}, [${JSON.stringify(tmp2)}])`)
      const dirDoc = path.join(db.getDataDir(), 'documenti', String(pr.id))
      await js(`document.querySelector('.kcard').click()`); await sleep(500)
      await js(`document.querySelector('.detail-main .btn-danger').click()`); await sleep(400)
      check('pratica: eliminazione chiede conferma', (await text()).includes('non è reversibile'))
      await clickText('.modal .btn-danger', 'Elimina definitivamente'); await sleep(900)
      check('pratica: eliminata con attività, scadenze e cartella documenti', !db.get('pratiche', pr.id) && !db.list('todos', { pratica_id: pr.id }).length && !fs.existsSync(dirDoc))
      check('pratica: dopo l\'eliminazione la fattura resta (senza pratica)', db.list('parcelle').length === 1 && db.list('parcelle')[0].pratica_id === null)
      check('pratica: dopo l\'eliminazione si torna all\'elenco', (await text()).includes('Nessuna commessa') || (await text()).includes('Commesse'))

      const bad2 = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad2.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}
module.exports = { attach }
