'use strict'
const path = require('node:path')
const { Worker } = require('node:worker_threads')
const { renderPdf } = require('./print-pdf')

// Coalesce queued edits and run a single conversion at a time.
let running = false, pending
function previewPdf(html, pagina = 1) {
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 16 * 1024 * 1024) return Promise.reject(new Error('Modello troppo grande.'))
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 30) return Promise.reject(new Error('Pagina non valida.'))
  return new Promise((resolve, reject) => {
    if (pending) pending.resolve(null)
    pending = { html, pagina, resolve, reject }
    drain()
  })
}
async function drain() {
  if (running || !pending) return
  running = true
  const job = pending
  pending = null
  try {
    const pdf = await renderPdf(job.html)
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'pdf-preview-worker.js'), { workerData: { pdf, pagina: job.pagina } })
      let delivered = false
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Anteprima non disponibile: tempo di elaborazione superato.')) }, 20000)
      const finish = () => clearTimeout(timer)
      worker.once('message', r => { delivered = true; finish(); r.error ? reject(new Error(r.error)) : resolve(r) })
      worker.once('error', e => { finish(); reject(e) })
      worker.once('exit', () => { finish(); if (!delivered) reject(new Error('Elaborazione anteprima interrotta.')) })
    })
    job.resolve(result)
  } catch (error) { job.reject(error) } finally { running = false; drain() }
}
module.exports = { previewPdf }
