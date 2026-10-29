'use strict'
const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs'), path = require('node:path')

async function extract({ file, name, ocr = false }) {
  const ext = path.extname(name).toLowerCase()
  if (fs.statSync(file).size > 60 * 1024 * 1024) throw new Error('Documento troppo grande (massimo 60 MB)')
  if (ext !== '.pdf' && !ocr) { const text = require('./doctext').estrai(fs.readFileSync(file), name); return { text, status: text ? 'testo' : 'scansione' } }
  const { createCanvas } = require('@napi-rs/canvas')
  let engine, languageFolder
  const recognize = async (image) => {
    if (!engine) {
      const { createWorker } = require('tesseract.js')
      languageFolder = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mngmnt-ocr-modelli-'))
      // solo italiano: l'app è pensata per i professionisti italiani (e il modello inglese pesava 14 MB in più)
      const data = require('@tesseract.js-data/ita')
      fs.copyFileSync(path.join(data.langPath, 'ita.traineddata.gz'), path.join(languageFolder, 'ita.traineddata.gz'))
      engine = await createWorker('ita', 1, { cacheMethod: 'none', langPath: languageFolder, workerPath: require.resolve('tesseract.js/src/worker-script/node/index.js') })
    }
    return (await engine.recognize(image)).data.text
  }
  try {
    if (ext !== '.pdf') {
      if (!ocr || !['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp'].includes(ext)) throw new Error('OCR disponibile per PDF e immagini')
      return { text: (await recognize(file)).slice(0, 2 * 1024 * 1024), status: 'ocr' }
    }
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false, useSystemFonts: true, disableFontFace: true, maxImageSize: 40000000 })
    const doc = await task.promise
    try {
      if (doc.numPages > (ocr ? 20 : 1000)) throw new Error(ocr ? 'L’OCR supporta PDF fino a 20 pagine. Dividi il documento in parti più piccole.' : 'Il PDF supera il limite di 1.000 pagine')
      const parts = []; let length = 0, usedOcr = false
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i), content = await page.getTextContent()
        let text = content.items.map((item) => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join('')
        if (ocr && text.trim().length < 20) {
          let viewport = page.getViewport({ scale: 2 })
          const factor = Math.min(1, 2400 / Math.max(viewport.width, viewport.height)); viewport = page.getViewport({ scale: 2 * factor })
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
          text = await recognize(canvas.toBuffer('image/png')); usedOcr = true
        }
        parts.push(text); length += text.length; page.cleanup()
        if (length >= 2 * 1024 * 1024) break
      }
      return { text: parts.join('\n').slice(0, 2 * 1024 * 1024), status: usedOcr ? 'ocr' : parts.some((p) => p.trim()) ? 'testo' : 'scansione' }
    } finally { await task.destroy() }
  } finally { if (engine) await engine.terminate(); if (languageFolder) fs.rmSync(languageFolder, { recursive: true, force: true }) }
}
extract(workerData).then((result) => parentPort.postMessage(result)).catch((error) => parentPort.postMessage({ error: error.message }))
