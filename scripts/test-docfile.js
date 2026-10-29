'use strict'
// Documenti collegati: nessuna copia dei file, ricerca dei file spostati o rinominati, cartella della pratica, file creati dall'app.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const db = require('../electron/db')
const docfile = require('../electron/docfile')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-docfile-'))
const dati = path.join(tmp, 'dati'), utente = path.join(tmp, 'Utente')
db.open(dati); docfile.init({ documenti: path.join(utente, 'Documenti') })
fs.mkdirSync(utente, { recursive: true })
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)
const scrivi = (p, contenuto) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, contenuto); return p }
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const pr = (n2, titolo) => db.save('pratiche', { numero: n2, titolo, colore: '#123456' })
const interni = () => { const d = path.join(dati, 'documenti'); return fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).filter((x) => fs.statSync(path.join(d, x)).isFile()) : [] }
const contenuto = (k, byte = 3000) => Buffer.from(k.repeat(Math.ceil(byte / k.length)).slice(0, byte))

// ---------- 1. collegamento senza copia ----------
const p1 = pr('2026/001', 'Rossi c. Bianchi')
const scr = scrivi(path.join(utente, 'Scritture', 'Pratica 1', 'ScritturaPrivata.pdf'), contenuto('%PDF scrittura privata '))
const d1 = docfile.collega(p1.id, scr, { categoria: 'Atti' })
assert.equal(d1.percorso, scr); assert.equal(d1.nome, 'ScritturaPrivata.pdf'); assert.equal(d1.file, ''); assert.match(d1.impronta, /^3000-sha256-[0-9a-f]{64}$/); assert.equal(d1.dimensione, 3000)
assert.deepEqual(interni(), []); assert.equal(docfile.collega(p1.id, scr).id, d1.id); assert.equal(db.list('documenti').length, 1)
assert.throws(() => docfile.collega(p1.id, path.join(utente, 'Scritture')), /Non è un file/); assert.throws(() => docfile.collega(999, scr), /Pratica non trovata/)
ok('collegare un file: nessuna copia nella cartella dell\'app, percorso e impronta memorizzati, nessun doppione, cartelle rifiutate')

// ---------- 2. stato ----------
db.save('documenti', { pratica_id: p1.id, nome: 'vecchio.txt', file: `${p1.id}/vecchio.txt`, dimensione: 5 })
const st = docfile.stato(); assert.deepEqual(Object.values(st).sort(), ['copia', 'ok'])
fs.renameSync(scr, scr + '.spostato'); assert.equal(docfile.stato(p1.id)[d1.id], 'mancante'); fs.renameSync(scr + '.spostato', scr)
assert.equal(docfile.esiste(d1), true); assert.equal(docfile.risolvi(d1), scr)
ok('stato dei documenti: ok, mancante (spostato o rinominato) e copia interna delle versioni precedenti')

// ---------- 3. file spostato in un'altra cartella ----------
const orig = sha(scr); fs.mkdirSync(path.join(utente, 'Scritture', 'Archivio 2026'), { recursive: true })
const nuovo = path.join(utente, 'Scritture', 'Archivio 2026', 'ScritturaPrivata.pdf'); fs.renameSync(scr, nuovo)
let r = docfile.sincronizza(); assert.equal(r.ritrovati.length, 1); assert.equal(r.ritrovati[0].a, nuovo); assert.equal(r.mancanti.length, 0); assert.equal(db.get('documenti', d1.id).percorso, nuovo); assert.equal(sha(nuovo), orig)
ok('file spostato in un\'altra cartella: ritrovato cercando vicino alla posizione precedente, percorso aggiornato, file intatto')

// ---------- 4. intera cartella della pratica spostata ----------
const p2 = pr('2026/002', 'Verdi c. Neri'); const base = path.join(utente, 'Cause', 'Verdi')
const files = ['Atto.pdf', 'Memoria.docx', path.join('Prove', 'Foto1.jpg'), path.join('Prove', 'Foto2.jpg'), path.join('Prove', 'Contratto.pdf')].map((f, i) => scrivi(path.join(base, f), contenuto(`file${i} `, 2000 + i * 100)))
const dp2 = files.map((f) => docfile.collega(p2.id, f))
const nuovaBase = path.join(utente, 'Studio', 'Archivio', 'Verdi (chiusa)'); fs.mkdirSync(path.dirname(nuovaBase), { recursive: true }); fs.renameSync(base, nuovaBase)
assert.deepEqual(Object.values(docfile.stato(p2.id)), Array(5).fill('mancante'))
r = docfile.sincronizza({ praticaId: p2.id, radici: [path.join(utente, 'Studio')] })
assert.equal(r.ritrovati.length, 5); assert.equal(r.mancanti.length, 0)
for (const d of dp2) { const a = db.get('documenti', d.id).percorso; assert.ok(a.startsWith(nuovaBase + path.sep) && fs.existsSync(a)) }
assert.equal(db.get('documenti', dp2[2].id).percorso, path.join(nuovaBase, 'Prove', 'Foto1.jpg'))
ok('cartella intera spostata o rinominata: tutti i file ritrovati in una sola scansione, con la struttura delle sottocartelle')

