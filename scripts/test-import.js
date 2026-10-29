'use strict'
// Importazione da file e cartelle: lettura CSV/Excel, riconoscimento colonne, doppioni, errori, anteprima senza scritture, origine intatta.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const db = require('../electron/db')
const imp = require('../electron/importer')
const { leggiCsv, leggiTabella } = require('../electron/tabelle')

let n = 0
const ok = (t, extra = '') => console.log(`ok ${++n} - ${t}${extra ? ' ' + extra : ''}`)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-import-'))
const scrivi = (nome, contenuto) => { const f = path.join(tmp, nome); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, contenuto); return f }
const impronta = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') + ':' + fs.statSync(f).mtimeMs

// scrittore ZIP minimale per costruire file .xlsx di prova (con o senza compressione)
function creaZip(files, comprimi) {
  const parti = [], centrale = []; let off = 0
  for (const [nome, dati] of Object.entries(files)) {
    const raw = Buffer.from(dati), body = comprimi ? zlib.deflateRawSync(raw) : raw, nm = Buffer.from(nome), crc = zlib.crc32(raw)
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(comprimi ? 8 : 0, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26)
    parti.push(lh, nm, body)
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(comprimi ? 8 : 0, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42)
    centrale.push(ch, nm); off += 30 + nm.length + body.length
  }
  const cd = Buffer.concat(centrale), eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(centrale.length / 2, 8); eocd.writeUInt16LE(centrale.length / 2, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16)
  return Buffer.concat([...parti, cd, eocd])
}
const xlsx = (righe, comprimi = true, serialiData = []) => {
  const cond = []; const idx = (s) => { let i = cond.indexOf(s); if (i < 0) { cond.push(s); i = cond.length - 1 } return i }
  const col = (i) => String.fromCharCode(65 + i)
  const rows = righe.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => { if (c === null || c === '') return ''; const ref = `${col(ci)}${ri + 1}`; if (typeof c === 'number') return `<c r="${ref}"${serialiData.includes(ci) && ri > 0 ? ' s="1"' : ''}><v>${c}</v></c>`; if (typeof c === 'boolean') return `<c r="${ref}" t="b"><v>${c ? 1 : 0}</v></c>`; if (String(c).startsWith('inline:')) return `<c r="${ref}" t="inlineStr"><is><t>${String(c).slice(7)}</t></is></c>`; return `<c r="${ref}" t="s"><v>${idx(String(c))}</v></c>` }).join('')}</row>`).join('')
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return creaZip({
    '[Content_Types].xml': '<Types/>', '_rels/.rels': '<Relationships/>',
    'xl/workbook.xml': '<workbook xmlns:r="x"><sheets><sheet name="Elenco" sheetId="1" r:id="rId7"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId7" Target="worksheets/foglio-dati.xml"/></Relationships>',
    'xl/styles.xml': '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    'xl/sharedStrings.xml': `<sst>${cond.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`,
    'xl/worksheets/foglio-dati.xml': `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
  }, comprimi)
}

