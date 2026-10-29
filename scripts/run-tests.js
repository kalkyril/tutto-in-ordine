'use strict'
// Esegue tutte le prove di `npm test` una dopo l'altra senza fermarsi alla prima che fallisce, poi elenca quelle fallite.
// In CI mostra in un solo giro tutto ciò che non va su un sistema (es. Windows), invece di un errore per volta.
const { spawnSync } = require('node:child_process')
const pkg = require('../package.json')

const prove = pkg.scripts.test.split('&&').map((s) => s.trim().replace(/^npm run /, ''))
const fallite = []
for (const nome of prove) {
  console.log(`\n=== ${nome}`)
  const r = spawnSync('npm', ['run', '--silent', nome], { stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) fallite.push(nome)
}
console.log(`\n${prove.length - fallite.length}/${prove.length} prove superate`)
if (fallite.length) { console.log('Fallite: ' + fallite.join(', ')); process.exit(1) }