// ---------- 5. file rinominato ----------
const rin = scrivi(path.join(utente, 'Scambi', 'Lettera del 3 marzo.pdf'), contenuto('lettera marzo ', 4096)); const dr = docfile.collega(p2.id, rin)
fs.renameSync(rin, path.join(utente, 'Scambi', 'Lettera diffida.pdf'))
r = docfile.sincronizza({ praticaId: p2.id }); assert.equal(r.ritrovati.length, 1); assert.equal(r.ritrovati[0].come, 'file rinominato'); assert.equal(path.basename(db.get('documenti', dr.id).percorso), 'Lettera diffida.pdf')
ok('file rinominato: riconosciuto dal contenuto (dimensione e impronta)')

// ---------- 6. stesso nome, contenuto diverso ----------
const a = scrivi(path.join(utente, 'X', 'Contratto.pdf'), contenuto('contratto A ', 5000)), b = scrivi(path.join(utente, 'Y', 'Contratto.pdf'), contenuto('contratto B ', 5000))
const dA = docfile.collega(p1.id, a); const dB = docfile.collega(p1.id, b)
const arch = path.join(utente, 'Archivio'); fs.mkdirSync(arch, { recursive: true }); fs.renameSync(path.join(utente, 'X'), path.join(arch, 'X2')); fs.renameSync(path.join(utente, 'Y'), path.join(arch, 'Y2'))
r = docfile.sincronizza({ radici: [arch] })
assert.ok(db.get('documenti', dA.id).percorso.includes('X2') && db.get('documenti', dB.id).percorso.includes('Y2')); ok('due file con lo stesso nome ma contenuto diverso: ognuno ritrovato nel suo posto')

// ---------- 7. copie identiche: scelta all'utente; file non trovato ----------
const c = scrivi(path.join(utente, 'Z', 'Copia.txt'), contenuto('stesso ', 1500)); const dC = docfile.collega(p1.id, c)
fs.unlinkSync(c); scrivi(path.join(arch, 'P', 'Copia.txt'), contenuto('stesso ', 1500)); scrivi(path.join(arch, 'Q', 'Copia.txt'), contenuto('stesso ', 1500))
const persa = scrivi(path.join(utente, 'W', 'Persa.pdf'), contenuto('persa ', 800)); const dL = docfile.collega(p1.id, persa); fs.unlinkSync(persa)
r = docfile.sincronizza({ radici: [arch], praticaId: p1.id })
assert.equal(r.ambigui.length, 1); assert.equal(r.ambigui[0].id, dC.id); assert.equal(r.ambigui[0].candidati.length, 2); assert.deepEqual(r.mancanti.map((x) => x.id), [dL.id]); assert.equal(db.get('documenti', dC.id).percorso, c)
ok('copie identiche in più cartelle: non si sceglie a caso (elencate all\'utente); file davvero scomparso: segnalato come non trovato')

// ---------- 8. ricollegamento manuale ----------
const rimesso = scrivi(path.join(utente, 'Altro', 'Persa nuova.pdf'), contenuto('persa ', 800)); const rc = docfile.ricollega(dL.id, rimesso)
assert.equal(rc.percorso, rimesso); assert.equal(docfile.stato(p1.id)[dL.id], 'ok'); assert.throws(() => docfile.ricollega(dL.id, utente), /Non è un file/); ok('ricollegamento manuale a un altro file')

