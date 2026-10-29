'use strict'
// Qualità dell'interfaccia: prestazioni con molti dati, testo ostile (HTML) e accessibilità (axe-core), in tema chiaro e scuro.
// Avvio: sh scripts/run-smoke.sh <cartella> smoke-qualita
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-smoke-qualita')
fs.mkdirSync(out, { recursive: true })
let sleep = (ms) => new Promise((r) => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
const pad = (n) => String(n).padStart(2, '0')
const iso = (dd, h = 9) => { const x = new Date(); x.setDate(x.getDate() + dd); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(h)}:00` }

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (code) => wc.executeJavaScript(code, true)
  const text = () => js('document.body.innerText')
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const setVal = (selector, value) => js(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
  const tempo = (nav, atteso) => js(`new Promise((res) => { const t0=performance.now(); const el=[...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes(${JSON.stringify(nav)})); el.click(); const poll=()=>{ if(document.querySelector(${JSON.stringify(atteso)})) requestAnimationFrame(()=>requestAnimationFrame(()=>res(performance.now()-t0))); else setTimeout(poll,5) }; poll() })`)

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, studio: { nome: 'Studio Prova', titolare: '', intestazione: '', indirizzo: '', cap_citta: '', piva: '', cf: '', email: '', pec: '', telefono: '', iban: '', domicilio_fiscale: '', banca: '' } })
      // ---------------- A. molti dati ----------------
      const P = []
      db.transaction(() => {
        for (let i = 0; i < 3000; i++) db.save('anagrafica', { denominazione: `Cliente ${i} Srl`, email: `c${i}@x.it` })
        for (let i = 0; i < 3000; i++) P.push(db.save('pratiche', { numero: `2026/${i}`, titolo: `Pratica ${i} — risarcimento danni`, cliente_id: 1 + (i % 3000), stato: i % 5 ? 'In corso' : 'Aperta', colore: ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6'][i % 4] }).id)
        for (let i = 0; i < 6000; i++) db.save('scadenze', { pratica_id: P[i % 3000], titolo: `Scadenza ${i}`, tipo: 'scadenza', data_ora: iso((i % 200) - 20, 9 + (i % 8)), promemoria: [1440] })
        for (let i = 0; i < 6000; i++) db.save('todos', { pratica_id: P[i % 3000], titolo: `Attività ${i}`, scadenza: iso((i % 150) - 10), ordine: i })
        for (let i = 0; i < 800; i++) db.saveParcella({ data: '2026-03-01', cliente_id: 1 + i, pratica_id: P[i], voci: [{ tipo: 'compenso', descrizione: 'x', quantita: 1, importo: 1000 }] })
      })
      wc.send('data-changed', [...db.TABLES, 'settings']); await sleep(2500)
      const mem0 = await js('Math.round(performance.memory.usedJSHeapSize/1048576)')
      const pagine = [['Panoramica', '.kpis'], ['Pratiche', '.pcard'], ['Agenda', '.cal-cell'], ['Compiti', '.row-item'], ['Anagrafica', '.contact'], ['Parcelle', '.table tbody tr'], ['Collegamenti', '.page-head']]
      const tempi = []
      for (const [nav, sel] of pagine) { const t = await tempo(nav, sel); tempi.push(`${nav} ${t.toFixed(0)}ms`); check(`volumi UI: "${nav}" si apre in meno di 2 secondi con 3.000 pratiche e 12.000 scadenze/attività`, t < 2000, `(${t.toFixed(0)} ms)`) }
      console.log('   tempi:', tempi.join(' · '))
      await clickText('.nav-item', 'Pratiche'); await sleep(500)
      const nCard = await js(`document.querySelectorAll('.pcard').length`)
      console.log('   schede pratica nel DOM:', nCard)
      await setVal('.search-box input', 'Pratica 2999'); await sleep(300)
      check('volumi UI: filtro pratiche istantaneo', (await js(`document.querySelectorAll('.pcard').length`)) === 1)
      await setVal('.search-box input', '')
      // ricerca globale con tanti dati
      await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))`); await sleep(300)
      const t0 = Date.now(); await setVal('.modal input', 'Attività 5999'); await js(`new Promise(r=>{const p=()=>document.querySelector('.result')?r():setTimeout(p,10);p()})`)
      check('volumi UI: ricerca globale risponde in meno di 1 secondo', Date.now() - t0 < 1000, `(${Date.now() - t0} ms)`)
      await setVal('.modal input', 'x'.repeat(5000)); await sleep(600)
      check('ricerca con 5.000 caratteri incollati: nessun errore a schermo', !(await text()).toLowerCase().includes('errore'))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(200)
      const mem1 = await js('Math.round(performance.memory.usedJSHeapSize/1048576)')
      check('memoria dell\'interfaccia sotto controllo (< 600 MB)', mem1 < 600, `(da ${mem0} a ${mem1} MB)`)

      // ---------------- B. testo ostile a schermo ----------------
      const XSS = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>'
      const hp = db.save('pratiche', { numero: '2026/X', titolo: XSS, descrizione: XSS, colore: '#ef4444', stato: 'Aperta' })
      db.save('note', { pratica_id: hp.id, testo: XSS }); db.save('todos', { pratica_id: hp.id, titolo: XSS }); db.save('scadenze', { pratica_id: hp.id, titolo: XSS, data_ora: iso(1), promemoria: [] })
      db.save('anagrafica', { denominazione: XSS }); db.save('link', { titolo: XSS, url: 'https://esempio.it' })
      wc.send('data-changed', db.TABLES); await sleep(1500)
      for (const nav of ['Panoramica', 'Pratiche', 'Agenda', 'Compiti', 'Anagrafica', 'Collegamenti']) { await clickText('.nav-item', nav); await sleep(600) }
      await clickText('.nav-item', 'Pratiche'); await setVal('.search-box input', 'img src'); await sleep(300)
      await js(`document.querySelector('.pcard h2').click()`); await sleep(500)
      for (const tab of ['Panoramica', 'Compiti', 'Scadenze', 'Note']) { await clickText('.tabs button', tab); await sleep(300) }
      check('testo ostile: nessun codice eseguito (img onerror / script) in nessuna pagina', (await js('window.__xss')) === undefined)
      check('testo ostile: il testo compare letteralmente, senza elementi iniettati', (await text()).includes('<img src=x') && (await js(`document.querySelectorAll('img[src="x"]').length`)) === 0)

      // ---------------- C. accessibilità con axe-core ----------------
      const axeSrc = fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8')
      await js(axeSrc + '; true')
      // axe misura i colori finali: senza transizioni un cambio di tema non lascia un pulsante a metà sfumatura
      await wc.insertCSS('*,*::before,*::after{transition:none!important;animation:none!important}')
      db.save('pratiche', { numero: '2026/A', titolo: 'Pratica accessibilità', colore: '#3b82f6', stato: 'Aperta' })
      wc.send('data-changed', db.TABLES); await sleep(800)
      const gravi = {}
      const analizza = async (etichetta) => {
        const r = await js(`axe.run(document, { resultTypes: ['violations'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, es: v.nodes.slice(0,2).map(n => n.target.join(' ') + ' :: ' + n.html.slice(0,110)) })))`)
        for (const v of r) { gravi[v.id] = gravi[v.id] || { impact: v.impact, help: v.help, dove: new Set(), es: v.es, n: 0 }; gravi[v.id].dove.add(etichetta); gravi[v.id].n += v.n }
      }
      for (const tema of ['chiaro', 'scuro']) {
        db.setSettings({ tema }); wc.send('data-changed', ['settings']); await sleep(900)
        for (const nav of ['Panoramica', 'Pratiche', 'Agenda', 'Compiti', 'Anagrafica', 'Parcelle', 'Collegamenti', 'Impostazioni']) { await clickText('.nav-item', nav); await sleep(700); await analizza(`${nav}/${tema}`) }
        for (const tab of ['Studio', 'Integrazioni', 'Modello PDF', 'Avvisi', 'Pratiche e colori', 'Fiscale', 'Backup e sicurezza']) { await clickText('.tabs button', tab); await sleep(500); await analizza(`Impostazioni ${tab}/${tema}`) }
        await clickText('.tabs button', 'Integrazioni'); await sleep(400); await js(`document.querySelector('button[aria-label="Collega un calendario"]').click()`); await sleep(500); await analizza(`Modulo calendario/${tema}`); await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(300)
        // schermate con finestre modali
        await clickText('.nav-item', 'Pratiche'); await sleep(400)
        await clickText('button', 'Nuova pratica'); await sleep(500); await analizza(`Modulo pratica/${tema}`); await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(300)
        await clickText('.nav-item', 'Parcelle'); await sleep(400); await clickText('button', 'Nuovo documento'); await sleep(2500); await analizza(`Editor parcella/${tema}`); await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(300)
        await clickText('.nav-item', 'Pratiche'); await sleep(500); await js(`document.querySelector('.pcard h2').click()`); await sleep(600); await analizza(`Dettaglio pratica/${tema}`)
      }
      const elenco = Object.entries(gravi).sort((a, b) => ({ critical: 0, serious: 1, moderate: 2, minor: 3 }[a[1].impact] - { critical: 0, serious: 1, moderate: 2, minor: 3 }[b[1].impact]))
      for (const [id, v] of elenco) console.log(`   [axe ${v.impact}] ${id}: ${v.help} — ${v.n} elementi in ${[...v.dove].slice(0, 4).join(', ')}${v.dove.size > 4 ? '…' : ''}\n        es: ${v.es[0]}`)
      fs.writeFileSync(path.join(out, 'axe.json'), JSON.stringify(elenco.map(([id, v]) => ({ id, ...v, dove: [...v.dove] })), null, 1))
      const seri = elenco.filter(([, v]) => v.impact === 'critical' || v.impact === 'serious')
      check('accessibilità: nessuna violazione critica o seria (axe-core, tema chiaro e scuro, tutte le pagine)', seri.length === 0, seri.length ? `(${seri.map(([id]) => id).join(', ')})` : '')

      const bad = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}
module.exports = { attach }
