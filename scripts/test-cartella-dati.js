'use strict'
// Passaggio dei dati al nuovo nome TIO: copia da MNGMNT (o da LARA Studio), senza toccare la cartella vecchia né sovrascrivere dati nuovi.
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { preparaCartellaDati } = require('../electron/cartella-dati')
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
const base = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tio-dati-'))
const scrivi = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t) }

let b = base(); scrivi(path.join(b, 'MNGMNT', 'mngmnt.db'), 'archivio'); scrivi(path.join(b, 'MNGMNT', 'backup-key.json'), '{}')
let r = preparaCartellaDati(b)
assert.equal(r.cartella, path.join(b, 'TIO')); assert.equal(r.copiataDa, path.join(b, 'MNGMNT'))
assert.equal(fs.readFileSync(path.join(b, 'TIO', 'mngmnt.db'), 'utf8'), 'archivio'); assert.ok(fs.existsSync(path.join(b, 'TIO', 'backup-key.json')))
assert.equal(fs.readFileSync(path.join(b, 'MNGMNT', 'mngmnt.db'), 'utf8'), 'archivio'); ok('dati di MNGMNT copiati in TIO, la cartella vecchia resta intatta')

scrivi(path.join(b, 'MNGMNT', 'mngmnt.db'), 'modificato dopo'); r = preparaCartellaDati(b)
assert.equal(r.copiataDa, null); assert.equal(fs.readFileSync(path.join(b, 'TIO', 'mngmnt.db'), 'utf8'), 'archivio'); ok('al secondo avvio TIO ha già i suoi dati: niente nuova copia, niente sovrascritture')

b = base(); scrivi(path.join(b, 'LARA Studio', 'lara.db'), 'molto vecchio'); r = preparaCartellaDati(b)
assert.equal(r.copiataDa, path.join(b, 'LARA Studio')); assert.ok(fs.existsSync(path.join(b, 'TIO', 'lara.db'))); ok('versioni ancora più vecchie (LARA Studio) riprese')

b = base(); scrivi(path.join(b, 'MNGMNT', 'mngmnt.db'), 'mngmnt'); scrivi(path.join(b, 'LARA Studio', 'lara.db'), 'lara'); r = preparaCartellaDati(b)
assert.equal(r.copiataDa, path.join(b, 'MNGMNT')); ok('se esistono entrambe vince la più recente (MNGMNT)')

b = base(); r = preparaCartellaDati(b); assert.equal(r.cartella, path.join(b, 'TIO')); assert.equal(r.copiataDa, null); assert.ok(!fs.existsSync(path.join(b, 'TIO'))); ok('primo uso: nessuna copia, la cartella la crea l\'app')
console.log(`\n${n} prove sul passaggio dei dati superate`)