// ---------- 9. cartella della pratica spostata e riassegnata ----------
const p3 = pr('2026/003', 'Gialli'); const cartella = path.join(utente, 'Gialli'); const q = [path.join(cartella, 'a.pdf'), path.join(cartella, 'sub', 'b.pdf')].map((f, i) => scrivi(f, contenuto('g' + i, 600)))
docfile.impostaCartella(p3.id, cartella); const dq = q.map((f) => docfile.collega(p3.id, f)); assert.deepEqual(dq.map((d) => d.rel), ['a.pdf', path.join('sub', 'b.pdf')])
const spostata = path.join(utente, 'Nuovo posto', 'Gialli 2026'); fs.mkdirSync(path.dirname(spostata), { recursive: true }); fs.renameSync(cartella, spostata)
const ris = docfile.impostaCartella(p3.id, spostata); assert.equal(ris.aggiornati, 2); assert.deepEqual(Object.values(docfile.stato(p3.id)), ['ok', 'ok']); assert.equal(db.get('pratiche', p3.id).cartella, spostata)
assert.throws(() => docfile.impostaCartella(p3.id, path.join(utente, 'non-esiste')), /non esiste/); ok('«cartella della pratica» spostata: indicando la nuova posizione tutti i percorsi si ricalcolano')

// ---------- 10. documenti creati dall'app ----------
const p4 = pr('2026/004', 'Atto: "prova"?'); const g = docfile.salvaGenerato(p4.id, 'Citazione.docx', Buffer.from('docx'), { categoria: 'Atti' })
assert.ok(g.percorso.startsWith(path.join(dati, 'documenti-utente') + path.sep) || g.percorso.includes('TIO')); assert.ok(fs.existsSync(g.percorso)); assert.equal(db.get('pratiche', p4.id).cartella, path.dirname(g.percorso)); assert.equal(g.categoria, 'Atti')
const g2 = docfile.salvaGenerato(p4.id, 'Citazione.docx', Buffer.from('docx2')); assert.equal(path.basename(g2.percorso), 'Citazione (2).docx'); assert.equal(path.dirname(g2.percorso), path.dirname(g.percorso))
const g3 = docfile.salvaGenerato(p4.id, 'PF 1.pdf', Buffer.from('pdf'), { sotto: 'Parcelle' }); assert.equal(path.basename(path.dirname(g3.percorso)), 'Parcelle'); assert.equal(g3.rel, path.join('Parcelle', 'PF 1.pdf')); assert.ok(!/[:"?]/.test(path.basename(path.dirname(path.dirname(g3.percorso)))))
ok('documenti creati dall\'app: salvati in una cartella dell\'utente (<Documenti>/TIO/<pratica>), collegati, nomi sicuri e senza sovrascritture')

// ---------- 11. collegare un'intera cartella ----------
const p5 = pr('2026/005', 'Bianchi'); const cb = path.join(utente, 'Bianchi'); for (const f of ['uno.pdf', 'sotto/due.pdf', 'sotto/tre/tre.docx', '.nascosto', '~$temp.docx', 'x.tmp']) scrivi(path.join(cb, f), contenuto(f, 700))
let cc = docfile.collegaCartella(p5.id, cb); assert.equal(cc.collegati, 3); assert.equal(db.get('pratiche', p5.id).cartella, cb); assert.deepEqual(db.list('documenti', { pratica_id: p5.id }).map((d) => d.categoria).sort(), [null, 'sotto', path.join('sotto', 'tre')].sort())
cc = docfile.collegaCartella(p5.id, cb); assert.equal(cc.collegati, 0); assert.equal(cc.gia, 3); ok('collegare una cartella intera: sottocartelle comprese, file nascosti e temporanei ignorati, nessun doppione')

// ---------- 12. sicurezza della ricerca ----------
const loop = path.join(utente, 'Loop'); fs.mkdirSync(path.join(loop, 'a'), { recursive: true }); fs.symlinkSync(loop, path.join(loop, 'a', 'torna'))
fs.mkdirSync(path.join(utente, '.nascosta')); scrivi(path.join(utente, '.nascosta', 'segreto.txt'), 'x'); scrivi(path.join(utente, 'node_modules', 'm.js'), 'x')
const { file, incompleto } = docfile.percorri([utente]); assert.ok(file.length > 10 && !incompleto); assert.ok(!file.some((f) => /segreto|m\.js/.test(f.nome)))
assert.equal(docfile.percorri([utente], { maxVoci: 5 }).incompleto, true); assert.equal(docfile.percorri([path.join(utente, 'non-esiste')]).file.length, 0)
ok('ricerca: collegamenti simbolici (anche ciclici) non seguiti, cartelle nascoste e node_modules saltate, limiti rispettati')

// ---------- 13. i file dell'utente non vengono mai toccati ----------
const tutti = db.list('documenti').filter((d) => d.percorso && fs.existsSync(d.percorso)); assert.ok(tutti.length >= 10)
db.remove('documenti', d1.id); assert.ok(fs.existsSync(nuovo)); assert.deepEqual(interni(), [])
ok('rimuovere un collegamento non cancella il file; nulla è stato copiato nella cartella dell\'app')

db.close(); fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${n} prove superate`)
