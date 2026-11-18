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
const db = require(path.join(radice, 'electron/db'))
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-103-'))
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: { aggiornamenti: 'src/lib/aggiornamentiRighe.ts', pagamenti: 'src/lib/pagamenti.ts', recapiti: 'src/lib/recapiti.ts', persone: 'src/lib/persone.ts', cartelle: 'src/lib/cartelle.ts' }, formats: ['es'], fileName: (_f, nome) => `${nome}.mjs` }, outDir: out, emptyOutDir: false, minify: false } })
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

  const contatto = { denominazione: 'Nicolò Rossi', indirizzo: 'Via Po 18', cap: '41012', provincia: 'MO', pec: 'studio@pec.test', indirizzi: scritti,
    email: 'storica@test.it', telefono: '059123', codice_fiscale: 'CF123', sdi: 'CODSDI1', note: 'Reperibile la mattina',
    recapiti: JSON.stringify({ email: [{ etichetta: 'Studio', valore: 'seconda@test.it' }], telefoni: [{ valore: '335123' }] }) }
  const testo = rec.testoRicercaContatto(contatto)
  for (const q of ['NICOLO', ' VIA PO 18 ', '41012', 'mo', 'studio@pec.test', 'Via Emilia 1', '41121', 'storica@test.it', 'seconda@test.it', '059123', '335123', 'cf123', 'codsdi1', 'mattina']) {
    assert.ok(testo.includes(rec.normalizzaRicerca(q)), q)
  }
  assert.ok(!testo.includes('"valore"'))
  assert.ok(rec.testoRicercaContatto({ ...contatto, recapiti: 'null', indirizzi: 'non json' }).includes('storica@test.it'))
  ok('ricerca nei campi principali e aggiuntivi, anche con accenti e vecchi recapiti')

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
  const tmp = fs.mkdtempSync(path.join(out, 'archivio-'))
  db.open(path.join(tmp, 'dati'))
  const a = db.save('anagrafica', { denominazione: 'Mario Rossi', indirizzi: scritti }), b = db.save('anagrafica', { denominazione: 'Paolo Neri' })
  assert.equal(JSON.parse(a.indirizzi)[0].citta, 'Modena')
  const pr = db.save('pratiche', { titolo: 'Causa', colore: '#000000', ruolo: 'Difensore', persone: JSON.stringify([{ id: a.id, ruolo: 'cliente' }, { id: b.id, ruolo: 'collaboratore' }]) })
  assert.equal(pr.ruolo, 'Difensore'); assert.equal(JSON.parse(pr.persone).length, 2)
  for (const rotto of ['{', '{}', '[{"id":"1; DROP","ruolo":"cliente"}]', '[{"id":1,"ruolo":"padrone"}]', '[{"id":-1,"ruolo":"cliente"}]']) assert.throws(() => db.save('pratiche', { id: pr.id, persone: rotto }), /persone/)
  assert.throws(() => db.save('anagrafica', { id: a.id, indirizzi: '{}' }), /indirizzi/)
  const ruoli = ['cliente', 'fornitore', 'controparte', 'collaboratore', 'altro']
  const molti = Array.from({ length: 1000 }, (_, i) => ({
    id: db.save('anagrafica', { denominazione: `Contatto ${i}` }).id, ruolo: ruoli[i % ruoli.length],
  }))
  const parti = molti.slice(0, 25), json = per.scriviPersone(parti.slice(1))
  const piena = db.save('pratiche', { titolo: 'Al limite', cliente_id: parti[0].id, controparte_id: parti[1].id, persone: json })
  const seconda = db.save('pratiche', { titolo: 'Altra pratica', persone: per.scriviPersone(parti) })
  assert.equal(per.idAttori(piena).size, 25)
  assert.equal(per.idAttori(seconda).size, 25)
  assert.throws(() => db.save('pratiche', { id: piena.id, cliente_id: parti[0].id, persone: per.scriviPersone(molti.slice(1, 26)) }), /25/)
  assert.throws(() => db.salvaPraticaDaModulo({ titolo: 'Troppi', persone: per.scriviPersone(molti) }), /25/)
  const storico = db.save('pratiche', { titolo: 'Storica' })
  db.getDb().prepare('UPDATE pratiche SET persone=? WHERE id=?').run(per.scriviPersone(molti), storico.id)
  db.close()
  db.open(path.join(tmp, 'dati'))
  assert.deepEqual(per.leggiPersone(db.get('pratiche', storico.id)), molti)
  db.save('pratiche', { id: storico.id, titolo: 'Storica modificata' })
  db.save('pratiche', { id: storico.id, persone: per.scriviPersone(molti.slice(1)) })
  assert.throws(() => db.save('pratiche', { id: storico.id, persone: per.scriviPersone(molti) }), /25/)
  assert.deepEqual(per.ruoliIn(db.get('pratiche', seconda.id), parti[0].id), [parti[0].ruolo])
  ok('25 attori distinti compresi i principali, più ruoli e più pratiche; archivio storico da mille attori conservato e riducibile')
  const handlers = new Map(), notifiche = []
  require(path.join(radice, 'electron/ipc/dati'))({ handle: (ch, fn) => handlers.set(ch, fn), changedRows: ids => notifiche.push(ids) })
  const salvaContatto = handlers.get('db:salvaContatto')
  const praticaA = db.save('pratiche', { titolo: 'A', cliente_id: a.id })
  const praticaB = db.save('pratiche', { titolo: 'B' })
  const lega = (p, ruolo, collega = true) => ({ pratica_id: p.id, ruolo, collega })
  const variazioni = [lega(praticaA, 'cliente'), lega(praticaB, 'controparte'), lega(praticaB, 'fornitore')]
  const assente = lega({ id: 9999999 }, 'cliente')
  const totaleContatti = db.list('anagrafica').length
  assert.throws(() => salvaContatto({ denominazione: 'Da riprovare' }, [...variazioni, assente]), /pratiche/)
  assert.equal(db.list('anagrafica').length, totaleContatti)
  assert.deepEqual(db.get('pratiche', praticaA.id), praticaA)
  assert.deepEqual(db.get('pratiche', praticaB.id), praticaB)
  assert.deepEqual(notifiche, [])
  const nuovo = salvaContatto({ denominazione: 'Da riprovare' }, variazioni)
  assert.deepEqual(notifiche, [{ anagrafica: [nuovo.id], pratiche: [praticaA.id, praticaB.id] }])
  assert.equal(db.get('pratiche', praticaA.id).cliente_id, a.id)
  assert.deepEqual(per.leggiPersone(db.get('pratiche', praticaA.id)), [{ id: nuovo.id, ruolo: 'cliente' }])
  assert.equal(db.get('pratiche', praticaB.id).controparte_id, nuovo.id)
  assert.deepEqual(per.leggiPersone(db.get('pratiche', praticaB.id)), [{ id: nuovo.id, ruolo: 'fornitore' }])
  assert.throws(() => salvaContatto({ id: nuovo.id, denominazione: 'Da annullare' }, [lega(praticaA, 'cliente', false), assente]), /pratiche/)
  assert.equal(db.get('anagrafica', nuovo.id).denominazione, 'Da riprovare')
  assert.deepEqual(per.ruoliIn(db.get('pratiche', praticaA.id), nuovo.id), ['cliente'])
  assert.equal(notifiche.length, 1)
  salvaContatto({ id: b.id }, [lega(praticaA, 'collaboratore')])
  salvaContatto({ id: nuovo.id }, variazioni)
  salvaContatto({ id: nuovo.id }, [lega(praticaA, 'cliente', false), lega(praticaB, 'controparte', false)])
  assert.deepEqual(per.leggiPersone(db.get('pratiche', praticaA.id)), [{ id: b.id, ruolo: 'collaboratore' }])
  assert.deepEqual(per.ruoliIn(db.get('pratiche', praticaB.id), nuovo.id), ['fornitore'])
  assert.throws(() => salvaContatto({ id: b.id }, [lega(praticaA, 'sconosciuto')]), /non valido/)
  assert.throws(() => salvaContatto({ id: 9999999 }, []), /contatto/)
  ok('transazione del contatto: creazione e modifica annullate integralmente su errore, ripetizione e aggiornamenti indipendenti')

  assert.throws(() => db.transaction(() => {
    db.getDb().exec('PRAGMA defer_foreign_keys = ON')
    db.salvaContatto({ denominazione: 'Prova commit' }, [])
    db.save('pratiche', { titolo: 'Riferimento mancante', cliente_id: 9999999 })
  }), /foreign key/i)
  assert.ok(!db.list('anagrafica').some(c => c.denominazione === 'Prova commit'))
  assert.equal(db.transaction(() => db.transaction(() => 42)), 42)
  ok('errore al commit SQLite: rollback completo e transazioni successive funzionanti')
  db.getDb().exec("CREATE TEMP TRIGGER ferma_eliminazione BEFORE DELETE ON anagrafica BEGIN SELECT RAISE(ABORT, 'Errore di prova'); END")
  assert.throws(() => db.remove('anagrafica', b.id), /Errore di prova/)
  assert.ok(db.get('anagrafica', b.id))
  assert.deepEqual(per.ruoliIn(db.get('pratiche', praticaA.id), b.id), ['collaboratore'])
  db.getDb().exec('DROP TRIGGER ferma_eliminazione')
  ok('eliminazione interrotta: contatto e collegamenti conservati insieme')
  const originale = db.get('pratiche', praticaA.id)
  salvaContatto({ id: nuovo.id }, [lega(praticaA, 'fornitore')])
  const aggiornata = db.salvaPraticaDaModulo({ ...originale, titolo: 'Titolo aggiornato' }, originale)
  assert.deepEqual(per.ruoliIn(aggiornata, nuovo.id), ['fornitore'])
  const unite = db.salvaPraticaDaModulo({ ...originale, persone: null }, originale)
  assert.deepEqual(per.leggiPersone(unite), [{ id: nuovo.id, ruolo: 'fornitore' }])
  assert.throws(() => db.salvaPraticaDaModulo({ ...originale, titolo: 'Modifica concorrente' }, originale), /cambiata/)
  assert.equal(db.get('pratiche', praticaA.id).titolo, 'Titolo aggiornato')
  const quantita = db.list('pratiche').length
  assert.throws(() => db.salvaPraticaDaModulo({ titolo: 'Contatto rimosso', persone: '[{"id":9999999,"ruolo":"cliente"}]' }), /rubrica/)
  assert.equal(db.list('pratiche').length, quantita)
  ok('modulo pratica già aperto: collegamenti successivi conservati, conflitto segnalato, contatto eliminato rifiutato')
  const storia = id => db.list('cronologia', { pratica_id: id }, 'id ASC')
  const storicoPrima = storia(piena.id)
  assert.throws(() => salvaContatto({ id: b.id }, [lega(praticaA, 'altro'), lega(piena, 'cliente')]), /25/)
  assert.deepEqual(per.ruoliIn(db.get('pratiche', praticaA.id), b.id), [])
  assert.deepEqual(storia(piena.id), storicoPrima)
  salvaContatto({ id: parti[0].id }, [lega(piena, 'fornitore')])
  assert.equal(per.idAttori(db.get('pratiche', piena.id)).size, 25)
  assert.match(storia(piena.id).at(-1).testo, /Contatto 0.*cliente principale.*fornitore/)
  const primaDelRetry = storia(piena.id).length
  salvaContatto({ id: parti[0].id }, [lega(piena, 'fornitore')])
  assert.equal(storia(piena.id).length, primaDelRetry)
  const azioni = storia(seconda.id).filter(x => x.azione === 'modificato')
  assert.equal(azioni.length, 1)
  assert.match(azioni[0].testo, /Collegato Contatto 24/)
  handlers.get('db:delete')('anagrafica', parti[0].id)
  assert.match(storia(piena.id).at(-1).testo, /Scollegato Contatto 0/)
  assert.deepEqual(handlers.get('db:righe')('anagrafica', [parti[0].id]), [])
  assert.deepEqual(handlers.get('db:righe')('pratiche', [seconda.id]).map(p => p.id), [seconda.id])
  ok('cronologia raggruppata e rollback al limite, altro ruolo a pratica piena, cancellazione e letture per ID')
  const { accodaRighe, applicaRighe } = await carica('aggiornamenti')
  const coda = new Map()
  accodaRighe(coda, 'pratiche', [2, 3]); accodaRighe(coda, 'pratiche', [3, 4])
  assert.deepEqual([...coda.get('pratiche')], [2, 3, 4])
  accodaRighe(coda, 'pratiche'); accodaRighe(coda, 'pratiche', [5])
  assert.equal(coda.get('pratiche'), null)
  const originari = [{ id: 2, denominazione: 'Ada' }, { id: 1, denominazione: 'Bice' }, { id: 3, denominazione: 'Zoè' }]
  assert.deepEqual(applicaRighe('anagrafica', originari, new Set([1, 3, 4]), [{ id: 4, denominazione: 'ada' }, { id: 1, denominazione: 'A' }]).map(x => x.id), [1, 2, 4])
  assert.deepEqual(applicaRighe('pratiche', [{ id: 3 }, { id: 1 }], new Set([2, 3]), [{ id: 2 }]), [{ id: 2 }, { id: 1 }])
  ok('store incrementale: coalescenza, invalidazione completa, riordino, aggiunta e rimozione')
  // sottocartelle sul disco, anche vuote; fuori quelle nascoste e i collegamenti simbolici
  const docfile = require(path.join(radice, 'electron/docfile')), cart = path.join(tmp, 'Causa')
  for (const d of ['Atti/Notifiche', 'Perizie', '.git/oggetti']) fs.mkdirSync(path.join(cart, d), { recursive: true })
  fs.writeFileSync(path.join(cart, 'Atti', 'a.txt'), 'x')
  try { fs.symlinkSync(path.join(cart, 'Atti'), path.join(cart, 'Scorciatoia'), 'dir') } catch { /* Windows senza permesso di creare collegamenti: la prova vale lo stesso */ }
  db.save('pratiche', { id: pr.id, cartella: cart })
  assert.deepEqual((await docfile.sottocartelle(pr.id)).sort(), ['Atti', 'Atti/Notifiche', 'Perizie'])
  db.save('pratiche', { id: pr.id, cartella: path.join(tmp, 'sparita') }); assert.deepEqual(await docfile.sottocartelle(pr.id), [])
  db.remove('anagrafica', b.id)
  assert.equal(db.get('pratiche', pr.id).persone, JSON.stringify([{ id: a.id, ruolo: 'cliente' }])) // il contatto eliminato esce dalla pratica
  db.remove('anagrafica', a.id); assert.equal(db.get('pratiche', pr.id).persone, null)
  assert.equal(db.getDb().prepare('PRAGMA user_version').get().user_version, 6) // colonne facoltative: lo schema resta il 6
  ok('archivio: persone e ruolo della pratica, indirizzi del contatto, valori non validi rifiutati, contatto eliminato tolto dalle pratiche')
  console.log(`\n${n} gruppi di controlli superati`)
} finally {
  db.close()
  fs.rmSync(out, { recursive: true, force: true })
}
