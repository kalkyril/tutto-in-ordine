'use strict'
// Collegamenti in riquadri quadrati: nessun sito preimpostato, aggiunta/modifica/eliminazione dall'interfaccia. Avvio: sh scripts/run-smoke.sh <cartella> smoke-tiles
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
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-tiles'); fs.mkdirSync(out, { recursive: true })
  const shot = async (n) => { await sleep(350); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } }
  const setVal = (sel, v) => js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
  const campo = (label) => `(() => { const l=[...document.querySelectorAll('.modal .field > label')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)})); return l && l.parentElement.querySelector('input') })()`
  const compila = async (label, v) => { const id = await js(`${campo(label)}.id`); await setVal('#' + id, v) }

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, studio: { nome: 'Studio Prova' } })
      await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Collegamenti'); await sleep(500)
      const t0 = await js('document.body.innerText')
      check('nessun sito preimpostato né pulsante "consigliati"', db.list('link').length === 0 && !/consigliat/i.test(t0) && !/Normattiva|Cassazione|INPS/.test(t0))
      check('con zero siti c\'è solo il riquadro "Aggiungi un sito"', await js(`document.querySelectorAll('.tile').length === 1 && !!document.querySelector('.tile-add')`))
      await clickText('.tile-add', 'Aggiungi'); await sleep(400)
      check('il modulo non chiede più la categoria', !/Categoria/.test(await js('document.querySelector(".modal").innerText')))
      await compila('Nome', 'Portale Giustizia'); await compila('Indirizzo', 'pst.giustizia.it')
      await clickText('.modal .btn-primary', 'Salva'); await sleep(800)
      await clickText('.tile-add', 'Aggiungi'); await sleep(400)
      await compila('Nome', 'Il mio fornitore'); await compila('Indirizzo', 'https://www.fornitore.example/area-riservata')
      await clickText('.modal .btn-primary', 'Salva'); await sleep(800)
      const l = db.list('link')
      check('solo i due siti inseriti dall\'utente, indirizzo completato con https', l.length === 2 && l.some((x) => x.url === 'https://pst.giustizia.it'), JSON.stringify(l.map((x) => x.url)))
      const forme = await js(`[...document.querySelectorAll('.tile:not(.tile-add)')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] })`)
      check('riquadri quadrati', forme.length === 2 && forme.every(([w, h]) => Math.abs(w - h) <= 1 && w >= 120), JSON.stringify(forme))
      check('il riquadro "Aggiungi" resta in fondo alla griglia', await js(`(() => { const t=[...document.querySelectorAll('.tiles > *')]; return t[t.length-1].classList.contains('tile-add') })()`))
      await shot('tiles-1')
      await js(`document.querySelector('.tile-azioni button[aria-label^="Modifica Il mio"]').click()`); await sleep(400)
      await compila('Nome', 'Fornitore cancelleria'); await clickText('.modal .btn-primary', 'Salva'); await sleep(700)
      check('modifica dal riquadro', db.list('link').some((x) => x.titolo === 'Fornitore cancelleria'))
      await js(`document.querySelector('.tile-azioni button[aria-label^="Elimina Fornitore"]').click()`); await sleep(700)
      check('eliminazione dal riquadro (subito, con «Annulla»)', db.list('link').length === 1 && /Collegamento eliminato/.test(await js('document.body.innerText')))
      // sito collegato a una pratica: scheda della pratica
      const p = db.save('pratiche', { numero: '2026/001', titolo: 'Rossi c. Bianchi', stato: 'In corso', priorita: 'media', colore: '#3b82f6' })
      await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Pratiche'); await sleep(500); await js(`document.querySelector('.pcard h2').click()`); await sleep(500)
      await clickText('.tabs button', 'Collegamenti'); await sleep(400)
      await clickText('.tile-add', 'Aggiungi'); await sleep(400)
      await compila('Nome', 'Fascicolo telematico'); await compila('Indirizzo', 'https://esempio.it/fascicolo/1')
      await clickText('.modal .btn-primary', 'Salva'); await sleep(800)
      check('sito aggiunto dalla pratica resta collegato a quella pratica', db.list('link').some((x) => x.titolo === 'Fascicolo telematico' && x.pratica_id === p.id))
      await shot('tiles-2-pratica')
      const axeSrc = fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8'); await js(axeSrc + '; true')
      for (const tema of ['light', 'dark']) {
        await js(`(() => { const r = document.documentElement; r.classList.add('sem-transizioni'); r.setAttribute('data-theme','${tema}'); void r.offsetHeight })()`); await sleep(300); await clickText('.nav-item', 'Collegamenti'); await sleep(500)
        const viol = await js(`axe.run(document, { resultTypes: ['violations'] }).then(r => r.violations.map(v => v.id + ':' + v.nodes.map(n => n.target.join(' ') + ' ' + ((n.any[0] && n.any[0].message) || '').slice(0, 110)).join(' || ')))`)
        check(`accessibilità (axe-core), tema ${tema}`, viol.length === 0, JSON.stringify(viol))
        if (tema === 'dark') await shot('tiles-3-scuro')
      }
      const bad = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}
module.exports = { attach }
