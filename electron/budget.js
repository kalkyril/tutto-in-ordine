'use strict'
// Sezione Budget (1.0.4): conti con il saldo reale, movimenti scritti a mano (prelievi, spese bancarie, giroconti) e
// fatture lette dai file del servizio di fatturazione dell'utente. Il servizio non viene mai toccato: TIO legge i file
// esportati e ricorda soltanto ciò che decide l'utente (incassata o pagata, su quale conto, categoria, nascosta).
const fs = require('node:fs')
const path = require('node:path')
const db = require('./db'), v = require('./validation')
const lettura = require('./fatture-lettura')

const TIPI_CONTO = ['banca', 'carta', 'contanti', 'altro']
const cent = (n) => Math.round(Number(n) * 100)
const euro = (n, zero = true) => { const x = Number(n); if (!Number.isFinite(x) || Math.abs(cent(x)) > 1e12 || (!zero && cent(x) === 0)) throw new Error('Importo non valido'); return cent(x) / 100 }
const testo = (s, obbligatorio = false, max = 300) => { const t = String(s ?? '').trim().slice(0, max); if (obbligatorio && !t) throw new Error('Compila i campi obbligatori'); return t }
const giorno = (s, obbligatorio = true) => { if (!s && !obbligatorio) return null; v.date(s, 'data'); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Usa una data senza ora'); return s }
const conto = (id, obbligatorio = false) => { if (!id) { if (obbligatorio) throw new Error('Scegli il conto'); return null } const r = db.getDb().prepare('SELECT id FROM conti WHERE id=?').get(v.id(id)); if (!r) throw new Error('Conto non trovato'); return r.id }
const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** Il conto predefinito (il primo, se nessuno lo è): ci finiscono incassi e pagamenti senza un conto indicato. */
const predefinito = () => db.getDb().prepare('SELECT id FROM conti WHERE archiviato=0 ORDER BY predefinito DESC, id LIMIT 1').get()?.id ?? null

function leggi() {
  const sql = db.getDb()
  return {
    conti: sql.prepare('SELECT * FROM conti ORDER BY archiviato, predefinito DESC, nome').all(),
    movimenti: sql.prepare('SELECT * FROM movimenti_conto ORDER BY data DESC, id DESC').all(),
    fatture: sql.prepare('SELECT * FROM fatture_servizio ORDER BY data DESC, id DESC').all(),
  }
}

function esegui(azione, a = {}) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Dati non validi')
  if (azione === 'leggi') return leggi()
  const sql = db.getDb()
  return db.transaction(() => {
    if (azione === 'conto') {
      const tipo = TIPI_CONTO.includes(a.tipo) ? a.tipo : 'banca'
      const valori = [testo(a.nome, true, 80), tipo, testo(a.iban, false, 40) || null, euro(a.saldo_iniziale || 0), giorno(a.data_saldo), a.archiviato ? 1 : 0, testo(a.note, false, 500) || null]
      let id
      if (a.id) { id = conto(a.id, true); sql.prepare('UPDATE conti SET nome=?,tipo=?,iban=?,saldo_iniziale=?,data_saldo=?,archiviato=?,note=? WHERE id=?').run(...valori, id) }
      else id = Number(sql.prepare('INSERT INTO conti(nome,tipo,iban,saldo_iniziale,data_saldo,archiviato,note) VALUES(?,?,?,?,?,?,?)').run(...valori).lastInsertRowid)
      // un solo conto predefinito; il primo conto lo è da sé
      if (a.predefinito || !sql.prepare('SELECT 1 FROM conti WHERE predefinito=1 AND archiviato=0').get()) { sql.prepare('UPDATE conti SET predefinito=0').run(); sql.prepare('UPDATE conti SET predefinito=1 WHERE id=?').run(id) }
      return id
    }
    if (azione === 'eliminaConto') {
      const id = conto(a.id, true)
      sql.prepare('DELETE FROM conti WHERE id=?').run(id) // i movimenti scritti a mano del conto se ne vanno con lui; incassi e pagamenti restano, senza conto
      if (!sql.prepare('SELECT 1 FROM conti WHERE predefinito=1').get()) { const p = predefinito(); if (p) sql.prepare('UPDATE conti SET predefinito=1 WHERE id=?').run(p) }
      return true
    }
    if (azione === 'movimento') {
      const da = conto(a.conto_id, true), verso = a.verso_conto_id ? conto(a.verso_conto_id) : null
      if (verso && verso === da) throw new Error('Scegli due conti diversi')
      // giroconto: l'importo esce da un conto ed entra nell'altro, quindi è sempre positivo
      const importo = verso ? Math.abs(euro(a.importo, false)) : euro(a.importo, false)
      const valori = [da, giorno(a.data), importo, testo(a.descrizione, true), testo(a.categoria, false, 80) || null, verso]
      if (a.id) { const id = v.id(a.id); if (!sql.prepare('SELECT 1 FROM movimenti_conto WHERE id=?').get(id)) throw new Error('Movimento non trovato'); sql.prepare('UPDATE movimenti_conto SET conto_id=?,data=?,importo=?,descrizione=?,categoria=?,verso_conto_id=? WHERE id=?').run(...valori, id); return id }
      return Number(sql.prepare('INSERT INTO movimenti_conto(conto_id,data,importo,descrizione,categoria,verso_conto_id) VALUES(?,?,?,?,?,?)').run(...valori).lastInsertRowid)
    }
    if (azione === 'eliminaMovimento') { sql.prepare('DELETE FROM movimenti_conto WHERE id=?').run(v.id(a.id)); return true }
    if (azione === 'fattura') {
      // solo ciò che decide l'utente in TIO: i dati letti dal file non si modificano
      const id = v.id(a.id), f = sql.prepare('SELECT * FROM fatture_servizio WHERE id=?').get(id); if (!f) throw new Error('Fattura non trovata')
      const regolata = a.regolata_il === undefined ? f.regolata_il : giorno(a.regolata_il, false)
      const c = a.conto_id === undefined ? f.conto_id : regolata ? conto(a.conto_id) ?? predefinito() : null
      sql.prepare('UPDATE fatture_servizio SET regolata_il=?, conto_id=?, categoria=?, nascosta=? WHERE id=?')
        .run(regolata, regolata ? c ?? predefinito() : null, a.categoria === undefined ? f.categoria : testo(a.categoria, false, 80) || null, a.nascosta === undefined ? f.nascosta : a.nascosta ? 1 : 0, id)
      return id
    }
    if (azione === 'eliminaFattura') { sql.prepare('DELETE FROM fatture_servizio WHERE id=?').run(v.id(a.id)); return true }
    throw new Error('Operazione non riconosciuta')
  })
}

