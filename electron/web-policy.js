'use strict'
const { pathToFileURL, fileURLToPath } = require('node:url')
const path = require('node:path')
const appPage = pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href
function isAppUrl(value, development = false) {
  try {
    const url = new URL(value)
    return development ? url.origin === 'http://localhost:5173' : stessoFile(url.href.split(/[?#]/)[0], appPage)
  } catch { return false }
}
function denyUnusedPermissions(session, canWriteClipboard = () => false) {
  const allowed = (contents, permission) => permission === 'clipboard-sanitized-write' && !!contents && canWriteClipboard(contents)
  session.setPermissionCheckHandler((contents, permission) => allowed(contents, permission))
  session.setPermissionRequestHandler((contents, permission, callback) => callback(allowed(contents, permission)))
}
// Stesso file anche se scritto in modo diverso: Node codifica «~» come «%7E» (C:\\Users\\NOME~1\\… nelle cartelle temporanee di Windows),
// Chromium no; su Windows anche lettere maiuscole e minuscole indicano lo stesso file
function percorsoDi(value) {
  const url = new URL(value)
  if (url.protocol !== 'file:') return null
  const file = path.normalize(fileURLToPath(url))
  return process.platform === 'win32' ? file.toLowerCase() : file
}
function stessoFile(a, b) {
  try { const file = percorsoDi(a); return !!file && file === percorsoDi(b) } catch { return false }
}
function printResourceAllowed(value, documentUrl) {
  try { return value === documentUrl || stessoFile(value, documentUrl) || new URL(value).protocol === 'data:' } catch { return false }
}
module.exports = { appPage, isAppUrl, denyUnusedPermissions, printResourceAllowed, stessoFile }
