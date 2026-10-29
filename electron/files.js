'use strict'
// Nomi di file sicuri su tutti i sistemi operativi (Windows incluso).
const path = require('node:path')

const RISERVATI = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

function safeName(n, fallback = 'file') {
  let s = String(n ?? '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/^[.\s]+/, '').replace(/[.\s]+$/, '').trim()
  const ext = path.extname(s)
  let stem = ext ? s.slice(0, -ext.length) : s
  if (RISERVATI.test(stem)) stem = '_' + stem                 // CON, PRN, AUX, NUL, COM1…
  // lunghezza massima 150 caratteri conservando l'estensione
  const maxStem = Math.max(1, 150 - ext.length)
  if (stem.length > maxStem) stem = stem.slice(0, maxStem).trim()
  s = (stem + ext).trim()
  return s || fallback
}

// file che il sistema avvierebbe come programmi o script: un archivio ripristinato da altri potrebbe collegarne uno
const PROGRAMMI = new Set(['.exe', '.com', '.bat', '.cmd', '.scr', '.pif', '.msi', '.msp', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.hta', '.cpl', '.lnk', '.url', '.reg', '.jar', '.app', '.command', '.tool', '.sh', '.pkg', '.mpkg', '.terminal', '.workflow', '.scpt', '.applescript', '.webloc', '.inetloc'])
const eseguibile = (p) => PROGRAMMI.has(path.extname(String(p ?? '')).toLowerCase())

module.exports = { safeName, eseguibile }
