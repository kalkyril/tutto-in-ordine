'use strict'
// Documenti COLLEGATI: il file resta dove l'ha messo l'utente (es. «Utente/Scritture/Pratica 1/ScritturaPrivata.pdf») e l'app ne ricorda il percorso,
// senza farne una copia. Se il file o la cartella vengono spostati, `sincronizza` ritrova i file e aggiorna i percorsi.
// I documenti creati dall'app (atti, PDF) vengono salvati in una cartella dell'utente e collegati allo stesso modo.
// Sola lettura sui file dell'utente: l'app non li sposta, non li rinomina e non li cancella mai.
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const db = require('./db')
const { safeName } = require('./files')
const validation = require('./validation')

let documentiUtente = null // cartella di base passata all'avvio: «Documenti», su Windows la cartella utente (vedi cartelle-utente.js)
const init = ({ documenti } = {}) => { documentiUtente = documenti || null }

const isFile = (p) => { try { return fs.statSync(p).isFile() } catch { return false } }
const isDir = (p) => { try { return fs.statSync(p).isDirectory() } catch { return false } }
const docsInterni = () => path.join(db.getDataDir(), 'documenti')

/** Percorso reale del documento (collegato o copia interna). */
function risolvi(d) {
  if (d.percorso) return d.percorso
  return validation.inside(docsInterni(), d.file || '')
}
const esiste = (d) => { try { return isFile(risolvi(d)) } catch { return false } }

/** SHA-256 dell'intero contenuto: il nome e la dimensione non identificano un file. */
function impronta(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const { size } = fs.fstatSync(fd), h = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024)
    let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) h.update(buffer.subarray(0, n))
    return `${size}-sha256-${h.digest('hex')}`
  } finally { fs.closeSync(fd) }
}
function stessoContenuto(d, file) {
  if (!d.impronta || !/-sha256-[a-f0-9]{64}$/.test(d.impronta)) return false
  try { return impronta(file) === d.impronta } catch { return false }
}

const dentro = (figlio, padre) => { const r = path.relative(padre, figlio); return !!r && !r.startsWith('..') && !path.isAbsolute(r) }
const relativoA = (file, cartella) => (cartella && dentro(file, cartella) ? path.relative(cartella, file) : null)

/** Collega un file esistente alla pratica (senza copiarlo). Se è già collegato restituisce il documento esistente. */
function collega(praticaId, src, { categoria = null, oraId = null } = {}) {
  const pratica = db.get('pratiche', praticaId); if (!pratica) throw new Error('Pratica non trovata')
  const assoluto = path.resolve(src)
  const st = fs.lstatSync(assoluto)
  if (st.isSymbolicLink() ? !isFile(assoluto) : !st.isFile()) throw new Error('Non è un file')
  const gia = db.list('documenti', { pratica_id: praticaId }).find((d) => d.percorso === assoluto && (d.ora_id || null) === (oraId || null))
  if (gia) return gia
  return db.save('documenti', { pratica_id: praticaId, nome: path.basename(assoluto), file: '', percorso: assoluto, impronta: impronta(assoluto), rel: relativoA(assoluto, pratica.cartella), dimensione: fs.statSync(assoluto).size, categoria, ora_id: oraId })
}

/** Collega un documento al file indicato dall'utente (percorso cambiato a mano). */
function ricollega(id, nuovo) {
  const d = db.get('documenti', id); if (!d) throw new Error('Documento non trovato')
  const assoluto = path.resolve(nuovo); if (!isFile(assoluto)) throw new Error('Non è un file')
  const pratica = db.get('pratiche', d.pratica_id)
  return db.save('documenti', { id, percorso: assoluto, impronta: impronta(assoluto), rel: relativoA(assoluto, pratica?.cartella), dimensione: fs.statSync(assoluto).size })
}

/** Stato dei documenti: 'ok', 'mancante' (collegato ma file non trovato) o 'copia' (copia interna delle versioni precedenti). */
function stato(praticaId) {
  const out = {}
  for (const d of db.list('documenti', praticaId ? { pratica_id: praticaId } : {})) out[d.id] = !d.percorso ? 'copia' : esiste(d) ? 'ok' : 'mancante'
  return out
}

