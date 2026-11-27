'use strict'
// Sito reale in Chromium/Electron, con risposte GitHub sintetiche: nessun repository pubblico viene contattato.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-sito-')), site = path.join(root, 'sito'), results = []
app.setPath('userData', path.join(root, 'profilo'))
fs.cpSync(path.resolve(__dirname, '../sito'), site, { recursive: true })
require('./prepare-site').prepare({ directory: site, repository: 'studio/tio', url: 'https://studio.github.io/tio/' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let server, current
let stage = 'avvio'
const deadline = setTimeout(() => { console.error('ERRORE: test del sito fermo durante ' + stage); app.exit(1) }, 120000)
const check = (name, value, detail) => { results.push({ name, ok: !!value, detail }); console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ' ' + JSON.stringify(detail))) }
const version = '1.4.0-beta.7', prefix = 'https://github.com/studio/tio/releases/download/'
const release = (beta = false) => ({ tag_name: beta ? 'v' + version : 'v1.4.0', prerelease: beta, draft: false,
  assets: ['TIO-' + version + '-arm64.dmg', 'TIO-' + version + '.dmg', 'TIO-Setup-' + version + '.exe', 'SHA256SUMS.txt'].map(name => ({ name, size: 150000000, browser_download_url: prefix + encodeURIComponent('v' + version) + '/' + encodeURIComponent(name) })) })
