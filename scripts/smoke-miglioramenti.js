'use strict'
// Confronto con le migliori app di gestione: azioni da tastiera (⌘/Ctrl), «Annulla» dopo l'eliminazione, cronologia della pratica,
// elenco con ordinamento per colonna, cambio stato dalla riga e azioni sulla selezione. Avvio: sh scripts/run-smoke.sh <cartella> smoke-miglioramenti
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (c) => wc.executeJavaScript(c, true)
  const text = () => js('document.body.innerText')
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-miglioramenti'); fs.mkdirSync(out, { recursive: true })
  const shot = async (n) => { await sleep(350); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } }
  const tasto = (key, mod, extra = {}) => js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, ${mod}: true, bubbles: true, ...${JSON.stringify(extra)} }))`)
  const setVal = (sel, v) => js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, studio: { nome: 'Studio Prova' } })
      const oggi = new Date(); const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const ieri = new Date(oggi.getTime() - 86400000)
      const p1 = db.save('pratiche', { numero: '2026/001', titolo: 'Verdi c. Neri', stato: 'In corso', colore: '#ef4444', tipo: 'Civile' })
      const p2 = db.save('pratiche', { numero: '2026/002', titolo: 'Alfa S.r.l. recupero', stato: 'Aperta', colore: '#3b82f6', tipo: 'Civile' })
      const p3 = db.save('pratiche', { numero: '2026/003', titolo: 'Zeta contratto', stato: 'Aperta', colore: '#22c55e', tipo: 'Stragiudiziale' })
      const t1 = db.save('todos', { pratica_id: p1.id, titolo: 'Preparare memoria', completata: 0 })
      await js('location.reload()'); await sleep(1600)

      // ---- tastiera: stessi tasti con ⌘ (Mac) e Ctrl (Windows/Linux) ----
      await tasto('k', 'ctrlKey'); await sleep(400)
      check('Ctrl+K apre la ricerca con le azioni rapide', /Nuova pratica/.test(await js('document.querySelector(".modal")?.innerText || ""')) && /Vai a/.test(await js('document.querySelector(".modal")?.innerText || ""')))
      await shot('mig-1-palette')
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(300)
      check('Esc chiude la ricerca', !(await js('!!document.querySelector(".modal")')))
      await tasto('k', 'metaKey'); await sleep(400)
      check('⌘K apre la ricerca allo stesso modo', await js('!!document.querySelector(".modal")'))
      await setVal('.modal input', 'nuovo comp'); await sleep(300)
      await js(`document.querySelector('.modal input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); await sleep(500)
      check('scrivendo un comando e premendo Invio si apre il modulo «Nuovo compito»', /Nuovo compito|Nuovo to-do/i.test(await js('document.querySelector(".modal")?.innerText || ""')) && !!(await js('document.querySelector(".modal input[required]")')))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(300)
      await tasto('n', 'ctrlKey'); await sleep(500)
      check('Ctrl+N apre «Nuova pratica» da qualsiasi pagina', /Nuova pratica/.test(await js('document.querySelector(".modal")?.innerText || ""')))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(300)

      // ---- elenco pratiche: ordinamento, stato dalla riga, selezione multipla ----
      await clickText('.nav-item', 'Pratiche'); await sleep(500)
      await js(`document.querySelector('.segmented button[title="Elenco"]').click()`); await sleep(400)
      const titoli = () => js(`[...document.querySelectorAll('tbody tr')].map(r => r.querySelector('td:nth-child(4)')?.innerText.trim())`)
      await clickText('.th-sort', 'Titolo'); await sleep(300)
      let t = await titoli()
      check('clic sull\'intestazione «Titolo»: ordine A→Z', t.join('|') === 'Alfa S.r.l. recupero|Verdi c. Neri|Zeta contratto', t.join('|'))
      check('l\'intestazione ordinata espone aria-sort', await js(`!!document.querySelector('th[aria-sort="ascending"]')`))
      await clickText('.th-sort', 'Titolo'); await sleep(300)
      t = await titoli()
      check('secondo clic: ordine Z→A', t[0] === 'Zeta contratto', t.join('|'))
      await shot('mig-2-elenco-ordinato')
      // stato dalla riga senza aprire la pratica
      await js(`(() => { const s = document.querySelector('select[aria-label^="Stato di Zeta"]'); s.value = 'In corso'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`); await sleep(600)
      check('stato cambiato direttamente dalla riga (e resta nell\'elenco)', db.get('pratiche', p3.id).stato === 'In corso' && await js(`!!document.querySelector('.table')`))
      check('cambio di stato scritto nella cronologia della pratica', db.list('cronologia', { pratica_id: p3.id }).some((c) => c.azione === 'stato' && /Aperta → In corso/.test(c.testo)))
      // selezione multipla
      await js(`document.querySelector('input[aria-label="Seleziona Alfa S.r.l. recupero"]').click()`); await sleep(150)
      await js(`document.querySelector('input[aria-label="Seleziona Zeta contratto"]').click()`); await sleep(300)
      check('selezionando righe compare la barra delle azioni di gruppo', /2 selezionate/.test(await text()))
      await shot('mig-3-selezione')
      await js(`(() => { const s = document.querySelector('select[aria-label="Cambia stato delle selezionate"]'); s.value = 'In attesa'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`); await sleep(900)
      check('stato di gruppo applicato alle sole selezionate', db.get('pratiche', p2.id).stato === 'In attesa' && db.get('pratiche', p3.id).stato === 'In attesa' && db.get('pratiche', p1.id).stato === 'In corso')
      await clickText('.bulkbar button', 'Elimina'); await sleep(400)
      check('eliminazione di gruppo: chiede conferma con il numero', /Eliminare 2/.test(await js('document.querySelector(".modal")?.innerText || ""')))
      await clickText('.modal .btn', 'Annulla'); await sleep(300)
      check('annullando la conferma non si elimina nulla', db.list('pratiche').length === 3)
      await clickText('.bulkbar button', 'Deseleziona'); await sleep(200)
      check('«Deseleziona» toglie la barra', !(await js('!!document.querySelector(".bulkbar")')))

      // ---- cronologia + annulla ----
      await js(`window.mngmnt.invoke('db:save','scadenze',{pratica_id:${p1.id},titolo:'Termine memoria',data_ora:'${ymd(ieri)}T09:00',tipo:'termine'})`).catch(() => {})
      await js(`window.mngmnt.invoke('db:save','todos',{id:${t1.id},completata:1})`); await sleep(400)
      await clickText('.nav-item', 'Pratiche'); await sleep(300)
      await js(`document.querySelector('.segmented button[title="Elenco"]').click()`); await sleep(300)
      await clickText('tbody tr', 'Verdi c. Neri'); await sleep(900)
      const pag = await text()
      check('la scheda della pratica ha la «Cronologia»', /Cronologia/.test(pag))
      check('cronologia: scadenza aggiunta e compito completato', /Scadenza «Termine memoria» aggiunta/.test(pag) && /Pratica aperta\s/.test(pag) && !/aperta aggiunt/.test(pag) && /Preparare memoria.*completato/s.test(pag), pag.slice(0, 0))
      await shot('mig-4-cronologia')
      // bordo della scadenza scaduta: colore di urgenza, non della pratica
      await clickText('.tabs button', 'Scadenze'); await sleep(500)
      const bordo = await js(`getComputedStyle(document.querySelector('.row-item')).borderLeftColor`)
      const danger = await js(`(() => { const e = document.createElement('i'); e.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger'); document.body.appendChild(e); const c = getComputedStyle(e).color; e.remove(); return c })()`)
      check('scadenza in ritardo: bordo del colore «scaduto»', bordo === danger, `${bordo} vs ${danger}`)
      // elimina e annulla un compito
      const t2 = await js(`window.mngmnt.invoke('db:save','todos',{pratica_id:${p1.id},titolo:'Telefonare al CTU',completata:0,note:'ore 10'})`); await sleep(400)
            await clickText('.tabs button', 'Compiti'); await sleep(500)
      await js(`document.querySelector('.row-item .icon-btn[aria-label="Elimina"]').click()`); await sleep(600)
      check('compito eliminato subito, con «Annulla»', !db.get('todos', t2.id) && /Compito eliminato/.test(await text()))
      check('l\'eliminazione compare nella cronologia', db.list('cronologia', { pratica_id: p1.id }).some((c) => c.azione === 'eliminato' && /Telefonare al CTU/.test(c.testo)))
      await tasto('z', 'ctrlKey'); await sleep(700)
      const ripr = db.get('todos', t2.id)
      check('Ctrl+Z ripristina il compito (stesso id, stessa nota)', ripr && ripr.titolo === 'Telefonare al CTU' && ripr.note === 'ore 10')
      check('ripristino: la riga «eliminato» sparisce dalla cronologia', !db.list('cronologia', { pratica_id: p1.id }).some((c) => c.azione === 'eliminato'))
      // attività con allegato: l'annullo ricollega il documento
      const o = db.save('ore', { pratica_id: p1.id, data: ymd(oggi), minuti: 90, descrizione: 'Invio PEC', tariffa_oraria: 100 })
      const d = db.save('documenti', { pratica_id: p1.id, nome: 'ricevuta.pdf', file: '', percorso: path.join(os.tmpdir(), 'ricevuta.pdf'), dimensione: 1, ora_id: o.id })
      const snap = await js(`window.mngmnt.invoke('db:deleteUndo','ore',${o.id})`)
      check('eliminando un\'attività il documento allegato resta (senza attività)', !db.get('ore', o.id) && db.get('documenti', d.id) && db.get('documenti', d.id).ora_id === null)
      await js(`window.mngmnt.invoke('db:undo', ${JSON.stringify(snap)})`)
      check('annullo: attività e allegato tornano collegati', db.get('ore', o.id)?.minuti === 90 && db.get('documenti', d.id).ora_id === o.id)
      const doppio = await js(`window.mngmnt.invoke('db:undo', ${JSON.stringify(snap)}).then(() => 'ok', e => 'errore')`)
      check('annullare due volte non duplica nulla', doppio === 'errore' && db.list('ore', { pratica_id: p1.id }).length === 1)
      const rifiuto = await js(`window.mngmnt.invoke('db:deleteUndo','pratiche',${p1.id}).then(() => 'ok', e => 'errore')`)
      check('l\'eliminazione annullabile è rifiutata per le pratiche (restano con conferma)', rifiuto === 'errore' && !!db.get('pratiche', p1.id))
      // filtri con etichetta chiara
      await clickText('.nav-item', 'Compiti'); await sleep(400)
      check('filtro pratica: «Tutte le pratiche»', /Tutte le pratiche/.test(await js(`document.querySelector('select[aria-label="Filtra per pratica"]').innerText`)))

      const bad = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e, e && e.stack) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}
module.exports = { attach }
