'use strict'
// Digitazione reale (eventi tastiera veri, una lettera alla volta) in tutti i campi di testo principali:
// il cursore non deve mai saltare in un altro campo né perdere lettere. Avvio: sh scripts/run-smoke.sh <cartella> smoke-digitazione
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (c) => wc.executeJavaScript(c, true)
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-digitazione'); fs.mkdirSync(out, { recursive: true })

  // espressione JS che individua il campo: per selettore CSS oppure per etichetta del campo
  const trova = (spec) => spec.sel ? `document.querySelector(${JSON.stringify(spec.sel)})`
    : `(() => { const l=[...document.querySelectorAll('.modal .field > label, .modal .srow .lbl, .field > label, .srow .lbl')].filter(x=>x.textContent.trim().startsWith(${JSON.stringify(spec.label)}))[${spec.n || 0}]; return l && l.parentElement.querySelector('input:not([type=checkbox]):not([type=radio]),textarea') })()`
  async function digita(nome, spec, testo = 'abc') {
    // il campo può comparire qualche istante dopo il clic (modali, schede, caricamento): si attende invece di fallire subito
    const ok = await require('./lib/attesa').attendi(() => js(`(() => { const el=${trova(spec)}; if(!el || el.disabled) return false; el.scrollIntoView({block:'center'}); el.focus(); window.__t=el; window.__v0=el.value; return document.activeElement===el })()`), { tempo: 6000 })
    if (!ok) { check(`digitazione: ${nome} (campo non trovato o disabilitato)`, false); return }
    wc.focus()
    for (const ch of testo) { wc.sendInputEvent({ type: 'keyDown', keyCode: ch }); wc.sendInputEvent({ type: 'char', keyCode: ch }); wc.sendInputEvent({ type: 'keyUp', keyCode: ch }); await sleep(45) }
    await sleep(120)
    const r = await js(`({ stesso: document.activeElement===window.__t, collegato: document.contains(window.__t), valore: window.__t.value, prima: window.__v0 })`)
    const pulisci = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') // alcuni campi (IBAN, codice fiscale) scrivono in maiuscolo
    const atteso = pulisci(r.valore).includes(pulisci(testo))
    check(`digitazione: ${nome}`, r.stesso && r.collegato && atteso, r.stesso ? '' : '(il cursore è saltato altrove)')
  }
  const chiudiModale = async () => { await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(350) }

  wc.once('did-finish-load', async () => {
    try {
      await sleep(1100)
      // ---- benvenuto: i due campi, uno dopo l'altro ----
      await digita('benvenuto › nome dello studio', { label: 'Nome dello studio' }, 'studioverdi')
      await digita('benvenuto › il tuo nome', { label: 'Il tuo nome' }, 'mariorossi')
      await digita('benvenuto › nome dello studio (di nuovo, dopo l\'altro campo)', { label: 'Nome dello studio' }, 'xyz')
      await clickText('.modal .btn-primary', 'Inizia'); await sleep(900)

      // dati di appoggio
      const cli = db.save('anagrafica', { denominazione: 'Mario Rossi', ruolo: 'cliente' })
      const pr = db.save('pratiche', { numero: '2026/001', titolo: 'Rossi c. Bianchi', cliente_id: cli.id, stato: 'Aperta', colore: '#3b82f6' })
      wc.send('data-changed', db.TABLES); await sleep(700)

      // ---- impostazioni ----
      await clickText('.nav-item', 'Impostazioni'); await sleep(500)
      await digita('impostazioni › nome dello studio o della ditta', { label: 'Nome dello studio o della ditta' }, 'rossisrl')
      await digita('impostazioni › il tuo nome per il saluto', { label: 'Il tuo nome' }, 'avvmario')
      await clickText('.tabs button', 'Studio'); await sleep(400)
      await digita('studio › indirizzo', { label: 'Indirizzo' }, 'viaroma12')
      await digita('studio › partita IVA', { label: 'Partita IVA' }, '123456')
      await digita('studio › IBAN', { label: 'IBAN' }, 'it60x')
      await clickText('.tabs button', 'Modello PDF'); await sleep(500)
      await digita('modello PDF › intestazione, prima riga', { sel: 'input[aria-label="Intestazione, riga 1"]' }, 'studiotest')
      await digita('modello PDF › piè di pagina, ultima riga', { sel: 'input[aria-label^="Piè di pagina, riga"]:last-of-type, .modello-blocco:nth-of-type(4) .riga-ed:last-of-type input' }, 'finepagina')
      await clickText('.tabs button', 'Fiscale'); await sleep(400)
      await digita('fiscale › tariffa oraria', { label: 'Tariffa oraria' }, '175')
      await clickText('.page-head button', 'Annulla modifiche'); await sleep(300)

      // ---- pratiche e pratica ----
      await clickText('.nav-item', 'Pratiche'); await sleep(400)
      await digita('pratiche › ricerca nell\'elenco', { sel: '.search-box input' }, 'rossi')
      await js(`(() => { const e=document.querySelector('.search-box input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,''); e.dispatchEvent(new Event('input',{bubbles:true})) })()`)
      await clickText('button', 'Nuova pratica'); await sleep(400)
      await digita('nuova pratica › titolo', { label: 'Titolo' }, 'impianto')
      await digita('nuova pratica › numero', { label: 'Numero' }, '77')
      await digita('nuova pratica › valore', { label: 'Valore' }, '5000')
      await digita('nuova pratica › descrizione', { label: 'Descrizione' }, 'noteabc')
      await chiudiModale()
      await js(`document.querySelector('.pcard h2').click()`); await sleep(500)
      await clickText('.tabs button', 'Compiti'); await sleep(300)
      await digita('attività della pratica › aggiunta rapida', { sel: '.quick-add input' }, 'chiamare')
      await clickText('.tabs button', 'Note'); await sleep(300)
      await digita('note della pratica', { sel: '.note-add textarea' }, 'colloquio')
      await clickText('.tabs button', 'Scadenze'); await sleep(300)
      await clickText('button', 'Nuova scadenza'); await sleep(400)
      await digita('scadenza › titolo', { label: 'Titolo' }, 'memoria')
      await digita('scadenza › luogo', { label: 'Luogo' }, 'aula12')
      await digita('scadenza › note', { label: 'Note' }, 'prova')
      await chiudiModale()
      await clickText('.tabs button', 'Attività e spese'); await sleep(300)
      await clickText('button', 'Nuova attività'); await sleep(400)
      await digita('attività › tempo dedicato', { label: 'Tempo dedicato' }, '130')
      await digita('attività › titolo', { label: 'Attività' }, 'studio')
      await chiudiModale()
      await clickText('button', 'Aggiungi spesa'); await sleep(400)
      await digita('spesa › importo', { label: 'Importo' }, '259')
      await digita('spesa › descrizione', { label: 'Descrizione' }, 'contributo')
      await chiudiModale()
      await clickText('.tabs button', 'Documenti'); await sleep(300)
      const doc = db.save('documenti', { pratica_id: pr.id, nome: 'atto.txt', file: `${pr.id}/atto.txt`, dimensione: 1 }); wc.send('data-changed', ['documenti']); await sleep(500)
      await js(`document.querySelector('.icon-btn[title="Rinomina"]').click()`); await sleep(400)
      await digita('rinomina documento › nome file', { label: 'Nome' }, 'nuovo')
      await chiudiModale()

      // ---- altre pagine con moduli ----
      await clickText('.nav-item', 'Compiti'); await sleep(400)
      await digita('attività › aggiunta rapida', { sel: '.quick-add input' }, 'ordinare')
      await clickText('button', 'Nuovo compito'); await sleep(400)
      await digita('nuovo compito › titolo', { label: 'Compito' }, 'telefono')
      await digita('nuova attività › note', { label: 'Note' }, 'dettagli')
      await chiudiModale()
      await clickText('.nav-item', 'Anagrafica'); await sleep(400)
      await clickText('button', 'Nuovo contatto'); await sleep(400)
      for (const [n, l, t] of [['nome', 'Nome e cognome', 'giuseppe'], ['codice fiscale', 'Codice fiscale', 'abc123'], ['email', 'Email', 'info'], ['telefono', 'Telefono', '333111'], ['indirizzo', 'Indirizzo', 'viamilano'], ['note', 'Note', 'cliente']]) await digita(`anagrafica › ${n}`, { label: l }, t)
      await chiudiModale()
      await clickText('.nav-item', 'Collegamenti'); await sleep(400)
      await clickText('.tile-add', 'Aggiungi'); await sleep(400)
      await digita('collegamento › nome', { label: 'Nome' }, 'normativa')
      await digita('collegamento › indirizzo', { label: 'Indirizzo del sito' }, 'sito')
      await digita('collegamento › descrizione', { label: 'Descrizione' }, 'testo')
      await chiudiModale()

      // ---- editor parcella e calcolatore ----
      await clickText('.nav-item', 'Parcelle'); await sleep(400)
      await clickText('button', 'Nuovo documento'); await sleep(2500)
      await digita('parcella › oggetto', { label: 'Oggetto' }, 'lettera')
      await clickText('.modal .srow label.check', 'In Percentuale'); await sleep(400)
      await digita('calcolatore › valore dell\'affare', { label: 'Valore €' }, '100000')
      await digita('calcolatore › percentuale', { label: 'Percentuale' }, '2')
      await digita('calcolatore › compenso libero', { sel: '.fase-in' }, '1500')
      await clickText('.tabs button', 'Aumenti'); await sleep(300)
      await js(`(() => { const c=[...document.querySelectorAll('.srow')].find(r=>r.textContent.includes('Ulteriore valutazione')).querySelector('input[type=checkbox]'); if(!c.checked) c.click() })()`); await sleep(200)
      await digita('calcolatore › ulteriore valutazione %', { sel: 'input[aria-label="Percentuale di aumento"]' }, '15')
      await clickText('.tabs button', 'Spese'); await sleep(300)
      await digita('calcolatore › spese esenti', { sel: 'input[aria-label="Spese esenti"]' }, '259')
      await digita('calcolatore › spese di trasferta', { sel: 'input[aria-label="Spese di trasferta"]' }, '40')
      await digita('calcolatore › altre spese', { sel: 'input[aria-label="Altre spese imponibili"]' }, '30')
      await digita('calcolatore › spese generali %', { sel: 'input[aria-label="Percentuale spese generali"]' }, '12')
      await clickText('.modal .btn', 'Aggiungi voce'); await sleep(300)
      await digita('parcella › descrizione di una voce', { sel: 'input[aria-label="Descrizione"]' }, 'consulenza')
      await digita('parcella › note', { label: 'Note' }, 'pagamento')
      await clickText('.modal .segmented button', 'Nota pro forma'); await sleep(300)
      await clickText('.modal button', 'Intestazione e piè di pagina'); await sleep(500)
      await digita('editor intestazione (finestra) › riga di intestazione', { sel: '.modal .modal .riga-ed input, .modal .riga-ed input' }, 'logo')
      await js(`[...document.querySelectorAll('.modello-blocco')[3].querySelectorAll('button')].find((b) => /riga/i.test(b.textContent)).click()`); await sleep(300) // aggiunge una riga al piè di pagina
      await digita('editor intestazione (finestra) › riga del piè di pagina', { sel: '.modello-blocco:nth-of-type(4) .riga-ed:last-of-type input' }, 'sedeabc')

      // ---- ricerca globale ----
      await chiudiModale()
      check('finestre sovrapposte: un solo Esc chiude solo quella in primo piano', (await js('document.body.innerText')).includes('Nuova nota pro forma') && !(await js('document.body.innerText')).includes('Valgono per tutte le note pro forma'))
      await chiudiModale()
      await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))`); await sleep(400)
      await digita('ricerca globale', { sel: '.modal input' }, 'rossi')

      const bad = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e) } finally { setTimeout(() => process.exit(0), 300) }
  })
}
module.exports = { attach }
