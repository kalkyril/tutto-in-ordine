'use strict'
// Test end-to-end: avviato con MNGMNT_TEST=1 (vedi package.json "test:smoke"). Pilota la UI reale,
// verifica il DB e salva screenshot in $SMOKE_OUT.
const fs = require('node:fs')
const path = require('node:path')

const out = process.env.SMOKE_OUT || path.join(require('node:os').tmpdir(), 'mngmnt-smoke')
fs.mkdirSync(out, { recursive: true })
let sleep = (ms) => new Promise((r) => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const plus = (n, h = 0, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d }
const ymdhm = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

function attach({ getWindow, db, runAlertCheck }) {
  const win = getWindow()
  const wc = win.webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (code) => wc.executeJavaScript(code, true)
  const shot = async (name) => { await sleep(350); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } } // la cattura può non riuscire senza scheda grafica (es. Linux senza schermo): non è un errore dell'app
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const setVal = (selector, value) => js(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
  const text = () => js('document.body.innerText')
  const setSelect = (labelText, value) => js(`(() => { const lab=[...document.querySelectorAll('.modal .field > label, .modal .srow .lbl')].find(l=>l.textContent.trim().startsWith(${JSON.stringify(labelText)})); const el=lab && lab.parentElement.querySelector('select'); if(!el) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`)

  const seed = () => {
    const cli = db.save('anagrafica', { denominazione: 'Mario Rossi', ruolo: 'cliente', tipo: 'persona', email: 'mario@example.it', telefono: '333 1234567', codice_fiscale: 'RSSMRA80A01H501U', citta: 'Milano', provincia: 'MI' })
    const ctr = db.save('anagrafica', { denominazione: 'Bianchi Costruzioni S.r.l.', ruolo: 'controparte', tipo: 'azienda', partita_iva: '01234567890' })
    const p1 = db.save('pratiche', { numero: '2026/001', titolo: 'Rossi c. Bianchi Costruzioni — risarcimento danni', cliente_id: cli.id, controparte_id: ctr.id, tipo: 'Civile', stato: 'In corso', colore: '#ef4444', autorita: 'Tribunale di Milano', rg: '12345/2026', giudice: 'Dott.ssa Verdi — sez. IV', valore: 48000, data_apertura: ymd(plus(-40)), preferita: 1, descrizione: 'Danni da infiltrazioni. Perizia di parte depositata.' })
    const p2 = db.save('pratiche', { numero: '2026/002', titolo: 'Contratto di locazione commerciale', cliente_id: cli.id, tipo: 'Stragiudiziale', stato: 'Aperta', colore: '#10b981', data_apertura: ymd(plus(-10)) })
    const p3 = db.save('pratiche', { numero: '2026/003', titolo: 'Recupero crediti Gamma S.p.A.', tipo: 'Recupero crediti', stato: 'In attesa', colore: '#8b5cf6', data_apertura: ymd(plus(-3)) })
    db.save('scadenze', { pratica_id: p1.id, titolo: 'Udienza di comparizione', tipo: 'udienza', data_ora: ymdhm(plus(0, 23, 30)), luogo: 'Aula 12, Tribunale di Milano', promemoria: [1440, 60, 0] })
    db.save('scadenze', { pratica_id: p1.id, titolo: 'Deposito memoria ex art. 183 co. 6 n.1 c.p.c.', tipo: 'scadenza', data_ora: ymd(plus(5)), tutto_il_giorno: 1, promemoria: [4320, 1440] })
    db.save('scadenze', { pratica_id: p2.id, titolo: 'Incontro con il locatore', tipo: 'appuntamento', data_ora: ymdhm(plus(2, 15, 0)), promemoria: [60] })
    db.save('scadenze', { pratica_id: p3.id, titolo: 'Invio diffida ad adempiere', tipo: 'scadenza', data_ora: ymd(plus(-2)), tutto_il_giorno: 1, promemoria: [] })
    db.save('scadenze', { titolo: 'Versamento acconto contributi', tipo: 'scadenza', data_ora: ymd(plus(12)), tutto_il_giorno: 1, promemoria: [10080] })
    db.save('todos', { pratica_id: p1.id, titolo: 'Preparare note di replica', scadenza: ymd(plus(3)), priorita: 2, promemoria_min: 1440, ordine: 0 })
    db.save('todos', { pratica_id: p1.id, titolo: 'Richiedere copia perizia al CTP', ordine: 1 })
    db.save('todos', { pratica_id: p1.id, titolo: 'Notificare atto alla controparte', completata: 1, completata_il: ymdhm(plus(-1, 10)), ordine: 2 })
    db.save('todos', { pratica_id: p2.id, titolo: 'Verificare registrazione contratto', scadenza: ymd(plus(1)), ordine: 0 })
    db.save('link', { titolo: 'Portale Servizi Telematici (PST)', url: 'https://pst.giustizia.it', categoria: 'Processo telematico', descrizione: 'Ministero della Giustizia' })
    db.save('link', { titolo: 'Normattiva', url: 'https://www.normattiva.it', categoria: 'Normativa' })
    db.save('link', { titolo: 'Fascicolo telematico', url: 'https://example.org/fascicolo/12345', pratica_id: p1.id })
    db.save('ore', { pratica_id: p1.id, data: ymd(plus(-5)), minuti: 150, descrizione: 'Studio fascicolo e perizia', tariffa_oraria: 180 })
    db.save('spese', { pratica_id: p1.id, data: ymd(plus(-4)), descrizione: 'Contributo unificato', importo: 259, esente: 1 })
    db.save('note', { pratica_id: p1.id, testo: 'Colloquio con il cliente: disponibile a transazione fino a 30.000 €.' })
    return { cli, ctr, p1, p2, p3 }
  }

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      // ---- primo avvio: benvenuto e personalizzazione per lo studio/la ditta ----
      check('primo avvio: schermata di benvenuto', (await text()).includes('Benvenuto in TIO'))
      await setVal('.modal input', 'Studio Legale Test'); await sleep(150)
      await clickText('.modal .scelta', 'Ditta individuale'); await sleep(150)
      check('benvenuto: scelta ditta cambia le indicazioni', (await text()).includes('Nome della ditta'))
      await clickText('.modal .scelta', 'Studio legale'); await sleep(150)
      await js(`document.querySelectorAll('.modal .swatch:not(.custom)')[5].click()`); await sleep(150)
      await clickText('.modal .btn-primary', 'Inizia'); await sleep(1000)
      check('benvenuto: nome dello studio nel menu laterale', (await js(`document.querySelector('.brand-name') && document.querySelector('.brand-name').textContent`)) === 'Studio Legale Test')
      check('benvenuto: titolo della finestra personalizzato', (await js('document.title')) === 'Studio Legale Test · TIO')
      const acc = await js(`document.documentElement.style.getPropertyValue('--accent')`)
      check('benvenuto: colore principale applicato', !!acc && acc !== '#4338ca' && db.getSettings().brand_colore === '#22c55e', String(acc))
      check('benvenuto: impostazioni salvate', db.getSettings().onboarding_fatto === true && db.getSettings().studio.nome === 'Studio Legale Test' && db.getSettings().studio.intestazione === 'Studio Legale Test')
      await shot('00-benvenuto-dopo')
      // cambio nome dalle impostazioni
      await clickText('.nav-item', 'Impostazioni'); await sleep(500)
      await setVal('.card input[placeholder="Es. Studio Legale Rossi"]', 'Rossi Impianti di Mario Rossi'); await sleep(150)
      await clickText('.page-head .btn-primary', 'Salva'); await sleep(900)
      check('impostazioni: il nuovo nome compare subito nel menu', (await js(`document.querySelector('.brand-name').textContent`)) === 'Rossi Impianti di Mario Rossi')
      await shot('00b-impostazioni-identita')
      const ids = seed()
      db.getDb().exec("DELETE FROM alert_fired WHERE key LIKE 'digest:%'") // il riepilogo giornaliero era già scattato a database vuoto
      await clickText('.nav-item', 'Panoramica')
      wc.send('data-changed', db.TABLES)
      await sleep(700)
      // ---- dashboard ----
      let t = await text()
      check('dashboard mostra scadenza di oggi', t.includes('Udienza di comparizione'))
      check('dashboard mostra ritardo', t.includes('Invio diffida ad adempiere'))
      check('dashboard KPI pratiche attive', /Pratiche attive\s*\n?\s*3\b/.test(t))
      await shot('01-dashboard')

      // ---- avvisi: scadenza tra ~1h30 con promemoria 1gg e 1h => scatta quello di 1 giorno prima ----
      const before = db.list('notifiche').length
      runAlertCheck()
      const after = db.list('notifiche')
      check('avvisi generati dallo scheduler', after.length > before, `(${after.length - before} nuovi)`)
      check('riepilogo giornaliero presente', after.some((n) => n.tipo === 'riepilogo'))
      check('avviso udienza presente', after.some((n) => /Udienza/.test(n.titolo)))
      await sleep(400)

      // ---- pratiche ----
      await clickText('.nav-item', 'Pratiche'); await sleep(400)
      await shot('02-pratiche-schede')
      t = await text()
      check('elenco pratiche (schede)', t.includes('Contratto di locazione commerciale') && t.includes('Recupero crediti'))
      await clickText('.segmented button', ''); // no-op
      await js(`document.querySelector('.segmented button[title="Per stato"]').click()`); await sleep(300)
      await shot('03-pratiche-kanban')
      await js(`document.querySelector('.segmented button[title="Elenco"]').click()`); await sleep(300)
      await shot('04-pratiche-elenco')

      // ---- creazione pratica da form ----
      await clickText('button', 'Nuova pratica'); await sleep(300)
      await setVal('.modal input[required]', 'Pratica creata dal test E2E')
      await clickText('.modal .btn-primary', 'Salva'); await sleep(900)
      const created = db.list('pratiche').find((p) => p.titolo === 'Pratica creata dal test E2E')
      check('creazione pratica via UI', !!created, created ? `numero ${created.numero}` : '')
      check('numero progressivo assegnato', created && /^\d{4}\/004$/.test(created.numero))
      t = await text()
      check('naviga al dettaglio dopo creazione', t.includes('Pratica creata dal test E2E') && t.includes('Panoramica'))
      await shot('05-nuova-pratica-dettaglio')

      // ---- dettaglio pratica 1 ----
      await clickText('.nav-item', 'Pratiche'); await sleep(300)
      await js(`document.querySelector('.segmented button[title="Schede"]').click()`); await sleep(300)
      await clickText('.pcard h2', 'Rossi c. Bianchi'); await sleep(500)
      await shot('06-dettaglio-panoramica')
      await clickText('.tabs button', 'Compiti'); await sleep(400)
      await shot('07-dettaglio-todo')
      await setVal('.quick-add input', 'To-do aggiunta dal test')
      await js(`document.querySelector('.quick-add').requestSubmit()`); await sleep(600)
      check('to-do rapida salvata nella pratica', db.list('todos').some((x) => x.titolo === 'To-do aggiunta dal test' && x.pratica_id === ids.p1.id))
      await js(`document.querySelector('.row-item.todo input.round').click()`); await sleep(500)
      check('completamento to-do', db.list('todos', { pratica_id: ids.p1.id }).filter((x) => x.completata).length === 2)
      await clickText('.tabs button', 'Scadenze'); await sleep(400)
      await shot('08-dettaglio-scadenze')
      await clickText('button', 'Nuova scadenza'); await sleep(300)
      await shot('09-form-scadenza')
      await setVal('.modal input[required]:not([type=date])', 'Scadenza creata dal test'); await sleep(100)
      await clickText('.modal .btn-primary', 'Salva'); await sleep(700)
      const sc = db.list('scadenze').find((x) => x.titolo === 'Scadenza creata dal test')
      check('scadenza creata con promemoria di default', sc && JSON.parse(sc.promemoria).length === 2 && sc.pratica_id === ids.p1.id)
      await clickText('.tabs button', 'Attività e spese'); await sleep(400)
      await shot('10-ore-spese')
      await clickText('.tabs button', 'Collegamenti'); await sleep(300)
      await shot('11-collegamenti-pratica')
      await clickText('.tabs button', 'Documenti'); await sleep(300)
      await shot('12-documenti')

      // colore personalizzato
      await js(`document.querySelector('.detail-main .btn-soft[title="Cambia colore"]').click()`); await sleep(300)
      await clickText('.modal .swatch', ''); // no-op
      await js(`document.querySelectorAll('.modal .swatch:not(.custom)')[9].click()`); await sleep(500)
      check('cambio colore pratica', db.get('pratiche', ids.p1.id).colore === '#3b82f6')
      await shot('13-colore')
      await js(`document.querySelector('.modal .btn-primary').click()`); await sleep(200)

      // ---- parcella da ore/spese ----
      await clickText('.tabs button', 'Attività e spese'); await sleep(300)
      await clickText('button', 'Crea parcella dalle voci'); await sleep(600)
      await shot('14-parcella-editor')
      t = await text()
      check('parcella: totale con CPA e IVA', /Totale/.test(t) && t.includes('Studio fascicolo'))
      await clickText('.modal .btn-primary', 'Salva'); await sleep(700)
      const par = db.list('parcelle')[0]
      // 150 min * 180 = 450 compensi; SG 15% = 67,50; CPA 4% = 20,70; imponibile 538,20; IVA 22% = 118,40; esenti 259; totale 915,60; ritenuta 20% su 517,50 = 103,50
      check('parcella: compensi 450', par && par.compensi === 450, par && String(par.compensi))
      check('parcella: spese generali 67,50 / CPA 20,70', par && par.spese_generali === 67.5 && par.cpa === 20.7)
      check('parcella: IVA 118,40 / totale 915,60', par && par.iva === 118.4 && par.totale === 915.6, par && `${par.iva} ${par.totale}`)
      check('parcella: ritenuta 103,50 / netto 812,10', par && par.ritenuta === 103.5 && par.netto === 812.1, par && `${par.ritenuta} ${par.netto}`)
      check('ore e spese collegate alla parcella', db.list('ore')[0].parcella_id === par.id && db.list('spese')[0].parcella_id === par.id)

      // ---- calcolo compensi + nota pro forma ----
      db.setSettings({ studio: { nome: 'Studio Legale Verdi', titolare: 'Avv. Mario Verdi', intestazione: 'Avv. Mario Verdi', indirizzo: 'Via Roma n. 1', cap_citta: '41121 Modena', cf: 'VRDMRA70A01F257X', piva: '01234567897', telefono: '059 000000', email: '', pec: '', iban: 'IT00A0000000000000000000000', domicilio_fiscale: 'Via Milano n. 2 - 41122 Modena', banca: 'PRESSO BANCA ESEMPIO SPA FILIALE DI MODENA' } })
      wc.send('data-changed', ['settings']); await sleep(400)
      await clickText('.nav-item', 'Parcelle'); await sleep(400)
      await clickText('button', 'Nuovo documento'); await sleep(2800)
      t = await text()
      check('editor: calcolatore integrato con tabelle normative locali', t.includes('Tabelle normative incluse'), t.includes('non raggiungibile') ? '(sito non raggiungibile: fallback)' : '')
      check('editor: scaglione 5.201-26.000 medio 1.985 (separatore migliaia)', t.includes('1.985'))
      check('editor: come sul sito, IVA, CPA e ritenuta partono spenti', !t.includes('Cassa Avvocati') && !t.includes('IVA 22% su Imponibile') && t.includes('Includi accessori'))
      await clickText('.modal button', 'Includi accessori'); await sleep(500)
      t = await text()
      check('editor: impostazione come il sito (Tabelle, Competenza, Compenso, Scaglione, Valore, Aumenti/Riduzioni/Spese, accessori, PROSPETTO FINALE)', ['Tabelle:', 'Competenza:', 'Compenso:', 'Scaglione:', 'Valore €', 'Aumenti', 'Riduzioni', 'Spese', 'accessori', 'Nascondi tipo compenso', 'PROSPETTO FINALE', 'Cassa Avvocati', 'IVA 22% su Imponibile', 'IPOTESI DI COMPENSO LIQUIDABILE'].every((x) => t.includes(x)))
      await shot('29-editor-calcolatore')
      await setSelect('Scaglione', 20); await sleep(1800)
      t = await text()
      check('editor: cambio scaglione aggiorna le tariffe (1.276)', t.includes('1.276'))
      await clickText('.modal .segmented button', 'Nota pro forma'); await sleep(500)
      t = await text()
      check('nota pro forma: numerazione PF separata', t.includes('Nuova nota pro forma') && t.includes('PF 1/'))
      await setSelect('Cliente', ids.cli.id); await sleep(200)
      await shot('30-nota-pro-forma-editor')
      const pdfDir = process.env.SMOKE_OUT
      await clickText('.modal .btn', 'Salva PDF…'); await sleep(2500)
      const pdfs = fs.readdirSync(pdfDir).filter((f) => f.endsWith('.pdf'))
      check('PDF nota pro forma generato', pdfs.length > 0 && fs.statSync(path.join(pdfDir, pdfs[0])).size > 2000, pdfs.join(','))
      const np = db.list('parcelle').find((x) => x.tipo === 'proforma')
      check('nota pro forma salvata con calcolo e importi (1276 + SG 191,40 + CPA 58,70)', np && np.compensi === 1276 && np.spese_generali === 191.4 && np.cpa === 58.7 && !!np.calcolo, np ? JSON.stringify({ c: np.compensi, sg: np.spese_generali, cpa: np.cpa, iva: np.iva, tot: np.totale }) : 'assente')
      await sleep(500)
      // riapertura: lo stato del calcolatore viene ripristinato identico
      await clickText('tbody tr', 'PF 1/'); await sleep(2500)
      const scagVal = await js(`(() => { const l=[...document.querySelectorAll('.modal .field > label, .modal .srow .lbl')].find(x=>x.textContent.trim().startsWith('Scaglione')); return l && l.parentElement.querySelector('select').value })()`)
      check('riapertura: stato del calcolatore ripristinato (scaglione 20)', String(scagVal) === '20', String(scagVal))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(300)

      // ---- modello PDF: intestazione e piè di pagina personalizzabili ----
      await clickText('.nav-item', 'Impostazioni'); await sleep(400)
      await clickText('.tabs button', 'Modello PDF'); await sleep(600)
      await shot('31-modello-pdf')
      for(let i=0;i<100&&!await js(`document.querySelector('.a4-frame img')?.naturalWidth>0`);i++)await sleep(100)
      check('modello PDF: anteprima dal vivo presente', !!(await js(`document.querySelector('.a4-frame img')?.naturalWidth>0`)))
      await setVal('.riga-ed input', 'Studio Legale Verdi & Associati'); await sleep(500)
      const src = await js(`document.querySelector('.a4-frame img').src`)
      await setVal('.riga-ed input', 'Studio Legale Verdi & Associati — prova anteprima')
      for(let i=0;i<100&&await js(`document.querySelector('.a4-frame img').src===${JSON.stringify(src)}`);i++)await sleep(100)
      check('modello PDF: l\'anteprima segue il testo digitato', await js(`document.querySelector('.a4-frame img').src!==${JSON.stringify(src)}`))
      await setVal('.riga-ed input', 'Studio Legale Verdi & Associati');await sleep(400)
      await clickText('.page-head .btn-primary', 'Salva'); await sleep(900)
      const ms = db.getSettings().modello_pdf
      check('modello PDF salvato nelle impostazioni', ms && ms.intestazione[0].testo === 'Studio Legale Verdi & Associati' && ms.footer.length >= 1)
      // riapre la nota e rigenera il PDF con il modello personalizzato
      await clickText('.nav-item', 'Parcelle'); await sleep(400)
      await clickText('tbody tr', 'PF 1/'); await sleep(2200)
      const prima = Date.now() // il confronto è con l'istante del clic, non con «6 secondi fa»: sotto carico la stampa può richiedere di più
      await clickText('.modal .btn', 'Salva PDF…')
      const rigenerato = await require('./lib/attesa').attendi(() => fs.statSync(path.join(pdfDir, fs.readdirSync(pdfDir).filter((f) => f.endsWith('.pdf'))[0])).mtimeMs >= prima, { tempo: 15000 })
      check('PDF rigenerato con il modello personalizzato', rigenerato)

      // ---- agenda ----
      await clickText('.nav-item', 'Agenda'); await sleep(500)
      await shot('15-agenda-mese')
      await clickText('.segmented button', 'Settimana'); await sleep(300)
      await shot('16-agenda-settimana')
      await clickText('.segmented button', 'Elenco'); await sleep(300)
      await shot('17-agenda-elenco')
      await clickText('.segmented button', 'Mese')

      // ---- altre pagine ----
      await clickText('.nav-item', 'Compiti'); await sleep(400); await shot('18-todo')
      await clickText('.nav-item', 'Anagrafica'); await sleep(400); await shot('19-anagrafica')
      await clickText('.nav-item', 'Parcelle'); await sleep(400); await shot('20-parcelle')
      await clickText('.nav-item', 'Collegamenti'); await sleep(400); await shot('21-collegamenti')
      await clickText('.nav-item', 'Impostazioni'); await sleep(400); await shot('22-impostazioni')
      for (const tab of ['Avvisi', 'Pratiche e colori', 'Fiscale', 'Backup e sicurezza']) { await clickText('.tabs button', tab); await sleep(250) }
      await clickText('.tabs button', 'Avvisi'); await sleep(250); await shot('23-impostazioni-avvisi')

      // ---- ricerca globale + notifiche ----
      await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))`); await sleep(300)
      await setVal('.modal input', 'Rossi')
      for (let i = 0; i < 20 && !((t = await text()).includes('Mario Rossi') && t.includes('Rossi c. Bianchi')); i++) await sleep(250) // attende il risultato (il computer può essere sotto carico)
      check('ricerca globale trova pratica e contatto', t.includes('Rossi c. Bianchi') && t.includes('Mario Rossi'))
      await shot('24-ricerca')
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(200)
      await js(`document.querySelector('.bell-btn').click()`); await sleep(400)
      await shot('25-notifiche')

      await js(`document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))`); await sleep(200)
      check('popover notifiche si chiude con clic esterno', !(await js(`!!document.querySelector('.popover')`)))
      // ---- tema scuro ----
      db.setSettings({ tema: 'scuro' }); wc.send('data-changed', ['settings']); await sleep(500)
      await clickText('.nav-item', 'Panoramica'); await sleep(400)
      await shot('26-dashboard-scuro')

      db.setSettings({ tema: 'chiaro' }); wc.send('data-changed', ['settings']); await sleep(1500); check('tema chiaro applicato', (await js(`document.documentElement.getAttribute('data-theme')`)) === 'light', String(await js(`document.documentElement.getAttribute('data-theme') + ' / ' + getComputedStyle(document.body).backgroundColor`))); await shot('27-dashboard-chiaro')
      await clickText('.nav-item', 'Pratiche'); await sleep(300); await js(`document.querySelector('.segmented button[title="Schede"]').click()`); await sleep(300); await shot('28-pratiche-chiaro')
      // errori di console?
      const failed = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - failed.length}/${results.length} controlli superati`)
      fs.writeFileSync(path.join(out, 'risultati.json'), JSON.stringify(results, null, 2))
    } catch (e) {
      console.log('ERRORE SMOKE', e)
    } finally {
      setTimeout(() => process.exit(0), 300)
    }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}

module.exports = { attach }
