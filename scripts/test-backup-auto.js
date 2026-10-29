'use strict'
// Backup automatico: attivo di default (cartella predefinita), cadenza giornaliera, rotazione, cartella scelta sparita, disattivazione.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const db = require('../electron/db')
const backup = require('../electron/backup')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-bk-'))
db.open(path.join(tmp, 'dati'))
db.save('anagrafica', { denominazione: 'Prova', ruolo: 'cliente', tipo: 'persona' })
const pred = path.join(tmp, 'Documenti', 'TIO Backup')
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
const H = 3600 * 1000, t0 = Date.now()
const conta = (d) => fs.readdirSync(d).filter((x) => x.startsWith('TIO-auto-')).length

assert.equal(backup.autoBackupIfDue({}, null, t0), null); assert.ok(!fs.existsSync(pred))
const d1 = backup.autoBackupIfDue({}, pred, t0); assert.ok(d1 && fs.existsSync(path.join(d1, 'mngmnt.db')) && conta(pred) === 1)
ok('senza impostazioni parte da solo nella cartella predefinita (creata); senza cartella predefinita non fa nulla')
const s = { backup_ultimo: new Date(t0).toISOString() }
assert.equal(backup.autoBackupIfDue(s, pred, t0 + 5 * H), null); assert.equal(conta(pred), 1)
const nuovoNome = () => { const w = Date.now() + 1100; while (Date.now() < w); }
nuovoNome(); assert.ok(backup.autoBackupIfDue(s, pred, t0 + 21 * H)); assert.equal(conta(pred), 2)
ok('una sola volta al giorno (non prima di 20 ore dall\'ultimo)')
for (let i = 0; i < 4; i++) { nuovoNome(); backup.autoBackupIfDue({ backup_mantieni: 3 }, pred, t0) }
assert.equal(conta(pred), 3); ok('conserva solo gli ultimi N backup')
assert.equal(backup.autoBackupIfDue({ backup_automatico: false }, pred, t0), null)
const scelta = path.join(tmp, 'DiscoEsterno'); assert.equal(backup.autoBackupIfDue({ backup_cartella: scelta }, pred, t0), null); assert.ok(!fs.existsSync(scelta))
ok('disattivabile; se la cartella scelta non c\'è (disco scollegato) non la ricrea e non ripiega in silenzio altrove')
fs.mkdirSync(scelta); nuovoNome(); const d2 = backup.autoBackupIfDue({ backup_cartella: scelta }, pred, t0); assert.ok(d2 && d2.startsWith(scelta))
ok('con la cartella scelta dall\'utente usa quella')
// cartella in cui non si può scrivere (come Documenti con la protezione ransomware di Windows): messaggio chiaro e niente tentativi ogni 5 minuti
;(async () => {
  const protetta = path.join(tmp, 'Protetta'); fs.mkdirSync(protetta); fs.chmodSync(protetta, 0o500)
  const base = { backup_cartella: protetta, backup_ultimo: '', backup_tentativo: '' }
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    assert.ok(await backup.autoBackupAsync(base, null))
    const dopo = db.getSettings()
    assert.equal(dopo.backup_esito, 'errore'); assert.equal(dopo.backup_negato, true)
    assert.match(dopo.backup_errore, /^Non hai i permessi per scrivere in «.*Protetta/)
    assert.equal(await backup.autoBackupAsync({ ...base, backup_tentativo: new Date(Date.now() - 3600000).toISOString(), backup_negato: true }, null), false)
    assert.equal(await backup.autoBackupAsync({ ...base, backup_tentativo: new Date(Date.now() - 3600000).toISOString(), backup_negato: false }, null), true)
    ok('cartella non scrivibile: errore spiegato e nuovo tentativo dopo 6 ore invece che dopo 5 minuti')
  }
  fs.chmodSync(protetta, 0o700)
  db.close(); fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`\n${n} prove superate`)
})().catch((e) => { console.error(e); process.exit(1) })
