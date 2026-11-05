'use strict'
// Cartelle di Cliens e cartelle locali della pratica, riunite in un'unica vista dei documenti.
//
// Cliens Cube non offre a programmi esterni un accesso ai fascicoli: i suoi documenti arrivano sul computer
// scaricandoli (o con la sincronizzazione del servizio) in una cartella, una sottocartella per pratica.
// TIO legge quella cartella in SOLA LETTURA, come la cartella locale della pratica, e a ogni sincronizzazione
// manuale tiene un solo documento per ogni file:
//   - «cliens»     il file c'è solo nella cartella di Cliens
//   - «locale»     il file c'è solo nella cartella locale (o è collegato da altrove)
//   - «condivisa»  lo stesso file (stesso contenuto, o stesso nome e dimensione) c'è in entrambe: un documento solo,
//                  che si apre dalla copia locale e ricorda anche quella di Cliens
// Nessun file viene copiato, spostato, rinominato o cancellato.
const fs = require('node:fs')
const path = require('node:path')
const db = require('./db')
const docfile = require('./docfile')

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const isDir = (p) => { try { return !!p && fs.statSync(p).isDirectory() } catch { return false } }
const isFile = (p) => { try { return !!p && fs.statSync(p).isFile() } catch { return false } }
const dentro = (figlio, padre) => { if (!figlio || !padre) return false; const r = path.relative(path.resolve(padre), path.resolve(figlio)); return !!r && !r.startsWith('..') && !path.isAbsolute(r) }
const TEMPORANEI = /^(~\$.*|.*\.tmp|.*\.crdownload|.*\.part)$/i
const MAX_FILE = 5000

/** File di una cartella (sottocartelle comprese), senza seguire i collegamenti simbolici. */
async function fileDi(dir, avanza) {
  if (!isDir(dir)) return { file: [], incompleto: false }
  const r = await docfile.percorriAsync([path.resolve(dir)], { maxVoci: MAX_FILE * 4, maxMs: 30000, avanza })
  return { file: r.file.filter((f) => !TEMPORANEI.test(f.nome)).slice(0, MAX_FILE), incompleto: r.incompleto || r.file.length > MAX_FILE }
}

const chiaveNome = (nome, byte) => `${String(nome).toLowerCase()}|${byte}`

/**
 * Impronta del file, riusata se percorso, dimensione e data di modifica non sono cambiati dall'ultima volta:
 * così una sincronizzazione legge per intero solo i file nuovi o modificati, non tutta la cartella di Cliens.
 */
async function improntaRicordata(f) {
  const d = db.getDb()
  const ass = path.resolve(f.percorso)
  const c = d.prepare('SELECT byte, mtime, impronta FROM impronte WHERE percorso = ?').get(ass)
  if (c && c.byte === f.byte && c.mtime === f.mtime) return c.impronta
  try {
    const imp = await docfile.improntaAsync(ass)
    d.prepare('INSERT INTO impronte(percorso, byte, mtime, impronta) VALUES(?,?,?,?) ON CONFLICT(percorso) DO UPDATE SET byte = excluded.byte, mtime = excluded.mtime, impronta = excluded.impronta').run(ass, f.byte, f.mtime ?? 0, imp)
    return imp
  } catch { return null }
}
/** Toglie dalla memoria delle impronte i file della cartella che non ci sono più. */
function dimenticaMancanti(cartella, presenti) {
  if (!cartella) return
  const d = db.getDb(), radice = path.resolve(cartella) + path.sep
  const del = d.prepare('DELETE FROM impronte WHERE percorso = ?')
  for (const r of d.prepare('SELECT percorso FROM impronte WHERE substr(percorso, 1, ?) = ?').all(radice.length, radice)) if (!presenti.has(r.percorso)) del.run(r.percorso)
}

