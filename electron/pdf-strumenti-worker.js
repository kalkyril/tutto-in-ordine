'use strict'
// Editor PDF: unione, divisione e salvataggio delle modifiche fuori dal processo principale (la finestra resta reattiva
// anche con documenti di centinaia di megabyte). L'avanzamento torna al processo principale, che lo mostra nella finestra.
const { parentPort, workerData } = require('node:worker_threads')
const strumenti = require('./pdf-strumenti')

let ultimo = 0
const avanza = (fatto, totale, fase) => { const t = Date.now(); if (t - ultimo < 120 && fatto < totale) return; ultimo = t; parentPort.postMessage({ avanzamento: { fatto, totale, fase } }) }
const azioni = { unisci: strumenti.unisci, dividi: strumenti.dividi, modifica: strumenti.modifica }

Promise.resolve().then(() => {
  const fn = azioni[workerData.azione]; if (!fn) throw new Error('Operazione non prevista')
  return fn(workerData.dati, avanza)
}).then((esito) => parentPort.postMessage({ esito })).catch((e) => parentPort.postMessage({ error: e.message || String(e) }))
