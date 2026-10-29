'use strict'
// Prove di robustezza prima della distribuzione: migrazione, archivio corrotto, crash, concorrenza, volumi, input ostili,
// nomi file di Windows, casi limite delle date. Uso: node scripts/test-robustezza.js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { DatabaseSync } = require('node:sqlite')

if (process.argv[2] === '--scrittore') { // processo figlio: scrive righe una per una (usato per crash e concorrenza)
  const db = require('../electron/db')
  db.open(process.argv[3])
  const n = Number(process.argv[4]); const tag = process.argv[5]
  for (let i = 0; i < n; i++) { db.save('note', { pratica_id: Number(process.argv[6]), testo: `${tag}-${i}` }); process.stdout.write(`${i}\n`) }
  process.exit(0)
}

const db = require('../electron/db')
const alerts = require('../electron/alerts')
const ics = require('../electron/ics')
const backup = require('../electron/backup')
const { safeName, eseguibile } = require('../electron/files')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-robustezza-'))
let n = 0
const ok = (t, extra = '') => console.log(`ok ${++n} - ${t}${extra ? ' ' + extra : ''}`)
const ms = (f) => { const t = process.hrtime.bigint(); const r = f(); return [Number(process.hrtime.bigint() - t) / 1e6, r] }

// ---------- 1. migrazione da uno schema precedente ----------
{
  const d = path.join(tmp, 'migra'); db.open(d); const p = db.save('pratiche', { titolo: 'Vecchia', numero: '2025/001' })
  db.saveParcella({ data: '2025-01-01', voci: [{ tipo: 'compenso', descrizione: 'x', quantita: 1, importo: 10 }] }); db.close()
  const raw = new DatabaseSync(path.join(d, 'mngmnt.db')); raw.exec('ALTER TABLE parcelle DROP COLUMN calcolo'); raw.close()
  db.open(d)
  assert.ok(db.getDb().prepare('PRAGMA table_info(parcelle)').all().some((c) => c.name === 'calcolo'))
  assert.equal(db.list('pratiche')[0].titolo, 'Vecchia'); assert.equal(db.list('parcelle').length, 1)
  assert.doesNotThrow(() => db.saveParcella({ data: '2026-01-01', calcolo: '{}' }))
  db.close(); ok('migrazione: colonna aggiunta a un archivio con schema precedente, dati intatti')
}

// ---------- 2. archivio corrotto ----------
{
  const d = path.join(tmp, 'corrotto'); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'mngmnt.db'), Buffer.from('Questo non è un database SQLite '.repeat(200)))
  let aperto = true
  try { db.open(d); aperto = db.verificaIntegrita() } catch { aperto = false }
  assert.equal(aperto, false); db.close()
  const messo = db.isolaArchivioDanneggiato(d)
  assert.ok(fs.existsSync(messo) && !fs.existsSync(path.join(d, 'mngmnt.db')))
  db.open(d); assert.equal(db.list('pratiche').length, 0); assert.ok(db.verificaIntegrita()); db.close()
  ok('archivio corrotto: rilevato, conservato da parte (non cancellato) e ripartenza da archivio nuovo')
  // archivio troncato a metà
  const d2 = path.join(tmp, 'troncato'); db.open(d2); for (let i = 0; i < 300; i++) db.save('note', { pratica_id: db.save('pratiche', { titolo: 'p' + i }).id, testo: 'x'.repeat(500) }); db.getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close()
  const f = path.join(d2, 'mngmnt.db'); fs.truncateSync(f, Math.floor(fs.statSync(f).size / 2))
  let rotto = false; try { db.open(d2); rotto = !db.verificaIntegrita() || db.list('note').length < 300 } catch { rotto = true } db.close()
  assert.ok(rotto); ok('archivio troncato a metà: non spacciato per valido')
}

