'use strict'
// Cartelle predefinite e scritture negate: su Windows TIO non scrive da sola in «Documenti», che la protezione ransomware
// («Accesso alle cartelle controllato») blocca per i programmi non firmati; un errore di permessi diventa un messaggio chiaro.
const assert = require('node:assert/strict')
const c = require('../electron/cartelle-utente')
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
const app = { getPath: (nome) => ({ home: 'C:\\Users\\avvocato', documents: 'C:\\Users\\avvocato\\Documents' })[nome] }
const mac = { getPath: (nome) => ({ home: '/Users/avvocato', documents: '/Users/avvocato/Documents' })[nome] }

assert.equal(c.basePredefinita(app, 'win32'), 'C:\\Users\\avvocato')
assert.ok(!/Documents/.test(c.backupPredefinito(app, 'win32')) && /TIO Backup$/.test(c.backupPredefinito(app, 'win32')))
assert.ok(!/Documents/.test(c.documentiPredefiniti(app, 'win32')) && /TIO$/.test(c.documentiPredefiniti(app, 'win32')))
ok('Windows: backup e documenti creati da TIO nella cartella utente, mai in Documenti')

assert.equal(c.backupPredefinito(mac, 'darwin'), require('node:path').join('/Users/avvocato/Documents', 'TIO Backup'))
assert.equal(c.documentiPredefiniti(mac, 'darwin'), require('node:path').join('/Users/avvocato/Documents', 'TIO'))
ok('Mac: restano in Documenti')

const negato = Object.assign(new Error("EPERM: operation not permitted, open 'C:\\Users\\avvocato\\Documents\\TIO Backup\\indice.json'"), { code: 'EPERM' })
const w = c.spiegaAccessoNegato(negato, 'win32')
assert.match(w.message, /Windows non permette a TIO di scrivere in «C:\\Users\\avvocato\\Documents\\TIO Backup»/)
assert.match(w.message, /Accesso alle cartelle controllato/); assert.match(w.message, /scegli un'altra cartella/)
assert.equal(w.code, 'EPERM')
const daWorker = new Error("Error: EACCES: permission denied, mkdir '/Volumes/Archivio/TIO Backup'") // dal worker arriva solo il testo
assert.match(c.spiegaAccessoNegato(daWorker, 'darwin').message, /^Non hai i permessi per scrivere in «\/Volumes\/Archivio\/TIO Backup»/)
ok('scrittura negata spiegata: su Windows come consentire TIO o scegliere un\'altra cartella, altrove i permessi; anche dai worker')

const altro = new Error('Disco pieno')
assert.equal(c.spiegaAccessoNegato(altro, 'win32'), altro); assert.equal(c.accessoNegato(altro), false)
ok('gli altri errori restano invariati')

console.log(`\n${n} prove sulle cartelle predefinite superate`)
