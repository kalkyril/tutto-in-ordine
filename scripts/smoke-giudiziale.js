'use strict'
// Calcolatore dei compensi civili e penali nell'app vera: elenco completo delle competenze, aumenti e riduzioni, prospetto, PDF.
// Avvio: sh scripts/run-smoke.sh <cartella> smoke-giudiziale
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
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-giudiziale'); fs.mkdirSync(out, { recursive: true })
  const shot = async (n) => { await sleep(350); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } }
  const setSel = (aria, v) => js(`(() => { const el=document.querySelector('select[aria-label="${aria}"]'); if(!el) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`)
  const setChk = (aria) => js(`(() => { const el=document.querySelector('input[aria-label="${aria}"]'); if(!el) return false; el.click(); return true })()`)
  const pannello = () => js(`document.querySelector('.calc-result')?.innerText || ''`)
  const attendi = async (cond, ms = 12000) => { for (let t = 0; t < ms; t += 300) { if (await cond()) return true; await sleep(300) } return false }
  const compensoTotale = async () => { const t = await pannello(); const m = t.match(/Compenso totale\s*\n?\s*€\s*([\d.,]+)/) || t.match(/Compenso tabellare\s*\n?\s*€\s*([\d.,]+)/); return m ? m[1] : null }

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, profilo: 'avvocato', studio: { nome: 'Studio Prova' } })
      await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Parcelle'); await sleep(500)
      await clickText('button', 'Nuovo documento'); await sleep(2500)

      // ---- finestra come quella dell'utente (1220×772): parcella intera, senza scorrere e, sul Mac, sotto i pulsanti della finestra ----
      const dimensioni = getWindow().getSize(); getWindow().setContentSize(1220, 772); await sleep(700)
      const posto = await js(`(() => { const r = document.querySelector('.modal').getBoundingClientRect(), b = document.querySelector('.modal-body'); return { sopra: Math.round(r.top), sotto: Math.round(r.bottom), altezza: innerHeight, scorre: b.scrollHeight > b.clientHeight + 1, eccesso: b.scrollHeight - b.clientHeight } })()`)
      // su uno schermo più basso (runner di GitHub) macOS accorcia la finestra: la misura non sarebbe quella dell'utente
      const reale = getWindow().getContentSize()
      if (reale[1] < 772) console.log(`SALTATO finestra 1220×772: lo schermo consente solo ${reale.join('×')}`)
      else check('finestra 1220×772: nuova parcella intera, senza scorrere e sotto i pulsanti del Mac', posto.sotto <= posto.altezza && !posto.scorre && (process.platform !== 'darwin' || posto.sopra >= 40), JSON.stringify(posto))
      getWindow().setSize(...dimensioni); await sleep(700)

      // ---- stragiudiziale, valore indeterminabile: quattro opzioni distinte e importi come sul sito (non 0 €) ----
      const opzioniInd = await js(`[...document.querySelectorAll('select[aria-label="Scaglione"] option')].map(o => o.textContent).filter(t => /ndeterminabile/.test(t))`)
      check('indeterminabile: bassa, media, alta e particolare importanza, senza doppioni', JSON.stringify(opzioniInd) === JSON.stringify(['Indeterminabile - complessità bassa', 'Indeterminabile - complessità media', 'Indeterminabile - complessità alta', 'Indeterminabile di particolare importanza']), JSON.stringify(opzioniInd))
      await setSel('Scaglione', 902)
      const okInd = await attendi(async () => (await compensoTotale()) === '3.473,00')
      check('indeterminabile - complessità media: compenso 3.473 come su avvocatoandreani.it, senza chiedere il valore', okInd && !/valutazione professionale/.test(await js('document.querySelector(".calc-form").innerText')), String(await compensoTotale()))
      await setSel('Scaglione', 30); await sleep(500)

      // ---- elenco completo delle competenze del sito ----
      const gruppi = await js(`[...document.querySelectorAll('select[aria-label="Competenza"] optgroup')].map(g => [g.label, g.querySelectorAll('option').length])`)
      check('competenze raggruppate come i calcolatori del sito: stragiudiziale 2, civile 29, penale 17', JSON.stringify(gruppi) === JSON.stringify([['Stragiudiziale', 2], ['Giudiziale civile', 29], ['Giudiziale penale', 17]]), JSON.stringify(gruppi))
      const nomi = await js(`[...document.querySelectorAll('select[aria-label="Competenza"] option')].map(o => o.textContent)`)
      check('ci sono tutte le competenze (Giudice di pace, Tribunale, T.A.R., Cassazione, Arbitrato, Tribunale monocratico, Corte d\'Assise…)', ['Giudice di pace', 'cognizione innanzi al tribunale', 'T.A.R.', 'Corte di Cassazione', 'Arbitrato', 'Tribunale monocratico', "Corte d'Assise", 'Atto di precetto', 'Esecuzioni immobiliari'].every((x) => nomi.some((n) => n.includes(x))))

      // ---- civile: tribunale, scaglione 5.201-26.000, valori medi ----
      await setSel('Competenza', 110)
      const ok1 = await attendi(async () => (await compensoTotale()) === '5.077,00')
      check('civile: compenso tabellare 5.077 (studio 919 + introduttiva 777 + istruttoria 1.680 + decisionale 1.701)', ok1, String(await compensoTotale()))
      const testo1 = await js('document.querySelector(".calc-form").innerText')
      check('civile: fasi del tribunale e riga del valore', /Studio/.test(testo1) && /Decisionale/.test(testo1) && /Scaglione/.test(testo1))
      await setSel('Numero di parti', 3); await sleep(300); await setSel('Percentuale di aumento per più parti', 40); await sleep(500)
      check('civile: più parti 3 al 40% → +2.030,80, compenso totale 7.107,80', (await compensoTotale()) === '7.107,80' && /2\.030,80/.test(await pannello()), await compensoTotale())
      await clickText('.tabs button', 'Riduzioni'); await sleep(300)
      await setChk('Gratuito patrocinio'); await sleep(500)
      check('civile: gratuito patrocinio −50% → compenso totale 3.553,90', (await compensoTotale()) === '3.553,90', await compensoTotale())
      await shot('giud-1-civile')
      await setChk('Gratuito patrocinio'); await clickText('.tabs button', 'Aumenti'); await sleep(300)
      await setSel('Numero di parti', 1); await sleep(300)
      // conciliazione: dal 2022 sostituisce la fase decisionale
      await setChk('Conciliazione'); await sleep(500)
      const concil = await js(`[...document.querySelectorAll('.fase-row')].map(r => [r.textContent.trim().slice(0,12), r.classList.contains('off')])`)
      check('conciliazione 2022: la fase decisionale si deseleziona da sola', concil.find((x) => /Decisionale/.test(x[0]))?.[1] === true, JSON.stringify(concil))
      await setSel('Conciliazione: percentuale', 25); await sleep(500)
      check('conciliazione 2022: 1.701 + 25% (massimo ammesso) → compenso totale 5.502,25', (await compensoTotale()) === '5.502,25', await compensoTotale())
      await setChk('Conciliazione'); await sleep(400)
      check('togliendo la conciliazione la fase decisionale si riattiva', (await compensoTotale()) === '5.077,00', await compensoTotale())

      // accessibilità del form con tutte le righe di aumenti e riduzioni
      const axeSrc = fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8'); await js(axeSrc + '; true')
      // axe misura i colori finali: senza transizioni un cambio di tema non lascia un pulsante a metà sfumatura
      await getWindow().webContents.insertCSS('*,*::before,*::after{transition:none!important;animation:none!important}')
      await setChk('Class action'); await setChk('Conciliazione'); await sleep(300)
      for (const tema of ['light', 'dark']) {
        // il tema si cambia dalle impostazioni, come fa l'utente: così l'app ricalcola anche il colore principale per quel tema
        db.setSettings({ tema: tema === 'light' ? 'chiaro' : 'scuro' }); getWindow().webContents.send('data-changed', ['settings']); await sleep(600)
        for (const tab of ['Aumenti', 'Riduzioni']) {
          await clickText('.tabs button', tab); await sleep(300)
          const viol = await js(`axe.run(document.querySelector('.modal'), { resultTypes: ['violations'] }).then(r => r.violations.map(v => v.id + ':' + v.nodes.map(n => n.target.join(' ') + ' ' + ((n.any[0] && n.any[0].message) || '').slice(0, 90)).join(' || ')))`)
          check(`accessibilità (axe-core) del calcolatore, scheda ${tab}, tema ${tema}`, viol.length === 0, JSON.stringify(viol))
        }
      }
      await setChk('Class action'); await setChk('Conciliazione'); await clickText('.tabs button', 'Aumenti'); await sleep(300)

      // ---- T.A.R.: variazioni specifiche della competenza ----
      await setSel('Competenza', 320); await attendi(async () => /Cautelare/.test(await js('document.querySelector(".calc-form").innerText')))
      const aumTar = await js('document.querySelector(".calc-form").innerText')
      check('T.A.R.: compaiono motivi aggiunti e ricorso incidentale (non presenti per il tribunale)', /Motivi aggiunti/.test(aumTar) && /Ricorso incidentale/.test(aumTar) && !/Memoria ex art. 378/.test(aumTar))
      await setSel('Competenza', 220); await sleep(1500)
      check('Cassazione: compare la memoria ex art. 378 c.p.c.', /Memoria ex art. 378/.test(await js('document.querySelector(".calc-form").innerText')))

      // ---- penale ----
      await setSel('Competenza', 570)
      const okP = await attendi(async () => (await compensoTotale()) === '3.592,00')
      const formP = await js('document.querySelector(".calc-form").innerText')
      check('penale: tribunale monocratico 3.592 (473 + 567 + 1.134 + 1.418), senza scaglioni né valore', okP && !/Scaglione/.test(formP) && !/Valore €/.test(formP), String(await compensoTotale()))
      await setSel('Numero di parti', 4); await sleep(300); await setSel('Percentuale di aumento per più parti', 60); await sleep(500)
      await clickText('.tabs button', 'Riduzioni'); await sleep(300); await setChk('Gratuito patrocinio'); await sleep(500)
      const rid = await js('document.querySelector(".calc-form").innerText')
      check('penale: il gratuito patrocinio è «1/3» e non c\'è la responsabilità art. 96', /1\/3/.test(rid) && !/Resp\. art\. 96/.test(rid))
      check('penale: 3.592 + 60% = 5.747,20 poi −1/3 → 3.831,47', (await compensoTotale()) === '3.831,47', await compensoTotale())
      await shot('giud-2-penale')

      // ---- tabelle 2014: le competenze introdotte dopo sono disabilitate ----
      await setSel('Competenza', 110); await sleep(800); await setSel('Tabelle', 2014); await sleep(1200)
      const dis = await js(`[...document.querySelectorAll('select[aria-label="Competenza"] option')].filter(o => o.disabled).map(o => o.textContent)`)
      check('tabelle 2014: 5 competenze non previste sono disattivate e segnalate', dis.length === 5 && dis.every((x) => /solo tabelle 2022/.test(x)), JSON.stringify(dis))
      await clickText('.tabs button', 'Riduzioni'); await sleep(300)
      const rid14 = await js('document.querySelector(".calc-form").innerText')
      check('tabelle 2014: «Resp. art. 96 e pronunce in rito» al posto delle due riduzioni del 2022', /Resp\. art\. 96 c\.p\.c\. e pronunce in rito/.test(rid14) && !/Pronunce in rito:/.test(rid14))
      await setSel('Tabelle', 2022); await sleep(1000)

      // ---- salvataggio come nota pro forma e riapertura ----
      await setSel('Competenza', 110); await attendi(async () => (await compensoTotale()) === '5.077,00')
      await clickText('.tabs button', 'Aumenti'); await sleep(300)
      await setSel('Numero di parti', 2); await sleep(300); await setSel('Percentuale di aumento per più parti', 30); await sleep(300)
      await clickText('.tabs button', 'Riduzioni'); await sleep(300); await setChk('Assenza questioni di fatto e diritto'); await sleep(300); await setSel('Assenza questioni di fatto e diritto: percentuale', 10); await sleep(300)
      await clickText('button', 'Nota pro forma'); await sleep(600)
      // gli accessori partono spenti: salvando il PDF così compare l'avviso; si annulla e si includono
      await clickText('.modal button', 'Salva PDF'); await sleep(600)
      check('PDF senza IVA e CPA: avviso prima di salvare', await js(`[...document.querySelectorAll('.modal h2')].some((h) => h.textContent === 'Mancano IVA o CPA')`))
      await clickText('.modal button', 'Annulla'); await sleep(400)
      await clickText('.modal button', 'Includi accessori'); await sleep(400)
      await clickText('.modal button', 'Salva PDF'); await sleep(3500)
      const pdf = fs.readdirSync(out).find((f) => /^Nota-pro-forma.*\.pdf$/.test(f))
      check('PDF della nota pro forma creato', pdf && fs.readFileSync(path.join(out, pdf)).subarray(0, 4).toString() === '%PDF', pdf)
      try {
        const txt = require('node:child_process').execFileSync('pdftotext', ['-layout', path.join(out, pdf), '-'], { encoding: 'utf8' })
        check('PDF: intestazione civile, fasi, aumento per più parti, riduzione, totali', ['NOTA PRO FORMA', 'D.M. n. 147', 'Fase di studio della controversia', 'Maggiorazione 1', 'Riduzione 1', 'Riepilogo degli importi', 'Netto da pagare', 'Sistema di Interscambio'].every((x) => txt.replace(/\s+/g, ' ').includes(x)), txt.length + ' caratteri')
      } catch { console.log('(pdftotext non disponibile: controllo del contenuto del PDF saltato)') }
      // Salva PDF salva già il documento e chiude l’editor.
      if (await js('!!document.querySelector(".modal")')) await clickText('.modal .btn-primary', 'Salva')
      await sleep(1500)
      const par = db.list('parcelle')[0]
      const det = par && JSON.parse(par.calcolo || '{}')
      check('la parcella salva il calcolo con aumenti e riduzioni', par && det.dettaglio?.ambito === 'civile' && det.dettaglio.aumenti?.length === 1 && det.dettaglio.riduzioni?.length === 1 && det.state?.competenza === 110, JSON.stringify(det.dettaglio?.aumenti))
      check('importi: 5.077 + 30% = 6.600,10; −10% → 5.940,09', Math.abs(par?.compensi - 5940.09) < 0.005, String(par?.compensi))
      await sleep(500)
      await clickText('.nav-item', 'Parcelle'); await sleep(500)
      await js(`document.querySelector('.table tbody tr')?.click()`); await sleep(2500)
      const stato = await attendi(async () => (await compensoTotale()) === '5.940,09', 8000)
      check('riaprendo la parcella il calcolo è ripristinato identico (competenza, parti, riduzione)', stato, String(await compensoTotale()))

      const bad = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e, e && e.stack) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}
module.exports = { attach }
