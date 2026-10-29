'use strict'
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-registro-')), log = require('../electron/registro')
try {
  log.init(dir, 'prova')
  for (const value of [
    'File assente in «/Users/prova/Cliente-Riservato/ricorso segreto.pdf»',
    "ENOENT open '/tmp/Cliente-Riservato/ricorso segreto.pdf'",
    'File assente in «C:\\Utenti\\Cliente-Riservato\\ricorso segreto.pdf»',
    'Errore su \\\\server\\Cliente-Riservato\\ricorso.pdf',
    'File: ' + path.join(os.homedir(), 'Cliente-Riservato', 'ricorso.pdf'),
    'fetch https://calendario.example/privato?token=TOKEN-RISERVATO',
  ]) log.scrivi('prova', value)
  log.scrivi('db:save', 'SQLITE_BUSY: archivio occupato')
  log.scrivi('dati', 'Data non valida: 27/10/2026 per R.G. 123/2026 e/o scadenza')
  const text = fs.readFileSync(log.percorso(), 'utf8')
  for (const secret of ['Cliente-Riservato', 'ricorso', 'TOKEN-RISERVATO', 'calendario.example', os.homedir()]) assert.ok(!text.includes(secret), 'Dato riservato nel registro: ' + secret)
  assert.ok(text.includes('[percorso rimosso]') && text.includes('[indirizzo rimosso]'))
  assert.ok(text.includes('[db:save] SQLITE_BUSY: archivio occupato'))
  assert.ok(text.includes('Data non valida: 27/10/2026 per R.G. 123/2026 e/o scadenza'), 'date e numeri con la barra conservati')
  console.log('ok 1 - percorsi POSIX, Windows, UNC, nomi dei file e URL privati rimossi dal registro; codice diagnostico conservato')
} finally { fs.rmSync(dir, { recursive: true, force: true }) }
