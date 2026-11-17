'use strict'
// Editor PDF: immagini delle pagine per l'anteprima (miniature e pagina grande). Il documento resta aperto in questo
// processo finché l'editor lo usa: ogni pagina si disegna a richiesta, una per volta, senza rileggere il file.
const { parentPort, workerData } = require('node:worker_threads')
const strumenti = require('./pdf-strumenti')

let aperto = null // { task, doc }
let coda = Promise.resolve()

async function apri() {
  const dati = strumenti.leggi(workerData.percorso)
  aperto = await strumenti.apriPdfjs(dati, workerData.password)
  const pagine = []
  for (let n = 1; n <= aperto.doc.numPages; n++) {
    // le dimensioni di tutte le pagine servono subito per impaginare le miniature; oltre le prime 2.000 si assume il formato della prima
    if (n > 2000) { pagine.push(pagine[0]); continue }
    const p = await aperto.doc.getPage(n), v = p.getViewport({ scale: 1 })
    pagine.push({ w: v.width, h: v.height }); p.cleanup()
  }
  return { pagine, byte: dati.length }
}

parentPort.on('message', (m) => {
  coda = coda.then(async () => {
    try {
      if (m.tipo === 'pagina') {
        const { canvas } = await strumenti.disegnaPagina(aperto.doc, m.numero, { larghezza: m.larghezza, rotazione: m.rotazione || 0, maxPixel: 16e6 })
        const jpeg = await canvas.encode('jpeg', m.larghezza > 600 ? 88 : 78)
        parentPort.postMessage({ id: m.id, immagine: 'data:image/jpeg;base64,' + jpeg.toString('base64') })
      } else if (m.tipo === 'chiudi') { await aperto?.task.destroy().catch(() => {}); parentPort.postMessage({ id: m.id, chiuso: true }); process.exit(0) }
    } catch (e) { parentPort.postMessage({ id: m.id, error: e.message || String(e) }) }
  })
})

apri().then((info) => parentPort.postMessage({ pronto: info })).catch((e) => { parentPort.postMessage({ error: e.message || String(e) }); process.exit(0) })
