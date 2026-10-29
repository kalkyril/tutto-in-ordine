'use strict'
// Coerenza tra interfaccia e processo principale: ogni canale richiesto dal renderer ha un gestore, ogni gestore è raggiungibile
// dall'elenco consentito del preload, e non esistono canali duplicati. Intercetta i guasti che nessuno scenario percorre
// (un pulsante usato di rado che chiama un canale rinominato).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const root = path.join(__dirname, '..')

function leggi(dir, ext) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? leggi(path.join(dir, e.name), ext) : ext.test(e.name) ? [path.join(dir, e.name)] : [])
}
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8')
const consentiti = new RegExp(preload.match(/const INVOKE = \/(.*)\/\n/)[1])
const gestori = new Map() // canale -> file
for (const f of leggi(path.join(root, 'electron', 'ipc'), /\.js$/)) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bhandle\(\s*'([^']+)'/g)) {
    if (gestori.has(m[1])) assert.fail(`canale ${m[1]} registrato due volte (${path.basename(gestori.get(m[1]))} e ${path.basename(f)})`)
    gestori.set(m[1], f)
  }
}
const richiesti = new Map() // canale -> file
for (const f of leggi(path.join(root, 'src'), /\.(ts|tsx)$/)) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/\b(?:inv|invoke)\(\s*'([a-zA-Z]+:[A-Za-z]+)'/g)) richiesti.set(m[1], f)
}

test('ogni canale usato dall’interfaccia ha un gestore nel processo principale', () => {
  const mancanti = [...richiesti].filter(([c]) => !gestori.has(c)).map(([c, f]) => `${c} (${path.relative(root, f)})`)
  assert.deepEqual(mancanti, [], 'canali senza gestore: ' + mancanti.join(', '))
})
test('ogni gestore è raggiungibile dall’elenco consentito del preload', () => {
  const irraggiungibili = [...gestori.keys()].filter((c) => !consentiti.test(c))
  assert.deepEqual(irraggiungibili, [], 'canali bloccati dal preload: ' + irraggiungibili.join(', '))
})
test('nessun gestore resta senza chiamanti (codice morto o canale rinominato a metà)', () => {
  const dalTest = new Set(leggi(path.join(root, 'scripts'), /\.(js|mjs)$/).flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/'([a-zA-Z]+:[A-Za-z]+)'/g)].map((m) => m[1])))
  const inutilizzati = [...gestori.keys()].filter((c) => !richiesti.has(c) && !dalTest.has(c))
  assert.deepEqual(inutilizzati, [], 'gestori mai chiamati: ' + inutilizzati.join(', '))
})
test('l’elenco dei canali non è vuoto (il controllo legge davvero i file)', () => {
  assert.ok(gestori.size > 40 && richiesti.size > 30, `gestori ${gestori.size}, richieste ${richiesti.size}`)
})
