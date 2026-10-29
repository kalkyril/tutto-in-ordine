'use strict'
// Attese adattive per gli scenari nell'app vera.
//
// I test usavano pause a tempo fisso («aspetta 400 ms e poi controlla»): su un computer carico l'interfaccia non ha finito di
// aggiornarsi e il controllo falliva senza che ci fosse un difetto. `adattiva` mantiene la stessa firma di `sleep(ms)` ma:
//   1. allunga la pausa in proporzione al carico del computer (media degli ultimi minuti rispetto ai core);
//   2. dopo la pausa aspetta che la pagina smetta di cambiare (nessuna modifica al DOM per un breve intervallo),
//      con un tetto massimo, così non si blocca su animazioni continue.
// Le pause non diventano più lunghe quando il computer è libero: la quiete si raggiunge subito.
const os = require('node:os')

const fattoreCarico = () => Math.min(3, Math.max(1, os.loadavg()[0] / Math.max(1, os.cpus().length)))

function adattiva(wc, { quiete = 140, tetto = 1500 } = {}) {
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms))
  // prima un giro di andata e ritorno con il processo principale (accoda dopo le richieste già inviate), poi la quiete della pagina
  const attendiQuiete = (q, max) => wc.executeJavaScript(`Promise.resolve(window.mngmnt && window.mngmnt.invoke('app:statoBlocco')).catch(() => 0).then(() => new Promise((resolve) => {
    let t; const fine = () => { obs.disconnect(); clearTimeout(t); clearTimeout(limite); resolve(true) }
    const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fine, ${q}) })
    obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
    t = setTimeout(fine, ${q}); const limite = setTimeout(fine, ${max})
  }))`, true)
  return async function sleep(ms) {
    await pausa(Math.round(ms * fattoreCarico()))
    try {
      if (wc.isDestroyed() || wc.isLoading()) return
      await attendiQuiete(Math.round(quiete * fattoreCarico()), Math.round(tetto * fattoreCarico()))
    } catch { /* pagina in navigazione o già chiusa: resta la pausa semplice */ }
  }
}

/** Ripete `condizione` finché non è vera (o scade il tempo): per i punti in cui si aspetta un risultato, non una durata. */
async function attendi(condizione, { tempo = 8000, passo = 100 } = {}) {
  const t0 = Date.now()
  for (;;) {
    try { const v = await condizione(); if (v) return v } catch { /* non ancora pronto */ }
    if (Date.now() - t0 > tempo * fattoreCarico()) return false
    await new Promise((r) => setTimeout(r, passo))
  }
}

module.exports = { adattiva, attendi, fattoreCarico }
