'use strict'
const { parentPort, workerData } = require('node:worker_threads')
async function render() {
  const { createCanvas } = require('@napi-rs/canvas')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(workerData.pdf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, maxImageSize: 4000000 })
  try {
    const doc = await task.promise
    if (doc.numPages > 30) throw new Error('Il modello di esempio supera 30 pagine. Riduci testi e immagini.')
    const pagina = Math.min(workerData.pagina, doc.numPages)
    const page = await doc.getPage(pagina)
    const viewport = page.getViewport({ scale: 1.5 })
    if (viewport.width * viewport.height > 2000000) throw new Error('Formato della pagina non supportato.')
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    return { immagine: canvas.toDataURL('image/png'), pagina, pagine: doc.numPages }
  } finally { await task.destroy() }
}
render().then(result => parentPort.postMessage(result)).catch(error => parentPort.postMessage({ error: error.message }))
