// Novità 1.0.3: panoramica annuale dello scadenzario, più persone e ruolo nella pratica, più indirizzi in anagrafica,
// sottocartelle dei documenti, colonne nuove dell'archivio (persone, ruolo, indirizzi) senza cambiare versione dello schema.
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-103-'))
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: { pagamenti: 'src/lib/pagamenti.ts', recapiti: 'src/lib/recapiti.ts', persone: 'src/lib/persone.ts', cartelle: 'src/lib/cartelle.ts' }, formats: ['es'], fileName: (_f, nome) => `${nome}.mjs` }, outDir: out, emptyOutDir: false, minify: false } })
const carica = (n) => import(pathToFileURL(path.join(out, `${n}.mjs`)).href)
const pag = await carica('pagamenti'), rec = await carica('recapiti'), per = await carica('persone'), car = await carica('cartelle')
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)
try {
  // ---------- panoramica annuale
  const mov = (data, stato, importo) => ({ chiave: data + stato, data, stato, importo, descrizione: '', pratica_id: null, scaduto: false })
  const anno = pag.annuale([mov('2026-01-10', 'incassate', 1250), mov('2026-01-20', 'pagate', 1000), mov('2026-02-03', 'da_pagare', 534.21), mov('2026-03-01', 'da_incassare', 800), mov('2026-03-02', 'pagate', 800), mov('2025-12-31', 'incassate', 99), mov('2027-01-01', 'incassate', 99)], 2026)
  assert.equal(anno.length, 12); assert.deepEqual(anno.map((m) => m.mese).slice(0, 2), ['2026-01', '2026-02']); assert.equal(anno[11].mese, '2026-12')
  assert.deepEqual([anno[0].entrate, anno[0].uscite, anno[0].saldo], [1250, 1000, 250])
  assert.deepEqual([anno[1].entrate, anno[1].uscite, anno[1].saldo], [0, 534.21, -534.21])
  assert.deepEqual([anno[2].entrate, anno[2].uscite, anno[2].saldo, anno[2].movimenti], [800, 800, 0, 2]) // pari, ma con movimenti
  assert.deepEqual([anno[3].saldo, anno[3].movimenti], [0, 0]) // mese vuoto
  assert.equal(anno.reduce((s, m) => s + m.movimenti, 0), 5) // gli altri anni restano fuori
  ok('panoramica annuale: dodici mesi, entrate, uscite e differenza; mese pari distinto dal mese vuoto')

  // ---------- persone della pratica
  const rubrica = new Map([[1, { id: 1, denominazione: 'Mario Rossi', ruolo: 'cliente' }], [2, { id: 2, denominazione: 'Lucia Rossi', ruolo: 'cliente' }], [3, { id: 3, denominazione: 'Alfa S.r.l.', ruolo: 'controparte' }], [4, { id: 4, denominazione: 'Paolo Neri', ruolo: 'altro' }]])
  const pratica = { id: 9, cliente_id: 1, controparte_id: 3, persone: JSON.stringify([{ id: 2, ruolo: 'cliente' }, { id: 4, ruolo: 'collaboratore' }, { id: 4, ruolo: 'collaboratore' }, { id: 1, ruolo: 'cliente' }, { id: 77, ruolo: 'fornitore' }, { id: 2, ruolo: 'spia' }, null, 'x']) }
  assert.deepEqual(per.leggiPersone(pratica), [{ id: 2, ruolo: 'cliente' }, { id: 4, ruolo: 'collaboratore' }, { id: 1, ruolo: 'cliente' }, { id: 77, ruolo: 'fornitore' }])
  assert.deepEqual(per.personeDi(pratica, rubrica).map((x) => `${x.contatto.id}${x.ruolo}${x.principale ? '*' : ''}`), ['1cliente*', '3controparte*', '2cliente', '4collaboratore']) // niente doppioni, niente contatti eliminati
  assert.deepEqual(per.ruoliIn(pratica, 1), ['cliente']); assert.deepEqual(per.ruoliIn(pratica, 4), ['collaboratore']); assert.deepEqual(per.ruoliIn(pratica, 5), [])
  assert.deepEqual(per.leggiPersone({ persone: '{rotto' }), []); assert.equal(per.scriviPersone([]), null)
  assert.equal(per.scriviPersone([{ id: 2, ruolo: 'cliente' }]), '[{"id":2,"ruolo":"cliente"}]')
  ok('persone della pratica: principali per primi, ruoli validi, senza doppioni né contatti eliminati')

  // ---------- indirizzi
  const scritti = rec.scriviIndirizzi([{ etichetta: ' Sede operativa ', indirizzo: 'Via Emilia 1', cap: '41121', citta: 'Modena', provincia: 'mo' }, { etichetta: 'Vuoto', indirizzo: '', cap: '', citta: '', provincia: '' }])
  assert.deepEqual(JSON.parse(scritti), [{ etichetta: 'Sede operativa', indirizzo: 'Via Emilia 1', cap: '41121', citta: 'Modena', provincia: 'MO' }])
  assert.equal(rec.scriviIndirizzi([]), null); assert.deepEqual(rec.leggiIndirizzi({ indirizzi: 'non json' }), []); assert.deepEqual(rec.leggiIndirizzi({ indirizzi: '{"a":1}' }), [])
  assert.equal(rec.indirizzoInRiga(JSON.parse(scritti)[0]), 'Via Emilia 1, 41121 Modena (MO)'); assert.equal(rec.indirizzoInRiga({ citta: 'Carpi' }), 'Carpi')
  ok('indirizzi in più: righe vuote scartate, provincia in maiuscolo, dati rovinati ignorati')

  // ---------- sottocartelle
  const radici = ['/Utenti/anna/Pratiche/Rossi', 'C:\\Cliens\\Rossi\\']
  assert.equal(car.sottocartella('/Utenti/anna/Pratiche/Rossi/procura.pdf', radici), '')
  assert.equal(car.sottocartella('/Utenti/anna/Pratiche/Rossi/Atti/Notifiche/relata.pdf', radici), 'Atti/Notifiche')
  assert.equal(car.sottocartella('c:\\cliens\\rossi\\Atti\\x.pdf', radici), 'Atti') // Windows: barre rovesciate, maiuscole diverse
  assert.equal(car.sottocartella('/Utenti/anna/Pratiche/RossiBis/Atti/x.pdf', radici), '') // un'altra cartella con lo stesso inizio non è una sottocartella
  assert.equal(car.sottocartella('/altrove/x.pdf', radici), ''); assert.equal(car.sottocartella(null, radici), ''); assert.equal(car.sottocartella('/a/b.pdf', [null, undefined]), '')
  const voci = [['a', ''], ['b', 'Atti'], ['c', 'Atti/Notifiche'], ['d', 'atti/Notifiche'], ['e', 'Corrispondenza'], ['f', 'Atti 10'], ['g', 'Atti 2']].map(([voce, cartella]) => ({ voce, cartella }))
  assert.deepEqual(car.contenutoCartella(voci, ''), { cartelle: [{ nome: 'Atti', percorso: 'Atti', file: 3 }, { nome: 'Atti 2', percorso: 'Atti 2', file: 1 }, { nome: 'Atti 10', percorso: 'Atti 10', file: 1 }, { nome: 'Corrispondenza', percorso: 'Corrispondenza', file: 1 }], file: ['a'] })
  assert.deepEqual(car.contenutoCartella(voci, 'Atti'), { cartelle: [{ nome: 'Notifiche', percorso: 'Atti/Notifiche', file: 2 }], file: ['b'] })
  assert.deepEqual(car.contenutoCartella(voci, 'Atti/Notifiche'), { cartelle: [], file: ['c', 'd'] })
  // cartelle vuote sul disco: compaiono con zero file, senza doppioni di quelle che hanno già file
  assert.deepEqual(car.contenutoCartella(voci, 'Atti', ['Atti', 'atti/notifiche', 'Atti/Bozze', 'Atti/Bozze/Vecchie', 'Perizie']).cartelle, [{ nome: 'Bozze', percorso: 'Atti/Bozze', file: 0 }, { nome: 'Notifiche', percorso: 'Atti/Notifiche', file: 2 }])
  assert.deepEqual(car.contenutoCartella([], '', ['Perizie', 'Perizie/2026']), { cartelle: [{ nome: 'Perizie', percorso: 'Perizie', file: 0 }], file: [] })
  assert.deepEqual(car.contenutoCartella([], 'Perizie/2026', ['Perizie', 'Perizie/2026']), { cartelle: [], file: [] })
  ok('sottocartelle: albero ricavato dai percorsi (macOS e Windows), conteggi, ordine naturale dei nomi')

  // ---------- archivio
  const db = require(path.join(radice, 'electron/db'))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-103-db-'))
  db.open(path.join(tmp, 'dati'))
  const a = db.save('anagrafica', { denominazione: 'Mario Rossi', indirizzi: scritti }), b = db.save('anagrafica', { denominazione: 'Paolo Neri' })
  assert.equal(JSON.parse(a.indirizzi)[0].citta, 'Modena')
  const pr = db.save('pratiche', { titolo: 'Causa', colore: '#000000', ruolo: 'Difensore', persone: JSON.stringify([{ id: a.id, ruolo: 'cliente' }, { id: b.id, ruolo: 'collaboratore' }]) })
  assert.equal(pr.ruolo, 'Difensore'); assert.equal(JSON.parse(pr.persone).length, 2)
  for (const rotto of ['{', '{}', '[{"id":"1; DROP","ruolo":"cliente"}]', '[{"id":1,"ruolo":"padrone"}]', '[{"id":-1,"ruolo":"cliente"}]']) assert.throws(() => db.save('pratiche', { id: pr.id, persone: rotto }), /persone/)
  assert.throws(() => db.save('anagrafica', { id: a.id, indirizzi: '{}' }), /indirizzi/)
  // sottocartelle sul disco, anche vuote; fuori quelle nascoste e i collegamenti simbolici
  const docfile = require(path.join(radice, 'electron/docfile')), cart = path.join(tmp, 'Causa')
  for (const d of ['Atti/Notifiche', 'Perizie', '.git/oggetti']) fs.mkdirSync(path.join(cart, d), { recursive: true })
  fs.writeFileSync(path.join(cart, 'Atti', 'a.txt'), 'x')
  try { fs.symlinkSync(path.join(cart, 'Atti'), path.join(cart, 'Scorciatoia'), 'dir') } catch { /* Windows senza permesso di creare collegamenti: la prova vale lo stesso */ }
  db.save('pratiche', { id: pr.id, cartella: cart })
  assert.deepEqual(docfile.sottocartelle(pr.id).sort(), ['Atti', 'Atti/Notifiche', 'Perizie'])
  db.save('pratiche', { id: pr.id, cartella: path.join(tmp, 'sparita') }); assert.deepEqual(docfile.sottocartelle(pr.id), [])
  db.remove('anagrafica', b.id)
  assert.equal(db.get('pratiche', pr.id).persone, JSON.stringify([{ id: a.id, ruolo: 'cliente' }])) // il contatto eliminato esce dalla pratica
  db.remove('anagrafica', a.id); assert.equal(db.get('pratiche', pr.id).persone, null)
  assert.equal(db.getDb().prepare('PRAGMA user_version').get().user_version, 6) // colonne facoltative: lo schema resta il 6
  db.close()
  ok('archivio: persone e ruolo della pratica, indirizzi del contatto, valori non validi rifiutati, contatto eliminato tolto dalle pratiche')
  console.log(`\n${n} gruppi di controlli superati`)
} finally { fs.rmSync(out, { recursive: true, force: true }) }
