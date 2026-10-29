'use strict'
// Nota di credito: storno totale di una fattura emessa, numerazione propria, fattura «stornata» e XML TD04 valido.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { execFileSync } = require('node:child_process')
const db = require('../electron/db'), fatturapa = require('../electron/fatturapa')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-nc-')); let n = 0
const ok = (s) => console.log(`ok ${++n} - ${s}`)
try {
  db.open(dir)
  const cliente = db.save('anagrafica', { denominazione: 'Edilnord S.r.l.', tipo: 'azienda', partita_iva: '01234567890', indirizzo: 'Via Roma 3', cap: '41012', citta: 'Carpi', provincia: 'MO' })
  const f = db.saveParcella({ tipo: 'parcella', data: '2026-10-10', cliente_id: cliente.id, stato: 'emessa', oggetto: 'Consulenza', sg_perc: 0, cpa_perc: 0, iva_perc: 22, rit_perc: 0, bollo: 0,
    compensi: 1000, spese_generali: 0, cpa: 0, imponibile: 1000, iva: 220, spese_esenti: 0, ritenuta: 0, totale: 1220, netto: 1220, voci: [{ tipo: 'compenso', descrizione: 'Consulenza', quantita: 1, importo: 1000 }] })
  assert.throws(() => db.creaNotaCredito(db.saveParcella({ tipo: 'preventivo', data: '2026-10-10', voci: [] }).id), /soltanto per una fattura/)
  const bozza = db.saveParcella({ tipo: 'parcella', data: '2026-10-11', stato: 'bozza', voci: [] })
  assert.throws(() => db.creaNotaCredito(bozza.id), /fattura emessa/)

  const nc = db.creaNotaCredito(f.id, '2026-10-28')
  assert.equal(nc.tipo, 'nota_credito'); assert.equal(nc.numero, 'NC 1/2026'); assert.equal(nc.storno_di, f.id)
  assert.equal(nc.totale, 1220); assert.equal(nc.voci.length, 1); assert.match(nc.oggetto, /Storno totale della fattura n\. 1\/2026 del 10\/10\/2026/)
  assert.equal(db.getParcella(f.id).stato, 'stornata')
  assert.throws(() => db.creaNotaCredito(f.id), /fattura emessa|già una nota/)
  ok('nota di credito: stesse voci e importi, numerazione NC, fattura stornata, nessun secondo storno')

  // la fattura stornata non torna «emessa» quando cambia il registro dei pagamenti
  db.aggiornaIncassi(f.id); assert.equal(db.getParcella(f.id).stato, 'stornata')
  ok('lo stato «stornata» resta anche ricalcolando gli incassi')

  const r = fatturapa.genera({ parcella: db.getParcella(nc.id), voci: nc.voci, cliente, studio: { nome: 'Studio', piva: '12345678903', indirizzo: 'Via Emilia 1', cap_citta: '41121 Modena (MO)', iban: 'IT60X0542811101000000123456' }, opzioni: { tipoDocumento: 'TD01' }, collegata: { numero: f.numero, data: f.data } })
  assert.deepEqual(r.errori, [])
  assert.ok(/<TipoDocumento>TD04<\/TipoDocumento>/.test(r.xml) && /<DatiFattureCollegate><IdDocumento>1\/2026<\/IdDocumento><Data>2026-10-10<\/Data><\/DatiFattureCollegate>/.test(r.xml) && !/DatiPagamento/.test(r.xml))
  assert.ok(/<ImportoTotaleDocumento>1220\.00<\/ImportoTotaleDocumento>/.test(r.xml), 'importi positivi')
  let xmllint = true; try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }) } catch { xmllint = false }
  if (xmllint) { const file = path.join(dir, r.nomeFile); fs.writeFileSync(file, r.xml); execFileSync('xmllint', ['--noout', '--nonet', '--schema', path.join(__dirname, 'fixtures', 'fatturapa', 'Schema_VFPR12_v1.2.3.xsd'), file], { stdio: 'pipe' }) }
  assert.match(fatturapa.genera({ parcella: db.getParcella(nc.id), voci: nc.voci, cliente, studio: { piva: '12345678903', indirizzo: 'Via Emilia 1', cap_citta: '41121 Modena (MO)', nome: 'S' }, opzioni: {} }).errori.join(), /fattura stornata/)
  ok('XML TD04 valido per lo schema: richiama la fattura stornata, importi positivi, senza dati di pagamento')
} finally { try { db.close?.() } catch { /* già chiuso */ } fs.rmSync(dir, { recursive: true, force: true }) }