const evaluate = code => current.webContents.executeJavaScript(code, true)
async function page(mode = 'stable', width = 1440, scripts = true) {
  stage = 'browser ' + mode + ' ' + width
  console.log('PROVA ' + stage)
  if (current && !current.isDestroyed()) current.destroy()
  current = new BrowserWindow({ show: false, width, height: 900, useContentSize: true, webPreferences: { partition: 'test-sito-' + Math.random(), sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: scripts, backgroundThrottling: false } })
  const wc = current.webContents
  await current.loadURL('about:blank')
  stage = 'debugger ' + mode
  wc.debugger.attach('1.3')
  await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await wc.debugger.sendCommand('Fetch.enable', { patterns: [{ urlPattern: 'https://api.github.com/*' }] })
  wc.debugger.on('message', async (_event, method, event) => {
    if (method !== 'Fetch.requestPaused' || mode === 'hang') return
    try {
      let status = 200, data = release()
      if (mode === 'beta') { status = event.request.url.includes('/latest') ? 404 : 200; data = status === 404 ? { message: 'Not Found' } : [release(true)] }
      if (mode === 'rate-limit') { status = 403; data = {} }
      if (mode === 'hostile') data = { ...release(), tag_name: 'v1.4.0-<svg/onload=alert(1)>', html_url: 'javascript:alert(1)' }
      if (mode === 'unsafe-url') { data = release(); data.assets.forEach(a => { a.browser_download_url = 'javascript:alert(1)' }) }
      await wc.debugger.sendCommand('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(JSON.stringify(data)).toString('base64') })
    } catch { /* La pagina può essere già chiusa durante una richiesta annullata. */ }
  })
  stage = 'caricamento ' + mode
  await current.loadURL(`http://127.0.0.1:${server.address().port}/`)
  stage = 'lettura pagina ' + mode
  if (scripts) {
    for (let i = 0; i < 40 && !(await evaluate('!!window.TIO_PRONTO')); i++) await sleep(50)
    await sleep(100)
  }
}
async function axe(label) {
  await evaluate(fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') + ';true')
  const violations = await evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})))")
  check(label, violations.length === 0, violations)
}
app.whenReady().then(async () => {
  try {
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' }
    server = http.createServer((req, res) => {
      const file = path.resolve(site, '.' + new URL(req.url, 'http://local').pathname.replace(/\/$/, '/index.html'))
      if (!file.startsWith(site + path.sep)) { res.writeHead(403); res.end(); return }
      try { const body = fs.readFileSync(file); res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(body) } catch { res.writeHead(404); res.end() }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page('stable', width)
      check('nessun overflow a ' + width + 'px', await evaluate('document.documentElement.scrollWidth<=innerWidth'), width)
      const links = await evaluate("[...document.querySelectorAll('.eroe [data-scarica-file]')].map(a=>({file:a.dataset.scaricaFile,url:a.href}))")
      check('tre installer distinti a ' + width + 'px', links.length === 3 && links.every(a => a.url.startsWith(prefix)) && new Set(links.map(a => a.url)).size === 3, links)
      await evaluate("document.querySelector('.installa-scarica [data-os=windows]').dispatchEvent(new FocusEvent('focus'))")
      check('istruzioni Windows a ' + width + 'px', await evaluate("document.querySelectorAll('.passo[data-os=windows]:not([hidden])').length===3&&document.querySelectorAll('.passo[data-os=mac]:not([hidden])').length===0"))
      for (const profile of ['professionista', 'ditta', 'avvocato']) {
        await evaluate(`document.querySelector('[data-pubblico] button[data-profilo="${profile}"]').click()`)
        check('profilo ' + profile + ' a ' + width + 'px', await evaluate(`[...document.querySelectorAll('.profilo-voce[data-profilo]:not([hidden])')].every(e=>e.dataset.profilo==='${profile}')`))
      }
      await evaluate("document.querySelector('.domande-elenco summary').click();document.querySelector('[data-vista=pratiche]').click();document.querySelector('.demo-pratica').click();document.querySelector('.demo-priorita button').click();document.querySelector('.demo-compito input').click();document.querySelector('[data-confronto]').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))")
      check('FAQ, confronto da tastiera e demo (pratica aperta, priorità cambiata, compito spuntato) a ' + width + 'px', await evaluate("document.querySelector('.domande-elenco details').open&&document.querySelector('.demo-priorita button').getAttribute('aria-pressed')==='true'&&document.querySelector('.demo-compito').classList.contains('fatto')&&document.querySelector('[data-confronto]').getAttribute('aria-valuenow')==='100'"))
      // demo del Budget: sei mesi, l'interruttore «se gli incassi tardano» porta un mese sotto zero con il suo avviso; nulla esce dalla finestra della demo
      await evaluate("document.querySelector('[data-vista=budget]').click();document.querySelector('.demo-interruttore').click()")
      check('demo del Budget: previsione, scenario «se gli incassi tardano» e avviso, senza uscire dalla finestra a ' + width + 'px', await evaluate("(()=>{const f=document.querySelector('.demo-finestra').getBoundingClientRect();return document.querySelectorAll('.demo-mese').length===6&&document.querySelectorAll('.demo-mese.sotto').length===1&&/sotto zero/.test(document.querySelector('.demo-avviso')?.textContent||'')&&[...document.querySelectorAll('.demo-vista *')].every(e=>{const r=e.getBoundingClientRect();return !r.width||r.right<=f.right+1})})()"))
      check('foto delle funzioni apribili a grandezza piena a ' + width + 'px', await evaluate("[...document.querySelectorAll('.funz-riga .foto-grande')].length===6&&[...document.querySelectorAll('.funz-riga .foto-grande')].every(a=>a.getAttribute('href')===a.querySelector('img').getAttribute('src')&&a.getAttribute('aria-label'))"))
      // 1.0.5: la demo completa. Cliente in Anagrafica, pratica nuova per quel cliente, attività a tariffa totale, spesa,
      // parcella dalle voci (400 + 15% + CPA 4% + IVA 22% + 16 esenti = 599,65), compito; «Ricomincia» e nessuna archiviazione
      const flusso = await evaluate(`(async()=>{const q=s=>document.querySelector(s),set=(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},tasto=t=>[...document.querySelectorAll('.demo-vista button')].find(b=>b.textContent===t)
        document.querySelector('[data-demo-ricomincia]').click();q('[data-vista=anagrafica]').click();tasto('+ Nuovo contatto').click();set(q('.demo-modulo [name=nome]'),'Paolo Neri');q('.demo-modulo').requestSubmit()
        q('[data-vista=pratiche]').click();tasto('+ Nuova pratica').click();const moduloAperto=!!q('.demo-modulo');set(q('.demo-modulo [name=titolo]'),'Recupero crediti Neri');const sel=q('.demo-modulo [name=cliente]');sel.value=[...sel.options].find(o=>o.text==='Paolo Neri').value;q('.demo-modulo').requestSubmit()
        tasto('+ Attività').click();set(q('.demo-modulo [name=descrizione]'),'Parere scritto');const m=q('.demo-modulo [name=modo]');m.value='totale';m.dispatchEvent(new Event('change'));set(q('.demo-modulo [name=importo]'),'400');q('.demo-modulo').requestSubmit()
        tasto('+ Spesa').click();set(q('.demo-modulo [name=descrizione]'),'Marca da bollo');set(q('.demo-modulo [name=importo]'),'16');q('.demo-modulo').requestSubmit()
        tasto('Crea la parcella').click();const totale=q('.demo-parcella-totale td:last-child')?.textContent
        q('[data-vista=compiti]').click();q('.demo-compito:not(.fatto) input').click()
        const f=q('.demo-finestra').getBoundingClientRect(),dentro=[...document.querySelectorAll('.demo-vista *')].every(e=>{const r=e.getBoundingClientRect();return !r.width||r.right<=f.right+1})
        const passi=q('[data-demo-avanzamento]').textContent,cliente=[...document.querySelectorAll('.demo-compito small')].length
        q('[data-vista=pratiche]').click();const dopoParcella=[...document.querySelectorAll('.demo-pratica b')].some(b=>b.textContent==='Recupero crediti Neri')
        document.querySelector('[data-demo-ricomincia]').click();q('[data-vista=pratiche]').click()
        return {moduloAperto,totale,dentro,passi,dopoParcella,azzerata:![...document.querySelectorAll('.demo-pratica b')].some(b=>b.textContent==='Recupero crediti Neri')&&q('[data-demo-avanzamento]').textContent==='0 di 6 passi',archivio:localStorage.length+sessionStorage.length}})()`)
      check('demo completa (anagrafica, pratica, attività a tariffa totale, spesa, parcella 599,65, compito), dentro la finestra e «Ricomincia» a ' + width + 'px', flusso.moduloAperto && /599,65/.test(flusso.totale || '') && flusso.dentro && /Fatto tutto/.test(flusso.passi) && flusso.dopoParcella && flusso.azzerata && flusso.archivio === 0, flusso)
      if (width === 390 || width === 1440) { await evaluate("document.querySelector('[data-vista=anagrafica]').click();[...document.querySelectorAll('.demo-vista button')].find(b=>b.textContent==='+ Nuovo contatto').click()"); await axe('accessibilità della demo con un modulo aperto a ' + width + 'px') ; await evaluate("document.querySelector('[data-demo-ricomincia]').click()") }
      if (width === 390 || width === 1440) await axe('accessibilità a ' + width + 'px, movimento ridotto')
    }
    // La sezione dei dati nei due aspetti, chiaro e scuro, con movimento normale.
    await current.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await new Promise(resolve => { current.webContents.once('did-finish-load', resolve); current.reload() })
    let minContrast = Infinity
    for (const tema of ['chiaro', 'scuro']) {
      const misura = () => evaluate("(()=>{const s=document.querySelector('[data-tramonto]'),el=s.querySelector('.tramonto-fermo'),p=s.querySelector('.tramonto-testa p');const rgb=v=>v.match(/[\\d.]+/g).slice(0,3).map(Number);const lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,k)=>n+v*[.2126,.7152,.0722][k],0);const a=lum(rgb(getComputedStyle(el).backgroundColor)),b=lum(rgb(getComputedStyle(p).color));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)})()")
      await evaluate(`document.querySelector('[data-tema-scegli=${tema}]').click();document.querySelector('[data-tramonto]').scrollIntoView({behavior:'instant'})`)
      // subito dopo il clic, a transizione appena iniziata (come su una macchina che non disegna i fotogrammi) e a transizione finita
      const subito = await misura()
      await sleep(900)
      const value = Math.min(subito, await misura())
      minContrast = Math.min(minContrast, value)
      await axe('accessibilità con la schermata in ' + tema)
    }
    check('contrasto sufficiente nella sezione dei dati, chiara e scura', minContrast >= 4.5, minContrast)
    for (const mode of ['beta', 'rate-limit', 'hostile', 'unsafe-url', 'hang']) {
      await page(mode)
      const state = await evaluate("({links:[...document.querySelectorAll('[data-scarica-file]')].map(a=>a.href),project:[...document.querySelectorAll('[data-github]')].map(a=>a.href),label:document.querySelector('[data-elenco-file]').textContent,markup:!!document.querySelector('[data-elenco-file] svg,[data-elenco-file] img')})")
      check(mode + ': link disponibili e sicuri', state.links.every(a => a.startsWith('https://github.com/studio/tio/releases')) && state.project.every(a => a.startsWith('https://github.com/studio/tio')), state)
      if (mode === 'beta') check('prima beta scaricabile e riconoscibile', state.links.every(a => a.startsWith(prefix)) && state.label.includes('Versione di prova ' + version), state)
      if (mode === 'hostile') check('metadati ostili non diventano HTML', !state.markup, state)
      if (mode === 'hang') { await sleep(5200); check('link di riserva conservati dopo il timeout', await evaluate("[...document.querySelectorAll('[data-scarica-file]')].every(a=>a.href==='https://github.com/studio/tio/releases')")) }
    }
    await page('stable', 390, false)
    const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8')
    const staticDownloads = html.match(/<a\b[^>]*data-scarica-file[^>]*>/g) || []
    check('HTML senza JavaScript: link reali e istruzioni Windows presenti', staticDownloads.length >= 3 && staticDownloads.every(tag => /href="https:\/\/github.com\/studio\/tio\/releases"/.test(tag)) && !/<[^>]*data-os="windows"[^>]*\bhidden\b/.test(html))
    check('metadati social con URL assoluti', html.includes('https://studio.github.io/tio/img/panoramica-chiaro.webp') && html.includes('rel="canonical"'))
    assert.throws(() => require('./prepare-site').prepare({ directory: site, repository: '../fuori' }))
    check('repository non valido rifiutato dal generatore', true)
  } catch (error) { check('esecuzione completa del test', false, error.stack) }
  finally {
    if (current && !current.isDestroyed()) current.destroy()
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
    if (process.env.SMOKE_OUT) { fs.mkdirSync(process.env.SMOKE_OUT, { recursive: true }); fs.writeFileSync(path.join(process.env.SMOKE_OUT, 'sito-risultati.json'), JSON.stringify(results, null, 2)) }
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 }) } catch { /* Windows: profilo ancora in uso da Chromium, resta nella cartella temporanea */ }
    console.log(`RISULTATO: ${results.filter(r => r.ok).length}/${results.length} controlli sito superati`)
    clearTimeout(deadline)
    app.exit(results.length && results.every(r => r.ok) ? 0 : 1)
  }
})
app.on('window-all-closed', () => {})
