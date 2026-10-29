'use strict'
// La password non entra in SQLite, nei backup o nelle risposte IPC.
const fs = require('node:fs'), path = require('node:path')
const { syncDir } = require('./restore-state')
function create(dir, storage, platform = process.platform) {
  const file = path.join(dir, 'backup-key.json')
  const available = async () => {
    if (platform === 'linux' && ['basic_text', 'unknown'].includes(storage.getSelectedStorageBackend())) return false
    return storage.isEncryptionAvailable()
  }
  const status = async () => ({ enabled: fs.existsSync(file), available: await available() })
  const ensure = async () => { if (!await available() || !await storage.isAsyncEncryptionAvailable()) throw new Error('Portachiavi di sistema non disponibile. Il backup cifrato non verrà sostituito da una copia in chiaro.') }
  const password = async () => {
    if (!fs.existsSync(file)) throw new Error('Chiave del backup automatico mancante: configura nuovamente la cifratura. Nessuna copia in chiaro è stata creata.')
    await ensure()
    try {
      const config = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (config.version !== 1 || config.provider !== 'safeStorage-async' || typeof config.cipher !== 'string') throw new Error()
      let decoded = await storage.decryptStringAsync(Buffer.from(config.cipher, 'base64'))
      if (decoded.shouldReEncrypt) decoded = await storage.decryptStringAsync(Buffer.from(config.cipher, 'base64'))
      if (typeof decoded.result !== 'string' || decoded.result.length < 12) throw new Error()
      return decoded.result
    } catch { throw new Error('Password del backup automatico non accessibile: configura nuovamente la cifratura. Conserva le password precedenti per recuperare le vecchie copie.') }
  }
  const configure = async (value) => {
    if (typeof value !== 'string' || value.length < 12 || value.length > 1024) throw new Error('Usa una password da 12 a 1024 caratteri')
    await ensure()
    const encrypted = await storage.encryptStringAsync(value)
    const decoded = await storage.decryptStringAsync(encrypted)
    if (decoded.result !== value) throw new Error('Verifica del portachiavi non riuscita')
    const tmp = file + '.tmp', fd = fs.openSync(tmp, 'w', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify({ version: 1, provider: 'safeStorage-async', cipher: encrypted.toString('base64') })); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(tmp, file); syncDir(dir)
    return status()
  }
  const disable = async () => { fs.rmSync(file, { force: true }); syncDir(dir); return status() }
  return { status, password, configure, disable }
}
let manager
module.exports = {
  create,
  init: (dir, storage) => { manager = create(dir, storage) },
  status: () => manager.status(),
  password: () => manager.password(),
  configure: value => manager.configure(value),
  disable: () => manager.disable(),
}
