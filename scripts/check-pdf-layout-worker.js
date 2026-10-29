'use strict'
// Isolated inspection/rendering of synthetic PDF exports used by UI smoke tests.
const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs')
async function inspect() {
  const { createCanvas } = require('@napi-rs/canvas')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(workerData.file)), isEvalSupported: false, useSystemFonts: false, disableFontFace: true })
  const doc = await task.promise
  try {
    const page = await doc.getPage(1)
    const content = await page.getTextContent()
    const operators = await page.getOperatorList()
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    if (workerData.png) fs.writeFileSync(workerData.png, canvas.toBuffer('image/png'))
    return { pages: doc.numPages, text: content.items.map(i => i.str || '').join(' '),
      images: operators.fnArray.filter(fn => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject).length,
      items: content.items.filter(i => i.str).map(i => ({ text: i.str, x: i.transform[4], y: i.transform[5], height: i.height })) }
  } finally { await task.destroy() }
}
inspect().then(result => parentPort.postMessage(result)).catch(error => parentPort.postMessage({ error: error.stack }))
