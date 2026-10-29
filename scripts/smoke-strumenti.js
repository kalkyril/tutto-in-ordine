'use strict'
// Strumenti dall'interfaccia vera: Documenti (modelli, campi, tutti i formati, collegamento alla pratica) e Anonimizza (anonimizzazione,
// correzioni, salvataggi, chiave e ripristino). Avvio: sh scripts/run-smoke.sh <cartella> smoke-strumenti
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (c) => wc.executeJavaScript(c, true)
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-strumenti'); fs.mkdirSync(out, { recursive: true })
  const file = path.join(out, 'file'); fs.rmSync(file, { recursive: true, force: true }); fs.mkdirSync(file, { recursive: true })
  process.env.MNGMNT_TEST_PDF_DIR = file
  const shot = async (n) => { await sleep(350); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } }
  const setVal = (sel, v) => js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; const proto = el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); return true })()`)
  const text = () => js('document.body.innerText')
  const overflow = () => js(`(() => { const r=[]; for (const el of document.querySelectorAll('.content *')) { const b=el.getBoundingClientRect(); if (!b.width||!b.height) continue; const cs=getComputedStyle(el); if (cs.position==='fixed'||el.closest('.anon-testo,.editor-foglio,.a4-frame,pre,textarea')) continue; if (b.right>window.innerWidth+1) r.push(el.tagName+'.'+el.className) } return r.slice(0,5) })()`)
  const sovrapposti = () => js(`(() => { const vis=(e)=>{ let r=e.getBoundingClientRect(); let l=r.left,t=r.top,R=r.right,Bo=r.bottom; for(let p=e.parentElement;p;p=p.parentElement){ const cs=getComputedStyle(p); if(/(auto|scroll|hidden)/.test(cs.overflow+cs.overflowY+cs.overflowX)){ const q=p.getBoundingClientRect(); l=Math.max(l,q.left); t=Math.max(t,q.top); R=Math.min(R,q.right); Bo=Math.min(Bo,q.bottom) } } return R-l>2&&Bo-t>2?{left:l,top:t,right:R,bottom:Bo}:null }; const modali=[...document.querySelectorAll('.modal')]; const radice=modali.length?modali[modali.length-1]:document.querySelector('.content'); const els=[...radice.querySelectorAll('button,input,select,textarea,h1,h2,h3,legend')].filter(e=>e.closest('.modal')===(modali.length?radice:null)||!modali.length).filter(e=>{const b=e.getBoundingClientRect(); const cs=getComputedStyle(e); return b.width>0&&b.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&e.type!=='radio'&&e.type!=='checkbox'&&!e.closest('[aria-hidden=true],.anon-testo,.a4-frame,.editor-foglio,.sr-only')}); const r=[]; for(let i=0;i<els.length;i++) for(let j=i+1;j<els.length;j++){ const a=els[i],b=els[j]; if(a.contains(b)||b.contains(a)) continue; const A=vis(a),B=vis(b); if(!A||!B) continue; const w=Math.min(A.right,B.right)-Math.max(A.left,B.left), h=Math.min(A.bottom,B.bottom)-Math.max(A.top,B.top); if(w>2&&h>2) r.push((a.getAttribute('aria-label')||a.textContent||a.tagName).trim().slice(0,24)+' × '+(b.getAttribute('aria-label')||b.textContent||b.tagName).trim().slice(0,24)) } return r.slice(0,6) })()`)
  const fuori = () => js(`(() => { const r=[]; const c=document.querySelector('.content'); if (c && c.scrollWidth > c.clientWidth + 1) { const cr=c.getBoundingClientRect(); const lungo=[...c.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>cr.right+1).map(e=>e.tagName+'.'+String(e.className).slice(0,40)).slice(0,4); r.push('scorrimento orizzontale '+c.scrollWidth+'/'+c.clientWidth+': '+lungo.join(' ')+' | '+[...c.querySelectorAll('*')].map(e=>[e.tagName+'.'+String(e.className).slice(0,30), Math.round(e.getBoundingClientRect().right), e.scrollWidth, e.clientWidth]).filter(x=>x[2]>x[3]+1).slice(0,5).map(x=>x.join(':')).join(' ')) } const modali=[...document.querySelectorAll('.modal')], cima=modali[modali.length-1]; for (const el of (cima ? cima.querySelectorAll('*') : document.querySelectorAll('.content *'))) { if (cima && el.closest('.modal')!==cima) continue; const b=el.getBoundingClientRect(); if (!b.width||!b.height||el.closest('.anon-testo,.editor-foglio,.a4-frame,pre,textarea,.anon-esito')) continue; const box=cima ? cima.getBoundingClientRect() : {left:0,right:window.innerWidth}; if (b.right>box.right+1||b.left<box.left-1) r.push(el.tagName+'.'+String(el.className).slice(0,30)) } return r.slice(0,5) })()`)
  const DIMENSIONI = [[980, 640], [1280, 800], [1680, 1050]]
  const layout = async (nome) => {
    for (const [w, h] of DIMENSIONI) {
      getWindow().setSize(w, h); await sleep(600)
      const a = await fuori(), b = await sovrapposti()
      check(`layout ${nome} a ${w}×${h}: niente fuori dai bordi né sovrapposto`, !a.length && !b.length, JSON.stringify({ fuori: a, sovrapposti: b }))
      if (w === 980) await shot(`layout-${nome.replace(/\W+/g, '-')}-${w}`)
      const nav = await js(`(() => { const l=document.querySelector('.nav-list'); if (!l) return true; const b=l.getBoundingClientRect(); return [...l.querySelectorAll('.nav-item')].every(i => { const r=i.getBoundingClientRect(); return r.top >= b.top - 1 && r.bottom <= b.bottom + 1 }) })()`)
      check(`barra laterale a ${w}×${h}: tutte le voci visibili, compresi gli Strumenti`, nav)
    }
    getWindow().setSize(1280, 800); await sleep(400)
  }
  const leggiDocx = (p) => { const docx = require('../electron/docx'); const d = docx.apri(fs.readFileSync(p)); return d.nomi.filter((n) => docx.PARTI_TESTO.test(n)).map((n) => docx.testoDi(d.testo(n))).join('\n') }

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, profilo: 'avvocato', studio: { nome: 'Studio Legale Prova', titolare: 'Avv. Anna Prova', indirizzo: 'Via Emilia 1', cap_citta: '41121 Modena (MO)', email: 'studio@prova.it', piva: '12345678903', cf: '', pec: '', telefono: '', iban: '', intestazione: '', domicilio_fiscale: '', banca: '' } })
      const cliente = db.save('anagrafica', { denominazione: 'Ezio Zanichelli', ruolo: 'cliente', tipo: 'persona', codice_fiscale: 'ZNCZEI70A01F257X', indirizzo: 'Via Roma 3', cap: '41012', citta: 'Carpi', provincia: 'MO' })
      const pratica = db.save('pratiche', { numero: '2026/007', titolo: 'Zanichelli c. Acme', cliente_id: cliente.id, stato: 'Aperta', colore: '#3b82f6', rg: '987/2026', autorita: 'Tribunale di Modena' })
      await js('location.reload()'); await sleep(1500)
      // sotto carico il primo caricamento può arrivare prima delle impostazioni: si riprova finché il benvenuto non sparisce
      for (let i = 0; i < 3 && await js(`/Benvenuto in TIO/.test(document.body.innerText)`); i++) { db.setSettings({ onboarding_fatto: true }); await js('location.reload()'); await sleep(1500) }

      // ---------- Documenti ----------
      check('barra laterale: gruppo Strumenti con Documenti e Anonimizza', await js(`(() => { const g=[...document.querySelectorAll('.nav-group')].find(x=>x.querySelector('.nav-section')?.textContent==='Strumenti'); return !!g && /Documenti/.test(g.textContent) && /Anonimizza/.test(g.textContent) })()`))
      await clickText('.nav-item', 'Documenti'); await sleep(500)
      await sleep(600)
      const predefiniti = (db.getSettings().modelli_documento || []).map((m) => m.nome)
      check('alla prima apertura ci sono già i modelli predefiniti del profilo, salvati', ['Lettera', 'Preventivo', 'Diffida e messa in mora', 'Procura alle liti', 'Incarico professionale', 'Verbale', 'Relazione', 'Informativa privacy'].every((n) => predefiniti.includes(n)) && (db.getSettings().modelli_documento || []).every((m) => m.predefinito), JSON.stringify(predefiniti))
      check('elenco dei modelli visibile e primo modello aperto', await js(`document.querySelectorAll('.documenti-voce').length`) >= 7 && await js(`document.querySelector('.documenti-titolo')?.value`) === 'Lettera')
      await shot('strumenti-1-documenti-predefiniti')
      check('modello «Lettera» pronto con il suo testo', (db.getSettings().modelli_documento || []).some((m) => m.tipo === 'Lettera' && /Gentile cliente/.test(m.corpo)))
      check('intestazione presa dai dati dello studio', /Studio Legale Prova/.test(JSON.stringify(db.getSettings().modelli_documento[0].intestazione)))
      // testo con un campo libero, formattazione e un campo dell'archivio
      await js(`(() => { const f=document.querySelector('.editor-foglio'); f.focus(); const r=document.createRange(); r.selectNodeContents(f); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('insertParagraph'); document.execCommand('bold'); document.execCommand('insertText', false, 'Importo dovuto: {{importo}}'); document.execCommand('bold'); return true })()`)
      await sleep(1200)
      const corpo = db.getSettings().modelli_documento[0].corpo
      check('l’editor salva testo, grassetto e campi liberi', /<strong>Importo dovuto: \{\{importo\}\}<\/strong>/.test(corpo), corpo.slice(-160))
      await sleep(1500)
      check('anteprima A4 generata', await js(`!!document.querySelector('.a4-frame img')`))
      await shot('strumenti-2-documenti-editor')
      check('Documenti: nulla esce dai bordi', (await overflow()).length === 0, JSON.stringify(await overflow()))

      await clickText('.btn-primary', 'Crea documento'); await sleep(600)
      await setVal('.modal select', String(pratica.id)); await sleep(500)
      check('scegliendo la pratica il destinatario diventa il cliente', await js(`[...document.querySelectorAll('.modal select')][1].value`) === String(cliente.id))
      check('i campi mancanti vengono chiesti', /Campi da completare/.test(await text()) && /importo/.test(await text()))
      await js(`(() => { const i=[...document.querySelectorAll('.crea-campi input')][0]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'€ 1.250,00'); i.dispatchEvent(new Event('input',{bubbles:true})) })()`)
      await shot('strumenti-3-crea-documento')
      const formati = ['docx', 'pdf', 'odt', 'rtf', 'html', 'md', 'txt']
      for (const f of formati) {
        if (!(await js(`!!document.querySelector('.modal')`))) { await clickText('.btn-primary', 'Crea documento'); await sleep(500); await setVal('.modal select', String(pratica.id)); await sleep(400); await js(`(() => { const i=[...document.querySelectorAll('.crea-campi input')][0]; if(!i) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'€ 1.250,00'); i.dispatchEvent(new Event('input',{bubbles:true})) })()`) }
        await js(`document.querySelector('.crea-formati input[value="${f}"]').click()`); await sleep(150)
        await clickText('.modal .btn-primary', 'Crea e salva'); await sleep(f === 'pdf' ? 2500 : 900)
      }
      const creati = fs.readdirSync(file)
      check('documento creato in tutti i formati', formati.every((f) => creati.some((n) => n.endsWith('.' + f))), creati.join(', '))
      const docxFile = creati.find((n) => n.endsWith('.docx'))
      const t = docxFile ? leggiDocx(path.join(file, docxFile)) : ''
      check('Word: destinatario, indirizzo, campo libero e intestazione compilati', /Ezio Zanichelli/.test(t) && /41012 Carpi \(MO\)/.test(t) && /€ 1\.250,00/.test(t) && /Studio Legale Prova/.test(t), t.slice(0, 300))
      check('PDF valido', (() => { const p = creati.find((n) => n.endsWith('.pdf')); return p && fs.readFileSync(path.join(file, p)).subarray(0, 5).toString() === '%PDF-' })())
      const collegati = db.list('documenti', { pratica_id: pratica.id })
      check('i documenti creati sono collegati alla pratica, categoria Documenti', collegati.length === formati.length && collegati.every((d) => d.categoria === 'Documenti'), JSON.stringify(collegati.map((d) => [d.nome, d.categoria])))

      // ---------- disposizione del testo ----------
      await clickText('.tabs button', 'Contenuto'); await sleep(300)
      // due colonne solo per due paragrafi selezionati
      await js(`(() => { const f=document.querySelector('.editor-foglio'); f.focus(); const ps=[...f.querySelectorAll('p')]; const a=ps.find(p=>p.textContent.startsWith('Gentile')); const b=ps.find(p=>p.textContent.startsWith('con la presente')); const r=document.createRange(); r.setStart(a.firstChild,0); r.setEnd(b.firstChild,3); const s=getSelection(); s.removeAllRanges(); s.addRange(r); return true })()`)
      await js(`document.querySelector('.editor-colonne').click()`); await sleep(1300)
      const corpoSez = db.getSettings().modelli_documento[0].corpo
      check('i paragrafi selezionati diventano una sezione a due colonne', /<div data-colonne="2"><p>Gentile cliente,<\/p><p>con la presente …<\/p><\/div>/.test(corpoSez), corpoSez.slice(0, 400))
      check('l’editor mostra la sezione su due colonne e il pulsante attivo', await js(`(() => { const s=document.querySelector('.editor-foglio [data-colonne]'); return !!s && getComputedStyle(s).columnCount==='2' })()`))
      await shot('strumenti-2a-sezione-colonne')
      await clickText('.btn-primary', 'Crea documento'); await sleep(500)
      await setVal('.modal select', String(pratica.id)); await sleep(400)
      await js(`document.querySelector('.crea-formati input[value="docx"]').click()`)
      await setVal('.crea-documento > .field input', 'Lettera sezione'); await sleep(200)
      await clickText('.modal .btn-primary', 'Crea e salva'); await sleep(900)
      const sezXml = fs.existsSync(path.join(file, 'Lettera sezione.docx')) ? require('../electron/zip').leggiZip(fs.readFileSync(path.join(file, 'Lettera sezione.docx'))).leggi('word/document.xml').toString() : ''
      check('Word: solo quella parte su due colonne, in una sezione continua', (sezXml.match(/<w:cols w:num="2"/g) || []).length === 1 && /<w:type w:val="continuous"\/>/.test(sezXml) && (sezXml.match(/<w:sectPr>/g) || []).length === 3)
      await js(`document.querySelector('.documenti-disposizione [aria-label="Testo giustificato"]').click()`); await sleep(200)
      await clickText('.documenti-disposizione button', 'Tutto su due colonne'); await sleep(1200)
      const mod = db.getSettings().modelli_documento[0]
      check('disposizione giustificata su due colonne salvata', mod.allineamento === 'giustificato' && mod.colonne === 2)
      check('l’editor mostra subito le due colonne e il testo giustificato', await js(`(() => { const f=document.querySelector('.editor-foglio'); const cs=getComputedStyle(f); return cs.columnCount==='2' && cs.textAlign==='justify' })()`))
      await sleep(1200); await shot('strumenti-2b-due-colonne')
      await layout('Documenti editor')
      await clickText('.btn-primary', 'Crea documento'); await sleep(500)
      await setVal('.modal select', String(pratica.id)); await sleep(400)
      await layout('Crea documento')
      await js(fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8') + '; true')
      const violModal = await js(`axe.run(document.querySelector('.modal'), { resultTypes: ['violations'] }).then(r => r.violations.map(v => v.id + ':' + v.nodes.map(n => n.target.join(' ') + ' ' + (n.any[0]?.message || '')).join(' ; ')))`)
      check('accessibilità (axe-core) della finestra «Crea documento»', violModal.length === 0, JSON.stringify(violModal))
      await js(`document.querySelector('.crea-formati input[value="docx"]').click()`)
      await setVal('.crea-documento > .field input', 'Lettera due colonne'); await sleep(200)
      await clickText('.modal .btn-primary', 'Crea e salva'); await sleep(900)
      const due = path.join(file, 'Lettera due colonne.docx')
      const dueXml = fs.existsSync(due) ? require('../electron/zip').leggiZip(fs.readFileSync(due)).leggi('word/document.xml').toString() : ''
      check('Word esportato su due colonne e giustificato', dueXml.includes('<w:cols w:num="2"') && dueXml.includes('w:val="both"'))
      if (await js(`!!document.querySelector('.modal')`)) { await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(300) }

      // ---------- sincronizzazione ----------
      await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Documenti'); await sleep(700)
      check('dopo il riavvio il modello c’è ancora, con testo e disposizione', /Importo dovuto/.test(await js(`document.querySelector('.editor-foglio')?.textContent || ''`)) && await js(`getComputedStyle(document.querySelector('.editor-foglio')).columnCount === '2'`))
      await js(`[...document.querySelectorAll('.pcard h2, .nav-item')].find(x=>x.textContent.includes('Pratiche')).click()`); await sleep(500)
      await js(`[...document.querySelectorAll('.pcard h2')].find(h=>h.textContent.includes('Zanichelli')).click()`); await sleep(600)
      await clickText('.tabs button', 'Documenti'); await sleep(600)
      const nelTab = await js(`document.querySelector('.content').innerText`)
      check('nella pratica compaiono i documenti creati', (nelTab.match(/Lettera - Ezio Zanichelli/g) || []).length >= 7, (nelTab.match(/Lettera[^\n]*/g) || []).join(' | '))
      const docxDoc = db.list('documenti', { pratica_id: pratica.id }).find((d) => d.nome === 'Lettera - Ezio Zanichelli.docx')
      await js(`window.mngmnt.invoke('documenti:indicizza', ${docxDoc.id}, false)`)
      const hits = await js(`window.mngmnt.invoke('db:search', 'Importo dovuto')`)
      check('il testo dei documenti creati si trova con la ricerca', hits.some((h) => h.kind === 'documento' && h.pratica_id === pratica.id), JSON.stringify(hits.map((h) => h.title)))
      // il file viene spostato in un'altra cartella: «Sincronizza documenti» lo ritrova e aggiorna il collegamento
      const altrove = path.join(file, 'archivio'); fs.mkdirSync(altrove, { recursive: true })
      const nuovoPercorso = path.join(altrove, docxDoc.nome); fs.renameSync(path.join(file, docxDoc.nome), nuovoPercorso)
      db.setSettings({ cartelle_ricerca: [file] })
      const stato = await js(`window.mngmnt.invoke('documenti:stato', ${pratica.id})`)
      check('il file spostato risulta mancante', stato[docxDoc.id] === 'mancante', JSON.stringify(stato))
      const rap = await js(`window.mngmnt.invoke('documenti:sincronizza', ${pratica.id})`)
      check('«Sincronizza documenti» ritrova il file spostato', rap.ritrovati.some((x) => x.id === docxDoc.id) && db.get('documenti', docxDoc.id).percorso === nuovoPercorso, JSON.stringify(rap))

      // ---------- rinomina e documento dalla pratica ----------
      await clickText('.nav-item', 'Anonimizza'); await sleep(200)
      await js(`[...document.querySelectorAll('.nav-item')].find(b=>b.textContent.trim()==='Documenti').click()`); await sleep(600)
      await js(`[...document.querySelectorAll('.documenti-voce')].find(b=>b.textContent.trim()==='Lettera').click()`); await sleep(300)
      await setVal('.documenti-titolo', 'Lettera al cliente'); await sleep(1200)
      check('il modello si rinomina a piacere: nome salvato e aggiornato nell’elenco', (db.getSettings().modelli_documento || []).some((m) => m.nome === 'Lettera al cliente') && await js(`[...document.querySelectorAll('.documenti-voce span')].some(b=>b.firstChild?.textContent==='Lettera al cliente')`))
      await clickText('.nav-item', 'Pratiche'); await sleep(500)
      await js(`[...document.querySelectorAll('.pcard h2')].find(h=>h.textContent.includes('Zanichelli')).click()`); await sleep(600)
      await clickText('.tabs button', 'Documenti'); await sleep(500)
      await clickText('button', 'Da modello'); await sleep(500)
      check('dalla pratica: scelta tra i modelli, con quello rinominato', /Nuovo documento da un modello/.test(await text()) && /Lettera al cliente/.test(await text()) && /Procura alle liti/.test(await text()))
      await layout('Scegli modello')
      await clickText('.modal .documenti-tipo', 'Lettera al cliente'); await sleep(500)
      check('la pratica e il suo cliente sono già scelti', await js(`[...document.querySelectorAll('.modal select')][0].value`) === String(pratica.id) && await js(`[...document.querySelectorAll('.modal select')][1].value`) === String(cliente.id))
      await js(`(() => { for (const i of document.querySelectorAll('.crea-campi input')) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'€ 300,00'); i.dispatchEvent(new Event('input',{bubbles:true})) } })()`)
      await js(`document.querySelector('.crea-formati input[value="docx"]').click()`); await sleep(100)
      await clickText('.modal .btn-primary', 'Crea e salva'); await sleep(1000)
      const dallaPratica = 'Lettera al cliente - Ezio Zanichelli.docx'
      check('documento creato dalla pratica: salvato e collegato ai suoi documenti', fs.existsSync(path.join(file, dallaPratica)) && db.list('documenti', { pratica_id: pratica.id }).some((d) => d.nome === dallaPratica) && /Lettera al cliente - Ezio Zanichelli/.test(await js(`document.querySelector('.content').innerText`)))

      // ---------- Anonimizza ----------
      await clickText('.nav-item', 'Anonimizza'); await sleep(500)
      await shot('strumenti-4-anon-inizio')
      await layout('Anonimizza inizio')
      const atto = 'Il sottoscritto Ezio Zanichelli, nato a Carpi (MO) il 01/01/1970, C.F. ZNCZEI70A01F257X, residente in Via Roma 3, conferisce incarico all’Avv. Giulia Bianchi (PEC giulia.bianchi@pec.it) per la causa R.G. 987/2026 contro Acme S.r.l., IBAN IT60 X054 2811 1010 0000 0123 456. Zanichelli chiede inoltre un parere al Foro di Modena.'
      await setVal('.anon-incolla textarea', atto); await sleep(200)
      await clickText('.anon-incolla .btn-primary', 'Anonimizza'); await sleep(900)
      const marcati = await js(`[...document.querySelectorAll('.anon-testo .pii')].map(b=>b.textContent+'='+b.dataset.ph)`)
      check('nomi, luoghi, codici, recapiti e numeri riconosciuti', ['Ezio Zanichelli', 'Carpi', 'ZNCZEI70A01F257X', 'Via Roma 3', 'Giulia Bianchi', 'giulia.bianchi@pec.it', 'R.G. 987/2026', 'Acme S.r.l.', 'IT60 X054 2811 1010 0000 0123 456'].every((v) => marcati.some((m) => m.startsWith(v + '='))), JSON.stringify(marcati))
      check('il cognome da solo ha lo stesso segnaposto della persona', new Set(marcati.filter((m) => /Zanichelli/.test(m)).map((m) => m.split('=')[1])).size === 1)
      await shot('strumenti-5-anon-analisi')
      check('Anonimizza: nulla esce dai bordi', (await overflow()).length === 0, JSON.stringify(await overflow()))
      await layout('Anonimizza analisi')
      // lascia in chiaro un dato con il clic, poi anonimizza una parola selezionata
      await js(`[...document.querySelectorAll('.anon-testo .pii')].find(b=>b.textContent==='Carpi').click()`); await sleep(300)
      await clickText('.anon-pop button', 'Lascia in chiaro'); await sleep(500)
      check('«Lascia in chiaro» toglie il dato da tutto il testo', !(await js(`[...document.querySelectorAll('.anon-testo .pii')].some(b=>b.textContent==='Carpi')`)))
      await js(`(() => { const s=[...document.querySelectorAll('.anon-testo pre span')].find(x=>x.textContent.includes('Foro di Modena')); const n=s.firstChild; const i=n.textContent.indexOf('Foro di Modena'); const r=document.createRange(); r.setStart(n,i); r.setEnd(n,i+'Foro di Modena'.length); const g=getSelection(); g.removeAllRanges(); g.addRange(r); s.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})) })()`); await sleep(300)
      await setVal('.anon-pop select', 'ORG'); await clickText('.anon-pop .btn-primary', 'Anonimizza'); await sleep(500)
      check('una selezione si anonimizza ovunque e compare tra le correzioni', await js(`[...document.querySelectorAll('.anon-testo .pii.manuale')].some(b=>b.textContent==='Foro di Modena')`) && /Le tue correzioni/.test(await text()))
      // salvataggi
      await setVal('.anon-salva select', 'docx'); await clickText('.anon-salva button', 'Salva'); await sleep(900)
      await setVal('.anon-salva select', 'txt'); await clickText('.anon-salva button', 'Salva'); await sleep(700)
      const anon = fs.readdirSync(file).filter((n) => /anonimizzato/.test(n))
      const tAnon = anon.find((n) => n.endsWith('.txt')) ? fs.readFileSync(path.join(file, anon.find((n) => n.endsWith('.txt'))), 'utf8') : ''
      check('testo anonimizzato salvato senza dati personali', anon.length === 2 && /\[FULLNAME_1\]/.test(tAnon) && !/Zanichelli|ZNCZEI|Bianchi|IT60/.test(tAnon) && /Carpi/.test(tAnon), tAnon.slice(0, 200))
      const tDocx = anon.find((n) => n.endsWith('.docx')) ? leggiDocx(path.join(file, anon.find((n) => n.endsWith('.docx')))) : ''
      check('Word anonimizzato', /\[ORG_\d\]/.test(tDocx) && !/Zanichelli/.test(tDocx))
      await clickText('.anon-azioni button', 'Salva la chiave'); await sleep(400); await clickText('.modal .btn-primary, .confirm .btn-primary, [role=dialog] .btn-primary', 'Salva la chiave'); await sleep(600)
      const chiave = fs.readdirSync(file).find((n) => /chiave di ripristino/.test(n))
      check('chiave di ripristino salvata con i valori originali', chiave && /Ezio Zanichelli/.test(fs.readFileSync(path.join(file, chiave), 'utf8')))
      // ripristino di una risposta dell'IA (segnaposto anche senza parentesi)
      await clickText('.segmented button', 'Ripristina'); await sleep(400)
      await setVal('.anon-ripristino textarea', 'Gentile FULLNAME_1, ho esaminato la posizione di [ORG_1] e il codice [CF_1].'); await sleep(400)
      const esito = await js(`document.querySelector('.anon-esito')?.textContent || ''`)
      check('ripristino della risposta dell’IA con i dati veri', /Gentile Ezio Zanichelli/.test(esito) && /ZNCZEI70A01F257X/.test(esito), esito)
      await shot('strumenti-6-anon-ripristino')
      await layout('Anonimizza ripristino')
      process.env.MNGMNT_TEST_CHIAVE = path.join(file, chiave || 'x')
      await clickText('.anon-ripristino button', 'Apri una chiave'); await sleep(500)
      check('la chiave salvata si riapre', /chiave di ripristino/.test(await text()))
      // la sessione resta passando ad altre sezioni, ma non dopo il blocco
      await clickText('.nav-item', 'Agenda'); await sleep(300); await clickText('.nav-item', 'Anonimizza'); await sleep(400); await clickText('.segmented button', 'Un documento'); await sleep(300)
      check('tornando su Anonimizza il documento è ancora aperto', await js(`!!document.querySelector('.anon-testo')`))
      // un Word trascinato: la copia anonimizzata mantiene impaginazione, intestazione e piè di pagina del file originale
      await js(`[...document.querySelectorAll('.anon-barra button')].find(b=>b.getAttribute('aria-label')==='Chiudi il documento').click()`); await sleep(400)
      await js(`(() => { const z=document.querySelector('.anon-drop'); const dt=new DataTransfer(); dt.setData('text/x-mngmnt-test-path', ${JSON.stringify(nuovoPercorso)}); dt.items.add(new File(['x'],'x.docx')); for (const t of ['dragenter','dragover','drop']) z.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:dt})) })()`)
      await sleep(1500)
      check('Word trascinato e aperto in Anonimizza', await js(`!!document.querySelector('.anon-testo') && document.querySelector('.anon-nome b')?.textContent.endsWith('.docx')`))
      check('per un Word si offre il salvataggio con la stessa impaginazione', await js(`document.querySelector('.anon-salva select').value`) === 'docx-originale')
      await clickText('.anon-salva button', 'Salva'); await sleep(1000)
      const orig = fs.readdirSync(file).find((n) => /Ezio Zanichelli anonimizzato\.docx$/.test(n))
      const tOrig = orig ? leggiDocx(path.join(file, orig)) : ''
      check('copia Word anonimizzata: corpo e intestazione senza dati personali', orig && !/Zanichelli|Studio Legale Prova|41012/.test(tOrig) && /\[FULLNAME_\d\]/.test(tOrig) && /Importo dovuto/.test(tOrig), tOrig.slice(0, 300))
      const origXml = orig ? require('../electron/zip').leggiZip(fs.readFileSync(path.join(file, orig))) : null
      check('la copia conserva struttura, intestazione e piè di pagina dell’originale', origXml && ['word/header1.xml', 'word/footer1.xml', 'word/media/logo.png', 'word/numbering.xml'].filter((n) => require('../electron/zip').leggiZip(fs.readFileSync(nuovoPercorso)).nomi.includes(n)).every((n) => origXml.nomi.includes(n)))
      // accessibilità della sezione
      const axeSrc = fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8'); await js(axeSrc + '; true')
      const viol = await js(`axe.run(document.querySelector('.content'), { resultTypes: ['violations'] }).then(r => r.violations.map(v => v.id + ':' + v.nodes.length))`)
      check('accessibilità (axe-core) di Anonimizza', viol.length === 0, JSON.stringify(viol))
      await clickText('.nav-item', 'Documenti'); await sleep(800)
      const viol2 = await js(`axe.run(document.querySelector('.content'), { resultTypes: ['violations'] }).then(r => r.violations.map(v => v.id + ':' + v.nodes.length))`)
      check('accessibilità (axe-core) di Documenti', viol2.length === 0, JSON.stringify(viol2))
      // tema scuro
      db.setSettings({ tema: 'scuro' }); await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Anonimizza'); await sleep(700)
      await shot('strumenti-7-anon-scuro')

      // ---------- Anonimizza su un PDF: copia oscurata con la stessa impaginazione ----------
      const pdfLettera = path.join(file, 'Lettera - Ezio Zanichelli.pdf')
      if (await js(`!!document.querySelector('.anon-barra')`)) { await js(`[...document.querySelectorAll('.anon-barra button')].find(b=>b.getAttribute('aria-label')==='Chiudi il documento').click()`); await sleep(300) }
      await clickText('.nav-item', 'Anonimizza'); await sleep(400); await clickText('.segmented button', 'Un documento'); await sleep(300)
      if (await js(`!!document.querySelector('.anon-barra')`)) { await js(`[...document.querySelectorAll('.anon-barra button')].find(b=>b.getAttribute('aria-label')==='Chiudi il documento').click()`); await sleep(300) }
      await js(`(() => { const z=document.querySelector('.anon-drop'); const dt=new DataTransfer(); dt.setData('text/x-mngmnt-test-path', ${JSON.stringify(pdfLettera)}); dt.items.add(new File(['x'],'x.pdf')); for (const t of ['dragenter','dragover','drop']) z.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:dt})) })()`)
      await sleep(2500)
      check('PDF aperto in Anonimizza con la proposta «PDF, stessa impaginazione»', await js(`document.querySelector('.anon-salva select')?.value`) === 'pdf-originale')
      await clickText('.anon-salva button', 'Salva'); await sleep(3500)
      const oscurato = fs.readdirSync(file).find((n) => /^Lettera - Ezio Zanichelli anonimizzato\.pdf$/.test(n))
      const { Worker } = require('node:worker_threads')
      const mappaPdf = (f) => new Promise((res, rej) => { const w = new Worker(path.join(__dirname, '..', 'electron', 'pdf-oscura-worker.js'), { workerData: { azione: 'mappa', file: f } }); w.once('message', (m) => { w.terminate(); m.error ? rej(new Error(m.error)) : res(m) }); w.once('error', rej) })
      const prima = await mappaPdf(pdfLettera), dopo = oscurato ? await mappaPdf(path.join(file, oscurato)) : null
      check('PDF oscurato: stesse pagine, nessun testo recuperabile', !!dopo && dopo.pagine.length === prima.pagine.length && !dopo.testo.trim() && Math.abs(dopo.pagine[0].larghezza - prima.pagine[0].larghezza) < 0.5, oscurato || 'file mancante')
      await shot('strumenti-8-anon-pdf')

      // ---------- fattura elettronica XML dall'editor del documento ----------
      const fattura = db.saveParcella({ tipo: 'parcella', data: '2026-10-28', cliente_id: cliente.id, pratica_id: pratica.id, stato: 'emessa', oggetto: 'Assistenza stragiudiziale', sg_perc: 15, cpa_perc: 4, iva_perc: 22, rit_perc: 20, bollo: 0,
        compensi: 1000, spese_generali: 150, cpa: 46, imponibile: 1196, iva: 263.12, spese_esenti: 98, ritenuta: 230, totale: 1557.12, netto: 1327.12,
        voci: [{ tipo: 'compenso', descrizione: 'Fase di studio', quantita: 1, importo: 1000 }, { tipo: 'spesa_esente', descrizione: 'Contributo unificato', quantita: 1, importo: 98 }] })
      await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Parcelle'); await sleep(700)
      await js(`[...document.querySelectorAll('tr, .row-item')].find(r=>r.textContent.includes(${JSON.stringify(fattura.numero)}))?.click()`); await sleep(800)
      await clickText('.modal button', 'Fattura elettronica'); await sleep(1500)
      check('finestra della fattura elettronica: dati completi e nome del file', /Dati completi/.test(await text()) && /IT12345678903_/.test(await text()), (await js(`document.querySelector('.fattura-xml-esito')?.innerText || ''`)).slice(0, 300))
      await layout('Fattura elettronica')
      await js(fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8') + '; true')
      const violXml = await js(`axe.run([...document.querySelectorAll('.modal')].pop(), { resultTypes: ['violations'] }).then(r => r.violations.map(v => v.id + ':' + v.nodes.map(n => n.target.join(' ')).join(' ; ')))`)
      check('accessibilità (axe-core) della finestra della fattura elettronica', violXml.length === 0, JSON.stringify(violXml))
      await shot('strumenti-9-fattura-xml')
      await clickText('.modal .btn-primary', 'Salva XML'); await sleep(1200)
      const xmlFile = fs.readdirSync(file).find((n) => /^IT12345678903_\w{5}\.xml$/.test(n))
      let valido = false
      if (xmlFile) { try { require('node:child_process').execFileSync('xmllint', ['--noout', '--nonet', '--schema', path.join(__dirname, 'fixtures', 'fatturapa', 'Schema_VFPR12_v1.2.3.xsd'), path.join(file, xmlFile)], { stdio: 'pipe' }); valido = true } catch (e) { console.log(String(e.stderr)) } }
      check('XML salvato, valido per lo schema FatturaPA 1.2.3 e collegato alla pratica', valido && db.list('documenti', { pratica_id: pratica.id }).some((d) => d.nome === xmlFile), xmlFile || 'file mancante')
      check('codice destinatario e PEC ricordati per il cliente', db.getSettings().fatturapa_destinatari?.[cliente.id] !== undefined)

      // ---------- nota di credito (TD04) ----------
      for (let i = 0; i < 3 && await js(`!!document.querySelector('.modal')`); i++) { await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(300) }
      await js(`[...document.querySelectorAll('tr, .row-item')].find(r=>r.textContent.includes(${JSON.stringify(fattura.numero)}))?.click()`); await sleep(800)
      await clickText('.modal button', 'Nota di credito'); await sleep(400)
      await clickText('.modal .btn-primary, .confirm .btn-primary, [role=dialog] .btn-primary', 'Crea la nota di credito'); await sleep(900)
      const nc = db.list('parcelle').find((x) => x.tipo === 'nota_credito')
      check('nota di credito creata: numero NC, stessi importi, fattura «stornata»', nc && /^NC 1\/\d{4}$/.test(nc.numero) && nc.totale === 1557.12 && db.get('parcelle', fattura.id).stato === 'stornata', JSON.stringify(nc && [nc.numero, nc.totale]))
      await js(`[...document.querySelectorAll('tr, .row-item')].find(r=>r.textContent.includes(${JSON.stringify(nc?.numero || 'NC')}))?.click()`); await sleep(800)
      await clickText('.modal button', 'Fattura elettronica'); await sleep(1500)
      check('XML della nota: tipo TD04 fisso', await js(`[...document.querySelectorAll('.modal select')].some(x=>x.value==='TD04' && x.disabled)`) && /Dati completi/.test(await text()))
      await clickText('.modal .btn-primary', 'Salva XML'); await sleep(1200)
      const xmlNc = fs.readdirSync(file).filter((n) => /^IT12345678903_\w{5}\.xml$/.test(n)).map((n) => fs.readFileSync(path.join(file, n), 'utf8')).find((x) => /TD04/.test(x))
      let ncValido = false
      if (xmlNc) { const f2 = path.join(out, 'nc.xml'); fs.writeFileSync(f2, xmlNc); try { require('node:child_process').execFileSync('xmllint', ['--noout', '--nonet', '--schema', path.join(__dirname, 'fixtures', 'fatturapa', 'Schema_VFPR12_v1.2.3.xsd'), f2], { stdio: 'pipe' }); ncValido = true } catch (e) { console.log(String(e.stderr)) } }
      check('XML TD04 valido per lo schema e collegato alla fattura stornata', ncValido && /<DatiFattureCollegate><IdDocumento>1\/2026<\/IdDocumento>/.test(xmlNc || ''))
      for (let i = 0; i < 3 && await js(`!!document.querySelector('.modal')`); i++) { await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(300) }

      // ---------- scadenze fiscali ricorrenti ----------
      await clickText('.segmented button', 'Attività ricorrenti'); await sleep(500)
      await clickText('button', 'Scadenze fiscali'); await sleep(500)
      check('scadenze fiscali dello studio legale: Cassa Forense e IVA, niente INPS artigiani', /Cassa Forense: contributi minimi/.test(await text()) && /IVA trimestrale/.test(await text()) && !/artigiani e commercianti/.test(await text()))
      await layout('Scadenze fiscali')
      await clickText('.modal .btn-primary', 'Aggiungi'); await sleep(1200)
      const ric = db.getDb().prepare("SELECT titolo, frequenza, prossima FROM ricorrenze WHERE titolo LIKE 'Fisco:%'").all()
      check('scadenze aggiunte come attività ricorrenti con la prima data futura', ric.length >= 10 && ric.every((r) => r.prossima >= new Date().toISOString().slice(0, 10)), String(ric.length))
      await clickText('button', 'Scadenze fiscali'); await sleep(500)
      check('riaprendo, le scadenze già aggiunte non si duplicano', /già presente/.test(await text()) && /Nessuna scadenza nuova/.test(await js(`document.querySelector('.modal .btn-primary')?.textContent || ''`)))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(300)

      // ---------- modello Word importato ----------
      const carta = path.join(out, 'Carta intestata.docx')
      fs.writeFileSync(carta, require('../electron/documento').genera('docx', { titolo: 'Carta', intestazione: [{ testo: '{{studio.nome}} – carta intestata', dimensione: 'grande', grassetto: true }], footer: [{ testo: 'P.IVA {{studio.piva}}', dimensione: 'piccola' }], corpo: [{ tipo: 'p', runs: [{ t: 'Spett.le ' }, { t: '{{destina', b: true }, { t: 'tario.nome}}' }] }, { tipo: 'p', runs: [{ t: 'Saldo dovuto: {{importo}}' }] }] }))
      process.env.MNGMNT_TEST_WORD = carta
      await js(`[...document.querySelectorAll('.nav-item')].find(b=>b.textContent.trim()==='Documenti').click()`); await sleep(600)
      await clickText('button', 'Importa da Word'); await sleep(1200)
      check('modello Word importato: nome dal file e campi trovati, anche spezzati', await js(`document.querySelector('.documenti-titolo')?.value`) === 'Carta intestata' && /destinatario\.nome/.test(await js(`document.querySelector('.campi-word')?.textContent || ''`)) && /importo/.test(await js(`document.querySelector('.campi-word')?.textContent || ''`)))
      await layout('Modello Word')
      await clickText('.btn-primary', 'Crea documento'); await sleep(500)
      await setVal('.modal select', String(pratica.id)); await sleep(400)
      check('per un modello Word il formato è il Word con la stessa impaginazione', /stessa impaginazione del tuo file/.test(await text()) && !(await js(`!!document.querySelector('.crea-formati')`)))
      await js(`(() => { for (const i of document.querySelectorAll('.crea-campi input')) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'€ 980,00'); i.dispatchEvent(new Event('input',{bubbles:true})) } })()`)
      await setVal('.crea-documento > .field input', 'Saldo da Word'); await sleep(150)
      await clickText('.modal .btn-primary', 'Crea e salva'); await sleep(1000)
      const tw = fs.existsSync(path.join(file, 'Saldo da Word.docx')) ? leggiDocx(path.join(file, 'Saldo da Word.docx')) : ''
      check('documento dal modello Word: campi compilati in corpo e intestazione, collegato alla pratica', /Spett\.le Ezio Zanichelli/.test(tw) && /Saldo dovuto: € 980,00/.test(tw) && /Studio Legale Prova – carta intestata/.test(tw) && db.list('documenti', { pratica_id: pratica.id }).some((d) => d.nome === 'Saldo da Word.docx'), tw.slice(0, 200))

      // ---------- Anonimizza su tutti i documenti della pratica ----------
      await clickText('.nav-item', 'Pratiche'); await sleep(400)
      await js(`[...document.querySelectorAll('.pcard h2')].find(h=>h.textContent.includes('Zanichelli')).click()`); await sleep(600)
      await clickText('.tabs button', 'Documenti'); await sleep(500)
      await clickText('button[title^="Copie anonimizzate"]', 'Anonimizza'); await sleep(700)
      check('dalla pratica si apre Anonimizza con la pratica già scelta', await js(`!!document.querySelector('.anon-pratica')`) && await js(`document.querySelector('.anon-pratica select')?.value`) === String(pratica.id))
      const nDoc = await js(`document.querySelectorAll('.anon-pratica-elenco li').length`)
      await layout('Anonimizza pratica')
      await clickText('.anon-pratica .btn-primary', 'Anonimizza'); await sleep(500)
      for (let i = 0; i < 60 && /in corso/.test(await js(`document.querySelector('.anon-pratica .btn-primary')?.textContent || ''`)); i++) await sleep(1000)
      const dirAnon = path.join(file, 'Anonimizzati'), prodotti = fs.existsSync(dirAnon) ? fs.readdirSync(dirAnon) : []
      const chiaveComune = prodotti.find((n) => /chiave di ripristino\.json$/.test(n))
      const testiAnon = prodotti.filter((n) => /\.txt$/.test(n)).map((n) => fs.readFileSync(path.join(dirAnon, n), 'utf8')).join('\n')
      check('in blocco: una copia per documento, PDF e Word compresi, e una chiave comune', nDoc >= 5 && prodotti.filter((n) => / anonimizzato/.test(n)).length >= nDoc - 1 && prodotti.some((n) => /\.pdf$/.test(n)) && prodotti.some((n) => /\.docx$/.test(n)) && !!chiaveComune, `${nDoc} documenti, prodotti: ${prodotti.join(' | ')}`)
      check('nessun dato del cliente nelle copie di testo; la chiave li ripristina', testiAnon.length > 0 && !/Zanichelli|ZNCZEI/.test(testiAnon) && /Ezio Zanichelli/.test(chiaveComune ? fs.readFileSync(path.join(dirAnon, chiaveComune), 'utf8') : ''))
      await shot('strumenti-10-anon-pratica')

      // ---------- aggiornamento disponibile, Da pagare, spese extra (avvocato) ----------
      db.setSettings({ tema: 'auto', profilo: 'avvocato' })
      const versioneApp = require('../package.json').version
      db.setSettings({ aggiornamento: { versione: '9.9.9', pagina: 'https://github.com/tio-app/tio/releases/tag/v9.9.9' } }); await js('location.reload()'); await sleep(1500)
      const pill = await js(`(() => { const b=document.querySelector('.topbar .update-pill'), s=document.querySelector('.topbar .search-trigger'); if(!b||!s) return null; const r=b.getBoundingClientRect(), q=s.getBoundingClientRect(); return { testo:b.textContent, nome:b.getAttribute('aria-label'), accanto: r.right <= q.left + 1 && Math.abs((r.top+r.bottom)/2-(q.top+q.bottom)/2) < 4 } })()`)
      check('aggiornamento disponibile: box accanto alla ricerca con la versione', pill && /9\.9\.9/.test(pill.testo) && /TIO 9\.9\.9/.test(pill.nome) && pill.accanto, JSON.stringify(pill))
      await shot('strumenti-11-aggiornamento-disponibile')
      await js(`document.querySelector('.topbar .update-pill').click()`); await sleep(600)
      check('il box apre Impostazioni › Backup e sicurezza, sezione Aggiornamenti', await js(`!!document.querySelector('.tabs button.on') && /Backup/.test(document.querySelector('.tabs button.on').textContent) && /Aggiornamenti/.test(document.body.innerText)`))
      await layout('Aggiornamento disponibile')
      db.setSettings({ aggiornamento: { versione: versioneApp, pagina: 'https://github.com/tio-app/tio/releases' } }); await js('location.reload()'); await sleep(1500)
      check('nessun box se la versione trovata è quella in uso', await js(`!document.querySelector('.update-pill')`))
      db.setSettings({ aggiornamento: null }); await js('location.reload()'); await sleep(1500)
      check('nessun box senza aggiornamenti', await js(`!document.querySelector('.update-pill')`))
      // guida completa: inclusa, raggiungibile da Impostazioni e dai comandi rapidi
      const guida = await js(`window.mngmnt.invoke('app:guida')`)
      check('la guida si apre dal canale dell’app ed esiste sul disco', typeof guida === 'string' && /guida[\\/]index\.html$/.test(guida) && fs.existsSync(guida), guida)
      await clickText('.nav-item', 'Impostazioni'); await sleep(500); await clickText('.tabs button', 'Backup'); await sleep(500)
      check('Impostazioni › Backup e sicurezza: «Apri la guida»', /Guida di TIO/.test(await text()) && await js(`[...document.querySelectorAll('button')].some(b=>/Apri la guida/.test(b.textContent))`))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,ctrlKey:true,bubbles:true}))`); await sleep(400)
      await js(`(() => { const i=document.querySelector('.modal input, [role=dialog] input'); if(!i) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'guida'); i.dispatchEvent(new Event('input',{bubbles:true})) })()`); await sleep(400)
      check('comandi rapidi: «Guida di TIO» con F1', /Guida di TIO/.test(await text()) && /F1/.test(await text()))
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(300)

      const navGestione = await js(`[...document.querySelectorAll('.nav-group')].find(g=>/Gestione/.test(g.querySelector('.nav-section')?.textContent||''))?.querySelectorAll('.nav-item span').length ? [...[...document.querySelectorAll('.nav-group')].find(g=>/Gestione/.test(g.querySelector('.nav-section').textContent)).querySelectorAll('.nav-item span')].map(x=>x.textContent) : []`)
      check('Gestione: «Da pagare» subito sotto Parcelle', navGestione.indexOf('Da pagare') === navGestione.indexOf('Parcelle') + 1 && navGestione.indexOf('Parcelle') >= 0, JSON.stringify(navGestione))
      const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10), tra10 = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
      await js(`window.mngmnt.invoke('app:gestione', 'costo', { descrizione: 'Domiciliazione Tribunale di Bologna', categoria: 'Domiciliazioni e sostituzioni', importo: 250, data: ${JSON.stringify(ieri)}, scadenza: ${JSON.stringify(ieri)}, pratica_id: ${pratica.id}, fornitore_id: null, pagata: 0, recuperabile: 1 })`)
      await js(`window.mngmnt.invoke('app:gestione', 'costo', { descrizione: 'Consulenza del commercialista', categoria: 'Prestazioni e consulenze', importo: 180.5, data: ${JSON.stringify(ieri)}, scadenza: ${JSON.stringify(tra10)}, pratica_id: null, fornitore_id: null, pagata: 0, recuperabile: 0 })`)
      await clickText('.nav-item', 'Da pagare'); await sleep(700)
      let dp = await text()
      check('Da pagare: totali, scadute ed entro 30 giorni', /Da pagare\s*430,50\s*€/.test(dp) && /Scadute\s*250,00\s*€/.test(dp) && /Entro 30 giorni\s*180,50\s*€/.test(dp), dp.slice(0, 400))
      check('Da pagare: la voce scaduta prima, con la pratica e il rimborso da chiedere', await js(`(() => { const r=[...document.querySelectorAll('.da-pagare tbody tr')]; return r.length===2 && /Domiciliazione/.test(r[0].textContent) && /Scaduta/.test(r[0].textContent) && /Zanichelli c\. Acme/.test(r[0].textContent) && /da riaddebitare/.test(r[0].textContent) })()`))
      await shot('strumenti-12-da-pagare')
      await layout('Da pagare')
      await clickText('.da-pagare tbody tr .btn', 'Pagata'); await sleep(700)
      dp = await text()
      check('segnata come pagata: esce dalle voci da pagare e conta tra le pagate', /Da pagare\s*180,50\s*€/.test(dp) && /Scadute\s*0,00\s*€/.test(dp) && await js(`document.querySelectorAll('.da-pagare tbody tr').length === 1`) && (await js(`window.mngmnt.invoke('app:gestione','leggi')`)).costi.some((c) => /Domiciliazione/.test(c.descrizione) && c.pagata === 1))
      await clickText('.da-pagare .segmented button', 'Pagate'); await sleep(400)
      check('filtro «Pagate» e «Riapri»', await js(`/Domiciliazione/.test(document.querySelector('.da-pagare tbody')?.textContent||'') && /Riapri/.test(document.querySelector('.da-pagare tbody')?.textContent||'')`))
      await clickText('.da-pagare .page-head .btn-primary', 'Nuova voce da pagare'); await sleep(500)
      check('nuova voce: categorie dello studio e «Da pagare entro»', await js(`(() => { const m=document.querySelector('.modal'); const o=[...m.querySelectorAll('select option')].map(x=>x.textContent); return /Nuova voce da pagare/.test(m.textContent) && /Da pagare entro/.test(m.textContent) && o.includes('Domiciliazioni e sostituzioni') && o.includes('Spese extra') })()`))
      await shot('strumenti-13-da-pagare-nuova')
      await js('location.reload()'); await sleep(1500)

      await clickText('.nav-item', 'Parcelle'); await sleep(600)
      await clickText('.page-head .btn-primary', 'Nuovo documento'); await sleep(800)
      const gruppiSpese = await js(`[...document.querySelectorAll('.modal select.spesa-extra optgroup')].map(g=>({ g:g.label, o:[...g.querySelectorAll('option')].map(o=>o.textContent) }))`)
      check('spese extra: anticipate senza IVA e rimborsi con IVA, voci dello studio', gruppiSpese.length === 2 && /senza IVA/.test(gruppiSpese[0].g) && gruppiSpese[0].o.includes('Contributo unificato') && gruppiSpese[0].o.some((o) => /Marca da bollo \(16,00 €\)/.test(o)) && gruppiSpese[1].o.includes('Carburante'), JSON.stringify(gruppiSpese))
      await setVal('.modal select.spesa-extra', '0:2'); await sleep(300)
      await setVal('.modal select.spesa-extra', '1:0'); await sleep(300)
      const vociSpese = await js(`[...document.querySelectorAll('.modal table.voci tbody tr')].map(r=>({ tipo:r.querySelector('select').value, d:r.querySelectorAll('input')[0].value, i:r.querySelectorAll('input')[2].value }))`)
      check('marca da bollo esente da 16 €, carburante imponibile da compilare', vociSpese.some((v) => v.tipo === 'spesa_esente' && v.d === 'Marca da bollo' && /^16/.test(v.i)) && vociSpese.some((v) => v.tipo === 'spesa_imponibile' && v.d === 'Carburante'), JSON.stringify(vociSpese))
      check('il menu delle spese torna su «+ Spesa extra…»', await js(`document.querySelector('.modal select.spesa-extra').value === ''`))
      await shot('strumenti-14-spese-extra')
      // la parcella di prova resta non salvata: senza questo, ricaricare apre «Ci sono modifiche non salvate» (finestra di sistema) e la prova si ferma
      await js(`window.dispatchEvent(new Event('mngmnt-saved'))`)
      await js('location.reload()'); await sleep(1500)

      // ---------- gli altri profili: libero professionista e ditta individuale ----------
      const PROFILI = [
        { nome: 'libero professionista', impostazioni: { profilo: 'ditta', attivita: 'professionista', etichette: { pratica: 'Incarico', pratiche: 'Incarichi', cliente: 'Cliente', clienti: 'Clienti', controparte: 'Fornitore / Altro', autorita: 'Ente / Ufficio', rg: 'Riferimento', giudice: 'Referente', parcella: 'Documento', parcelle: 'Documenti e incassi' } }, ci: ['Sollecito di pagamento', 'Incarico professionale', 'Relazione'], no: ['Procura alle liti', 'Diffida e messa in mora', 'Conferma d’ordine'], crea: 'Sollecito di pagamento', gruppo: 'Incarico' },
        { nome: 'ditta individuale', impostazioni: { profilo: 'ditta', attivita: 'impresa', etichette: { pratica: 'Commessa', pratiche: 'Commesse', cliente: 'Cliente', clienti: 'Clienti', controparte: 'Fornitore / Altro', autorita: 'Ente / Ufficio', rg: 'Riferimento', giudice: 'Referente', parcella: 'Fattura', parcelle: 'Fatture' } }, ci: ['Sollecito di pagamento', 'Conferma d’ordine', 'Relazione tecnica'], no: ['Procura alle liti', 'Diffida e messa in mora', 'Incarico professionale'], crea: 'Conferma d’ordine', gruppo: 'Commessa' },
      ]
      for (const p of PROFILI) {
        db.setSettings({ tema: 'auto', ...p.impostazioni }); await js('location.reload()'); await sleep(1500)
        check(`${p.nome}: Documenti e Anonimizza nella barra laterale`, await js(`(() => { const g=[...document.querySelectorAll('.nav-group')].find(x=>x.querySelector('.nav-section')?.textContent==='Strumenti'); return !!g && /Documenti/.test(g.textContent) && /Anonimizza/.test(g.textContent) })()`))
        await js(`[...document.querySelectorAll('.nav-item')].find(b=>b.textContent.trim()==='Documenti').click()`); await sleep(600)
        await clickText('.btn-primary', 'Nuovo modello'); await sleep(500)
        const tipi = await js(`[...document.querySelectorAll('.modal .documenti-tipo b')].map(b=>b.textContent)`)
        check(`${p.nome}: modelli di partenza adatti al profilo`, p.ci.every((t) => tipi.includes(t)) && p.no.every((t) => !tipi.includes(t)), JSON.stringify(tipi))
        await clickText('.modal .documenti-tipo', p.crea); await sleep(900)
        check(`${p.nome}: campi con le parole del profilo`, await js(`[...document.querySelectorAll('.editor-campi optgroup')].some(g=>g.label===${JSON.stringify(p.gruppo)})`))
        await clickText('.btn-primary', 'Crea documento'); await sleep(500)
        await setVal('.modal select', String(pratica.id)); await sleep(400)
        await js(`(() => { for (const i of document.querySelectorAll('.crea-campi input')) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'123'); i.dispatchEvent(new Event('input',{bubbles:true})) } })()`)
        await js(`document.querySelector('.crea-formati input[value="docx"]').click()`)
        await setVal('.crea-documento > .field input', `${p.crea} ${p.nome}`); await sleep(200)
        await layout(`Crea documento ${p.nome}`)
        await clickText('.modal .btn-primary', 'Crea e salva'); await sleep(900)
        const f2 = path.join(file, `${p.crea} ${p.nome}.docx`)
        const t2 = fs.existsSync(f2) ? leggiDocx(f2) : ''
        check(`${p.nome}: documento creato e compilato`, /Ezio Zanichelli/.test(t2) && !/\{\{/.test(t2), t2.slice(0, 200))
        await layout(`Documenti ${p.nome}`)
        await clickText('.nav-item', 'Anonimizza'); await sleep(500)
        if (await js(`!!document.querySelector('.anon-barra')`)) { await js(`[...document.querySelectorAll('.anon-barra button')].find(b=>b.getAttribute('aria-label')==='Chiudi il documento').click()`); await sleep(300) }
        await setVal('.anon-incolla textarea', 'Incontro con ezio zanichelli per la commessa 987/2026: telefono 335 123 4567.'); await sleep(200)
        await clickText('.anon-incolla .btn-primary', 'Anonimizza'); await sleep(800)
        const m2 = await js(`[...document.querySelectorAll('.anon-testo .pii')].map(b=>b.textContent)`)
        check(`${p.nome}: Anonimizza riconosce i clienti dell’archivio`, m2.includes('ezio zanichelli') && m2.includes('987/2026') && m2.includes('335 123 4567'), JSON.stringify(m2))
        await layout(`Anonimizza ${p.nome}`)
        await clickText('.nav-item', 'Agenda'); await sleep(500)
        check(`${p.nome}: niente calcolo dei termini processuali in Agenda`, !/Calcola termine/.test(await text()))
        await clickText('.nav-item', 'Da pagare'); await sleep(500)
        check(`${p.nome}: Da pagare con le parole dell’attività`, /Fornitori, collaboratori, consulenze/.test(await text()))
        await clickText('.nav-item', p.impostazioni.etichette.parcelle || 'Parcelle'); await sleep(500)
        await clickText('.page-head .btn-primary', 'Nuovo documento'); await sleep(800)
        const speseDitta = await js(`[...document.querySelectorAll('.modal select.spesa-extra option')].map(o=>o.textContent)`)
        check(`${p.nome}: spese extra senza voci processuali`, speseDitta.includes('Materiali') && speseDitta.includes('Carburante') && !speseDitta.includes('Contributo unificato'), JSON.stringify(speseDitta))
        await js('location.reload()'); await sleep(1500)
        await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,ctrlKey:true,bubbles:true}))`); await sleep(400)
        const palette = await text()
        check(`${p.nome}: comandi rapidi con le parole del profilo`, !/Calcola un termine/.test(palette) && (p.gruppo === 'Incarico' ? /Nuovo incarico/.test(palette) : /Nuova commessa/.test(palette)), palette.slice(0, 200))
        await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(300)
      }

      const bad = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e, e && e.stack) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}
module.exports = { attach }