// ---------- 1. lettura di CSV ----------
{
  const c = leggiCsv('Nome;Note;Valore\r\n"Rossi, Mario";"Riga uno\nriga due con ""virgolette""";1.234,56\r\nBianchi;;\r\n')
  assert.deepEqual(c.righe[1], ['Rossi, Mario', 'Riga uno\nriga due con "virgolette"', '1.234,56']); assert.equal(c.delimitatore, ';'); assert.equal(c.righe.length, 3)
  assert.equal(leggiCsv('a,b,c\n1,2,3').delimitatore, ','); assert.equal(leggiCsv('a\tb\n1\t2').delimitatore, '\t')
  assert.deepEqual(leggiTabella(scrivi('latin1.csv', Buffer.from('Nome;Città\nGiuseppe Perù;Forlì\n', 'latin1'))).righe[0], ['Giuseppe Perù', 'Forlì'])
  assert.deepEqual(leggiTabella(scrivi('bom.csv', '﻿Nome;Città\nZoë;Napoli\n')).intestazioni, ['Nome', 'Città'])
  assert.deepEqual(leggiTabella(scrivi('vuote.csv', 'A;B\n\n;;\nx;y\n\n')).righe, [['x', 'y']])
  ok('CSV: virgolette, a capo e virgolette doppie nei campi, delimitatori ; , tabulazione, accenti Windows-1252, BOM, righe vuote')
}
// ---------- 2. lettura di Excel (.xlsx) ----------
for (const comprimi of [true, false]) {
  const f = scrivi(`prova-${comprimi}.xlsx`, xlsx([['Cognome', 'Data udienza', 'Importo', 'Fatto', 'Note'], ['Rossi & C.', 46308, 1234.5, true, 'inline:Testo <b>diretto</b>'], ['Bianchi', 46309.5, 0.1 + 0.2, false, '']], comprimi, [1]))
  const t = leggiTabella(f)
  assert.deepEqual(t.intestazioni, ['Cognome', 'Data udienza', 'Importo', 'Fatto', 'Note']); assert.equal(t.foglio, 'Elenco')
  assert.deepEqual(t.righe[0], ['Rossi & C.', '2026-10-13', '1234.5', 'Sì', 'Testo <b>diretto</b>']); assert.equal(t.righe[1][1], '2026-10-14T12:00'); assert.equal(t.righe[1][2], '0.3')
}
ok('Excel (.xlsx): testo condiviso e diretto, numeri, date (anche con ora), valori Sì/No, simboli &, archivio compresso e non')
for (const [nome, cont, re] of [['vecchio.xls', 'x', /\.xlsx|CSV/], ['foglio.ods', 'x', /\.xlsx|CSV/], ['guasto.xlsx', 'non è uno zip', /archivio valido|Excel/], ['atto.pdf', '%PDF', /Formato non riconosciuto/], ['vuoto.csv', '', /vuoto/]]) assert.throws(() => leggiTabella(scrivi(nome, cont)), re)
ok('formati non supportati o file guasti: messaggio chiaro con cosa fare (es. salvare come CSV/.xlsx)')

// ---------- 3. riconoscimento automatico delle colonne ----------
{
  const m1 = imp.proponiMappatura('anagrafica', ['Cognome', 'Nome', 'Codice Fiscale', 'P.IVA', 'Cell.', 'E-mail', 'Indirizzo', 'CAP', 'Comune', 'Prov.', 'Tipo anagrafica', 'Note'])
  assert.deepEqual(m1, { cognome: 0, nome: 1, codice_fiscale: 2, partita_iva: 3, telefono: 4, email: 5, indirizzo: 6, cap: 7, citta: 8, provincia: 9, ruolo: 10, note: 11 })
  const m2 = imp.proponiMappatura('pratiche', ['N. Fascicolo', 'Oggetto', 'Assistito', 'Controparte', 'Materia', 'Stato', 'Ufficio giudiziario', 'R.G.', 'Giudice', 'Valore causa', 'Data apertura', 'Annotazioni'])
  assert.deepEqual(m2, { numero: 0, titolo: 1, cliente: 2, controparte: 3, tipo: 4, stato: 5, autorita: 6, rg: 7, giudice: 8, valore: 9, data_apertura: 10, descrizione: 11 })
  const m3 = imp.proponiMappatura('scadenze', ['Data udienza', 'Ora', 'Oggetto', 'Fascicolo', 'Aula', 'Tipo impegno', 'Note'])
  assert.deepEqual(m3, { data: 0, ora: 1, titolo: 2, pratica: 3, luogo: 4, tipo: 5, note: 6 })
  const m4 = imp.proponiMappatura('parcelle', ['N. Fattura', 'Data fattura', 'Cliente', 'Causale', 'Imponibile', 'IVA', 'Totale fattura', 'Stato pagamento'])
  assert.deepEqual(m4, { numero: 0, data: 1, cliente: 2, oggetto: 3, imponibile: 4, iva: 5, totale: 6, stato: 7 })
  assert.deepEqual(imp.proponiMappatura('anagrafica', ['Colonna 1', 'Colonna 2']), {})
  ok('colonne riconosciute da sole con i nomi tipici dei gestionali (Cliens, Excel…) per anagrafica, pratiche, scadenze e parcelle')
}
// ---------- 4. conversione di date e numeri ----------
{
  const d = imp.parseData
  for (const [i, o] of Object.entries({ '15/11/2026': ['2026-11-15', null], '5-1-26': ['2026-01-05', null], '31.12.2026 09:30': ['2026-12-31', '09:30'], '2026-03-04': ['2026-03-04', null], '2026-03-04T08:05': ['2026-03-04', '08:05'], '2026/03/04': ['2026-03-04', null] })) assert.deepEqual([d(i).data, d(i).ora], o, i)
  for (const brutta of ['31/02/2026', '32/01/2026', 'domani', '', '13/13/2026', '00/00/0000']) assert.equal(d(brutta), null, brutta)
  const v = imp.parseNumero
  for (const [i, o] of Object.entries({ '1.234,56': 1234.56, '1234.56': 1234.56, '€ 1.234,56': 1234.56, '1,5': 1.5, '1.500': 1500, '12.5': 12.5, '-100,00': -100, '(100,00)': -100, '1.234.567,89': 1234567.89, '0': 0 })) assert.equal(v(i), o, i)
  assert.equal(v('-'), null); assert.ok(Number.isNaN(v('abc'))); assert.equal(imp.parseOra('9.30'), '09:30'); assert.equal(imp.parseOra('9'), '09:00'); assert.equal(imp.parseOra('25:00'), null)
  ok('date (gg/mm/aaaa, gg-mm-aa, ISO, con ora, date inesistenti rifiutate) e numeri all\'italiana (1.234,56 · € · negativi) interpretati correttamente')
}