// ---------------------------------------------------------------- cartelle dei documenti creati dall'app
function baseGenerati() {
  const imp = db.getSettings().cartella_documenti
  if (imp) return imp
  if (process.env.MNGMNT_DOCS_DIR) return process.env.MNGMNT_DOCS_DIR
  if (process.env.MNGMNT_TEST) return path.join(db.getDataDir(), 'documenti-utente') // le prove non devono scrivere nei documenti veri
  return path.join(documentiUtente || path.join(os.homedir(), 'Documents'), 'TIO')
}
const nomeCartellaPratica = (p) => safeName([p.numero, p.titolo].filter(Boolean).join(' ').slice(0, 90), `Pratica ${p.id}`).replace(/\./g, '_')

/** Cartella in cui salvare i documenti creati per la pratica (quella scelta dall'utente, oppure <Documenti>/TIO/<numero titolo>). La memorizza sulla pratica. */
function cartellaPer(praticaId, sotto = '') {
  const p = db.get('pratiche', praticaId); if (!p) throw new Error('Pratica non trovata')
  let cartella = p.cartella
  if (!cartella || !isDir(cartella)) {
    cartella = path.join(baseGenerati(), nomeCartellaPratica(p)); fs.mkdirSync(cartella, { recursive: true })
    db.save('pratiche', { id: praticaId, cartella })
  }
  const dir = sotto ? path.join(cartella, safeName(sotto)) : cartella
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
const libero = (dir, nome) => { let t = path.join(dir, nome); const ext = path.extname(nome), stem = path.basename(nome, ext); for (let i = 2; fs.existsSync(t); i++) t = path.join(dir, `${stem} (${i})${ext}`); return t }

/** Salva un file creato dall'app nella cartella della pratica e lo collega. */
function salvaGenerato(praticaId, nome, contenuto, { categoria = null, sotto = '' } = {}) {
  const dir = cartellaPer(praticaId, sotto)
  const target = libero(dir, safeName(nome)); fs.writeFileSync(target, contenuto, { flag: 'wx' })
  return collega(praticaId, target, { categoria })
}

// ---------------------------------------------------------------- ricerca dei file spostati
const SALTA = /^(\..*|node_modules|\$RECYCLE\.BIN|System Volume Information|Library|AppData|Applications|Program Files.*|Windows|proc|sys|dev|lost\+found)$/i

/** Percorre le radici (senza seguire i collegamenti simbolici) e restituisce i file con nome e dimensione. */
function percorri(radici, { maxVoci = 250000, maxProf = 10, maxMs = 60000 } = {}) {
  const t0 = Date.now(), file = []; let voci = 0, incompleto = false
  const visti = new Set()
  const vai = (dir, prof) => {
    if (incompleto) return
    let reali; try { reali = fs.realpathSync(dir) } catch { return }
    if (visti.has(reali)) return; visti.add(reali)
    let elenco; try { elenco = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of elenco) {
      if (++voci > maxVoci || Date.now() - t0 > maxMs) { incompleto = true; return }
      const p = path.join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) { if (prof < maxProf && !SALTA.test(e.name)) vai(p, prof + 1) }
      else if (e.isFile() && !/^(\..*|Thumbs\.db|desktop\.ini)$/i.test(e.name)) { try { file.push({ percorso: p, nome: e.name, byte: fs.statSync(p).size }) } catch { /* illeggibile */ } }
    }
  }
  for (const r of radici) if (isDir(r)) vai(r, 0)
  return { file, incompleto, voci }
}

const suffissoComune = (a, b) => { const x = a.split(path.sep).reverse(), y = b.split(path.sep).reverse(); let n = 0; while (n < x.length && n < y.length && x[n].toLowerCase() === y[n].toLowerCase()) n++; return n }
// cartelle ancora esistenti sopra il file (fino a 3 livelli), escluse la radice del disco e la cartella personale: lì si cerca il file spostato
const ancestriEsistenti = (p, livelli = 3) => {
  const casa = path.resolve(os.homedir()), out = []
  let d = path.dirname(p)
  for (let i = 0; i < livelli && d && d !== path.dirname(d); i++, d = path.dirname(d)) if (path.resolve(d) !== casa && isDir(d)) out.push(d)
  return out
}

