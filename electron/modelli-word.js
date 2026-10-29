'use strict'
// Modelli Word dell'utente (sezione Documenti): un .docx con la propria carta intestata, in cui i campi sono scritti tra
// doppie graffe ({{destinatario.nome}}, {{oggi}}, {{importo}}…). Il file è conservato intero nell'archivio (tabella
// modelli_word), quindi entra nei backup; il documento creato è una copia del file con i campi compilati, senza toccare
// impaginazione, stili, intestazione, piè di pagina e immagini.
const crypto = require('node:crypto')
const db = require('./db')
const docx = require('./docx')

const MAX = 15 * 1024 * 1024
const RE_CAMPO = /\{\{\s*([\p{L}\p{N}_.\- ]{1,60}?)\s*\}\}/gu

function leggi(buf) {
  if (!Buffer.isBuffer(buf) || buf.length > MAX) throw new Error('Il file Word supera i 15 MB')
  const d = docx.apri(buf)
  const parti = d.nomi.filter((n) => docx.PARTI_TESTO.test(n))
  const testo = parti.map((n) => docx.testoDi(d.testo(n), { conCancellato: false })).join('\n')
  const campi = [...new Set([...testo.matchAll(RE_CAMPO)].map((m) => m[1].trim()))]
  return { d, parti, testo, campi }
}
const info = (id, nome, buf) => { const { testo, campi } = leggi(buf); return { id, nome, campi, anteprima: testo.replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000), dimensione: buf.length } }

function importa(buf, nome) {
  const id = 'word-' + crypto.randomUUID()
  const r = info(id, String(nome || 'Modello Word').replace(/\.docx$/i, '').slice(0, 120), buf)
  db.getDb().prepare('INSERT INTO modelli_word(id, nome, dati) VALUES(?, ?, ?)').run(id, r.nome, buf)
  return r
}
const dati = (id) => { const r = db.getDb().prepare('SELECT nome, dati FROM modelli_word WHERE id=?').get(String(id)); if (!r) throw new Error('Modello Word non trovato: importalo di nuovo'); return { nome: r.nome, buf: Buffer.from(r.dati) } }
function sostituisci(id, buf) { const r = info(String(id), dati(id).nome, buf); db.getDb().prepare('UPDATE modelli_word SET dati=? WHERE id=?').run(buf, String(id)); return r }
function duplica(id, nuovo) { if (!/^word-[\w-]{8,64}$/.test(String(nuovo))) throw new Error('Identificativo non valido'); const { nome, buf } = dati(id); db.getDb().prepare('INSERT INTO modelli_word(id, nome, dati) VALUES(?, ?, ?)').run(nuovo, nome, buf); return info(nuovo, nome, buf) }
const elimina = (id) => { db.getDb().prepare('DELETE FROM modelli_word WHERE id=?').run(String(id)); return true }

/** Copia del modello con i campi compilati; i campi senza valore restano scritti tra graffe, così si ritrovano. */
function compila(id, valori = {}) {
  const { buf } = dati(id)
  const { d, parti, campi } = leggi(buf)
  const v = (k) => { const x = valori[k]; return typeof x === 'string' && x.trim() ? x : null }
  const regole = campi.filter((c) => v(c)).map((c) => ({ id: c, varianti: [{ re: new RegExp(String.raw`\{\{\s*${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*\}\}`, 'gu'), nuovo: () => v(c) }] }))
  const modificate = {}
  let sostituiti = 0
  for (const p of parti) {
    const r = docx.elabora(d.testo(p), regole, { evidenzia: false })
    modificate[p] = r.xml
    for (const n of r.usati.values()) sostituiti += n
  }
  // titolo e oggetto nelle proprietà del file possono contenere campi anche loro
  const core = d.testo('docProps/core.xml')
  if (core) modificate['docProps/core.xml'] = core.replace(/>([^<]+)</g, (m, t) => '>' + docx.esc(docx.sostituisciTesto(docx.unesc(t), regole).testo) + '<')
  return { buf: docx.salva(d, modificate), sostituiti, mancanti: campi.filter((c) => !v(c)) }
}

module.exports = { importa, sostituisci, duplica, elimina, compila, info: (id) => { const { nome, buf } = dati(id); return info(String(id), nome, buf) }, esporta: (id) => dati(id) }