const dir = path.join(tmp, 'dati'); db.open(dir)
const mappa = (tipo, f) => imp.proponi(tipo, f)
const esegui = (tipo, f, opz) => { const p = mappa(tipo, f); const a = imp.anteprima(tipo, f, p.mappatura, opz); const r = imp.importa(tipo, f, p.mappatura, opz); return [a, r] }

// ---------- 5. anagrafica ----------
{
  const f = scrivi('anagrafica.csv', ['Cognome;Nome;Codice Fiscale;P.IVA;Cell.;E-mail;Comune;Prov.;Tipo anagrafica',
    'Rossi;Mario;rssmra80a01f257x;;333 111 222;mario@esempio.it;Modena;mo;Cliente',
    'Bianchi Costruzioni S.r.l.;;;01234567890;;info@bianchi.it;Bologna;BO;Controparte',
    'Verdi;Anna;;;;non-una-mail;Roma;RM;',
    ';;;;;;;;',
    'Rossi;Mario;RSSMRA80A01F257X;;;;;;',
    '"Ferrari, Luca";;;;;luca@esempio.it;;;Assistito'].join('\n'))
  const [a, r] = esegui('anagrafica', f, {})
  assert.deepEqual([a.creati, a.esistenti, a.errori.length], [r.creati, r.esistenti, r.errori.length]); assert.equal(db.list('anagrafica').length, 4)
  assert.deepEqual([r.creati, r.esistenti], [4, 1])
  const per = Object.fromEntries(db.list('anagrafica').map((x) => [x.denominazione, x]))
  assert.equal(per['Rossi Mario'].codice_fiscale, 'RSSMRA80A01F257X'); assert.equal(per['Rossi Mario'].provincia, 'MO'); assert.equal(per['Rossi Mario'].tipo, 'persona')
  assert.equal(per['Bianchi Costruzioni S.r.l.'].tipo, 'azienda'); assert.equal(per['Bianchi Costruzioni S.r.l.'].ruolo, 'controparte'); assert.equal(per['Ferrari, Luca'].ruolo, 'cliente')
  assert.equal(per['Verdi Anna'].email, null); assert.ok(r.avvisi.some((x) => /Email non valida/.test(x.motivo)))
  const r2 = imp.importa('anagrafica', f, mappa('anagrafica', f).mappatura, {}); assert.deepEqual([r2.creati, r2.esistenti], [0, 5]); assert.equal(db.list('anagrafica').length, 4)
  ok('anagrafica: cognome+nome uniti, codice fiscale in maiuscolo, società riconosciute, ruoli, email errata segnalata, doppione per codice fiscale; riimportazione senza duplicati')
  db.save('anagrafica', { id: per['Rossi Mario'].id, telefono: 'MODIFICATO A MANO' })
  const f2 = scrivi('anagrafica2.csv', 'Nome e cognome;Codice fiscale;Cell.;Comune\nRossi Mario;RSSMRA80A01F257X;;Parma\n')
  imp.importa('anagrafica', f2, mappa('anagrafica', f2).mappatura, { aggiorna: true })
  const dopo = db.get('anagrafica', per['Rossi Mario'].id); assert.equal(dopo.citta, 'Parma'); assert.equal(dopo.telefono, 'MODIFICATO A MANO')
  ok('"aggiorna esistenti": aggiorna solo i campi compilati nel file e non cancella i dati inseriti a mano')
}
// ---------- 6. pratiche ----------
{
  const f = scrivi('pratiche.xlsx', xlsx([['N. Fascicolo', 'Oggetto', 'Assistito', 'Controparte', 'Materia', 'Stato', 'Ufficio giudiziario', 'R.G.', 'Valore causa', 'Data apertura'],
    ['2024/010', 'Rossi c. Bianchi — risarcimento', 'Rossi Mario', 'Bianchi Costruzioni S.r.l.', 'Civile', 'Chiuso', 'Tribunale di Modena', '1234/2024', '12.500,00', 46000],
    ['2025/003', 'Recupero crediti Gamma', 'Gamma Spa', '', 'Recupero crediti', 'In corso', '', '', '1.234,56', '03/02/2025'],
    ['', 'Consulenza contratto locazione', 'Nuovo Cliente', '', '', '', '', '', '', ''],
    ['2025/004', '', 'Senza titolo', '', '', '', '', '', '', ''],
    ['2025/005', 'Pratica con data errata', '', '', '', 'Sospesa', '', '', 'abc', '31/02/2025']], true, [9]))
  const prima = db.list('anagrafica').length
  const [a, r] = esegui('pratiche', f, {})
  assert.deepEqual([a.creati, a.errori.length], [r.creati, r.errori.length]); assert.equal(r.creati, 4); assert.equal(r.errori.length, 1); assert.match(r.errori[0].motivo, /titolo mancante/); assert.equal(r.errori[0].riga, 5)
  const p = Object.fromEntries(db.list('pratiche').map((x) => [x.titolo, x]))
  const rossi = p['Rossi c. Bianchi — risarcimento']
  assert.equal(rossi.numero, '2024/010'); assert.equal(rossi.stato, 'Chiusa'); assert.equal(rossi.valore, 12500); assert.equal(rossi.autorita, 'Tribunale di Modena'); assert.equal(rossi.rg, '1234/2024'); assert.equal(rossi.data_apertura, '2025-12-09')
  assert.equal(db.get('anagrafica', rossi.cliente_id).denominazione, 'Rossi Mario'); assert.equal(db.get('anagrafica', rossi.controparte_id).denominazione, 'Bianchi Costruzioni S.r.l.')
  assert.equal(db.list('anagrafica').length - prima, 2 + 0, 'clienti creati: Gamma Spa, Nuovo Cliente (Rossi e Bianchi esistevano)')
  assert.equal(p['Recupero crediti Gamma'].valore, 1234.56); assert.equal(p['Recupero crediti Gamma'].data_apertura, '2025-02-03'); assert.equal(p['Recupero crediti Gamma'].stato, 'In corso')
  assert.match(p['Consulenza contratto locazione'].numero, /^\d{4}\/\d{3}$/)
  assert.equal(p['Pratica con data errata'].stato, 'Sospesa'); assert.equal(p['Pratica con data errata'].data_apertura, null); assert.ok(r.avvisi.some((x) => /Data di apertura non riconosciuta/.test(x.motivo)) && r.avvisi.some((x) => /Valore non riconosciuto/.test(x.motivo)))
  const r2 = imp.importa('pratiche', f, mappa('pratiche', f).mappatura, {}); assert.equal(r2.creati, 0); assert.equal(db.list('pratiche').length, 4)
  ok('pratiche da Excel: numeri, stati ("Chiuso" → Chiusa), valori 12.500,00, date Excel e testuali, clienti e controparti collegati o creati, riga con errore segnalata (riga 5) e le altre importate; riimportazione senza duplicati')
  const solo = scrivi('solo-clienti.csv', 'Oggetto;Assistito\nPratica X;Mario Ignoto\n'); const r3 = imp.importa('pratiche', solo, mappa('pratiche', solo).mappatura, { creaClienti: false })
  assert.equal(r3.creati, 1); assert.ok(r3.avvisi.some((x) => /non è in anagrafica/.test(x.motivo))); assert.equal(db.list('pratiche').find((x) => x.titolo === 'Pratica X').cliente_id, null)
  ok('opzione "non creare i clienti mancanti": la pratica viene importata senza collegamento e viene segnalato')
}
// ---------- 7. scadenze e udienze ----------
{
  const f = scrivi('udienze.csv', ['Data udienza;Ora;Oggetto;Fascicolo;Aula;Tipo impegno',
    '15/11/2099;9.30;Udienza di comparizione;2024/010;Aula 3;Udienza', '20/11/2099;;Deposito memoria art. 183;Recupero crediti Gamma;;Termine', '01/01/2020;10:00;Udienza passata;2024/010;;', '16/11/2099;15:00;Incontro con il cliente;Fascicolo inesistente;;Incontro', 'data sbagliata;;Evento senza data;;;', '15/11/2099;9:30;Udienza di comparizione;2024/010;Aula 3;Udienza'].join('\n'))
  const [a, r] = esegui('scadenze', f, {})
  assert.equal(r.creati, a.creati); assert.deepEqual([r.creati, r.esistenti, r.errori.length], [4, 1, 1])
  const s = Object.fromEntries(db.list('scadenze').map((x) => [x.titolo, x]))
  const rossi = db.list('pratiche').find((x) => x.numero === '2024/010')
  assert.deepEqual([s['Udienza di comparizione'].data_ora, s['Udienza di comparizione'].tipo, s['Udienza di comparizione'].tutto_il_giorno, s['Udienza di comparizione'].pratica_id], ['2099-11-15T09:30', 'udienza', 0, rossi.id])
  assert.deepEqual([s['Deposito memoria art. 183'].data_ora, s['Deposito memoria art. 183'].tutto_il_giorno, s['Deposito memoria art. 183'].tipo], ['2099-11-20', 1, 'scadenza']); assert.ok(s['Deposito memoria art. 183'].pratica_id)
  assert.equal(JSON.parse(s['Udienza di comparizione'].promemoria).length, 2); assert.equal(JSON.parse(s['Udienza passata'].promemoria).length, 0)
  assert.equal(s['Incontro con il cliente'].pratica_id, null); assert.equal(s['Incontro con il cliente'].tipo, 'appuntamento'); assert.ok(r.avvisi.some((x) => /non trovata/.test(x.motivo))); assert.match(r.errori[0].motivo, /Data non riconosciuta/)
  const r2 = imp.importa('scadenze', f, mappa('scadenze', f).mappatura, {}); assert.equal(r2.creati, 0); assert.equal(db.list('scadenze').length, 4)
  ok('udienze e scadenze: data e ora (anche 9.30), giorno intero senza ora, tipo riconosciuto, pratica collegata per numero o titolo, avvisi solo per il futuro, riga errata segnalata, doppioni ignorati')
}
// ---------- 8. parcelle / fatture ----------
{
  const f = scrivi('fatture.csv', ['N. Fattura;Data fattura;Cliente;Causale;Imponibile;IVA;Totale fattura;Stato pagamento', '12;10/03/2026;Rossi Mario;Assistenza stragiudiziale;1.000,00;220,00;1.220,00;Pagata', '13;15/03/2026;Gamma Spa;Consulenza;500,00;110,00;610,00;Da pagare', '14;20/03/2026;Gamma Spa;Con importi incoerenti;500,00;110,00;999,00;', ';21/03/2026;Nuovo;Senza numero;;;122,00;', 'x;data;Y;;;;;'].join('\n'))
  const [a, r] = esegui('parcelle', f, {})
  assert.equal(a.creati, r.creati); assert.deepEqual([r.creati, r.errori.length], [4, 1]); assert.ok(r.avvisi.some((x) => /non coincide/.test(x.motivo)))
  const pc = Object.fromEntries(db.list('parcelle').map((x) => [x.numero, x]))
  assert.deepEqual([pc['12/2026'].stato, pc['12/2026'].imponibile, pc['12/2026'].iva, pc['12/2026'].totale, pc['12/2026'].iva_perc, pc['12/2026'].data_pagamento], ['pagata', 1000, 220, 1220, 22, '2026-03-10'])
  assert.equal(pc['13/2026'].stato, 'emessa'); assert.ok(db.getParcella(pc['12/2026'].id).voci.length === 1)
  assert.equal(db.nextParcellaNumero(2026).progressivo, 16, 'la numerazione prosegue dopo lo storico importato')
  const r2 = imp.importa('parcelle', f, mappa('parcelle', f).mappatura, {}); assert.equal(r2.creati, 1, 'solo la riga senza numero (non riconoscibile) viene ricreata'); assert.equal(r2.esistenti, 3)
  ok('fatture e parcelle storiche: importi, IVA calcolata, pagata/emessa, incoerenze segnalate, numerazione che prosegue dopo lo storico, riimportazione senza duplicati')
}
// ---------- 9. l'anteprima non scrive nulla ----------
{
  const f = scrivi('anteprima.csv', 'Cognome;Nome\nUno;Test\nDue;Test\n'); const prima = db.getDb().prepare('SELECT COUNT(*) c FROM anagrafica').get().c
  const a = imp.anteprima('anagrafica', f, mappa('anagrafica', f).mappatura, {}); assert.equal(a.creati, 2); assert.equal(db.getDb().prepare('SELECT COUNT(*) c FROM anagrafica').get().c, prima)
  assert.throws(() => imp.anteprima('anagrafica', f, {}, {}), /Associa una colonna/); assert.throws(() => imp.anteprima('pratiche', f, { numero: 0 }, {}), /Associa una colonna/)
  const rollback = scrivi('rollback.csv', 'Oggetto;Cliente\nA;X\nB;Y\n'); const pre = db.list('pratiche').length
  const orig = db.save; let k = 0; db.save = (t, o) => { if (t === 'pratiche' && ++k === 2) throw new Error('disco pieno (simulato)'); return orig(t, o) }
  try { const r = imp.importa('pratiche', rollback, mappa('pratiche', rollback).mappatura, {}); assert.equal(r.errori.length, 1) } finally { db.save = orig }
  ok('anteprima: nessuna scrittura; campi obbligatori non associati rifiutati; un errore di salvataggio su una riga non blocca le altre')
}
// ---------- 10. origine intatta e volumi ----------
{
  const grande = ['Cognome;Nome;E-mail']; for (let i = 0; i < 20000; i++) grande.push(`Cognome${i};Nome${i};c${i}@esempio.it`)
  const f = scrivi('grande.csv', grande.join('\n')); const h = impronta(f); const t0 = Date.now()
  const r = imp.importa('anagrafica', f, mappa('anagrafica', f).mappatura, {})
  assert.equal(r.creati, 20000); assert.ok(Date.now() - t0 < 15000, `${Date.now() - t0} ms`); assert.equal(impronta(f), h)
  const r2 = imp.importa('anagrafica', f, mappa('anagrafica', f).mappatura, {}); assert.equal(r2.creati, 0)
  const tutti = fs.readdirSync(tmp).filter((x) => /\.(csv|xlsx)$/.test(x))
  ok(`volumi: 20.000 anagrafiche importate in ${Date.now() - t0} ms, riimportazione senza duplicati; il file di origine non è stato toccato (impronta e data identiche)`)
  db.getDb().exec("DELETE FROM anagrafica WHERE denominazione LIKE 'Cognome%'")
}
// ---------- 11. modello CSV da compilare ----------
{
  for (const tipo of imp.TIPI) { const f = scrivi(`modello-${tipo}.csv`, imp.modelloCsv(tipo)); const p = mappa(tipo, f); const attesi = imp.CAMPI[tipo].filter((c) => c.obbl).map((c) => c.k); for (const k of attesi) assert.ok(p.mappatura[k] !== undefined, `${tipo}: ${k} non riconosciuto nel modello`) }
  const f = scrivi('modello-pratiche.csv', imp.modelloCsv('pratiche').replace('2026/001', '2026/777')); const conta = db.list('pratiche').length
  const [, r] = esegui('pratiche', f, {}); assert.equal(r.creati, 1); assert.equal(db.list('pratiche').length, conta + 1); assert.equal(db.list('pratiche').find((x) => x.numero === '2026/777').rg, '1234/2026')
  ok('modelli CSV scaricabili: tutte le colonne vengono riconosciute da sole e l\'esempio si importa correttamente')
}
// ---------- 12. cartelle di documenti ----------
{
  const radice = path.join(tmp, 'ArchivioVecchio')
  const crea = (rel, cont = rel) => scrivi(path.join('ArchivioVecchio', rel), cont)
  crea('2024-010 Rossi c. Bianchi/atto di citazione.pdf', 'PDF citazione'); crea('2024-010 Rossi c. Bianchi/Memorie/memoria 183.docx', 'DOCX memoria'); crea('2024-010 Rossi c. Bianchi/Memorie/Bozze/memoria 183.docx', 'altro contenuto'); crea('2024-010 Rossi c. Bianchi/.DS_Store'); crea('2024-010 Rossi c. Bianchi/~$lock.docx')
  crea('Recupero crediti Gamma/diffida.pdf', 'diffida'); crea('Contratto Società Nuova/bozza contratto.docx', 'bozza'); crea('Contratto Società Nuova/àèìòù perizia.pdf', 'perizia accentata'); crea('Cartella vuota/.gitkeep'); crea('file-in-radice.pdf', 'x')
  const hashOrigine = () => { const out = {}; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : (out[p] = impronta(p)) } }; walk(radice); return out }
  const prima = hashOrigine()
  const a = imp.anteprimaCartella(radice)
  const per = Object.fromEntries(a.cartelle.map((c) => [c.nome, c]))
  assert.equal(per['2024-010 Rossi c. Bianchi'].pratica.numero, '2024/010'); assert.equal(per['2024-010 Rossi c. Bianchi'].file, 3); assert.equal(per['Recupero crediti Gamma'].pratica.titolo, 'Recupero crediti Gamma')
  assert.equal(per['Contratto Società Nuova'].pratica, null); assert.equal(a.fileInRadice, 1); assert.equal(per['Cartella vuota'].file, 0)
  const p0 = db.list('pratiche').length, d0 = db.list('documenti').length
  const r = imp.importaCartella(radice, {}, {})
  assert.deepEqual([r.collegati, r.createPratiche, r.errori.length], [6, 1, 0]); assert.equal(db.list('pratiche').length, p0 + 1); assert.equal(db.list('documenti').length, d0 + 6)
  const rossi = db.list('pratiche').find((x) => x.numero === '2024/010'); const docs = db.list('documenti', { pratica_id: rossi.id })
  assert.equal(docs.length, 3); assert.deepEqual(docs.map((d) => d.nome).sort(), ['atto di citazione.pdf', 'memoria 183.docx', 'memoria 183.docx']); assert.equal(new Set(docs.map((d) => d.percorso)).size, 3) // due file con lo stesso nome in sottocartelle diverse: restano due collegamenti distinti
  assert.ok(docs.some((d) => d.categoria === 'Memorie/Bozze' || d.categoria === 'Memorie\\Bozze'))
  for (const d of docs) assert.ok(d.percorso && fs.existsSync(d.percorso) && d.percorso.startsWith(radice + path.sep) && d.file === '') // collegati: nessuna copia
  assert.equal(fs.readFileSync(docs.find((d) => d.nome === 'atto di citazione.pdf').percorso, 'utf8'), 'PDF citazione')
  const nuova = db.list('pratiche').find((x) => x.titolo === 'Contratto Società Nuova'); assert.ok(db.list('documenti', { pratica_id: nuova.id }).some((d) => d.nome === 'àèìòù perizia.pdf'))
  const r2 = imp.importaCartella(radice, {}, {}); assert.deepEqual([r2.collegati, r2.createPratiche], [0, 0]); assert.equal(r2.saltati, 6)
  const r3 = imp.importaCartella(radice, { 'Contratto Società Nuova': 'salta', 'Recupero crediti Gamma': 'salta' }, {}); assert.equal(r3.collegati, 0)
  assert.deepEqual(hashOrigine(), prima)
  ok('cartelle di documenti: abbinamento alle pratiche per numero o titolo, sottocartelle e nomi uguali gestiti, file di sistema ignorati, riimportazione senza doppioni; i file di origine restano identici (impronta e data)')
}

db.close(); fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${n} prove superate`)
