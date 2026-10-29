// Prove della stampa agenda (periodi, raccolta degli impegni, HTML) — TypeScript eseguito tramite esbuild di Vite.
import { build } from 'vite'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const out = path.join(os.tmpdir(), `mngmnt-agenda-${Date.now()}.mjs`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/lib/stampaAgenda.ts', formats: ['es'], fileName: () => path.basename(out) }, outDir: path.dirname(out), emptyOutDir: false, minify: false } })
const m = await import(pathToFileURL(out).href)
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
// mercoledì 14 ottobre 2026
const adesso = new Date(2026, 9, 14, 10, 0)
assert.deepEqual(m.intervallo('oggi', adesso), { da: '2026-10-14', a: '2026-10-14' }); assert.deepEqual(m.intervallo('domani', adesso), { da: '2026-10-15', a: '2026-10-15' })
assert.deepEqual(m.intervallo('settimana', adesso), { da: '2026-10-12', a: '2026-10-18' }); assert.deepEqual(m.intervallo('prossima', adesso), { da: '2026-10-19', a: '2026-10-25' })
assert.deepEqual(m.intervallo('domani', new Date(2026, 11, 31)), { da: '2027-01-01', a: '2027-01-01' }); assert.deepEqual(m.intervallo('settimana', new Date(2026, 9, 18)), { da: '2026-10-12', a: '2026-10-18' }) // domenica
ok('periodi: oggi, domani (anche a capodanno), settimana da lunedì a domenica, settimana prossima')
const p = new Map([[1, { id: 1, numero: '2026/001', titolo: 'Rossi c. Bianchi', cliente_id: 1, controparte_id: 2, autorita: 'Tribunale di Modena', rg: '1234/2026', giudice: 'Dott. Neri' }]])
const an = new Map([[1, { id: 1, denominazione: 'Mario Rossi' }], [2, { id: 2, denominazione: 'Bianchi <S.r.l.>' }]])
const scadenze = [
  { id: 1, pratica_id: 1, titolo: 'Udienza di precisazione', tipo: 'udienza', data_ora: '2026-10-15T09:30', tutto_il_giorno: 0, luogo: 'Aula 4', completata: 0 },
  { id: 2, pratica_id: null, titolo: 'Termine <script>x</script>', tipo: 'scadenza', data_ora: '2026-10-15', tutto_il_giorno: 1, completata: 0 },
  { id: 3, pratica_id: 1, titolo: 'Già fatta', tipo: 'altro', data_ora: '2026-10-15T08:00', tutto_il_giorno: 0, completata: 1 },
  { id: 4, pratica_id: 1, titolo: 'Fuori periodo', tipo: 'udienza', data_ora: '2026-10-16T09:00', tutto_il_giorno: 0, completata: 0 },
]
const dati = { scadenze, todos: [{ id: 1, pratica_id: 1, titolo: 'Preparare memoria', scadenza: '2026-10-15T07:30', completata: 0 }], eventi: [{ id: 1, calendario_id: 1, titolo: 'Colloquio', inizio: '2026-10-15T11:00', tutto_il_giorno: 0 }, { id: 2, calendario_id: 2, titolo: 'Calendario spento', inizio: '2026-10-15T12:00', tutto_il_giorno: 0 }], calendari: [{ id: 1, nome: 'Cliens', attivo: 1 }, { id: 2, nome: 'Vecchio', attivo: 0 }], praticaById: p, anagraficaById: an }
const v = m.raccogli(dati, '2026-10-15', '2026-10-15', { attivita: true })
assert.deepEqual(v.map((x) => x.titolo), ['Termine <script>x</script>', 'Preparare memoria', 'Udienza di precisazione', 'Colloquio'])
assert.equal(v.find((x) => x.titolo === 'Udienza di precisazione').dettagli, 'Tribunale di Modena — RG 1234/2026 — Dott. Neri — Cliente: Mario Rossi — Controparte: Bianchi <S.r.l.>')
ok('impegni del giorno in ordine: tutto il giorno, poi per ora; completati, fuori periodo e calendari spenti esclusi; dettagli di pratica (autorità, RG, giudice, parti)')
assert.equal(m.raccogli(dati, '2026-10-15', '2026-10-15', { attivita: false }).length, 3); assert.equal(m.raccogli(dati, '2026-10-15', '2026-10-15', { attivita: true, completate: true }).length, 5); assert.equal(m.raccogli(dati, '2026-10-15', '2026-10-16', {}).length, 4)
ok('opzioni: senza attività, con completati, periodo di più giorni')
const html = m.agendaHtml('Agenda — domani', '2026-10-15', '2026-10-15', v, { studio: { nome: 'Studio <b>Rossi</b>' } }, new Date(2026, 9, 14, 18, 5))
assert.ok(!html.includes('<script>') && !html.includes('<b>Rossi') && html.includes('&lt;script&gt;') && html.includes('Studio &lt;b&gt;Rossi')); assert.match(html, /giovedì 15 ottobre 2026/); assert.match(html, /09:30/); assert.match(html, /Stampato il 14\/10\/2026 alle 18:05 · 4 impegni/)
const vuota = m.agendaHtml('Agenda', '2026-10-15', '2026-10-21', [], { studio: {} }); assert.match(vuota, /Nessun impegno nel periodo/)
const sett = m.agendaHtml('Agenda', '2026-10-12', '2026-10-18', m.raccogli(dati, '2026-10-12', '2026-10-18', {}), { studio: {} }); assert.equal((sett.match(/<h2>/g) || []).length, 2) // solo i giorni con impegni
ok('PDF: testo di studio e titoli sempre protetti da HTML, data in italiano, giornata vuota segnalata, settimana senza giorni vuoti')
console.log(`\n${n} prove superate`)
