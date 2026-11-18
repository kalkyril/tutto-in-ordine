// Prove del controllo di conflitto di interessi (TypeScript eseguito tramite esbuild di Vite).
import { build } from 'vite'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const out = path.join(os.tmpdir(), `mngmnt-conflitti-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/conflitti.ts', formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(out).href)
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
const A = (id, denominazione, extra = {}) => ({ id, denominazione, tipo: 'persona', ruolo: 'cliente', ...extra })
const rossi = A(1, 'Mario Rossi', { codice_fiscale: 'RSSMRA80B01F205X' })
const rossiBis = A(2, 'ROSSI Mario')           // doppione inserito due volte
const rossiCf = A(3, 'M. Rossi', { codice_fiscale: 'rssmra80b01f205x' })
const bianchi = A(4, 'Bianchi Costruzioni S.r.l.', { tipo: 'azienda', partita_iva: '01234567897' })
const bianchiBis = A(5, 'Bianchi Costruzioni Srl')
const altro = A(6, 'Luigi Verdi')
const mappa = new Map([rossi, rossiBis, rossiCf, bianchi, bianchiBis, altro].map((a) => [a.id, a]))
const pr = [{ id: 10, numero: '2024/010', titolo: 'Rossi c. Bianchi', cliente_id: 1, controparte_id: 4 }, { id: 11, numero: '2025/003', titolo: 'Verdi', cliente_id: 6, controparte_id: 5 }]
const cerca = m.indiceConflitti(pr, mappa)
assert.deepEqual(cerca(rossi, 'controparte').map(c => c.pratica.id), [10]); ok('Mario Rossi compare come cliente nella pratica 10')
assert.equal(cerca(rossi, 'cliente').length, 0); ok('stesso cliente in più pratiche senza conflitto')
assert.equal(cerca(rossiBis, 'controparte').length, 1)
assert.equal(cerca(rossiCf, 'controparte').length, 1)
assert.equal(cerca(bianchiBis, 'cliente').length, 2)
assert.equal(cerca(bianchi, 'cliente').length, 2); ok('identità per nome invertito, codice fiscale e ragione sociale')
assert.equal(m.indiceConflitti(pr, mappa, 10)(rossi, 'controparte').length, 0); ok('la pratica modificata è esclusa')
assert.equal(cerca(undefined, 'cliente').length, 0)
assert.equal(m.indiceConflitti([], mappa)(altro, 'cliente').length, 0); ok('nessuna persona o pratica')
const aggiuntive = { id: 12, persone: JSON.stringify([{ id: 1, ruolo: 'controparte' }, { id: 2, ruolo: 'controparte' }, { id: 6, ruolo: 'fornitore' }]) }
const altre = m.indiceConflitti([...pr, aggiuntive], mappa)
assert.deepEqual(altre(rossi, 'cliente').map(c => c.pratica.id), [12])
assert.equal(altre(altro, 'cliente').length, 0); ok('controparte aggiuntiva trovata una sola volta, fornitore escluso')
console.log(`\n${n} prove superate`)
