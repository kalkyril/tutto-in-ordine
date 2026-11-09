'use strict'
// Novità della 1.0.2 nell'app vera (ditta individuale): anagrafica che non si salva da sola, recapiti multipli, Pagamenti con
// scadenzario e contabile, valore della commessa con il grafico, tariffa da decidere, editor dei documenti con tabelle,
// anteprima grande, firma, luogo e data, Comprimi PDF. Avvio: sh scripts/run-smoke.sh <cartella> smoke-102
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
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-102'); fs.mkdirSync(out, { recursive: true })
  const shot = async (n) => { await sleep(400); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } }
  const setVal = (sel, v) => js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; const proto = el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); return true })()`)
  const text = () => js('document.body.innerText')
  const campo = (label) => `(() => { const l=[...document.querySelectorAll('.modal .field > label')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)})); return l && l.parentElement.querySelector('select,input,textarea') })()`
  const axe = async (nome) => {
    const src = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); await js(src + '; true')
    const v = await js(`axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: false } } }).then(r => r.violations.map(v => v.id + ':' + v.nodes.length + ' ' + v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' | ')))`)
    check(`accessibilità (axe-core): ${nome}`, v.length === 0, JSON.stringify(v))
  }

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      const { PRESET } = { PRESET: { profilo: 'ditta', attivita: 'impresa', etichette: { pratica: 'Commessa', pratiche: 'Commesse', cliente: 'Cliente', clienti: 'Clienti', controparte: 'Fornitore / Altro', autorita: 'Ente / Ufficio', rg: 'Riferimento', giudice: 'Referente', parcella: 'Documento', parcelle: 'Documenti e incassi' } } }
      db.setSettings({ onboarding_fatto: true, ...PRESET, studio: { nome: 'Impianti Galli', cap_citta: '41121 Modena', iban: 'IT60X0542811101000000123456', titolare: 'Marco Galli' } })
      const cli = db.save('anagrafica', { denominazione: 'Condominio Aurora', ruolo: 'cliente', tipo: 'azienda' })
      const vecchio = db.save('anagrafica', { denominazione: 'Ferramenta Bassi', ruolo: 'controparte', tipo: 'azienda' })
      const pr = db.save('pratiche', { numero: '2026/001', titolo: 'Impianto termico Aurora', cliente_id: cli.id, stato: 'In corso', colore: '#3b82f6', tipo: 'Commessa' })
      const oggi = new Date(), ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const tra = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }
      db.saveParcella({ anno: oggi.getFullYear(), tipo: 'parcella', data: tra(-40), pratica_id: pr.id, cliente_id: cli.id, stato: 'emessa', voci: [{ tipo: 'compenso', descrizione: 'Acconto lavori', quantita: 1, importo: 2000 }], sg_perc: 0, cpa_perc: 0, iva_perc: 22, rit_perc: 0, bollo: 0, compensi: 2000, imponibile: 2000, iva: 440, totale: 2440, netto: 2440 })
      db.saveParcella({ anno: oggi.getFullYear(), tipo: 'parcella', data: tra(-10), pratica_id: pr.id, cliente_id: cli.id, stato: 'pagata', data_pagamento: tra(-2), voci: [{ tipo: 'compenso', descrizione: 'Saldo progetto', quantita: 1, importo: 1000 }], sg_perc: 0, cpa_perc: 0, iva_perc: 22, rit_perc: 0, bollo: 0, compensi: 1000, imponibile: 1000, iva: 220, totale: 1220, netto: 1220 })
      const g = require('../electron/gestione')
      g.esegui('costo', { pratica_id: pr.id, fornitore_id: vecchio.id, data: tra(-5), descrizione: 'Caldaia a condensazione', categoria: 'Materiali', importo: 1500, scadenza: tra(5) })
      g.esegui('costo', { pratica_id: pr.id, data: tra(-20), descrizione: 'Noleggio ponteggio', categoria: 'Servizi', importo: 300, scadenza: tra(-1), pagata: 1 })
      await js('location.reload()'); await sleep(1500)

      // ---------- barra laterale ----------
      const nav = await js(`[...document.querySelectorAll('.nav-item span')].map(x=>x.textContent)`)
      check('barra laterale: «Pagamenti» al posto di «Documenti e incassi» e «Da pagare», «Comprimi PDF» tra gli strumenti', nav.includes('Pagamenti') && !nav.includes('Da pagare') && !nav.includes('Documenti e incassi') && nav.includes('Comprimi PDF'), JSON.stringify(nav))

      // ---------- anagrafica ----------
      await clickText('.nav-item', 'Anagrafica'); await sleep(400)
      await clickText('.page-head button', 'Nuovo contatto'); await sleep(500)
      await clickText('.modal .segmented button', 'Fornitore'); await sleep(400)
      await clickText('.modal .segmented button', 'Persona fisica'); await sleep(300)
      check('cambiare ruolo e tipo non salva e non chiude il contatto', await js(`!!document.querySelector('.modal')`) && db.list('anagrafica').length === 2)
      const ruoli = await js(`[...document.querySelectorAll('.modal .segmented')][0].innerText`)
      check('ruoli per la ditta: Cliente, Fornitore, Collaboratore, Altro', /Cliente[\s\S]*Fornitore[\s\S]*Collaboratore[\s\S]*Altro/.test(ruoli) && !/Controparte/.test(ruoli), ruoli)
      await setVal(`#${await js(`${campo('Titolo')}.id`)}`, 'Ing.')
      await setVal(`#${await js(`${campo('Nome e cognome')}.id`)}`, 'Paolo Verdi')
      await setVal(`#${await js(`${campo('Codice SDI')}.id`)}`, 'm5uxcr1')
      await setVal('.modal input[aria-label="Telefoni 1"]', '333 1234567')
      await clickText('.modal .recapiti button', 'Aggiungi un telefono'); await sleep(200)
      await setVal('.modal select[aria-label="Etichetta telefoni 2"]', '__altro'); await sleep(200)
      await setVal('.modal input[aria-label="Nome dell\'etichetta 2"]', 'Cantiere')
      await setVal('.modal input[aria-label="Telefoni 2"]', '059 765432')
      await setVal('.modal input[aria-label="Email 1"]', 'paolo@verdi.it')
      await shot('102-1-anagrafica')
      await axe('nuovo contatto')
      await clickText('.modal-foot .btn-primary', 'Salva'); await sleep(700)
      const pv = db.list('anagrafica').find((a) => a.denominazione === 'Paolo Verdi')
      check('contatto salvato con titolo, SDI, ruolo e due telefoni con etichetta', pv && pv.titolo === 'Ing.' && pv.sdi === 'M5UXCR1' && pv.ruolo === 'fornitore' && pv.telefono === '333 1234567' && JSON.parse(pv.recapiti).telefoni[1].etichetta === 'Cantiere', JSON.stringify(pv))
      check('scheda: «Ing. Paolo Verdi» con il telefono del cantiere', /Ing\. Paolo Verdi/.test(await text()) && /Cantiere/.test(await text()))

      // ---------- Pagamenti ----------
      await clickText('.nav-item', 'Pagamenti'); await sleep(700)
      const sc = await text()
      check('scadenzario: mesi con incassate, da incassare, pagate, da pagare e saldo previsto', /Scadenzario/.test(sc) && /Saldo previsto/.test(sc) && /Caldaia a condensazione/.test(sc) && /Documento n\./.test(sc), sc.slice(0, 300))
      await shot('102-2-scadenzario')
      await axe('scadenzario')
      await clickText('.tabs button', 'Incassi'); await sleep(600)
      check('scheda Incassi: documenti dell’anno', /Emesso/.test(await text()) && /Nuovo documento/.test(await text()))
      await clickText('.tabs button', 'Da pagare'); await sleep(600)
      await js(`[...[...document.querySelectorAll('.da-pagare tbody tr')].find(r=>/Caldaia/.test(r.textContent)).querySelectorAll('button')].find(b=>b.textContent.trim()==='Pagata').click()`); await sleep(800)
      check('segnata come pagata: TIO propone di allegare la contabile', /Allegare la contabile/.test(await text()))
      await shot('102-3-contabile')
      await clickText('.modal-foot button', 'Non ora'); await sleep(400)
      const costo = (await js(`window.mngmnt.invoke('app:gestione','leggi')`)).costi.find((c) => /Caldaia/.test(c.descrizione))
      const pdfProva = path.join(out, 'contabile-prova.pdf'); fs.writeFileSync(pdfProva, '%PDF-1.4\n%%EOF\n')
      const r = await js(`window.mngmnt.invoke('app:contabile','allega',${costo.id},${JSON.stringify(pdfProva)}).catch(e=>({errore:e.message}))`); await sleep(600)
      await clickText('.da-pagare .segmented button', 'Pagate'); await sleep(500)
      const dopo = (await js(`window.mngmnt.invoke('app:gestione','leggi')`)).costi.find((c) => c.id === costo.id)
      await shot('102-3b-pagate')
      check('contabile copiata nella cartella dati e mostrata accanto alla voce', r?.nome === 'contabile-prova.pdf' && JSON.parse(dopo.contabile || 'null')?.nome === 'contabile-prova.pdf' && /contabile-prova\.pdf/.test(await text()), JSON.stringify(r))

      // ---------- commessa ----------
      await js(`window.dispatchEvent(new Event('focus'))`)
      await clickText('.nav-item', 'Commesse'); await sleep(500)
      await js(`[...document.querySelectorAll('.pcard h2, .pcard, [data-pratica-id]')].find(h=>/Impianto termico/.test(h.textContent)).click()`); await sleep(700)
      await clickText('.tabs button', 'Fatture e pagamenti'); await sleep(700)
      check('commessa: valore con grafico a torta, fatture e voci pagate e da pagare', await js(`!!document.querySelector('.torta-commessa svg path')`) && /Fatture incassate e da incassare/.test(await text()) && /Fatture e voci pagate e da pagare/.test(await text()))
      await shot('102-4-commessa')
      await axe('valore della commessa')
      await clickText('.tabs button', 'Attività'); await sleep(500)
      await clickText('button', 'Nuova attività'); await sleep(500)
      await setVal('.modal select[aria-label="Come indicare la tariffa oraria"]', 'dopo'); await sleep(300)
      check('tariffa oraria: «Da decidere» nasconde l’importo', !(await js(`!!document.querySelector('.modal input[aria-label="Tariffa oraria in euro"]')`)) && /Da decidere/.test(await js(`document.querySelector('.modal').innerText + [...document.querySelectorAll('.modal input')].map(i=>i.value).join(' ')`)))
      await setVal(`#${await js(`${campo('Attività')}.id`)}`, 'Sopralluogo'); await setVal(`#${await js(`${campo('Tempo dedicato')}.id`)}`, '1:30'); await sleep(200)
      await shot('102-5-tariffa')
      await clickText('.modal-foot .btn-primary', 'Salva'); await sleep(700)
      check('attività salvata con tariffa da decidere', db.list('ore').some((o) => o.descrizione === 'Sopralluogo' && o.tariffa_da_decidere === 1 && o.tariffa_oraria === 0))

      // ---------- Impostazioni ----------
      await clickText('.nav-item', 'Impostazioni'); await sleep(500)
      check('Impostazioni della ditta senza «Modello PDF»', !(await js(`[...document.querySelectorAll('.tabs button')].some(b=>b.textContent==='Modello PDF')`)))
      check('colori dei pagamenti in Aspetto', /Colori dei pagamenti/.test(await text()))

      // ---------- Documenti ----------
      await clickText('.nav-item', 'Documenti'); await sleep(900)
      check('editor: tabelle, immagini, interruzione di pagina, dimensione, colore, indice', await js(`['Inserisci una tabella','Inserisci un’immagine','Riconosci titoli e capitoli nel testo','Barrato'].every(t=>document.querySelector('.editor-barra [aria-label="'+t+'"]')) && !!document.querySelector('.editor-barra select[aria-label="Dimensione del testo selezionato"]')`))
      await js(`(() => { const f=document.querySelector('.editor-foglio'); f.focus(); const r=document.createRange(); r.selectNodeContents(f); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); const dt=new DataTransfer(); dt.setData('text/plain','CAPITOLO 1\\nPremessa del contratto\\n\\nVoce\\tImporto\\nCaldaia\\t1.500\\nPosa\\t400'); f.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})) })()`); await sleep(900)
      check('testo incollato: capitolo e tabella riconosciuti', await js(`!!document.querySelector('.editor-foglio h1') && !!document.querySelector('.editor-foglio table td')`))
      await clickText('.documenti-testa button', 'Anteprima'); await sleep(2500)
      check('anteprima grande a tutta finestra con lo zoom', await js(`!!document.querySelector('.anteprima-grande img') && /Ingrandisci/.test(document.querySelector('.modal').innerHTML)`))
      await shot('102-6-anteprima')
      await clickText('.modal-foot button', 'Chiudi'); await sleep(400)
      await shot('102-7-editor')
      await clickText('.tabs button', 'Impaginazione'); await sleep(500)
      check('impaginazione: firma e posizione di luogo e data', /Firma/.test(await text()) && await js(`[...document.querySelector('select[aria-label="Posizione di luogo e data"]').options].map(o=>o.textContent).join('|')`) === 'In alto a destra|In alto a sinistra|In basso a sinistra|In basso a destra')
      await clickText('.tabs button', 'Intestazione'); await sleep(400)
      check('intestazione: dimensione «Grandissima» e sottolineato', await js(`[...document.querySelectorAll('.riga-ed select option')].some(o=>o.textContent==='Grandissima') && !!document.querySelector('.riga-ed button[title="Sottolineato"]')`))

      // ---------- Comprimi PDF ----------
      await clickText('.nav-item', 'Comprimi PDF'); await sleep(600)
      check('Comprimi PDF: tre livelli e scelta dei file', /Minima/.test(await text()) && /Media/.test(await text()) && /Massima/.test(await text()) && /Scegli i PDF/.test(await text()))
      await shot('102-8-comprimi')
      await axe('Comprimi PDF')

      const bad = results.filter((x) => !x.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e, e && e.stack) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message) })
}
module.exports = { attach }