// ---------- 3. crash a metà scrittura (kill -9) ----------
{
  const d = path.join(tmp, 'crash'); db.open(d); const p = db.save('pratiche', { titolo: 'P' }); db.close()
  const figlio = spawn(process.execPath, [__filename, '--scrittore', d, '5000', 'crash', String(p.id)], { stdio: ['ignore', 'pipe', 'inherit'] })
  let ultimi = 0
  const fine = new Promise((res) => {
    figlio.stdout.on('data', (b) => { ultimi = Number(String(b).trim().split('\n').pop()); if (ultimi >= 400) figlio.kill('SIGKILL') })
    figlio.on('exit', res)
  })
  ;(async () => {
    await fine
    db.open(d)
    assert.ok(db.verificaIntegrita(), 'integrità dopo kill -9')
    const salvate = db.list('note').length
    assert.ok(salvate >= ultimi, `righe confermate perse (${salvate} < ${ultimi + 1})`)
    db.close(); ok('crash (kill -9 durante 5000 scritture): archivio integro e nessuna riga confermata persa', `(${salvate} righe)`)

    // ---------- 4. due processi che scrivono insieme ----------
    const d2 = path.join(tmp, 'concorrenza'); db.open(d2); const p2 = db.save('pratiche', { titolo: 'C' }); db.close()
    const lanci = ['A', 'B', 'C'].map((t) => new Promise((res) => { const c = spawn(process.execPath, [__filename, '--scrittore', d2, '400', t, String(p2.id)], { stdio: ['ignore', 'ignore', 'pipe'] }); let err = ''; c.stderr.on('data', (x) => (err += x)); c.on('exit', (code) => res({ code, err })) }))
    const res = await Promise.all(lanci)
    assert.ok(res.every((r) => r.code === 0), 'errori: ' + res.map((r) => r.err).join('|'))
    db.open(d2); assert.equal(db.list('note').length, 1200); assert.ok(db.verificaIntegrita()); db.close()
    ok('concorrenza: 3 processi scrivono insieme sullo stesso archivio, 1200/1200 righe, nessun errore')

    resto()
  })().catch((e) => { console.error(e); process.exit(1) })
}

