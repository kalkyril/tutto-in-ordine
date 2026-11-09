'use strict'
// Immagini del sito e della guida registrate dall'app vera, con dati di esempio inventati.
// Avvio (due giri, uno per profilo):
//   IMMAGINI_PROFILO=ditta  sh scripts/run-smoke.sh <cartella> immagini-sito
//   IMMAGINI_PROFILO=studio sh scripts/run-smoke.sh <cartella> immagini-sito
// Le immagini WebP finiscono in sito/img e, per quelle usate anche dalla guida, in guida/img.
const fs = require('node:fs')
const path = require('node:path')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const RADICE = path.join(__dirname, '..')
const GUIDA = new Set(['funzione-agenda', 'funzione-backup', 'funzione-fatture', 'funzione-lavoro', 'funzione-panoramica', 'funzione-ricerca', 'funzione-scadenzario', 'funzione-commessa',
  'strumento-anonimizza-pratica', 'strumento-anonimizza', 'strumento-crea', 'strumento-modelli', 'strumento-ripristino', 'strumento-word', 'strumento-editor', 'strumento-comprimi'])
const pad = (n) => String(n).padStart(2, '0')
const giorno = (n, ora) => { const d = new Date(); d.setDate(d.getDate() + n); const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; return ora ? `${s}T${ora}` : s }

/** Importi di un documento: senza cassa per la ditta, con spese generali, CPA e ritenuta per lo studio legale. */
function importi(voci, legale) {
  const c = voci.reduce((s, v) => s + v.importo * (v.quantita || 1), 0)
  const r = (n) => Math.round(n * 100) / 100
  if (!legale) { const iva = r(c * 0.22); return { compensi: c, imponibile: c, iva, totale: r(c + iva), netto: r(c + iva), iva_perc: 22, sg_perc: 0, cpa_perc: 0, rit_perc: 0, bollo: 0 } }
  const sg = r(c * 0.15), cpa = r((c + sg) * 0.04), imp = r(c + sg + cpa), iva = r(imp * 0.22), rit = r((c + sg) * 0.2)
  return { compensi: c, spese_generali: sg, cpa, imponibile: imp, iva, ritenuta: rit, totale: r(imp + iva), netto: r(imp + iva - rit), sg_perc: 15, cpa_perc: 4, iva_perc: 22, rit_perc: 20, bollo: 0 }
}