/**
 * Ritrova i documenti collegati il cui file non c'è più nel percorso memorizzato e ne aggiorna il percorso.
 * 1) cartella della pratica + percorso relativo; 2) stessa cartella spostata come un blocco; 3) ricerca nelle cartelle indicate
 * (impostazioni, cartella della pratica, cartella più vicina ancora esistente) per nome e dimensione, o per impronta se rinominato.
 */
function sincronizza({ praticaId = null, radici = [], maxMs = 60000 } = {}) {
  const docs = db.list('documenti', praticaId ? { pratica_id: praticaId } : {}).filter((d) => d.percorso)
  const rep = { controllati: docs.length, ok: 0, ritrovati: [], mancanti: [], ambigui: [], incompleto: false }
  // Migra le vecchie impronte parziali solo quando l'originale è ancora disponibile.
  for (const d of docs) if (isFile(d.percorso) && !/-sha256-[a-f0-9]{64}$/.test(d.impronta || '')) { try { d.impronta = impronta(d.percorso); db.save('documenti', { id: d.id, impronta: d.impronta }) } catch { /* file illeggibile */ } }
  let mancanti = docs.filter((d) => !isFile(d.percorso)); rep.ok = docs.length - mancanti.length
  if (!mancanti.length) return rep
  const stessoFile = stessoContenuto
  const applica = (d, nuovo, come) => {
    const pratica = db.get('pratiche', d.pratica_id)
    db.save('documenti', { id: d.id, percorso: nuovo, rel: relativoA(nuovo, pratica?.cartella), ...(d.impronta ? {} : { impronta: impronta(nuovo) }) })
    rep.ritrovati.push({ id: d.id, nome: d.nome, da: d.percorso, a: nuovo, come })
    mancanti = mancanti.filter((x) => x.id !== d.id)
    daA.set(path.dirname(d.percorso), path.dirname(nuovo))
  }
  const daA = new Map() // cartella di origine → nuova cartella (spostata come un blocco)
  const passoRapido = () => {
    for (const d of [...mancanti]) {
      const pratica = db.get('pratiche', d.pratica_id)
      if (pratica?.cartella && d.rel) { const c = path.join(pratica.cartella, d.rel); if (isFile(c) && stessoFile(d, c)) { applica(d, c, 'cartella della pratica'); continue } }
      const chiavi = [...daA.keys()].filter((k) => d.percorso === k || d.percorso.startsWith(k + path.sep)).sort((a, b) => b.length - a.length)
      for (const k of chiavi) { const c = path.join(daA.get(k), path.relative(k, d.percorso)); if (isFile(c) && stessoFile(d, c)) { applica(d, c, 'cartella spostata'); break } }
    }
  }
  passoRapido(); passoRapido()
  if (mancanti.length) {
    const rad = new Set(radici.filter(Boolean))
    for (const r of db.getSettings().cartelle_ricerca || []) rad.add(r)
    for (const d of mancanti) { const p = db.get('pratiche', d.pratica_id); if (p?.cartella) rad.add(p.cartella); for (const a of ancestriEsistenti(d.percorso)) rad.add(a) }
    // radici annidate: basta la più esterna
    const lista = [...rad].filter(isDir).map((r) => path.resolve(r)); const esterne = lista.filter((r) => !lista.some((o) => o !== r && dentro(r, o)))
    const { file, incompleto } = percorri(esterne, { maxMs }); rep.incompleto = incompleto
    const perNome = new Map(); for (const f of file) { const k = f.nome.toLowerCase(); (perNome.get(k) || perNome.set(k, []).get(k)).push(f) }
    const perDim = new Map(); for (const f of file) (perDim.get(f.byte) || perDim.set(f.byte, []).get(f.byte)).push(f)
    for (const d of [...mancanti]) {
      let cand = (perNome.get(d.nome.toLowerCase()) || []).filter((f) => d.dimensione == null || f.byte === d.dimensione)
      let come = 'stesso nome e dimensione'
      cand = cand.filter((f) => stessoContenuto(d, f.percorso)); if (cand.length) come = 'stesso contenuto'
      if (!cand.length && d.impronta && d.dimensione != null) { // rinominato: stessa dimensione e stesso contenuto
        const sim = (perDim.get(d.dimensione) || []).filter((f) => { return stessoContenuto(d, f.percorso) })
        if (sim.length) { cand = sim; come = 'file rinominato' }
      }
      if (!cand.length) continue
      if (cand.length > 1) { // più copie: si sceglie quella con il percorso più simile; se pari, la scelta resta all'utente
        const ord = cand.map((f) => ({ f, s: suffissoComune(f.percorso, d.percorso) })).sort((a, b) => b.s - a.s)
        if (ord[0].s === ord[1].s) { rep.ambigui.push({ id: d.id, nome: d.nome, percorso: d.percorso, candidati: cand.slice(0, 5).map((f) => f.percorso) }); mancanti = mancanti.filter((x) => x.id !== d.id); continue }
        cand = [ord[0].f]
      }
      applica(d, cand[0].percorso, come)
    }
    passoRapido()
  }
  rep.mancanti = mancanti.map((d) => ({ id: d.id, nome: d.nome, percorso: d.percorso, pratica_id: d.pratica_id }))
  return rep
}

