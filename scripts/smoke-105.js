'use strict'
// Novità della 1.0.5 nell'app vera: editor dei documenti con interlinea e spazio prima/dopo (come in Word), sottolineatura
// colorata e ondulata, colore del testo; linea dell'intestazione facoltativa; sezione «Luogo e data»; «Tariffa totale» delle
// attività e parcella dalle voci; rate con l'ultima scadenza in Da pagare; parcella col calcolo forense a 1220×772.
// Avvio: sh scripts/run-smoke.sh <cartella> smoke-105
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${cond ? '' : extra}`) }
  const js = (c) => wc.executeJavaScript(c, true)
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-105'); fs.mkdirSync(out, { recursive: true })
  const shot = async (n) => { await sleep(400); wc.invalidate(); await js('Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), new Promise((r) => setTimeout(() => r(true), 300))])'); await wc.capturePage(); await sleep(300); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } }
  const setVal = (sel, v) => js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; const proto = el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); return true })()`)
  const campoModale = (label) => `(() => { const l=[...document.querySelectorAll('.modal .field > label')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)})); return l && l.parentElement.querySelector('select,input,textarea') })()`
  const scriviCampo = (label, v) => js(`(() => { const el=${campoModale(label)}; if(!el) return false; const proto = el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); return true })()`)
  const text = () => js('document.body.innerText')
  const attendi = async (fn, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await sleep(250) } }
  const overflow = () => js(`[...document.querySelectorAll('.content *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.table-wrap,.editor-foglio') }).slice(0,4).map(e => e.className || e.tagName)`)
  const axe = async (nome) => {
    const src = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); await js(src + '; true')
    const v = await js(`axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: false } } }).then(r => r.violations.map(v => v.id + ':' + v.nodes.length + ' ' + v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' | ')))`)
    check(`accessibilità (axe-core): ${nome}`, v.length === 0, JSON.stringify(v))
  }
  // seleziona del testo nel foglio dell'editor: il paragrafo n (tutto) o una parola al suo interno
  const seleziona = (n, parola) => js(`(() => { const p=document.querySelectorAll('.editor-foglio p')[${n}]; if(!p) return false; const r=document.createRange(); ${parola ? `const t=[...p.childNodes].find(x=>x.nodeType===3&&x.textContent.includes(${JSON.stringify(parola)})); if(!t) return false; const i=t.textContent.indexOf(${JSON.stringify(parola)}); r.setStart(t,i); r.setEnd(t,i+${JSON.stringify(parola)}.length)` : 'r.selectNodeContents(p)'}; document.querySelector('.editor-foglio').focus(); const s=getSelection(); s.removeAllRanges(); s.addRange(r); return true })()`)
  const tendina = (etichetta) => js(`(() => { const b=document.querySelector('.editor-barra [aria-label=${JSON.stringify(etichetta)}]'); b?.click(); return !!b })()`)
  const nelPannello = (testo) => js(`(() => { const b=[...document.querySelectorAll('.tendina-pannello button')].find(x=>(x.getAttribute('aria-label')||x.textContent).trim()===${JSON.stringify(testo)}); b?.click(); return !!b })()`)
  const modello = () => (db.getSettings().modelli_documento || []).find((m) => m.nome === 'Lettera')

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, studio: { nome: 'Avv. Lara Ferrari', cap_citta: '41121 Modena', titolare: 'Lara Ferrari' } })
      const cli = db.save('anagrafica', { denominazione: 'Giulia Rinaldi', ruolo: 'cliente', tipo: 'persona', citta: 'Carpi' })
      db.save('pratiche', { numero: '2026/001', titolo: 'Rinaldi c. Edilnova', cliente_id: cli.id, stato: 'In corso', colore: '#ef4444', tipo: 'Civile' })
      await js('location.reload()'); await sleep(1500)

      // ---------- Documenti: editor ----------
      await clickText('.nav-item', 'Documenti'); await sleep(900)
      await attendi(() => js(`!!document.querySelector('.documenti-scelta select')`))
      const idLettera = await js(`[...document.querySelectorAll('.documenti-scelta select option')].find(o=>o.textContent==='Lettera')?.value`)
      await setVal('.documenti-scelta select', idLettera); await sleep(800)
      await attendi(() => js(`document.querySelectorAll('.editor-foglio p').length > 3`))
      check('barra dell’editor: colore del testo, sottolineatura e interlinea come tendine', await js(`['Colore del testo','Colore e tipo della sottolineatura','Interlinea e spaziatura del paragrafo'].every(t=>document.querySelector('.editor-barra [aria-label="'+t+'"][aria-haspopup="dialog"]'))`))

      // interlinea doppia e spazio prima sul quinto paragrafo, «Rimuovi spazio dopo» sul sesto
      await seleziona(5); await tendina('Interlinea e spaziatura del paragrafo'); await sleep(300)
      check('tendina dell’interlinea: 1,0 1,15 1,5 2,0 2,5 3,0 e i comandi di Word', await js(`[...document.querySelectorAll('.tendina-paragrafo .tendina-voce span')].map(s=>s.textContent).slice(0,6).join(' ')`) === '1,0 1,15 1,5 2,0 2,5 3,0' && /Aggiungi spazio prima del paragrafo/.test(await text()))
      await shot('105-1-interlinea')
      await nelPannello('2,0'); await sleep(300)
      await nelPannello('Aggiungi spazio prima del paragrafo'); await sleep(300)
      const p5 = await js(`(() => { const p=document.querySelectorAll('.editor-foglio p')[5]; return { i: p.dataset.interlinea, lh: p.style.lineHeight, mt: p.style.marginTop } })()`)
      check('interlinea 2,0 e spazio prima di 12 pt sul paragrafo scelto', p5.i === '2' && p5.lh === '2.3' && p5.mt === '12pt', JSON.stringify(p5))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(200)
      check('la tendina si chiude con Esc', !(await js(`!!document.querySelector('.tendina-pannello')`)))
      await seleziona(6); await tendina('Interlinea e spaziatura del paragrafo'); await sleep(300)
      await nelPannello('Rimuovi spazio dopo il paragrafo'); await sleep(300)
      check('«Rimuovi spazio dopo il paragrafo»: 0 pt', await js(`document.querySelectorAll('.editor-foglio p')[6].style.marginBottom`) === '0pt')
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)

      // sottolineatura rossa ondulata e colore blu su due parole
      const parola = await js(`(() => { const p=[...document.querySelectorAll('.editor-foglio p')].find(x=>/presente/.test(x.textContent)); return p ? [...document.querySelectorAll('.editor-foglio p')].indexOf(p) : -1 })()`)
      await seleziona(parola, 'presente'); await tendina('Colore e tipo della sottolineatura'); await sleep(300)
      await nelPannello('Rosso'); await sleep(250); await nelPannello('Ondulata'); await sleep(250)
      await shot('105-2-sottolineatura')
      const u = await js(`(() => { const u=[...document.querySelectorAll('.editor-foglio u')].find(x=>x.textContent==='presente'); return u ? { c: u.style.textDecorationColor, s: u.style.textDecorationStyle, n: document.querySelectorAll('.editor-foglio u').length } : null })()`)
      check('sottolineatura rossa e ondulata sulla parola, senza sottolineature doppie', !!u && u.c === 'rgb(185, 28, 28)' && u.s === 'wavy' && u.n === 1, JSON.stringify(u))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
      await seleziona(parola, 'con'); await tendina('Colore del testo'); await sleep(300)
      await nelPannello('Blu'); await sleep(300)
      check('colore del testo dalla tavolozza', await js(`[...document.querySelectorAll('.editor-foglio [style*="color"]')].some(e=>/rgb\\(37, 99, 235\\)/.test(e.style.color))`))
      await sleep(900)
      const corpo = modello()?.corpo || ''
      check('il modello salva interlinea, spazi, sottolineatura e colore', /data-interlinea="2"/.test(corpo) && /margin-top:12pt/.test(corpo) && /margin-bottom:0pt/.test(corpo) && /<u style="text-decoration-color:#b91c1c;text-decoration-style:wavy">presente<\/u>/.test(corpo) && /color:#2563eb/.test(corpo), corpo.slice(0, 400))
      check('Documenti: nulla esce dai bordi', (await overflow()).length === 0, JSON.stringify(await overflow()))

      // ---------- intestazione: linea facoltativa ----------
      await clickText('.documenti-form .tabs button', 'Intestazione'); await sleep(400)
      await js(`[...document.querySelectorAll('.modello-blocco label.check')].find(l=>/Linea tra intestazione e testo/.test(l.textContent)).querySelector('input').click()`); await sleep(900)
      check('«Linea tra intestazione e testo» si toglie e resta tolta', modello()?.lineaIntestazione === false)

      // ---------- luogo e data ----------
      await clickText('.documenti-form .tabs button', 'Impaginazione'); await sleep(500)
      await js(`[...document.querySelectorAll('.luogo-data-blocco button')].find(x=>x.textContent.trim()==='Mostra')?.click()`); await sleep(400)
      await js(`(() => { const l=[...document.querySelectorAll('.luogo-data-griglia label')].find(x=>x.textContent.trim().startsWith('Città')); const i=l.parentElement.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Carpi'); i.dispatchEvent(new Event('input',{bubbles:true})) })()`)
      await js(`(() => { const s=document.querySelector('.luogo-data-griglia select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'li'); s.dispatchEvent(new Event('change',{bubbles:true})) })()`)
      await js(`document.querySelector('.foglio-posizioni [aria-label="In basso a sinistra"]').click()`); await sleep(900)
      const esempio = await js(`document.querySelector('.luogo-data-esempio b')?.textContent`)
      const m = modello()
      check('luogo e data: città, forma «lì» e posizione scelte sul foglio, con l’esempio', /^Carpi, lì \d{1,2} \S+ \d{4}$/.test(esempio || '') && m.luogo === 'Carpi' && m.formatoData === 'li' && m.posizioneLuogoData === 'basso-sinistra' && m.mostraLuogoData, JSON.stringify({ esempio, l: m.luogo, f: m.formatoData, p: m.posizioneLuogoData }))
      await js(`document.querySelector('.luogo-data-blocco').scrollIntoView({block:'center'})`)
      await shot('105-3-luogo-data')
      check('Impaginazione: nulla esce dai bordi', (await overflow()).length === 0, JSON.stringify(await overflow()))
      await axe('Documenti › Impaginazione')

      // ---------- attività a tariffa totale e parcella dalle voci ----------
      await clickText('.nav-item', 'Pratiche'); await sleep(500)
      await attendi(() => js(`!!document.querySelector('.pcard')`))
      await js(`[...document.querySelectorAll('.pcard')].find(c=>/Rinaldi/.test(c.textContent)).click()`); await sleep(600)
      await clickText('.tabs button', 'Attività e spese'); await sleep(500)
      await clickText('button', 'Nuova attività'); await sleep(500)
      check('modulo dell’attività: «Tariffa oraria», «Tariffa totale», «Da decidere»', await js(`[...document.querySelector('.modal select[aria-label="Come indicare il compenso"]').options].map(o=>o.textContent).join('|')`) === 'Tariffa oraria|Tariffa totale|Da decidere')
      await setVal('.modal select[aria-label="Come indicare il compenso"]', 'totale'); await sleep(300)
      await scriviCampo('Attività', 'Parere scritto'); await setVal('.modal input[aria-label="Tariffa totale in euro"]', '400'); await sleep(300)
      check('con la tariffa totale il tempo è facoltativo e il valore è l’importo', /Tempo dedicato \(facoltativo\)/.test(await js(`document.querySelector('.modal').innerText`)) && await js(`[...document.querySelectorAll('.modal input[readonly]')].some(i=>/400,00/.test(i.value))`) && !(await js(`[...document.querySelectorAll('.modal-foot .btn-primary')].find(b=>b.textContent==='Salva').disabled`)))
      await shot('105-4-tariffa-totale')
      await axe('attività con tariffa totale')
      await clickText('.modal-foot .btn-primary', 'Salva'); await sleep(800)
      const ora = db.list('ore').find((o) => o.descrizione === 'Parere scritto')
      check('attività salvata a corpo: 400 €, senza tempo', !!ora && ora.tariffa_totale === 400 && ora.minuti === 0, JSON.stringify(ora))
      check('nell’elenco: valore e «a corpo»', /400,00\s*€?\s*· a corpo/.test(await text()))
      await clickText('button', 'Crea parcella dalle voci'); await sleep(900)
      const voci = await js(`[...document.querySelectorAll('.modal input')].map(i=>i.value).join('|')`)
      check('la parcella dalle voci riporta l’attività a corpo: descrizione e 400 €', /Parere scritto/.test(voci) && /400/.test(voci), voci.slice(0, 300))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(500)

      // ---------- rate con l'ultima scadenza ----------
      const oggiS = (() => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` })()
      const tra = (mesi) => { const x = new Date(); x.setMonth(x.getMonth() + mesi); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
      await clickText('.nav-item', 'Pagamenti'); await sleep(500)
      await clickText('.pagamenti-schede .tabs button', 'Da pagare'); await sleep(500)
      await clickText('.btn-primary', 'Nuova voce da pagare'); await sleep(500)
      check('categorie «Rate e finanziamenti» e «Assicurazioni», ogni 2 e ogni 6 mesi', await js(`(() => { const c=[...${campoModale('Categoria')}.options].map(o=>o.textContent), r=[...${campoModale('Si ripete')}.options].map(o=>o.textContent); return c.includes('Rate e finanziamenti') && c.includes('Assicurazioni') && r.includes('Ogni 2 mesi') && r.includes('Ogni 6 mesi') })()`))
      check('«Ultima scadenza» solo per le voci che si ripetono', !(await js(`!!${campoModale('Ultima scadenza')}`)))
      await scriviCampo('Descrizione', 'Rata auto'); await scriviCampo('Importo', '320'); await scriviCampo('Data', oggiS); await scriviCampo('Da pagare entro', oggiS)
      await scriviCampo('Categoria', 'Rate e finanziamenti'); await scriviCampo('Si ripete', 'mensile'); await sleep(300)
      await scriviCampo('Ultima scadenza', tra(2)); await sleep(200)
      await shot('105-5-rata')
      await clickText('.modal .btn-primary', 'Salva'); await sleep(900)
      const rate = db.getDb().prepare("SELECT * FROM costi WHERE descrizione='Rata auto' ORDER BY scadenza").all()
      check('rata salvata con l’ultima scadenza', rate.length >= 1 && rate.every((x) => x.ripeti_fine === tra(2)), JSON.stringify(rate.map((x) => [x.scadenza, x.ripeti_fine])))
      check('in Da pagare: «si ripete ogni mese fino al …»', /si ripete ogni mese fino al/.test(await text()))

      const bad = results.filter((x) => !x.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e, e && e.stack) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message) })
}
module.exports = { attach }
