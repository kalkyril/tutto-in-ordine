'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const db = require('../electron/db'), backup = require('../electron/backup'), { create } = require('../electron/backup-key')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-backup-encryption-'))
let n = 0; const ok = s => console.log(`ok ${++n} - ${s}`)
// Adattatore di prova: verifica il contratto con il portachiavi senza toccare quello dell'utente.
const key = crypto.randomBytes(32)
let available = true
const storage = {
  isEncryptionAvailable: () => available,
  isAsyncEncryptionAvailable: async () => available,
  getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptStringAsync: async value => { const nonce = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, nonce); return Buffer.concat([nonce, c.update(value), c.final(), c.getAuthTag()]) },
  decryptStringAsync: async value => { const c = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); c.setAuthTag(value.subarray(-16)); return { result: Buffer.concat([c.update(value.subarray(12, -16)), c.final()]).toString(), shouldReEncrypt: false } },
}
async function main() {
  try {
    const dir = path.join(root, 'data'), dest = path.join(root, 'dest'); db.open(dir); fs.mkdirSync(dest)
    db.save('pratiche', { titolo: 'Segreto sintetico' })
    const manager = create(dir, storage), password = 'Password-di-prova-2026!'
    assert.equal((await manager.status()).enabled, false)
    await assert.rejects(() => manager.configure('corta'), /12/)
    await manager.configure(password)
    assert.equal(await manager.password(), password)
    assert.ok(!fs.readFileSync(path.join(dir, 'backup-key.json'), 'utf8').includes(password))
    assert.ok(!JSON.stringify(db.getSettings()).includes(password)); ok('password ricordata cifrata separatamente da SQLite; password corta rifiutata')
    const fresh = create(dir, storage); assert.equal(await fresh.password(), password); ok('password recuperabile dopo la ricreazione del gestore locale')
    await backup.autoBackupAsync({ backup_cartella: dest }, null, { passwordProvider: () => fresh.password() })
    const saved = path.join(dest, fs.readdirSync(dest)[0]); assert.ok(fs.existsSync(path.join(saved, 'indice.enc')))
    assert.ok(!fs.existsSync(path.join(saved, 'mngmnt.db')))
    assert.equal(backup.inspect(saved, password).valido, true)
    assert.throws(() => backup.inspect(saved, 'password-errata'), /Password/)
    ok('backup automatico cifrato reale nel worker, verifica e password errata')
    const preview = path.join(root, 'unpacked'); fs.mkdirSync(preview)
    const index = path.join(root, 'index'); backup.cryptFile(path.join(saved, 'indice.enc'), index, password, true)
    const entries = JSON.parse(fs.readFileSync(index, 'utf8'))
    assert.ok(!entries.some(e => e.path.includes('backup-key') || e.path.includes('restore-state')))
    ok('chiave locale e registro di recupero esclusi dall’archivio cifrato')
    available = false
    const before = fs.readdirSync(dest)
    await backup.autoBackupAsync({ backup_cartella: dest }, null, { passwordProvider: () => fresh.password() })
    assert.deepEqual(fs.readdirSync(dest), before); assert.equal(db.getSettings().backup_esito, 'errore')
    ok('portachiavi indisponibile: errore visibile e nessun ripiego in chiaro')
    available = true
    const file = path.join(dir, 'backup-key.json'), original = fs.readFileSync(file)
    fs.writeFileSync(file, '{'); await assert.rejects(() => fresh.password(), /non accessibile/); fs.writeFileSync(file, original)
    const linux = create(dir, { ...storage, getSelectedStorageBackend: () => 'basic_text' }, 'linux')
    assert.equal((await linux.status()).available, false); await assert.rejects(() => linux.password(), /Portachiavi/)
    ok('chiave danneggiata e fallback Linux basic_text rifiutati')
    fs.unlinkSync(file)
    await assert.rejects(() => manager.password(), /mancante/)
    await backup.autoBackupAsync({ backup_cartella: dest, backup_cifrato: true }, null, { passwordProvider: () => manager.password() })
    assert.deepEqual(fs.readdirSync(dest), before); assert.equal(db.getSettings().backup_esito, 'errore')
    await backup.autoBackupAsync({ backup_cartella: dest, backup_cifrato: true }, null)
    assert.deepEqual(fs.readdirSync(dest), before)
    assert.equal(backup.autoBackupIfDue({ backup_cartella: dest, backup_cifrato: true }, null), null)
    fs.writeFileSync(file, original)
    ok('chiave cancellata o provider assente: scelta di cifrare conservata, nessuna copia in chiaro')
    const oldEncrypt = storage.encryptStringAsync
    storage.encryptStringAsync = async () => { throw new Error('Portachiavi bloccato') }
    await assert.rejects(() => manager.configure('Una-password-diversa-2026'), /bloccato/)
    storage.encryptStringAsync = oldEncrypt
    assert.deepEqual(fs.readFileSync(file), original); assert.equal(await manager.password(), password)
    ok('cambio password fallito conserva la configurazione precedente')
    const wrong = path.join(root, 'file-non-cartella'); fs.writeFileSync(wrong, 'file')
    const failure = backup.autoBackupIfDue({ backup_cartella: wrong }, null, Date.now(), { password })
    assert.equal(failure, null); assert.equal(db.getSettings().backup_esito, 'errore')
    ok('destinazione non scrivibile come cartella: errore senza perdita dell’archivio')
    const write = fs.writeSync
    fs.writeSync = function (fd, data) { if (Buffer.isBuffer(data) && data.subarray(0, 6).toString() === 'MNGC01') throw Object.assign(new Error('Disco pieno'), { code: 'ENOSPC' }); return write.apply(this, arguments) }
    try { assert.throws(() => backup.run(dest, { password }), /Disco pieno/) } finally { fs.writeSync = write }
    assert.deepEqual(fs.readdirSync(dest), before)
    assert.ok(!fs.readdirSync(dir).some(s => s.startsWith('.backup-privato-')))
    assert.equal(db.list('pratiche')[0].titolo, 'Segreto sintetico')
    ok('disco pieno durante la cifratura: eliminati residui temporanei, archivio intatto')
    let release
    const waiting = backup.autoBackupAsync({ backup_cartella: dest }, null, { passwordProvider: () => new Promise(resolve => { release = resolve }) })
    db.close(); db.open(path.join(root, 'secondo-archivio')); release(password)
    assert.equal(await waiting, false); assert.deepEqual(fs.readdirSync(dest), before)
    assert.equal(db.getSettings().backup_esito, undefined); db.close(); db.open(dir)
    ok('cambio archivio durante l’accesso al portachiavi: nessuna copia o esito assegnato al nuovo archivio')
    await manager.disable(); assert.equal((await manager.status()).enabled, false)
    assert.equal(backup.inspect(saved, password).valido, true)
    ok('disattivazione non altera le copie già cifrate, recuperabili con la password conservata')
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }) }
  console.log(`${n} prove cifratura automatica superate`)
}
main().catch(e => { console.error(e); process.exitCode = 1 })