/** Cambia la cartella della pratica (spostata): ricalcola i percorsi dei documenti dal percorso relativo. */
function impostaCartella(praticaId, nuova) {
  const p = db.get('pratiche', praticaId); if (!p) throw new Error('Pratica non trovata')
  const cartella = nuova ? path.resolve(nuova) : null
  if (cartella && !isDir(cartella)) throw new Error('La cartella non esiste')
  db.save('pratiche', { id: praticaId, cartella })
  let aggiornati = 0
  if (cartella) for (const d of db.list('documenti', { pratica_id: praticaId })) {
    if (!d.percorso || !d.rel) continue
    const c = path.join(cartella, d.rel)
    if (isFile(c) && c !== d.percorso && stessoContenuto(d, c)) { db.save('documenti', { id: d.id, percorso: c }); aggiornati++ }
  }
  return { cartella, aggiornati }
}

/** Collega tutti i file di una cartella (sottocartelle comprese) alla pratica. */
function collegaCartella(praticaId, dir, { maxFile = 5000 } = {}) {
  const p = db.get('pratiche', praticaId); if (!p) throw new Error('Pratica non trovata')
  const radice = path.resolve(dir); if (!isDir(radice)) throw new Error('La cartella non esiste')
  if (!p.cartella) db.save('pratiche', { id: praticaId, cartella: radice })
  const { file, incompleto } = percorri([radice], { maxVoci: maxFile * 4, maxMs: 30000 })
  let collegati = 0, gia = 0; const nuovi = []
  const finale = () => { if (collegati) db.scriviCronologia(praticaId, 'documenti', null, 'creato', collegati === 1 ? `Documento «${nuovi[0].nome}»` : `${collegati} documenti collegati dalla cartella`) }
  const esistenti = new Set(db.list('documenti', { pratica_id: praticaId }).filter((d) => d.percorso && !d.ora_id).map((d) => d.percorso))
  for (const f of file.slice(0, maxFile)) {
    if (/^(~\$.*|.*\.tmp)$/i.test(f.nome)) continue
    const ass = path.resolve(f.percorso)
    if (esistenti.has(ass)) { gia++; continue }
    const sub = path.dirname(path.relative(radice, f.percorso))
    try { nuovi.push(db.senzaCronologia(() => collega(praticaId, ass, { categoria: sub && sub !== '.' ? sub : null }))); esistenti.add(ass); collegati++ } catch { /* file illeggibile: saltato */ }
  }
  finale()
  return { collegati, gia, incompleto: incompleto || file.length > maxFile, documenti: nuovi }
}

module.exports = { init, risolvi, esiste, impronta, collega, ricollega, stato, sincronizza, impostaCartella, collegaCartella, cartellaPer, salvaGenerato, baseGenerati, percorri }
