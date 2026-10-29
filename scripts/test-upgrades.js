'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { DatabaseSync } = require('node:sqlite'), { spawnSync } = require('node:child_process')
const db = require('../electron/db'), backup = require('../electron/backup')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-upgrades-'))
let n = 0; const ok = s => console.log(`ok ${++n} - ${s}`)
// Archivi sintetici ricostruiti dalle migrazioni: non sostituiscono una prova con i vecchi eseguibili.
function fixture(dir, version) {
  db.open(dir)
  const cli = db.save('anagrafica', { denominazione: 'Cliente sintetico', codice_fiscale: 'CF-DI-PROVA' })
  const p = db.save('pratiche', { titolo: 'Fascicolo da conservare', cliente_id: cli.id, numero: '2026/003' })
  const inv = db.saveParcella({ data: '2026-10-14', cliente_id: cli.id, pratica_id: p.id, netto: 1229.12, totale: 1459.12, tipo: 'proforma', voci: [{ tipo: 'compenso', descrizione: 'Voce storica', quantita: 1, importo: 1000 }] })
  fs.writeFileSync(path.join(dir, 'documenti', 'atto.txt'), 'ALLEGATO STORICO')
  db.save('documenti', { pratica_id: p.id, nome: 'atto.txt', file: 'atto.txt', dimensione: 15 })
  db.setSettings({ studio: { nome: 'Studio sintetico' } }); db.close()
  const sql = new DatabaseSync(path.join(dir, 'mngmnt.db'))
  sql.exec('PRAGMA foreign_keys=OFF; DROP TABLE pagamenti; DROP TABLE costi; DROP TABLE ricorrenze; DROP INDEX idx_documento_preventivo')
  for (const c of ['validita','esito_preventivo','origine_preventivo_id','contributo_nome','contributo_ritenuta','incassi_dettagliati']) sql.exec('ALTER TABLE parcelle DROP COLUMN '+c)
  for (const c of ['budget_ore','budget_importo','consegna']) sql.exec('ALTER TABLE pratiche DROP COLUMN '+c)
  if (version < 4) sql.exec('PRAGMA foreign_keys=OFF; ALTER TABLE parcelle DROP COLUMN importazione')
  if (version < 3) sql.exec('ALTER TABLE documenti_testo DROP COLUMN sorgente')
  if (version < 2) sql.exec(`
    DROP TABLE eventi_esterni; DROP TABLE calendari; DROP TABLE cronologia; DROP TABLE documenti_testo; DROP TABLE alert_fired;
    DROP INDEX idx_documenti_ora;
    ALTER TABLE parcelle DROP COLUMN calcolo; ALTER TABLE parcelle DROP COLUMN incassato; ALTER TABLE parcelle DROP COLUMN scadenza_pagamento;
    ALTER TABLE ore DROP COLUMN dettagli; ALTER TABLE documenti DROP COLUMN ora_id;
    ALTER TABLE documenti DROP COLUMN percorso; ALTER TABLE documenti DROP COLUMN impronta; ALTER TABLE documenti DROP COLUMN rel; ALTER TABLE pratiche DROP COLUMN cartella;
  `)
  sql.exec(`PRAGMA user_version=${version}`); sql.close()
  return inv.id
}
try {
  for (const version of [0, 1, 2, 3, 4]) {
    const dir = path.join(root, `v${version}`), id = fixture(dir, version)
    const legacyBackup = path.join(root, `backup-v${version}`); fs.cpSync(dir, legacyBackup, { recursive: true })
    assert.equal(backup.inspect(legacyBackup).valido, true)
    for (let repeat = 0; repeat < 2; repeat++) {
      db.open(dir)
      const p = db.getParcella(id)
      assert.equal(p.netto, 1229.12); assert.equal(p.totale, 1459.12); assert.equal(p.numero, 'PF 1/2026')
      assert.equal(p.voci[0].importo, 1000); assert.equal(p.importazione, null)
      assert.equal(db.list('pratiche')[0].titolo, 'Fascicolo da conservare')
      assert.equal(db.getSettings().studio.nome, 'Studio sintetico')
      assert.equal(fs.readFileSync(path.join(dir, 'documenti', 'atto.txt'), 'utf8'), 'ALLEGATO STORICO')
      assert.equal(db.getDb().prepare('PRAGMA user_version').get().user_version, db.SCHEMA_VERSION)
      assert.equal(db.getDb().prepare('PRAGMA foreign_key_check').all().length, 0)
      assert.equal(db.verificaIntegrita(), true); db.close()
    }
    db.open(dir); backup.restore(legacyBackup); assert.equal(db.getParcella(id).netto, 1229.12); db.close()
    ok(`schema ${version}: aggiornamento, seconda apertura e ripristino conservano dati, voci, numeri e allegati`)
  }
  const interrupted = path.join(root, 'interrotto'); fixture(interrupted, 1)
  const code = `const {DatabaseSync}=require('node:sqlite'),exec=DatabaseSync.prototype.exec;DatabaseSync.prototype.exec=function(sql){const r=exec.call(this,sql);if(sql.includes('ALTER TABLE documenti ADD COLUMN percorso'))process.kill(process.pid,'SIGKILL');return r};require('./electron/db').open(process.argv[1])`
  const result = spawnSync(process.execPath, ['-e', code, interrupted], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 20000 })
  assert.ok(result.signal === 'SIGKILL' || (process.platform === 'win32' && result.status !== 0), result.stderr)
  const probe = new DatabaseSync(path.join(interrupted, 'mngmnt.db'))
  assert.equal(probe.prepare('PRAGMA user_version').get().user_version, 1)
  assert.ok(!probe.prepare('PRAGMA table_info(parcelle)').all().some(c => c.name === 'calcolo')); probe.close()
  db.open(interrupted); assert.equal(db.list('parcelle')[0].netto, 1229.12); db.close()
  ok('crash durante le migrazioni: modifiche parziali annullate e aggiornamento completabile al riavvio')
  const future = path.join(root, 'futuro'); fixture(future, 3)
  const newer = new DatabaseSync(path.join(future, 'mngmnt.db')); newer.exec('PRAGMA user_version=999'); newer.close()
  assert.throws(() => db.open(future), e => e.code === 'ARCHIVE_NEWER_VERSION'); db.close()
  const untouched = new DatabaseSync(path.join(future, 'mngmnt.db'))
  assert.equal(untouched.prepare('PRAGMA user_version').get().user_version, 999)
  assert.ok(!untouched.prepare('PRAGMA table_info(parcelle)').all().some(c => c.name === 'importazione')); untouched.close()
  ok('archivio futuro rifiutato prima di applicare migrazioni o creare nuove tabelle')
} finally { db.close(); fs.rmSync(root, { recursive: true, force: true }) }
console.log(`${n} prove migrazione superate`)
