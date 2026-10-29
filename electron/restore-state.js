'use strict'
// Registro persistente: prima di aprire SQLite si completa il rollback di un ripristino interrotto.
// Le sorgenti del rollback rimangono intatte fino alla rimozione durevole del registro.
const fs = require('node:fs'), path = require('node:path')
const JOURNAL = '.restore-state.json'
function syncDir(dir) {
  if (process.platform === 'win32') return // Node non espone FlushFileBuffers per le directory Windows.
  const fd = fs.openSync(dir, 'r')
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}
function syncTree(file) {
  const stat = fs.lstatSync(file)
  if (stat.isSymbolicLink()) throw new Error('Collegamento simbolico nel ripristino')
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(file)) syncTree(path.join(file, name))
    syncDir(file)
  } else {
    // Windows: FlushFileBuffers richiede un handle con accesso in scrittura, altrimenti fsync dà EPERM
    const fd = fs.openSync(file, process.platform === 'win32' ? 'r+' : 'r')
    try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  }
}
function write(dir, state) {
  const file = path.join(dir, JOURNAL), tmp = file + '.tmp'
  const fd = fs.openSync(tmp, 'w', 0o600)
  try { fs.writeFileSync(fd, JSON.stringify(state)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  fs.renameSync(tmp, file); syncDir(dir)
}
function begin(dir, staging) {
  if (fs.existsSync(path.join(dir, JOURNAL))) throw new Error('Un ripristino precedente richiede recupero')
  const state = { version: 1, stage: path.basename(staging), status: 'pending' }
  write(dir, state)
  return state
}
function clear(dir) { fs.rmSync(path.join(dir, JOURNAL), { force: true }); syncDir(dir) }
function recover(dir) {
  const file = path.join(dir, JOURNAL)
  if (!fs.existsSync(file)) return null
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Registro non valido')
    const state = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (state.version !== 1 || !/^\.restore-[A-Za-z0-9]+$/.test(state.stage) || !['pending', 'committed'].includes(state.status)) throw new Error('Registro non valido')
    const staging = path.join(dir, state.stage), target = path.join(dir, 'mngmnt.db'), docs = path.join(dir, 'documenti')
    if (fs.existsSync(staging) && fs.lstatSync(staging).isSymbolicLink()) throw new Error('Area di recupero non valida')
    if (state.status === 'pending') {
      if (!fs.existsSync(staging)) throw new Error('Area di recupero assente')
      const oldDb = path.join(staging, '_precedente.db'), oldDocs = path.join(staging, '_precedenti-documenti')
      if (fs.existsSync(oldDb)) {
        syncTree(oldDb)
        const copy = path.join(staging, '_recupero.db')
        fs.copyFileSync(oldDb, copy); syncTree(copy)
        // Un'interruzione anche qui è recuperabile: oldDb non viene spostato o cancellato.
        for (const ext of ['', '-wal', '-shm']) fs.rmSync(target + ext, { force: true })
        fs.renameSync(copy, target)
      } else if (!fs.existsSync(target)) throw new Error('Archivio precedente assente')
      if (fs.existsSync(oldDocs)) {
        syncTree(oldDocs)
        fs.rmSync(docs, { recursive: true, force: true })
        fs.cpSync(oldDocs, docs, { recursive: true }); syncTree(docs)
      }
      syncTree(target); syncDir(dir)
    }
    // Il registro è rimosso prima delle sorgenti di recupero: un secondo crash è idempotente.
    clear(dir)
    fs.rmSync(staging, { recursive: true, force: true })
    return { recovered: state.status === 'pending' }
  } catch (error) {
    const wrapped = new Error('Ripristino interrotto: impossibile completare il recupero. File conservati in ' + dir + '. ' + error.message)
    wrapped.code = 'RESTORE_RECOVERY_REQUIRED'
    throw wrapped
  }
}
module.exports = { begin, write, recover, syncTree, syncDir, JOURNAL }
