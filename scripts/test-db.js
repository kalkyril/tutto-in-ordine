'use strict'
// Test del livello dati, degli avvisi, dell'export ICS e del backup (senza Electron).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const db = require('../electron/db')
const alerts = require('../electron/alerts')
const ics = require('../electron/ics')
const backup = require('../electron/backup')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-test-'))
db.open(path.join(tmp, 'data'))
let n = 0
const ok = (name) => console.log(`ok ${++n} - ${name}`)

// anagrafica + pratica
const cli = db.save('anagrafica', { denominazione: 'Mario Rossi', ruolo: 'cliente', email: 'm@x.it' })
assert.ok(cli.id); ok('crea anagrafica')
const num = db.nextPraticaNumero()
assert.match(num, /^\d{4}\/001$/)
const p = db.save('pratiche', { numero: num, titolo: 'Rossi c. Bianchi', cliente_id: cli.id, colore: '#ef4444', stato: 'Aperta' })
assert.equal(p.colore, '#ef4444')
assert.equal(db.nextPraticaNumero().endsWith('/002'), true); ok('pratica con colore e numerazione')
db.save('pratiche', { id: p.id, colore: '#10b981' })
assert.equal(db.get('pratiche', p.id).colore, '#10b981'); ok('modifica colore')

// sicurezza: tabella e colonne
assert.throws(() => db.list('sqlite_master'), /Tabella non valida/)
assert.throws(() => db.save('pratiche; DROP TABLE pratiche', { titolo: 'x' }))
db.save('pratiche', { id: p.id, 'titolo = 1; --': 'x', titolo: 'Rossi c. Bianchi' })
assert.equal(db.list('pratiche', { 'titolo; DROP': 1 }).length, 1); ok('colonne/tabelle non whitelisted ignorate')
assert.equal(db.list('pratiche', {}, 'titolo; DROP TABLE x').length, 1); ok('order by sicuro')

// to-do per pratica
const t1 = db.save('todos', { pratica_id: p.id, titolo: 'Depositare memoria', scadenza: '2026-10-20', priorita: 2, promemoria_min: 1440 })
db.save('todos', { pratica_id: p.id, titolo: 'Chiamare cliente' })
assert.equal(db.list('todos', { pratica_id: p.id }).length, 2); ok('to-do per pratica')

// avvisi scadenze
const now = new Date(2026, 9, 12, 8, 0, 0)
const s1 = db.save('scadenze', { pratica_id: p.id, titolo: 'Udienza istruttoria', tipo: 'udienza', data_ora: '2026-10-12T10:00', promemoria: [1440, 60, 0] })
let due = alerts.collectDue(now)
assert.equal(due.length, 1, JSON.stringify(due.map(d => d.titolo)))
assert.match(due[0].titolo, /Udienza tra 2 ore: Udienza istruttoria|Udienza oggi alle 10:00/); ok('avviso 1 giorno prima scatta (in ritardo, etichetta reale)')
assert.equal(alerts.collectDue(now).length, 0); ok('nessun avviso duplicato')
due = alerts.collectDue(new Date(2026, 9, 12, 9, 1))
assert.equal(due.length, 1); assert.match(due[0].titolo, /tra 59 minuti/); ok('avviso 1h prima')
due = alerts.collectDue(new Date(2026, 9, 12, 10, 0))
assert.equal(due.length, 1); assert.match(due[0].titolo, /ora/); ok('avviso alla scadenza')
due = alerts.collectDue(new Date(2026, 9, 12, 11, 0))
assert.equal(due.length, 0); ok('nessun avviso di ritardo se già notificato alla scadenza')
// evento molto vecchio: marcato senza notifica
db.save('scadenze', { titolo: 'Vecchia', data_ora: '2026-01-01T10:00', promemoria: [60] })
assert.equal(alerts.collectDue(new Date(2026, 9, 12, 11, 0)).length, 0); ok('eventi vecchi silenziati')
// spostare la data riarma gli avvisi
db.save('scadenze', { id: s1.id, data_ora: '2026-10-14T10:00' })
due = alerts.collectDue(new Date(2026, 9, 13, 11, 0))
assert.equal(due.length, 1); assert.match(due[0].titolo, /domani alle 10:00/); ok('spostamento data riarma avvisi')
// completata: niente avvisi
db.save('scadenze', { id: s1.id, completata: 1, data_ora: '2026-10-20T10:00' })
assert.equal(alerts.collectDue(new Date(2026, 9, 20, 9, 30)).filter((d) => d.rif_tipo === 'scadenza').length, 0); ok('scadenze completate ignorate')
// to-do con promemoria
db.save('todos', { id: t1.id, scadenza: '2026-10-25', completata: 0 })
due = alerts.collectDue(new Date(2026, 9, 24, 9, 0))
assert.equal(due.length, 1); assert.match(due[0].titolo, /^To-do domani alle 09:00: Depositare memoria/); ok('promemoria to-do')
db.save('todos', { id: t1.id, completata: 1 })
// digest
const dg = alerts.dailyDigest(new Date(2026, 9, 20, 8, 0))
assert.equal(alerts.dailyDigest(new Date(2026, 9, 20, 9, 0)), null); ok('riepilogo giornaliero una volta al giorno (' + (dg ? dg.corpo : 'vuoto') + ')')
alerts.pushNotifiche([{ titolo: 't', tipo: 'scadenza' }]); assert.equal(db.list('notifiche').length, 1); ok('notifiche persistite')

