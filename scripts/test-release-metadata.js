'use strict'
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..'), pkg = require('../package.json')
const minimum = pkg.build.mac.minimumSystemVersion
assert.equal(minimum, '13.0')
assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /macOS\*\* 13 Ventura/)
assert.match(fs.readFileSync(path.join(root, 'sito/index.html'), 'utf8'), /macOS 13 Ventura o successivo/)
assert.ok(require('../electron/aggiornamenti').confronta(pkg.devDependencies.electron, '44.9.1') >= 0)
assert.equal(pkg.scripts.postinstall, 'node node_modules/electron/install.js')
console.log('ok 1 - runtime corretto, download riproducibile e requisito macOS coerente tra pacchetto, README e sito')
