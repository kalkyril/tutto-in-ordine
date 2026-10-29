'use strict'
// Nel profilo ditta gli impegni non parlano di udienze; nello studio legale sì.
function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const js = (c) => wc.executeJavaScript(c, true)
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const testo = () => js('document.body.innerText')
  let ok = true, totale = 0, superati = 0
  const check = (nome, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + nome); totale++; if (cond) superati++; else ok = false }
  const prova = async (profilo) => {
    db.setSettings({ onboarding_fatto: true, profilo, backup_automatico: false })
    await js('location.reload()'); await sleep(1800)
    const ditta = profilo === 'ditta'
    const pan = await testo()
    check(`${profilo}: Panoramica vuota`, ditta ? /Scadenze e appuntamenti compaiono qui/.test(pan) && !/Udienze, termini/.test(pan) : /Udienze, termini e appuntamenti compaiono qui/.test(pan))
    await clickText('.nav-item', 'Agenda'); await sleep(800)
    const ag = await testo()
    check(`${profilo}: sottotitolo dell'Agenda`, ditta ? /Scadenze e appuntamenti/.test(ag) && !/Scadenze, udienze e appuntamenti/.test(ag) : /Scadenze, udienze e appuntamenti/.test(ag))
    await clickText('button', 'Stampa'); await sleep(600)
    const st = await testo()
    check(`${profilo}: stampa agenda`, ditta ? /PDF da portare con te/.test(st) && !/udienz/i.test(st.split('Stampa agenda')[1] || '') : /PDF da portare in udienza/.test(st))
    await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(400)
    await clickText('.nav-item', 'Pratiche'); await sleep(700)
    await js(`[...document.querySelectorAll('.pcard h2, .pcard .titolo, .plain-row b')].find(e => /Prova profilo/.test(e.textContent))?.click()`); await sleep(900)
    await clickText('.tabs button', 'Scadenze'); await sleep(600)
    const pr = await testo()
    check(`${profilo}: scheda della pratica`, ditta ? /Scadenze e appuntamenti/.test(pr) && !/Scadenze, udienze e appuntamenti/.test(pr) : /Scadenze, udienze e appuntamenti/.test(pr))
    await clickText('.nav-item', 'Panoramica'); await sleep(500)
  }
  db.save('pratiche', { numero: '2026/001', titolo: 'Prova profilo', stato: 'Aperta', tipo: 'Commessa' })
  wc.once('did-finish-load', async () => {
    try { await sleep(800); await prova('ditta'); await prova('avvocato'); console.log(`\nRISULTATO: ${superati}/${totale} controlli superati`) }
    catch (e) { console.log('ERRORE', e); ok = false }
    finally { setTimeout(() => process.exit(ok ? 0 : 1), 300) }
  })
}
module.exports = { attach }