/**
 * Sincronizzazione manuale di una pratica: collega i file nuovi delle due cartelle, riconosce quelli presenti in
 * entrambe, unisce i doppioni e segnala i file tolti da Cliens. Restituisce il resoconto.
 * Le letture dei file (lente su cartelle grandi o in rete) si fanno prima, senza bloccare la finestra;
 * poi le modifiche all'archivio in un'unica transazione.
 */
async function sincronizzaPratica(praticaId, { avanza: cb = null } = {}) {
  const avanza = docfile.avanzamento(cb)
  const p = db.get('pratiche', praticaId); if (!p) throw new Error('Pratica non trovata')
  const rep = { praticaId: p.id, cliens: 0, locali: 0, condivisi: 0, nuovi: 0, uniti: 0, toltiDaCliens: 0, incompleto: false, cartellaCliens: !!p.cartella_cliens && isDir(p.cartella_cliens), cartellaLocale: !!p.cartella && isDir(p.cartella) }
  if (p.cartella_cliens && !rep.cartellaCliens) throw new Error(`La cartella di Cliens di questa pratica non si trova più («${p.cartella_cliens}»). Scegline un'altra.`)
  const cl = rep.cartellaCliens ? await fileDi(p.cartella_cliens, avanza) : { file: [], incompleto: false }
  // la cartella di Cliens dentro quella locale (o viceversa) non deve far contare due volte gli stessi file
  const loc = rep.cartellaLocale ? await fileDi(p.cartella, avanza) : { file: [], incompleto: false }
  const locali = loc.file.filter((f) => !(rep.cartellaCliens && dentro(f.percorso, p.cartella_cliens)))
  const daCliens = cl.file.filter((f) => !(rep.cartellaLocale && dentro(f.percorso, p.cartella) && !dentro(p.cartella_cliens, p.cartella)))
  rep.incompleto = cl.incompleto || loc.incompleto

  // impronte: dei file di Cliens (riusate se il file non è cambiato) e dei file locali non ancora collegati
  const giaCollegati = new Set(db.list('documenti', { pratica_id: p.id }).filter((d) => d.percorso && !d.ora_id).map((d) => path.resolve(d.percorso)))
  const daLeggere = [...daCliens, ...locali.filter((f) => !giaCollegati.has(path.resolve(f.percorso)))]
  let i = 0
  for (const f of daLeggere) {
    avanza({ fase: 'leggo', fatti: ++i, totale: daLeggere.length })
    f.impronta = await improntaRicordata(f)
  }
  if (rep.cartellaCliens) dimenticaMancanti(p.cartella_cliens, new Set(cl.file.map((f) => path.resolve(f.percorso))))
  avanza({ fase: 'salvo', fatti: daLeggere.length, totale: daLeggere.length }, true)

  db.transaction(() => db.senzaCronologia(() => {
    let docs = db.list('documenti', { pratica_id: p.id }).filter((d) => d.percorso && !d.ora_id)
    const perPercorso = new Map(docs.map((d) => [path.resolve(d.percorso), d]))
    // 1) file locali nuovi
    for (const f of locali) {
      if (perPercorso.has(path.resolve(f.percorso)) || !f.impronta) continue
      try { const d = docfile.collega(p.id, f.percorso, { categoria: categoria(f.percorso, p.cartella), impronta: f.impronta }); perPercorso.set(path.resolve(f.percorso), d); docs.push(d); rep.nuovi++ } catch { /* illeggibile */ }
    }
    // indice dei documenti non di Cliens: per contenuto e per nome + dimensione
    const nonCliens = () => docs.filter((d) => !dentro(d.percorso, p.cartella_cliens))
    const perImpronta = new Map(), perNome = new Map()
    for (const d of nonCliens()) { if (d.impronta) perImpronta.set(d.impronta, d); perNome.set(chiaveNome(path.basename(d.percorso), d.dimensione), d) }
    // 2) file di Cliens: stesso file di un documento locale → condiviso; altrimenti documento «cliens»
    const visti = new Set()
    for (const f of daCliens) {
      const ass = path.resolve(f.percorso); visti.add(ass)
      const imp = f.impronta
      // stesso contenuto; in mancanza dell'impronta, stesso nome e dimensione (ma mai due file dal contenuto diverso)
      const perN = perNome.get(chiaveNome(f.nome, f.byte))
      const gemello = (imp && perImpronta.get(imp)) || (perN && (!imp || !perN.impronta || perN.impronta === imp) ? perN : null)
      const giaCliens = perPercorso.get(ass)
      if (gemello) {
        if (gemello.percorso_cliens !== ass || gemello.origine !== 'condivisa') db.save('documenti', { id: gemello.id, percorso_cliens: ass, origine: 'condivisa' })
        gemello.percorso_cliens = ass; gemello.origine = 'condivisa'
        // un documento collegato prima direttamente al file di Cliens è ora un doppione: si unisce al gemello
        if (giaCliens && giaCliens.id !== gemello.id) { unisci(giaCliens, gemello); docs = docs.filter((d) => d.id !== giaCliens.id); perPercorso.set(ass, gemello); rep.uniti++ }
        continue
      }
      if (giaCliens) { if (giaCliens.origine !== 'cliens') db.save('documenti', { id: giaCliens.id, origine: 'cliens' }); continue }
      if (!imp) continue // illeggibile
      try { const d = docfile.collega(p.id, ass, { categoria: categoria(ass, p.cartella_cliens), impronta: imp }); db.save('documenti', { id: d.id, origine: 'cliens' }); d.origine = 'cliens'; perPercorso.set(ass, d); docs.push(d); rep.nuovi++ } catch { /* illeggibile */ }
    }
    // 3) doppioni fra documenti già collegati (stesso contenuto, uno in Cliens e uno in locale)
    const perContenuto = new Map()
    for (const d of docs) {
      if (!d.impronta || !isFile(d.percorso)) continue
      const altro = perContenuto.get(d.impronta)
      if (!altro) { perContenuto.set(d.impronta, d); continue }
      const [diCliens, locale] = dentro(d.percorso, p.cartella_cliens) ? [d, altro] : dentro(altro.percorso, p.cartella_cliens) ? [altro, d] : [null, null]
      if (!diCliens) continue // due copie locali: restano entrambe, sono file diversi per l'utente
      db.save('documenti', { id: locale.id, percorso_cliens: path.resolve(diCliens.percorso), origine: 'condivisa' })
      unisci(diCliens, locale); docs = docs.filter((x) => x.id !== diCliens.id); perContenuto.set(d.impronta, locale); rep.uniti++
    }
    // 4) file tolti da Cliens: il documento condiviso torna locale
    for (const d of db.list('documenti', { pratica_id: p.id })) {
      if (d.origine === 'condivisa' && d.percorso_cliens && (!rep.cartellaCliens || !visti.has(path.resolve(d.percorso_cliens)))) {
        db.save('documenti', { id: d.id, percorso_cliens: null, origine: 'locale' }); rep.toltiDaCliens++
      }
    }
    for (const d of db.list('documenti', { pratica_id: p.id })) {
      const o = sezione(d, p)
      if (o === 'cliens') rep.cliens++; else if (o === 'condivisa') rep.condivisi++; else rep.locali++
    }
  }))
  if (rep.nuovi || rep.uniti) db.scriviCronologia(p.id, 'documenti', null, 'modificato', `Sincronizzazione con Cliens: ${rep.nuovi} nuovi, ${rep.uniti} doppioni uniti`)
  return rep
}