function attach({ getWindow, db }) {
  const win = getWindow(), wc = win.webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const profilo = process.env.IMMAGINI_PROFILO === 'studio' ? 'studio' : 'ditta'
  const out = process.env.SMOKE_OUT || path.join(require('node:os').tmpdir(), 'tio-immagini'); fs.mkdirSync(out, { recursive: true })
  const js = (c) => wc.executeJavaScript(c, true)
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const setVal = (sel, v) => js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; const proto = el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); return true })()`)
  const fatte = []
  /** Fotografia della finestra (contenuto w×h) in WebP: il cursore lampeggiante e le animazioni sono fermi. */
  // come le immagini della 1.0: finestra 1360×860 (la misura predefinita dell'app) ingrandita fino alla misura dell'immagine
  async function foto(nome, w = 1600, h = 1012) {
    win.setContentSize(Math.round(w / 1.1765), Math.round(h / 1.1765)); await sleep(700)
    await js(`document.activeElement?.blur?.(); getSelection().removeAllRanges(); document.documentElement.classList.add('sem-transizioni'); true`); await sleep(250)
    const img = (await wc.capturePage()).resize({ width: w, quality: 'best' })
    await js(`document.documentElement.classList.remove('sem-transizioni'); true`)
    const { loadImage, createCanvas } = require('@napi-rs/canvas')
    const im = await loadImage(img.toPNG()), c = createCanvas(w, h)
    c.getContext('2d').drawImage(im, 0, 0, w, h)
    const webp = await c.encode('webp', 84)
    fs.writeFileSync(path.join(RADICE, 'sito', 'img', nome + '.webp'), webp)
    if (GUIDA.has(nome)) fs.writeFileSync(path.join(RADICE, 'guida', 'img', nome + '.webp'), webp)
    fs.writeFileSync(path.join(out, nome + '.png'), img.toPNG())
    fatte.push(`${nome} ${Math.round(webp.length / 1024)} KB`); console.log('FOTO', nome)
  }
  // ora del pomeriggio nella finestra (come nelle immagini della 1.0): gli impegni di oggi restano «oggi», non in ritardo
  const pomeriggio = async () => { await js(`(() => { if (!window.__realDate) { window.__realDate = Date; const t = new Date(); t.setHours(15, 40, 0, 0); window.__ora = t.getTime(); window.Date = class extends window.__realDate { constructor(...a) { super(...(a.length ? a : [window.__ora])) } static now() { return window.__ora } } } window.dispatchEvent(new Event('focus')); return true })()`); wc.send('time-changed'); await sleep(600) }
  const esc = () => js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      if (profilo === 'ditta') await ditta(); else await studio()
      console.log(`\nRISULTATO: ${fatte.length}/${fatte.length} controlli superati\n` + fatte.join('\n'))
    } catch (e) { console.log('ERRORE', e, e && e.stack) } finally { setTimeout(() => process.exit(0), 300) }
  })

  // ---------------------------------------------------------------- ditta individuale: Impianti Galli
  async function ditta() {
    db.setSettings({ onboarding_fatto: true, tema: 'chiaro', brand_colore: '#7f1d39', profilo: 'ditta', attivita: 'impresa', aggiornamenti_controllo: false,
      etichette: { pratica: 'Commessa', pratiche: 'Commesse', cliente: 'Cliente', clienti: 'Clienti', controparte: 'Fornitore / Altro', autorita: 'Ente / Ufficio', rg: 'Riferimento', giudice: 'Referente', parcella: 'Documento', parcelle: 'Documenti e incassi' },
      tipi_pratica: ['Commessa', 'Preventivo', 'Fornitura', 'Consulenza', 'Manutenzione', 'Pratica amministrativa', 'Altro'], aliquote: { sg: 0, cpa: 0, iva: 22, rit: 0, bollo: 2 },
      studio: { nome: 'Impianti Galli', intestazione: 'Impianti Galli di Luca Galli', titolare: 'Luca Galli', indirizzo: 'Via Emilia Est 220', cap_citta: '41121 Modena', piva: '03456780366', cf: 'GLLLCU80A01F257Z', email: 'info@impiantigalli.it', pec: 'impiantigalli@pec.it', telefono: '059 123456', iban: 'IT60X0542811101000000123456', banca: '', domicilio_fiscale: '' },
      backup_ultimo: new Date().toISOString(), backup_esito: 'ok', backup_cartella: '/Volumes/Backup/TIO' })
    const a = (o) => db.save('anagrafica', { tipo: 'azienda', ruolo: 'cliente', ...o })
    const bar = a({ denominazione: 'Bar Centrale di Neri Paola', indirizzo: 'Via Garibaldi 10', cap: '41121', citta: 'Modena', provincia: 'MO', telefono: '059 765432', email: 'barcentrale@email.it', partita_iva: '02345670361', sdi: 'M5UXCR1' })
    const hotel = a({ denominazione: 'Hotel Miramare S.r.l.', citta: 'Riccione', email: 'amministrazione@hotelmiramare.it' })
    const farm = a({ denominazione: 'Farmacia San Rocco', citta: 'Carpi' })
    const cond = a({ denominazione: 'Condominio Le Querce', citta: 'Modena' })
    const bianchi = a({ denominazione: 'Marco Bianchi', tipo: 'persona', titolo: 'Ing.', citta: 'Sassuolo', telefono: '333 1234567' })
    const forn = a({ denominazione: 'Elettroforniture Emilia S.r.l.', ruolo: 'fornitore', citta: 'Modena' })
    const coll = a({ denominazione: 'Davide Rinaldi', tipo: 'persona', ruolo: 'collaboratore', titolo: 'Geom.' })
    let n = 11
    const p = (o) => db.save('pratiche', { numero: `2026/0${++n}`, stato: 'In corso', tipo: 'Commessa', data_apertura: giorno(-30), ...o })
    const pBar = p({ titolo: 'Impianto elettrico Bar Centrale', cliente_id: bar.id, controparte_id: forn.id, colore: '#c2410c', valore: 6800, preferita: 1, budget_ore: 40, budget_importo: 6800, consegna: giorno(18) })
    const pHotel = p({ titolo: 'Illuminazione Hotel Miramare', cliente_id: hotel.id, colore: '#a16207', valore: 9200 })
    const pFarm = p({ titolo: 'Quadro elettrico Farmacia San Rocco', cliente_id: farm.id, colore: '#1d4ed8', valore: 3900 })
    const pCond = p({ titolo: 'Manutenzione Condominio Le Querce', cliente_id: cond.id, colore: '#047857', tipo: 'Manutenzione', preferita: 1 })
    const pCasa = p({ titolo: 'Casa Bianchi, impianto di allarme', cliente_id: bianchi.id, colore: '#7e22ce', stato: 'Aperta' })
    const s = (o) => db.save('scadenze', { tipo: 'appuntamento', tutto_il_giorno: 0, promemoria: '[60]', completata: 0, ...o })
    s({ pratica_id: pCond.id, titolo: 'Sopralluogo con l’amministratore', data_ora: giorno(0, '17:30'), luogo: 'Via delle Querce 12' })
    s({ pratica_id: pFarm.id, titolo: 'Collaudo del quadro', data_ora: giorno(1, '10:00'), luogo: 'Farmacia San Rocco' })
    s({ pratica_id: pBar.id, titolo: 'Consegna del preventivo', tipo: 'scadenza', data_ora: giorno(1, '18:00') })
    s({ pratica_id: pHotel.id, titolo: 'Riunione con il direttore', data_ora: giorno(2, '09:30'), luogo: 'Hotel Miramare' })
    s({ pratica_id: pBar.id, titolo: 'Inizio lavori', data_ora: giorno(5, '08:00'), luogo: 'Bar Centrale' })
    s({ pratica_id: pCasa.id, titolo: 'Installazione sensori', data_ora: giorno(3, '14:00') })
    s({ pratica_id: null, titolo: 'Versamento IVA trimestrale', tipo: 'scadenza', data_ora: giorno(6, '09:00'), tutto_il_giorno: 1 })
    const t = (o) => db.save('todos', { priorita: 1, completata: 0, ...o })
    t({ pratica_id: pBar.id, titolo: 'Ordinare i cavi e le canaline', scadenza: giorno(0), priorita: 2 })
    t({ pratica_id: pFarm.id, titolo: 'Mandare la foto del quadro al cliente', scadenza: giorno(1) })
    t({ pratica_id: pCond.id, titolo: 'Chiamare l’amministratore', scadenza: giorno(1) })
    t({ pratica_id: pHotel.id, titolo: 'Preparare lo schema dei punti luce', scadenza: giorno(3) })
    db.save('note', { pratica_id: pBar.id, testo: 'La cucina resta aperta: lavori nel locale dalle 15 alle 18. Chiavi dal titolare.' })
    for (const [d, m, de] of [[-12, 150, 'Sopralluogo e misure'], [-8, 240, 'Progetto dell’impianto'], [-3, 90, 'Preventivo e scelta dei materiali']]) db.save('ore', { pratica_id: pBar.id, data: giorno(d), minuti: m, descrizione: de, tariffa_oraria: 45 })
    db.save('ore', { pratica_id: pBar.id, data: giorno(-1), minuti: 60, descrizione: 'Incontro con il fornitore', tariffa_oraria: 0, tariffa_da_decidere: 1 })
    // documenti collegati: file veri in una cartella del computer
    const cartella = path.join(out, 'Commesse', 'Impianto elettrico Bar Centrale'); fs.mkdirSync(cartella, { recursive: true })
    const gen = require('../electron/documento').genera
    const files = { 'Verbale di sopralluogo.docx': gen('docx', { titolo: 'Verbale', corpo: [{ tipo: 'p', runs: [{ t: 'Sopralluogo presso il Bar Centrale di Neri Paola, via Garibaldi 10, Modena. Presenti Luca Galli e Paola Neri (cell. 333 9876543).' }] }] }), 'Contratto di appalto - Bar Centrale.docx': gen('docx', { titolo: 'Contratto', corpo: [{ tipo: 'p', runs: [{ t: 'Tra Bar Centrale di Neri Paola, P.IVA 02345670361, IBAN IT60X0542811101000000123456, e Impianti Galli si conviene quanto segue.' }] }] }), 'Email di conferma - Paola Neri.txt': Buffer.from('Gentile Luca, confermo l’inizio dei lavori. Paola Neri, paola.neri@email.it, 333 9876543') }
    for (const [nome, dati] of Object.entries(files)) fs.writeFileSync(path.join(cartella, nome), dati)
    await js(`window.mngmnt.invoke('documenti:addPaths', ${pBar.id}, ${JSON.stringify(Object.keys(files).map((f) => path.join(cartella, f)))})`)
    // documenti di vendita, incassi e voci da pagare
    const anno = new Date().getFullYear()
    const doc = (o, voci) => db.saveParcella({ anno, tipo: 'parcella', stato: 'emessa', voci, ...importi(voci, false), ...o })
    doc({ data: giorno(-45), pratica_id: pCond.id, cliente_id: cond.id, stato: 'pagata', data_pagamento: giorno(-20) }, [{ tipo: 'compenso', descrizione: 'Manutenzione ordinaria impianti comuni', quantita: 1, importo: 1200 }])
    doc({ data: giorno(-34), pratica_id: pHotel.id, cliente_id: hotel.id, scadenza_pagamento: giorno(-4) }, [{ tipo: 'compenso', descrizione: 'Fornitura e posa corpi illuminanti', quantita: 1, importo: 4200 }])
    doc({ data: giorno(-10), pratica_id: pFarm.id, cliente_id: farm.id, scadenza_pagamento: giorno(20) }, [{ tipo: 'compenso', descrizione: 'Quadro elettrico e collaudo', quantita: 1, importo: 1950 }])
    doc({ data: giorno(-6), pratica_id: pBar.id, cliente_id: bar.id, stato: 'pagata', data_pagamento: giorno(-2) }, [{ tipo: 'compenso', descrizione: 'Acconto impianto elettrico', quantita: 1, importo: 2000 }])
    doc({ data: giorno(-3), pratica_id: pBar.id, cliente_id: bar.id, scadenza_pagamento: giorno(27) }, [{ tipo: 'compenso', descrizione: 'Secondo stato di avanzamento lavori', quantita: 1, importo: 2500 }])
    db.saveParcella({ anno, tipo: 'preventivo', stato: 'emessa', data: giorno(-4), pratica_id: pCasa.id, cliente_id: bianchi.id, esito_preventivo: 'inviato', validita: giorno(26), voci: [{ tipo: 'compenso', descrizione: 'Impianto di allarme con sei sensori', quantita: 1, importo: 1950 }], ...importi([{ importo: 1950 }], false) })
    const g = require('../electron/gestione')
    g.esegui('costo', { pratica_id: pBar.id, fornitore_id: forn.id, data: giorno(-9), descrizione: 'Cavi, canaline e quadro di zona', categoria: 'Materiali', importo: 1180, scadenza: giorno(-1), pagata: 1 })
    g.esegui('costo', { pratica_id: pBar.id, fornitore_id: coll.id, data: giorno(-2), descrizione: 'Assistenza alla posa (Geom. Rinaldi)', categoria: 'Prestazioni e consulenze', importo: 650, scadenza: giorno(12) })
    g.esegui('costo', { pratica_id: pHotel.id, fornitore_id: forn.id, data: giorno(-20), descrizione: 'Corpi illuminanti LED', categoria: 'Materiali', importo: 2100, scadenza: giorno(4) })
    g.esegui('costo', { pratica_id: null, data: giorno(-15), descrizione: 'Affitto del magazzino', categoria: 'Affitto', importo: 750, scadenza: giorno(-12), pagata: 1 })
    g.esegui('costo', { pratica_id: null, data: giorno(-1), descrizione: 'Assicurazione del furgone', categoria: 'Servizi', importo: 480, scadenza: giorno(15) })
    await js('location.reload()'); await sleep(1800); await pomeriggio()

    // ---- Panoramica, lavoro, agenda, ricerca, backup
    await foto('funzione-panoramica')
    await js(`[...document.querySelectorAll('.pcard, [data-pratica-id], .plain-row, button')].find(e=>/Impianto elettrico Bar Centrale/.test(e.textContent) && e.offsetParent)?.click()`); await sleep(900)
    if (!(await js(`/Dettagli|Prossime scadenze/.test(document.body.innerText)`))) { await clickText('.nav-item', 'Commesse'); await sleep(500); await js(`[...document.querySelectorAll('.pcard h2')].find(h=>/Bar Centrale/.test(h.textContent)).click()`); await sleep(900) }
    await foto('funzione-lavoro')
    await clickText('.tabs button', 'Fatture e pagamenti'); await sleep(1000)
    await foto('funzione-commessa')
    await clickText('.nav-item', 'Agenda'); await sleep(500); await clickText('.segmented button', 'Settimana'); await sleep(700)
    await foto('funzione-agenda')
    await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,ctrlKey:true,bubbles:true}))`); await sleep(500)
    await setVal('.modal input, [role=dialog] input', 'bar'); await sleep(900)
    await foto('funzione-ricerca')
    await esc(); await sleep(400)
    await clickText('.nav-item', 'Impostazioni'); await sleep(500); await clickText('.tabs button', 'Backup e sicurezza'); await sleep(800)
    await foto('funzione-backup')

    // ---- Pagamenti
    await clickText('.nav-item', 'Pagamenti'); await sleep(900)
    await foto('funzione-scadenzario')
    await clickText('.tabs button', 'Incassi'); await sleep(900)
    await foto('funzione-fatture')

    // ---- Documenti: modelli, editor, creazione, Word
    await clickText('.nav-item', 'Documenti'); await sleep(900)
    const prev = await js(`[...document.querySelector('.documenti-scelta select').options].find(o=>/^Preventivo/.test(o.textContent))?.value`)
    await setVal('.documenti-scelta select', prev); await sleep(1800)
    await foto('strumento-modelli')
    await clickText('.btn-primary', 'Crea documento'); await sleep(600)
    await setVal('.modal select', String(pBar.id)); await sleep(500)
    await js(`(() => { const v=['l’impianto elettrico del locale','6.800,00','45 giorni']; [...document.querySelectorAll('.crea-campi input')].forEach((i,k)=>{ Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, v[k] || ''); i.dispatchEvent(new Event('input',{bubbles:true})) }) })()`); await sleep(400)
    await foto('strumento-crea')
    await esc(); await sleep(500)
    // editor: una relazione con capitoli, tabella, firma e campi
    const rel = await js(`[...document.querySelector('.documenti-scelta select').options].find(o=>/Relazione tecnica/.test(o.textContent))?.value`)
    if (rel) { await setVal('.documenti-scelta select', rel); await sleep(900) }
    await js(`(() => { const f=document.querySelector('.editor-foglio'); f.focus(); const r=document.createRange(); r.selectNodeContents(f); const s=getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('delete'); const dt=new DataTransfer(); dt.setData('text/plain', ['RELAZIONE TECNICA','Commessa {{pratica.numero}} – {{pratica.titolo}}','','1. Situazione riscontrata','Al sopralluogo del {{data sopralluogo}} l’impianto del locale risultava privo di differenziale sulla linea della cucina.','','2. Interventi eseguiti','- nuovo quadro di zona con differenziali selettivi','- linee separate per cucina e sala','','Voce\\tQuantità\\tImporto','Quadro di zona\\t1\\t€ 1.250,00','Cavi e canaline\\t120 m\\t€ 640,00','Posa e collaudo\\t16 h\\t€ 720,00','','3. Conclusioni','I lavori saranno completati entro {{n.giorni}} giorni dall’accettazione.'].join('\\n')); f.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})) })()`); await sleep(1500)
    await js(`(() => { const t=[...document.querySelectorAll('.editor-barra button')].find(b=>b.getAttribute('aria-label')==='Mostra l’indice dei capitoli'); t && t.click() })()`); await sleep(500)
    await js(`(() => { const td=document.querySelector('.editor-foglio table td'); if(!td) return; const r=document.createRange(); r.selectNodeContents(td); r.collapse(true); const s=getSelection(); s.removeAllRanges(); s.addRange(r); document.querySelector('.editor-foglio').dispatchEvent(new MouseEvent('mouseup',{bubbles:true})) })()`); await sleep(2500)
    await js(`(() => { const e=document.querySelector('.documenti-editor .tabs'); const c=document.querySelector('.content'); if (e && c) c.scrollTop += e.getBoundingClientRect().top - c.getBoundingClientRect().top - 12 })()`); await sleep(400)
    await foto('strumento-editor')
    // modello Word
    const carta = path.join(out, 'Carta intestata Galli.docx')
    fs.writeFileSync(carta, gen('docx', { titolo: 'Carta intestata', intestazione: [{ testo: 'Impianti Galli di Luca Galli', dimensione: 'grande', grassetto: true }, { testo: 'Via Emilia Est 220 · 41121 Modena · info@impiantigalli.it', dimensione: 'piccola' }], footer: [{ testo: 'P.IVA {{studio.piva}} · IBAN {{studio.iban}}', dimensione: 'piccola' }], corpo: ['Spett.le {{destinatario.nome}}', '{{destinatario.indirizzo}}', '{{destinatario.cap_citta}}', '', 'Oggetto: {{pratica.titolo}}', '', 'Con la presente confermiamo l’ordine dei lavori per un importo di € {{importo}} oltre IVA, con consegna entro il {{data di consegna}}.', '', 'Cordiali saluti', '{{studio.titolare}}'].map((t) => ({ tipo: 'p', runs: [{ t }] })) }))
    process.env.MNGMNT_TEST_WORD = carta
    await js(`document.querySelector('.content').scrollTop = 0`)
    await clickText('button', 'Importa da Word'); await sleep(1600)
    await js(`document.querySelector('.content').scrollTop = 0`); await sleep(3800) // il messaggio «Modello importato» sparisce
    await foto('strumento-word')

    // ---- Anonimizza: un documento, una commessa intera, ripristino
    await clickText('.nav-item', 'Anonimizza'); await sleep(600)
    await setVal('.anon-incolla textarea', 'Gentile Luca, ti confermo i lavori al Bar Centrale di Neri Paola in via Garibaldi 10 a Modena. Per l’acconto puoi usare l’IBAN IT60 X054 2811 1010 0000 0123 456 intestato a Paola Neri, C.F. NREPLA75C41F257K. Se serve chiamami al 333 9876543 o scrivimi a paola.neri@email.it. La fattura va intestata a Bar Centrale S.n.c., P.IVA 02345670361.\n\nGrazie, Paola'); await sleep(200)
    await clickText('.anon-incolla .btn-primary', 'Anonimizza'); await sleep(1200)
    await foto('strumento-anonimizza')
    await clickText('.page-head .segmented button', 'Ripristina'); await sleep(500)
    await setVal('.anon-ripristino textarea', 'Gentile [NOME_COMPLETO_1], le confermo che l’acconto sarà versato sull’IBAN [IBAN_1]. Per qualsiasi dubbio la richiamo al [TELEFONO_1].'); await sleep(700)
    await foto('strumento-ripristino')
    await clickText('.page-head .segmented button', 'pratica'); await sleep(600)
    await setVal('.content select', String(pBar.id)); await sleep(900)
    await js(`[...document.querySelectorAll('.content .btn-primary')].find(b=>/Anonimizza \\d/.test(b.textContent))?.click()`); await sleep(6000)
    await foto('strumento-anonimizza-pratica')

    // ---- Comprimi PDF
    const { PDFDocument, StandardFonts } = require('pdf-lib'), { createCanvas } = require('@napi-rs/canvas')
    const scansioni = []
    for (const [nome, pagine] of [['Scansione contratto firmato.pdf', 4], ['Foto del cantiere.pdf', 6]]) {
      const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
      for (let k = 0; k < pagine; k++) {
        const c = createCanvas(2480, 3508), g = c.getContext('2d'); g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 2480, 3508)
        for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${(i * 37) % 200},${(i * 53) % 200},${(i * 71) % 200},0.25)`; g.fillRect((i * 97) % 2480, (i * 61) % 3508, 40 + (i % 50), 8 + (i % 20)) }
        const im = await pdf.embedJpg(await c.encode('jpeg', 96)); const pg = pdf.addPage([595, 842]); pg.drawImage(im, { x: 0, y: 0, width: 595, height: 842 }); pg.drawText(nome, { x: 40, y: 800, size: 12, font })
      }
      const f = path.join(out, nome); fs.writeFileSync(f, await pdf.save()); scansioni.push(f)
    }
    process.env.MNGMNT_TEST_PDF_COMPRIMI = scansioni.join('|')
    await clickText('.nav-item', 'Comprimi PDF'); await sleep(500)
    await clickText('.comprimi-zona button', 'Scegli i PDF'); await sleep(800)
    await clickText('.comprimi .btn-primary', 'Comprimi'); await sleep(9000)
    await foto('strumento-comprimi')
  }

  // ---------------------------------------------------------------- studio legale: Studio Legale Ferri (prima immagine del sito e README)
  async function studio() {
    db.setSettings({ onboarding_fatto: true, tema: 'chiaro', brand_colore: '#7f1d39', profilo: 'avvocato', attivita: 'studio', aggiornamenti_controllo: false,
      studio: { nome: 'Studio Legale Ferri', intestazione: 'Avv. Giulia Ferri', titolare: 'Avv. Giulia Ferri', indirizzo: 'Corso Canalgrande 40', cap_citta: '41121 Modena', piva: '03987650369', cf: 'FRRGLI82D45F257T', email: 'segreteria@studioferri.it', pec: 'giulia.ferri@ordineavvmodena.it', telefono: '059 223344', iban: 'IT60X0542811101000000654321', banca: '', domicilio_fiscale: '' } })
    const a = (o) => db.save('anagrafica', { tipo: 'persona', ruolo: 'cliente', ...o })
    const c = { verdi: a({ denominazione: 'Anna Verdi' }), rossi: a({ denominazione: 'Mario Rossi' }), ricci: a({ denominazione: 'Eredi Ricci' }), esp: a({ denominazione: 'Carla Esposito' }), mor: a({ denominazione: 'Moretti Trasporti S.r.l.', tipo: 'azienda' }), gallo: a({ denominazione: 'Paolo Gallo' }) }
    const cp = { neri: a({ denominazione: 'Neri Immobiliare S.r.l.', tipo: 'azienda', ruolo: 'controparte' }), bianchi: a({ denominazione: 'Bianchi Costruzioni S.p.A.', tipo: 'azienda', ruolo: 'controparte' }), carpi: a({ denominazione: 'Comune di Carpi', tipo: 'azienda', ruolo: 'controparte' }), banca: a({ denominazione: 'Banca Padana S.p.A.', tipo: 'azienda', ruolo: 'controparte' }) }
    const p = (o) => db.save('pratiche', { stato: 'Aperta', tipo: 'Civile', data_apertura: giorno(-60), autorita: 'Tribunale di Modena', ...o })
    const pV = p({ numero: '2026/011', titolo: 'Verdi c/ Neri Immobiliare', cliente_id: c.verdi.id, controparte_id: cp.neri.id, colore: '#047857', preferita: 1, rg: '1873/2026' })
    const pR = p({ numero: '2026/014', titolo: 'Rossi c/ Bianchi Costruzioni', cliente_id: c.rossi.id, controparte_id: cp.bianchi.id, colore: '#c2410c', preferita: 1, rg: '2231/2026' })
    p({ numero: '2026/002', titolo: 'Rossi — sfratto per morosità', cliente_id: c.rossi.id, colore: '#15803d' })
    const pRi = p({ numero: '2026/003', titolo: 'Successione Ricci', cliente_id: c.ricci.id, colore: '#be123c', tipo: 'Famiglia', autorita: '' })
    const pE = p({ numero: '2026/005', titolo: 'Esposito c/ Comune di Carpi', cliente_id: c.esp.id, controparte_id: cp.carpi.id, colore: '#7e22ce', tipo: 'Amministrativo', autorita: 'TAR Emilia-Romagna' })
    const pM = p({ numero: '2026/007', titolo: 'Moretti Trasporti c/ Banca Padana', cliente_id: c.mor.id, controparte_id: cp.banca.id, colore: '#a16207' })
    const pG = p({ numero: '2026/009', titolo: 'Gallo — recupero crediti', cliente_id: c.gallo.id, colore: '#1d4ed8', tipo: 'Recupero crediti' })
    const s = (o) => db.save('scadenze', { tipo: 'udienza', tutto_il_giorno: 0, promemoria: '[1440,60]', completata: 0, ...o })
    s({ pratica_id: pR.id, titolo: 'Udienza di prima comparizione', data_ora: giorno(0, '17:30'), luogo: 'Tribunale di Modena, aula 4' })
    s({ pratica_id: pRi.id, titolo: 'Incontro con gli eredi', tipo: 'appuntamento', data_ora: giorno(1, '16:00'), luogo: 'Studio' })
    s({ pratica_id: pV.id, titolo: 'Deposito memoria 171-ter n. 1', tipo: 'scadenza', data_ora: giorno(1, '23:59') })
    s({ pratica_id: pG.id, titolo: 'Udienza di discussione', data_ora: giorno(2, '11:00'), luogo: 'Giudice di pace di Modena' })
    s({ pratica_id: pE.id, titolo: 'Termine per il ricorso al TAR', tipo: 'scadenza', data_ora: giorno(4, '23:59') })
    s({ pratica_id: pM.id, titolo: 'Mediazione', tipo: 'appuntamento', data_ora: giorno(5, '10:00'), luogo: 'Organismo di mediazione' })
    const t = (o) => db.save('todos', { priorita: 1, completata: 0, ...o })
    t({ pratica_id: pR.id, titolo: 'Preparare la procura e i documenti per l’udienza', scadenza: giorno(0), priorita: 2 })
    t({ pratica_id: pV.id, titolo: 'Rileggere la perizia del CTU', scadenza: giorno(1) })
    t({ pratica_id: pG.id, titolo: 'Telefonare alla cliente per l’esito', scadenza: giorno(2) })
    t({ pratica_id: pM.id, titolo: 'Chiedere gli estratti conto alla banca', scadenza: giorno(4) })
    const anno = new Date().getFullYear()
    for (const [pr, cl, imp, st] of [[pV, c.verdi, 1500, 'emessa'], [pR, c.rossi, 1200, 'emessa'], [pM, c.mor, 900, 'pagata']]) {
      const voci = [{ tipo: 'compenso', descrizione: 'Compenso per l’attività svolta', quantita: 1, importo: imp }]
      db.saveParcella({ anno, tipo: 'parcella', stato: st, data: giorno(-25), pratica_id: pr.id, cliente_id: cl.id, voci, ...importi(voci, true), ...(st === 'pagata' && { data_pagamento: giorno(-5) }) })
    }
    await js('location.reload()'); await sleep(1800); await pomeriggio()
    await foto('panoramica-chiaro', 1700, 1075)
    await foto('readme-panoramica-chiaro', 1816, 1184)
    db.setSettings({ tema: 'scuro' }); await js('location.reload()'); await sleep(1800); await pomeriggio(); await pomeriggio()
    await foto('panoramica-scuro', 1700, 1075)
    await foto('readme-panoramica-scuro', 1816, 1184)
  }
}
module.exports = { attach }