function resto() {
  // ---------- 5. grandi volumi ----------
  const d = path.join(tmp, 'volume'); db.open(d)
  const clienti = []
  db.transaction(() => { for (let i = 0; i < 2000; i++) clienti.push(db.save('anagrafica', { denominazione: `Cliente ${i} Srl`, email: `c${i}@esempio.it`, codice_fiscale: `CF${i}` }).id) })
  const pratiche = []
  const oggi = new Date()
  const iso = (dd, h = 9) => { const x = new Date(oggi); x.setDate(x.getDate() + dd); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:00` }
  const [tIns] = ms(() => db.transaction(() => {
    for (let i = 0; i < 5000; i++) pratiche.push(db.save('pratiche', { numero: `2026/${String(i).padStart(4, '0')}`, titolo: `Pratica ${i} — risarcimento danni e questioni accessorie`, cliente_id: clienti[i % 2000], stato: i % 7 ? 'In corso' : 'Chiusa', colore: '#3b82f6' }).id)
    for (let i = 0; i < 20000; i++) db.save('scadenze', { pratica_id: pratiche[i % 5000], titolo: `Scadenza ${i}`, tipo: 'scadenza', data_ora: iso((i % 400) - 100, 9 + (i % 8)), promemoria: [1440, 60], completata: i % 3 === 0 ? 1 : 0 })
    for (let i = 0; i < 20000; i++) db.save('todos', { pratica_id: pratiche[i % 5000], titolo: `Attività ${i}`, scadenza: iso((i % 300) - 50), promemoria_min: i % 2 ? 1440 : null, completata: i % 4 === 0 ? 1 : 0, ordine: i })
    for (let i = 0; i < 2000; i++) db.saveParcella({ data: '2026-03-01', cliente_id: clienti[i], pratica_id: pratiche[i], compensi: 1000, voci: [{ tipo: 'compenso', descrizione: 'x', quantita: 1, importo: 1000 }, { tipo: 'spesa_esente', descrizione: 'y', quantita: 1, importo: 50 }] })
  }))
  const lim = (nome, tempo, max) => { assert.ok(tempo < max, `${nome}: ${tempo.toFixed(0)} ms (limite ${max})`); return `${nome} ${tempo.toFixed(0)}ms` }
  const rep = []
  rep.push(lim('inserimento 49.000 righe', tIns, 20000))
  for (const t of ['pratiche', 'scadenze', 'todos', 'anagrafica', 'parcelle']) { const [tt, r] = ms(() => db.list(t, {}, 'id DESC')); rep.push(lim(`elenco ${t} (${r.length})`, tt, 800)) }
  rep.push(lim('ricerca globale', ms(() => db.searchAll('Pratica 49'))[0], 400))
  rep.push(lim('controllo avvisi (ogni 30 s)', ms(() => alerts.collectDue(new Date()))[0], 1500))
  rep.push(lim('controllo avvisi a regime (nessun nuovo avviso)', ms(() => alerts.collectDue(new Date()))[0], 300))
  rep.push(lim('riepilogo giornaliero', ms(() => alerts.dailyDigest(new Date()))[0], 300))
  const [tIcs, icsOut] = ms(() => ics.build(null)); rep.push(lim(`esportazione .ics (${(icsOut.length / 1e6).toFixed(1)} MB)`, tIcs, 4000))
  const [tBk, bk] = ms(() => backup.run(path.join(tmp, 'bk-volume'))); rep.push(lim(`backup (${(fs.statSync(path.join(bk, 'mngmnt.db')).size / 1e6).toFixed(0)} MB)`, tBk, 6000))
  assert.ok(db.verificaIntegrita())
  ok('volumi (5.000 pratiche, 20.000 scadenze, 20.000 attività, 2.000 parcelle): ' + rep.join(' · '))
  db.close()

  // ---------- 6. input ostili ----------
  const h = path.join(tmp, 'ostili'); db.open(h)
  const brutte = ["'); DROP TABLE pratiche;--", '<img src=x onerror=alert(1)>', '"; DELETE FROM pratiche; --', '\\', '%', '_', '\u0000nul', '😀🏛️ 日本語 العربية', 'x'.repeat(200000), "Robert'); --", '\n\r\t', '{"a":1}', '${process.exit(1)}']
  for (const b of brutte) {
    const p = db.save('pratiche', { titolo: b, descrizione: b, numero: b.slice(0, 20) })
    assert.equal(db.get('pratiche', p.id).titolo, b.replace(/\u0000/g, ''))
    db.save('anagrafica', { denominazione: b }); db.save('note', { pratica_id: p.id, testo: b }); db.save('link', { titolo: b, url: 'https://x.it/' + b.slice(0, 10) })
    assert.doesNotThrow(() => db.searchAll(b)); assert.doesNotThrow(() => db.list('pratiche', { titolo: b }))
  }
  assert.equal(db.list('pratiche').length, brutte.length); assert.ok(db.getDb().prepare("SELECT name FROM sqlite_master WHERE name='pratiche'").get())
  assert.deepEqual(db.searchAll('%').length >= 0, true)
  assert.throws(() => db.save('pratiche', { id: 'x; DROP TABLE pratiche', titolo: 'a' }), /Identificativo/) // l'id è un parametro: non esegue nulla
  assert.ok(db.list('pratiche').length === brutte.length)
  assert.throws(() => db.save('scadenze', { titolo: 'data errata', data_ora: 'non-una-data', promemoria: 'non json' }), /Data/)
  assert.doesNotThrow(() => alerts.collectDue(new Date())); assert.doesNotThrow(() => ics.build(null))
  assert.throws(() => db.save('todos', { titolo: 'x', scadenza: '99-99-99', promemoria_min: 'abc' }), /Data/)
  assert.doesNotThrow(() => alerts.collectDue(new Date()))
  db.close(); ok('input ostili: SQL injection, HTML, unicode, 200.000 caratteri, date e JSON malformati — nessun errore e tabelle intatte')

  // ---------- 7. nomi file (Windows incluso) ----------
  const casi = { 'CON': '_CON', 'con.txt': '_con.txt', 'nul.pdf': '_nul.pdf', 'COM1': '_COM1', 'LPT9.docx': '_LPT9.docx', 'a/b\\c:d*e?f"g<h>i|j.pdf': 'a_b_c_d_e_f_g_h_i_j.pdf', '  nome con spazi.pdf  ': 'nome con spazi.pdf', 'file...': 'file', '.nascosto': 'nascosto', '': 'file', '日本語の書類.pdf': '日本語の書類.pdf', 'perizia 2026 — Rossi/Bianchi.pdf': 'perizia 2026 — Rossi_Bianchi.pdf', 'tab\there.txt': 'tab_here.txt' }
  for (const [i, o] of Object.entries(casi)) assert.equal(safeName(i), o, `safeName(${JSON.stringify(i)})`)
  const lungo = safeName('a'.repeat(400) + '.pdf'); assert.ok(lungo.length <= 150 && lungo.endsWith('.pdf'))
  ok('nomi file: nomi riservati di Windows, caratteri vietati, punti e spazi finali, unicode, lunghezza massima')
  for (const f of ['C:\\x\\setup.EXE', 'a/b/script.ps1', '/Applications/X.app', 'avvia.command', 'collegamento.lnk', 'x.bat']) assert.ok(eseguibile(f), f)
  for (const f of ['atto.pdf', 'ricorso.docx', 'foto.JPG', 'nota.txt', 'senza-estensione', '']) assert.ok(!eseguibile(f), f)
  ok('documenti collegati: programmi e script non vengono avviati da «Apri»')

  // ---------- 8. date limite per gli avvisi ----------
  const dd = path.join(tmp, 'date'); db.open(dd)
  const A = (data, prom, adesso, extra = {}) => { db.getDb().exec('DELETE FROM alert_fired; DELETE FROM scadenze'); db.save('scadenze', { titolo: 'T', data_ora: data, promemoria: prom, ...extra }); return alerts.collectDue(adesso) }
  assert.equal(A('2028-03-01T10:00', [1440], new Date(2028, 1, 29, 10, 0)).length, 1)         // anno bisestile: 1 giorno prima = 29 febbraio
  assert.equal(A('2028-03-01T10:00', [1440], new Date(2028, 1, 29, 9, 59)).length, 0)
  assert.equal(A('2027-01-01T00:30', [60], new Date(2026, 11, 31, 23, 30)).length, 1)          // a cavallo del capodanno
  assert.equal(A('2026-03-30', [1440], new Date(2026, 2, 29, 9, 0), { tutto_il_giorno: 1 }).length, 1) // passaggio all'ora legale (29 marzo, giornata di 23 ore)
  assert.equal(A('2026-03-30', [1440], new Date(2026, 2, 29, 8, 59), { tutto_il_giorno: 1 }).length, 0)
  assert.equal(A('2026-10-26', [1440], new Date(2026, 9, 25, 9, 0), { tutto_il_giorno: 1 }).length, 1) // passaggio all'ora solare (25 ottobre)
  assert.equal(A('2026-10-26', [1440], new Date(2026, 9, 25, 8, 59), { tutto_il_giorno: 1 }).length, 0)
  assert.equal(A('2026-06-15T23:59', [0], new Date(2026, 5, 15, 23, 59)).length, 1)
  assert.equal(A('2026-06-15T00:00', [10080], new Date(2026, 5, 8, 0, 0)).length, 1)           // una settimana prima a mezzanotte
  assert.equal(A('2026-06-15T10:00', [60, 60, 60], new Date(2026, 5, 15, 9, 30)).length, 1)    // promemoria duplicati: un solo avviso
  const unAvviso = A('2026-06-15T10:00', [15], new Date(2026, 5, 15, 9, 50)); assert.equal(unAvviso.length, 1); assert.equal(alerts.collectDue(new Date(2026, 5, 15, 9, 55)).length, 0)
  db.close(); ok('date limite: anno bisestile, capodanno, cambio ora legale/solare, mezzanotte, promemoria duplicati')

  // Le impostazioni storiche non devono riattivare rete o cache del servizio privato.
  db.open(path.join(tmp, 'tariffe'))
  const tariffe = require('../electron/tariffe'), fetchOriginale = global.fetch
  ;(async () => {
    try {
      global.fetch = () => { throw new Error('Nessuna richiesta di rete consentita') }
      db.setSettings({ tariffe_online: true, cache_tariffe: { '2022:360:30:0': { valori: {99:[1,2,3]} } } })
      const r = await tariffe.valori({ anno: 2022, competenza: 360, scaglione: 30 })
      assert.equal(r.fonte, 'incluse'); assert.deepEqual(r.valori['99'], [993,1985,2978])
      assert.equal(tariffe.struttura(2022,360).online, false)
      assert.equal(tariffe.competenze().length, 48)
      await assert.rejects(() => tariffe.valori({ anno:2022, competenza:110, scaglione:130 }), /manualmente/) // oltre 32 milioni: a mano
      // indeterminabili come nei calcolatori di avvocatoandreani.it (valori letti sul sito il 22/10/2026)
      const ind = async (anno, competenza, scaglione) => (await tariffe.valori({ anno, competenza, scaglione })).valori
      assert.deepEqual(await ind(2022, 360, 901), { 99: [1205, 2410, 3615] })
      assert.deepEqual(await ind(2022, 360, 902), { 99: [1737, 3473, 5210] })
      assert.deepEqual(await ind(2022, 360, 910), { 99: [3082, 6164, 9246] })
      assert.deepEqual(await ind(2022, 110, 902), { 10: [1064, 2127, 3191], 20: [708, 1416, 2124], 30: [1869, 3738, 5607], 40: [1790, 3579, 5369] })
      assert.deepEqual(await ind(2022, 110, 903), { 10: [1276, 2552, 3828], 20: [814, 1628, 2442], 30: [2835, 5670, 8505], 40: [2127, 4253, 6380] })
      assert.deepEqual((await ind(2014, 110, 902))[40], [1705, 3409, 6136])
      const etichette = tariffe.struttura(2022, 360).scaglioni.filter((s) => s.id > 900)
      assert.deepEqual(etichette.map((s) => s.label), ['Indeterminabile - complessità bassa', 'Indeterminabile - complessità media', 'Indeterminabile - complessità alta', 'Indeterminabile di particolare importanza'])
      assert.ok(etichette.every((s) => !s.calcolato)) // non chiedono il valore della causa
      assert.throws(() => tariffe.struttura(2014,380), /non è prevista/)
      ok('tabelle normative locali, cache esterna ignorata, rete assente, indeterminabili come sul sito, oltre 32 milioni a mano')
    } finally { global.fetch = fetchOriginale; db.close(); fs.rmSync(tmp, { recursive:true, force:true }) }
    console.log(`\n${n} prove di robustezza superate`)
  })().catch(e => { console.error(e); process.exitCode = 1 })
}