// parcella
const ore = db.save('ore', { pratica_id: p.id, data: '2026-10-01', minuti: 90, descrizione: 'Studio fascicolo', tariffa_oraria: 200 })
const sp = db.save('spese', { pratica_id: p.id, data: '2026-10-02', descrizione: 'Contributo unificato', importo: 98, esente: 1 })
const nx = db.nextParcellaNumero(2026); assert.equal(nx.numero, '1/2026')
const parc = db.saveParcella({ data: '2026-10-10', pratica_id: p.id, cliente_id: cli.id, oggetto: 'Fase studio', compensi: 300, voci: [
  { tipo: 'compenso', descrizione: 'Studio', quantita: 1.5, importo: 200 }, { tipo: 'spesa_esente', descrizione: 'CU', quantita: 1, importo: 98 }],
  importa_ore: [ore.id], importa_spese: [sp.id] })
assert.equal(parc.numero, '1/2026'); assert.equal(parc.voci.length, 2)
assert.equal(db.get('ore', ore.id).parcella_id, parc.id); assert.equal(db.get('spese', sp.id).parcella_id, parc.id)
assert.equal(db.saveParcella({ data: '2026-10-11' }).numero, '2/2026'); ok('parcelle: numerazione, voci, collegamento ore/spese')
const p2 = db.saveParcella({ id: parc.id, voci: [] }); assert.equal(p2.voci.length, 0)
assert.equal(db.get('ore', ore.id).parcella_id, null); ok('riedit parcella sgancia ore')

// nota pro forma: numerazione separata e stato del calcolo persistito
const pf = db.saveParcella({ data: '2026-10-12', tipo: 'proforma', calcolo: JSON.stringify({ state: { scaglione: 20 }, manuali: [] }), voci: [{ tipo: 'compenso', descrizione: 'x', quantita: 1, importo: 100 }] })
assert.equal(pf.numero, 'PF 1/2026'); assert.equal(db.saveParcella({ data: '2026-10-13', tipo: 'proforma' }).numero, 'PF 2/2026')
assert.equal(db.saveParcella({ data: '2026-10-14' }).numero, '3/2026'); ok('numerazione pro forma separata (PF n/anno) senza consumare i numeri delle parcelle')
assert.deepEqual(JSON.parse(db.getParcella(pf.id).calcolo).state, { scaglione: 20 }); ok('stato del calcolo compensi salvato con la parcella')

// ricerca
assert.ok(db.searchAll('Rossi').length >= 2); assert.equal(db.searchAll('a').length, 0); assert.equal(db.searchAll('100%').length, 0); ok('ricerca globale')

// ICS
const out = ics.build(null)
assert.match(out, /BEGIN:VCALENDAR/); assert.match(out, /SUMMARY:Udienza istruttoria/); assert.match(out, /TRIGGER:-PT60M/)
assert.ok(out.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)); ok('export ICS')

// settings
db.setSettings({ a: 1, b: { c: [1, 2] } }); assert.deepEqual(db.getSettings().b, { c: [1, 2] }); ok('impostazioni JSON')

// cascata + backup/ripristino
const docDir = path.join(tmp, 'data', 'documenti', String(p.id)); fs.mkdirSync(docDir, { recursive: true }); fs.writeFileSync(path.join(docDir, 'atto.txt'), 'ciao')
db.save('documenti', { pratica_id: p.id, nome: 'atto.txt', file: `${p.id}/atto.txt`, dimensione: 4 })
const bdir = backup.run(path.join(tmp, 'bk'))
assert.ok(fs.existsSync(path.join(bdir, 'mngmnt.db')) && fs.existsSync(path.join(bdir, 'documenti', String(p.id), 'atto.txt'))); ok('backup')
db.remove('pratiche', p.id)
assert.equal(db.list('todos', { pratica_id: p.id }).length, 0); assert.equal(db.list('scadenze', { pratica_id: p.id }).length, 0); ok('eliminazione pratica a cascata')
fs.rmSync(docDir, { recursive: true })
const r = backup.restore(bdir)
assert.equal(db.list('pratiche').length, 1); assert.equal(db.list('todos').length, 2)
assert.equal(fs.readFileSync(path.join(docDir, 'atto.txt'), 'utf8'), 'ciao'); assert.ok(fs.existsSync(r.safety)); ok('ripristino con copia di sicurezza')
assert.throws(() => backup.restore(tmp), /manca mngmnt.db/); ok('ripristino rifiuta cartelle non valide')
// compatibilità con i dati delle versioni precedenti (lara.db)
db.close()
const vecchio = path.join(tmp, 'vecchio'); fs.mkdirSync(vecchio, { recursive: true })
fs.copyFileSync(path.join(bdir, 'mngmnt.db'), path.join(vecchio, 'lara.db'))
db.open(vecchio); assert.ok(fs.existsSync(path.join(vecchio, 'mngmnt.db')) && !fs.existsSync(path.join(vecchio, 'lara.db'))); assert.equal(db.list('pratiche').length, 1); ok('dati della versione precedente (lara.db) riutilizzati')
const bkVecchio = path.join(tmp, 'bk-vecchio'); fs.mkdirSync(bkVecchio); fs.copyFileSync(path.join(bdir, 'mngmnt.db'), path.join(bkVecchio, 'lara.db')); fs.cpSync(path.join(bdir, 'documenti'), path.join(bkVecchio, 'documenti'), { recursive: true })
assert.ok(backup.isBackup(bkVecchio)); backup.restore(bkVecchio); assert.equal(db.list('pratiche').length, 1); ok('ripristino di un backup creato dalla versione precedente')
db.close(); fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${n} test superati`)
