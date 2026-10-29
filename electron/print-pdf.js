'use strict'
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')
const { denyUnusedPermissions, printResourceAllowed } = require('./web-policy')
function createSource(html, base = os.tmpdir()) {
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 16 * 1024 * 1024) throw new Error('Documento PDF non valido o troppo grande (massimo 16 MB di HTML)')
  const dir = fs.mkdtempSync(path.join(base, 'mngmnt-print-'))
  try {
    fs.chmodSync(dir, 0o700)
    const file = path.join(dir, 'documento.html')
    fs.writeFileSync(file, html, { flag: 'wx', mode: 0o600 })
    return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
  } catch (error) { fs.rmSync(dir, { recursive: true, force: true }); throw error }
}
async function renderPdf(html) {
  const { BrowserWindow, session } = require('electron'), source = createSource(html)
  let win
  try {
    const isolated = session.fromPartition('mngmnt-print-' + crypto.randomUUID())
    denyUnusedPermissions(isolated)
    const url = pathToFileURL(source.file).href
    isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !printResourceAllowed(details.url, url) }))
    win = new BrowserWindow({ show: false, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, webviewTag: false } })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', event => event.preventDefault())
    await win.loadFile(source.file)
    // i documenti creati dai modelli possono chiedere «Pagina N di M» in fondo a ogni pagina
    const numeri = /<meta name="tio-numeri-pagina" content="1">/.test(html)
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true, ...(numeri ? { displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;font:8px Arial,sans-serif;color:#555;text-align:right;padding:0 12mm 4mm 0">Pagina <span class="pageNumber"></span> di <span class="totalPages"></span></div>' } : {}) })
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    source.cleanup()
  }
}
module.exports = { createSource, renderPdf }