const categoria = (file, radice) => { if (!radice) return null; const sub = path.dirname(path.relative(path.resolve(radice), file)); return sub && sub !== '.' && !sub.startsWith('..') ? sub : null }

/** Il doppione `via` lascia il posto a `resta`: testo indicizzato e categoria passano al documento che resta. */
function unisci(via, resta) {
  if (!resta.categoria && via.categoria) db.save('documenti', { id: resta.id, categoria: via.categoria })
  db.remove('documenti', via.id)
}

/** Sezione del documento nella vista unica. */
function sezione(d, p) {
  if (d.origine === 'condivisa' && d.percorso_cliens) return 'condivisa'
  if (d.origine === 'cliens' || (p?.cartella_cliens && dentro(d.percorso, p.cartella_cliens))) return 'cliens'
  return 'locale'
}

/** Abbina le sottocartelle della cartella principale di Cliens alle pratiche (per numero, codice o titolo). */
function abbinaCartelle(radice) {
  if (!isDir(radice)) throw new Error('La cartella di Cliens non esiste')
  const pratiche = db.list('pratiche')
  const sotto = fs.readdirSync(radice, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
  return sotto.map((nome) => {
    const n = norm(nome)
    const pr = pratiche.find((p) => p.numero && (n === norm(p.numero) || n.startsWith(norm(p.numero) + ' ') || n.endsWith(' ' + norm(p.numero))))
      || pratiche.find((p) => norm(p.titolo) === n)
      || pratiche.find((p) => norm(p.titolo).length >= 6 && (n.includes(norm(p.titolo)) || norm(p.titolo).includes(n)))
      || pratiche.find((p) => p.numero && norm(p.numero).length >= 3 && n.includes(norm(p.numero)))
      || null
    return { nome, percorso: path.join(radice, nome), pratica: pr ? { id: pr.id, numero: pr.numero, titolo: pr.titolo, giaCollegata: !!pr.cartella_cliens && path.resolve(pr.cartella_cliens) === path.resolve(path.join(radice, nome)) } : null }
  })
}

/** Imposta la cartella di Cliens della pratica (o la toglie con null) e sincronizza. */
async function impostaCartella(praticaId, dir, opzioni = {}) {
  const p = db.get('pratiche', praticaId); if (!p) throw new Error('Pratica non trovata')
  if (dir && !isDir(dir)) throw new Error('La cartella non esiste')
  db.save('pratiche', { id: p.id, cartella_cliens: dir ? path.resolve(dir) : null })
  if (!dir) { // senza cartella di Cliens i documenti condivisi tornano locali; quelli solo di Cliens restano collegati al loro file
    for (const d of db.list('documenti', { pratica_id: p.id })) if (d.origine === 'condivisa') db.save('documenti', { id: d.id, percorso_cliens: null, origine: 'locale' })
    return { praticaId: p.id, rimossa: true }
  }
  return sincronizzaPratica(p.id, opzioni)
}

/** Sincronizza tutte le pratiche: con `radice` collega prima le sottocartelle riconosciute alle pratiche che non ne hanno una. */
async function sincronizzaTutte(radice, { avanza = null } = {}) {
  const esito = { pratiche: 0, collegate: 0, nuovi: 0, uniti: 0, condivisi: 0, errori: [] }
  if (radice) for (const c of abbinaCartelle(radice)) {
    if (!c.pratica) continue
    const p = db.get('pratiche', c.pratica.id)
    if (!p.cartella_cliens || !isDir(p.cartella_cliens)) { db.save('pratiche', { id: p.id, cartella_cliens: path.resolve(c.percorso) }); esito.collegate++ }
  }
  const daFare = db.list('pratiche').filter((x) => x.cartella_cliens || x.cartella)
  for (const [i, p] of daFare.entries()) {
    try { const r = await sincronizzaPratica(p.id, { avanza: avanza && ((x) => avanza({ ...x, pratica: p.numero || p.titolo, pratiche: i + 1, totalePratiche: daFare.length })) }); esito.pratiche++; esito.nuovi += r.nuovi; esito.uniti += r.uniti; esito.condivisi += r.condivisi } catch (e) { esito.errori.push({ pratica: p.numero || p.titolo, motivo: e.message }) }
  }
  return esito
}

module.exports = { sincronizzaPratica, sincronizzaTutte, abbinaCartelle, impostaCartella, sezione }