/** I file di fatture di una cartella (sottocartelle comprese, fino a 20.000 file): .xml, .p7m e .zip. */
async function fileFatture(cartella, { max = 20000, maxProf = 6 } = {}) {
  const out = []
  const vai = async (dir, prof) => {
    let elenco; try { elenco = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of elenco) {
      if (out.length >= max) return
      const p = path.join(dir, e.name)
      if (e.isSymbolicLink() || e.name.startsWith('.')) continue
      if (e.isDirectory()) { if (prof < maxProf) await vai(p, prof + 1) }
      else if (e.isFile() && /\.(xml|p7m|zip)$/i.test(e.name) && !/_(MT|NS|RC|SE|DT|EC|AT)_\d+\.xml(\.p7m)?$/i.test(e.name)) out.push(p) // ricevute dello SdI: non sono fatture
    }
  }
  await vai(cartella, 0)
  return out
}

/**
 * Legge le fatture dai file indicati e aggiunge quelle nuove. Una fattura già letta (stesso contenuto, oppure stesso
 * verso, numero, data e controparte) non si ripete. Restituisce quante sono nuove, già presenti e i file non leggibili.
 */
async function leggiFatture(percorsi, mieiCodici, avanza = () => {}) {
  const esito = { nuove: 0, gia: 0, errori: [] }
  const lette = []
  for (const [i, p] of percorsi.entries()) {
    avanza({ fase: 'leggo', fatti: i + 1, totale: percorsi.length })
    try {
      const st = await fs.promises.stat(p); if (st.size > 60 * 1024 * 1024) throw new Error('file troppo grande')
      lette.push(...lettura.leggiFile(p, await fs.promises.readFile(p), mieiCodici))
    } catch (e) { if (esito.errori.length < 50) esito.errori.push({ file: path.basename(p), motivo: e.message }) }
    if (i % 50 === 49) await new Promise((r) => setImmediate(r))
  }
  const sql = db.getDb(), adesso = oggi()
  db.transaction(() => {
    const giaImpronta = sql.prepare('SELECT 1 FROM fatture_servizio WHERE impronta=?')
    const giaChiave = sql.prepare("SELECT 1 FROM fatture_servizio WHERE verso=? AND numero=? AND data=? AND COALESCE(piva,'')||COALESCE(cf,'')=?")
    const metti = sql.prepare('INSERT INTO fatture_servizio(impronta,verso,tipo,numero,data,controparte,piva,cf,descrizione,imponibile,iva,ritenuta,cassa,bollo,totale,netto,scadenza,file,letta_il) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    for (const f of lette) {
      if (giaImpronta.get(f.impronta) || giaChiave.get(f.verso, f.numero, f.data, (f.piva || '') + (f.cf || ''))) { esito.gia++; continue }
      metti.run(f.impronta, f.verso, f.tipo, f.numero.slice(0, 60), f.data, (f.controparte || '').slice(0, 200), f.piva || null, f.cf || null, f.descrizione || null, f.imponibile, f.iva, f.ritenuta, f.cassa, f.bollo, f.totale, f.netto, f.scadenza, f.file, adesso)
      esito.nuove++
    }
  })
  return esito
}

module.exports = { esegui, leggi, leggiFatture, fileFatture, predefinito, TIPI_CONTO }
