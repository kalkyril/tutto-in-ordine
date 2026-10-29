'use strict'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function clickTextReady(js, selector, text) {
  const tentativi = Math.round(50 * require('./lib/attesa').fattoreCarico()) // 5 s a computer libero, fino a 15 s sotto carico
  for (let i=0; i<tentativi; i++) {
    const found = await js(`(() => { const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim().includes(${JSON.stringify(text)}) && e.getClientRects().length && !e.closest('[inert]') && !e.disabled); if(!el)return false;el.click();return true })()`)
    if (found) return true
    await wait(100)
  }
  // il messaggio dice che cosa c'era a schermo: un «elemento non pronto» senza contesto costringe a rifare la prova a mano
  let stato = ''
  try { stato = await js(`(() => { const m = [...document.querySelectorAll('.modal h2')].map((h) => h.textContent).join(' | '); return 'finestre aperte: [' + m + '] · sidebar inerte: ' + !!document.querySelector('.sidebar[inert], [inert] .sidebar') + ' · testo: ' + document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160) })()`) } catch (e) { stato = 'pagina non leggibile: ' + e.message }
  throw new Error(`Elemento non pronto: ${selector} / ${text} — ${stato}`)
}
async function discardAfterEscape(js) {
  await wait(80)
  return js(`(() => { const modals=[...document.querySelectorAll('.modal')]; const modal=modals.find(m=>/^(Modifiche non salvate|Impostazioni non salvate)$/.test(m.querySelector('h2')?.textContent)); const button=modal && [...modal.querySelectorAll('button')].find(b=>b.textContent.trim()==='Scarta modifiche'); if(button){button.click();return true}return false })()`)
}
module.exports={clickTextReady,discardAfterEscape}
