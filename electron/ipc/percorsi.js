'use strict'
// Percorsi dei documenti: tutto ciò che sta sotto <dati>/documenti, con protezione dal path traversal.
const fs = require('node:fs')
const path = require('node:path')
const db = require('../db')
const validation = require('../validation')

const docsDir = () => path.join(db.getDataDir(), 'documenti')
const praticaDir = (id) => validation.inside(docsDir(), String(validation.id(id)))

// risolve un percorso relativo dentro la cartella documenti impedendo path traversal
function docPath(rel) {
  return validation.inside(docsDir(), rel)
}

// nome libero nella cartella: «file.pdf», «file (2).pdf», …
function uniqueFile(dir, name) {
  let target = path.join(dir, name)
  const ext = path.extname(name)
  const stem = path.basename(name, ext)
  for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, `${stem} (${i})${ext}`)
  return target
}

module.exports = { docsDir, praticaDir, docPath, uniqueFile }
