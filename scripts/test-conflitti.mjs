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
assert.ok(m.stessaPersona(rossi, rossiBis) && m.stessaPersona(rossi, rossiCf) && m.stessaPersona(bianchi, bianchiBis) && !m.stessaPersona(rossi, altro)); ok('stessa persona: stesso nome in ordine invertito, stesso CF (maiuscole/minuscole), società con Srl/S.r.l.; persone diverse distinte')
assert.equal(m.conflittiPer(rossi, 'controparte', pr, mappa).length, 1); assert.equal(m.conflittiPer(rossi, 'controparte', pr, mappa)[0].pratica.id, 10); ok('Mario Rossi è cliente nella pratica 10: se compare come controparte → conflitto')
assert.equal(m.conflittiPer(rossi, 'cliente', pr, mappa).length, 0); ok('stesso ruolo (cliente anche qui): nessun conflitto')
assert.equal(m.conflittiPer(rossiBis, 'controparte', pr, mappa).length, 1); ok('anagrafica doppia con nome invertito: conflitto rilevato lo stesso')
assert.equal(m.conflittiPer(bianchiBis, 'cliente', pr, mappa).length, 2); assert.equal(m.conflittiPer(bianchi, 'cliente', pr, mappa).length, 2); ok('società controparte altrove: conflitto se diventa cliente (anche scritta in altro modo)')
assert.equal(m.conflittiPer(rossi, 'controparte', pr, mappa, 10).length, 0); ok('modificando la stessa pratica non segnala se stessa')
assert.equal(m.conflittiPer(null, 'cliente', pr, mappa).length, 0); assert.equal(m.conflittiPer(altro, 'cliente', [], mappa).length, 0); ok('nessuna persona / nessuna pratica: nessun conflitto')
console.log(`\n${n} prove superate`)
