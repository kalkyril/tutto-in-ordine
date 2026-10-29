'use strict'
// Guida di TIO (cartella guida/): collegamenti interni, immagini, nessuna risorsa di rete, inclusa nell'installer e raggiungibile dall'app.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const radice = path.join(__dirname, '..')
const dir = path.join(radice, 'guida')
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)

const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
const ancore = [...html.matchAll(/href="#([^"]*)"/g)].map((m) => m[1])
const rotte = ancore.filter((a) => !ids.has(a))
assert.deepEqual(rotte, [], 'collegamenti interni senza destinazione: ' + rotte.join(', '))
assert.ok(ancore.length > 80, `pochi collegamenti nell'indice: ${ancore.length}`)
ok(`${ancore.length} collegamenti interni, tutti con una destinazione`)

const indice = html.slice(html.indexOf('<aside class="indice"'), html.indexOf('</aside>'))
const capitoli = [...html.matchAll(/<section class="capitolo" id="([^"]+)"/g)].map((m) => m[1])
assert.ok(capitoli.length >= 20 && capitoli.every((c) => indice.includes(`href="#${c}"`)), 'ogni capitolo è nell’indice')
const numeri = [...html.matchAll(/<h2><span class="num">(\d+)\.<\/span>/g)].map((m) => Number(m[1]))
assert.deepEqual(numeri, numeri.map((_, i) => i + 1), 'capitoli numerati in ordine')
ok(`${capitoli.length} capitoli numerati in ordine, tutti nell’indice`)

const immagini = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !s.endsWith('.js'))
const mancanti = immagini.filter((s) => !fs.existsSync(path.join(dir, s)))
assert.deepEqual(mancanti, [], 'immagini mancanti: ' + mancanti.join(', '))
assert.ok([...html.matchAll(/<img [^>]*>/g)].every((m) => /\salt="[^"]*"/.test(m[0])), 'ogni immagine ha il testo alternativo')
ok(`${immagini.length} immagini presenti, con testo alternativo`)

const esterni = [html, fs.readFileSync(path.join(dir, 'guida.css'), 'utf8'), fs.readFileSync(path.join(dir, 'guida.js'), 'utf8')].join('\n').match(/(src|href)=["']?https?:|url\(\s*["']?https?:|fetch\(|XMLHttpRequest|@import/g)
assert.equal(esterni, null, 'risorse di rete: ' + esterni)
assert.match(html, /Content-Security-Policy" content="default-src 'none'/)
ok('nessuna risorsa di rete e politica di sicurezza restrittiva: funziona senza internet')

for (const parola of ['Anonimizza', 'Da pagare', 'Fattura elettronica', 'Nota di credito', 'Scadenze fiscali', 'Spesa extra', 'Modelli Word', 'Backup', 'Simone Rizzo', 'Matteo Lugli'])
  assert.ok(html.includes(parola), 'manca: ' + parola)
ok('tratta le funzioni principali e cita autore e ringraziamenti')

const pkg = require('../package.json')
assert.ok(pkg.build.extraResources.some((r) => r.from === 'guida' && r.to === 'guida'), 'guida/ inclusa nell’installer')
const sistema = fs.readFileSync(path.join(radice, 'electron/ipc/sistema.js'), 'utf8'), main = fs.readFileSync(path.join(radice, 'electron/main.js'), 'utf8')
assert.match(sistema, /handle\('app:guida'/)
assert.match(main, /voce\('Guida di TIO', 'guida', 'F1'\)/)
assert.match(fs.readFileSync(path.join(radice, 'src/lib/azioni.ts'), 'utf8'), /id: 'guida'/)
ok('inclusa nell’installer, aperta da Aiuto › Guida di TIO (F1), dai comandi rapidi e dalle Impostazioni')
