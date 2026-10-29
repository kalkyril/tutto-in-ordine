'use strict'
// Controllo facoltativo degli aggiornamenti nell'app vera: spento di default, nessuna richiesta senza consenso, «Controlla ora»,
// notifica di una versione nuova, menu, errori. GitHub è simulato: `fetch` del processo principale è sostituito qui.
// Avvio: sh scripts/run-smoke.sh <cartella> smoke-aggiornamenti
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const { Menu, shell } = require('electron')
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (c) => wc.executeJavaScript(c, true)
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'tio-aggiornamenti'); fs.mkdirSync(out, { recursive: true })
  const shot = async (n) => { await sleep(350); wc.invalidate(); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } }
  const testo = () => js('document.body.innerText')
  const mostraGruppo = () => js(`[...document.querySelectorAll('.settings-section')].find(s => s.querySelector('h2')?.textContent === 'Aggiornamenti')?.scrollIntoView({ block: 'center' })`)

  // GitHub simulato: ogni richiesta viene registrata; nessuna esce davvero dal computer
  let chiamate = [], ultima = 'v9.9.9', guasto = false
  globalThis.fetch = async (url, init) => {
    chiamate.push({ url: String(url), ua: init?.headers?.['User-Agent'] })
    if (guasto) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
    if (!String(url).startsWith('https://api.github.com/')) throw new Error('richiesta inattesa ' + url)
    // TIO in prova (beta) chiede l'elenco delle ultime versioni, una stabile solo l'ultima
    const versione = { tag_name: ultima, html_url: 'https://truffa.example/', draft: false, prerelease: false }
    const res = new Response(JSON.stringify(String(url).includes('/releases?') ? [versione] : versione), { status: 200 })
    Object.defineProperty(res, 'url', { value: String(url) })
    return res
  }
  const aperti = []
  shell.openExternal = async (u) => { aperti.push(u) } // nessun browser vero durante la prova
  delete process.env.MNGMNT_TEST_REPO
  // notifiche solo nell'app: niente avvisi del sistema sul computer di chi esegue la prova
  db.setSettings({ onboarding_fatto: true, studio: { nome: 'Studio Prova' }, notifiche_desktop: false })
  const vaiAggiornamenti = async () => {
    await clickText('.nav-item', 'Impostazioni'); await sleep(400)
    await clickText('.tabs button', 'Backup e sicurezza'); await sleep(500)
  }

  wc.once('did-finish-load', async () => {
    try {
      wc.setBackgroundThrottling(false)
      await sleep(3500) // oltre il primo giro dei controlli periodici (2,5 s dopo l'avvio)
      check('spento di default e nessuna richiesta di rete all\'avvio', db.getSettings().aggiornamenti_controllo !== true && chiamate.length === 0, JSON.stringify(chiamate))

      await vaiAggiornamenti()
      check('senza indirizzo GitHub nel progetto le Impostazioni spiegano che arriverà con la pubblicazione', /Sarà disponibile quando TIO verrà pubblicato su GitHub/.test(await testo()) && !/Controlla ora/.test(await testo()))

      process.env.MNGMNT_TEST_REPO = 'studio/tio'
      await js('location.reload()'); await sleep(1500)
      check('con l\'indirizzo GitHub TIO chiede una volta se avvisare delle nuove versioni', /Vuoi sapere quando esce una nuova versione\?/.test(await testo()) && chiamate.length === 0)
      await shot('aggiornamenti-0-domanda')
      await clickText('.modal button', 'Non ora'); await sleep(700)
      check('«Non ora»: risposta ricordata, controllo spento, nessuna richiesta', db.getSettings().aggiornamenti_chiesto === true && db.getSettings().aggiornamenti_controllo !== true && chiamate.length === 0)
      await js('location.reload()'); await sleep(1500)
      check('la domanda non torna dopo una risposta', !/Vuoi sapere quando esce una nuova versione\?/.test(await testo()))
      await vaiAggiornamenti()
      const interruttore = `[...document.querySelectorAll('.settings-toggle-row')].find(r => r.innerText.includes('Controlla gli aggiornamenti ogni giorno'))?.querySelector('input')`
      check('interruttore presente e spento', await js(`${interruttore}?.checked === false`))
      check('ancora nessuna richiesta prima di una scelta dell\'utente', chiamate.length === 0)
      await mostraGruppo(); await shot('aggiornamenti-1-spento')

      const notificheAvanti = db.getDb().prepare('SELECT COUNT(*) c FROM notifiche').get().c
      await clickText('.settings-row button', 'Controlla ora'); await sleep(900)
      check('«Controlla ora»: una sola richiesta, a api.github.com, con solo nome e versione del programma', chiamate.length === 1 && /^https:\/\/api\.github\.com\/repos\/studio\/tio\/releases(\/latest|\?per_page=30)$/.test(chiamate[0].url) && /^TIO\/\d+\.\d+\.\d+/.test(chiamate[0].ua || ''), JSON.stringify(chiamate))
      const t1 = await testo()
      check('versione nuova mostrata con il pulsante per scaricarla', /È disponibile TIO 9\.9\.9/.test(t1) && /Apri la pagina di download/.test(t1))
      check('nessuna notifica nel campanello per un controllo chiesto a mano', db.getDb().prepare('SELECT COUNT(*) c FROM notifiche').get().c === notificheAvanti)
      await clickText('.settings-row button', 'Apri la pagina di download'); await sleep(400)
      check('la pagina aperta è quella composta da TIO su github.com, non l\'indirizzo arrivato nella risposta', aperti.length === 1 && aperti[0] === 'https://github.com/studio/tio/releases/tag/v9.9.9', JSON.stringify(aperti))
      await mostraGruppo(); await shot('aggiornamenti-2-disponibile')

      await js(`${interruttore}.click()`); await sleep(300)
      await clickText('.azioni-salvataggio .btn-primary', 'Salva'); await sleep(900)
      check('attivato e salvato; subito dopo un controllo riuscito nessuna nuova richiesta', db.getSettings().aggiornamenti_controllo === true && chiamate.length === 1, String(chiamate.length))

      // controllo automatico del giorno dopo: esce una versione ancora più recente
      ultima = 'v9.9.10'
      require('../electron/aggiornamenti')._azzera()
      await js(`window.mngmnt.invoke('settings:set', { aggiornamenti_ultimo: '${new Date(Date.now() - 2 * 86400000).toISOString()}' })`); await sleep(1200)
      const notifica = db.getDb().prepare("SELECT * FROM notifiche WHERE tipo = 'aggiornamento' ORDER BY id DESC").get()
      check('controllo automatico dopo un giorno: nuova richiesta e notifica nel campanello', chiamate.length === 2 && notifica?.titolo === 'È disponibile TIO 9.9.10', JSON.stringify(notifica))
      await clickText('.nav-item', 'Panoramica'); await sleep(500)
      await js(`document.querySelector('.bell-btn').click()`); await sleep(400)
      await clickText('.notif-item', 'È disponibile TIO 9.9.10'); await sleep(700)
      check('la notifica porta alla sezione Aggiornamenti delle Impostazioni', /È disponibile TIO 9\.9\.10/.test(await testo()) && /Controlla gli aggiornamenti ogni giorno/.test(await testo()))

      const voci = []
      const visita = (items) => items.forEach((i) => { voci.push(i.label); if (i.submenu) visita(i.submenu.items) })
      visita(Menu.getApplicationMenu().items)
      check('voce «Controlla aggiornamenti…» nel menu dell\'app', voci.includes('Controlla aggiornamenti…'))

      guasto = true
      await clickText('.settings-row button', 'Controlla ora'); await sleep(900)
      const t2 = await testo()
      check('senza rete: messaggio chiaro, e la versione nuova già trovata resta proposta', /controlla la connessione/.test(t2) && /È disponibile TIO 9\.9\.10/.test(t2))
      await js(`window.mngmnt.invoke('settings:set', { aggiornamento: null })`); await sleep(600)
      const t3 = await testo()
      check('senza rete e senza versioni note: stato «non riuscito» con il motivo', /Ultimo controllo non riuscito/.test(t3) && /GitHub non è raggiungibile/.test(t3))

      guasto = false
      const axeSrc = fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8'); await js(axeSrc + '; true')
      for (const tema of ['light', 'dark']) {
        // il tema si cambia dalle impostazioni, come fa l'utente: così l'app ricalcola anche il colore principale per quel tema
        db.setSettings({ tema: tema === 'light' ? 'chiaro' : 'scuro' }); wc.send('data-changed', ['settings']); await sleep(600)
        const viol = await js(`axe.run(document.querySelector('.content') || document, { resultTypes: ['violations'] }).then(r => r.violations.map(v => v.id + ':' + v.nodes.map(n => n.target.join(' ')).join(',')))`)
        check(`accessibilità (axe-core), tema ${tema}`, viol.length === 0, JSON.stringify(viol))
        if (tema === 'dark') await mostraGruppo(); await shot('aggiornamenti-3-scuro')
      }
      const bad = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}
module.exports = { attach }
