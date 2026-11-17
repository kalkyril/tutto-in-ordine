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
    // «Pagina N di M» dei documenti creati dai modelli è nel CSS della pagina (riquadro @bottom-right), sulla riga del piè di pagina
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    source.cleanup()
  }
}
module.exports = { createSource, renderPdf }
