'use strict'
// Strumenti: Anonimizza (anonimizzazione dei documenti) e Documenti (modelli con intestazione e piè di pagina).
// Il riconoscimento dei dati personali avviene nell'interfaccia; qui si leggono i file scelti dall'utente e si
// scrivono quelli che chiede di salvare. Niente esce dal computer e i testi analizzati non vengono conservati.
const { dialog, app, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const db = require('../db')
const docx = require('../docx')
const documento = require('../documento')
const docfile = require('../docfile')
const { safeName } = require('../files')

const LEGGIBILI = ['pdf', 'docx', 'odt', 'txt', 'md', 'markdown', 'rtf', 'eml', 'html', 'htm', 'csv', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp']
const MAX_FILE = 60 * 1024 * 1024
const MAX_TESTO = 20 * 1024 * 1024
const NOMI_FORMATO = { docx: 'Word', odt: 'OpenDocument', rtf: 'RTF', html: 'Pagina web', md: 'Markdown', txt: 'Testo', pdf: 'PDF', json: 'Chiave di ripristino' }

/** Testo di un RTF: abbastanza per anonimizzarlo (gruppi di controllo e immagini scartati, \uN e \'hh decodificati). */
function rtfTesto(raw) {
  let s = raw.replace(/\{\\\*[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '').replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}\s*\}/g, '')
  s = s.replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(n < 0 ? 65536 + Number(n) : Number(n)))
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => Buffer.from([parseInt(h, 16)]).toString('latin1'))
    .replace(/\\(?:par|line)\b ?/g, '\n').replace(/\\tab\b ?/g, '\t').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/\\([{}\\])/g, '$1').replace(/[{}]/g, '')
  return s.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Esegue pdf-oscura-worker.js fuori dal processo principale (fuori dall'archivio asar negli installer). */
function lavoroPdf(dati, ms) {
  const { Worker } = require('node:worker_threads')
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, '..', 'pdf-oscura-worker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'), { workerData: dati, resourceLimits: { maxOldGenerationSizeMb: 1024 } })
    const timer = setTimeout(() => { w.terminate(); reject(new Error('Il documento ha superato il tempo massimo di elaborazione')) }, ms)
    w.once('message', (r) => { clearTimeout(timer); w.terminate(); r.error ? reject(new Error(r.error)) : resolve(r) })
    w.once('error', (e) => { clearTimeout(timer); reject(e) })
    w.once('exit', (c) => { clearTimeout(timer); if (c !== 0) reject(new Error('Elaborazione interrotta')) })
  })
}

/** Esegue pdf-comprimi-worker.js fuori dal processo principale; l'avanzamento arriva alla finestra. */
function lavoroComprimi(dati, avanza) {
  const { Worker } = require('node:worker_threads')
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, '..', dati.azione ? 'pdf-strumenti-worker.js' : 'pdf-comprimi-worker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'), { workerData: dati, resourceLimits: { maxOldGenerationSizeMb: 8192 } })
    const timer = setTimeout(() => { w.terminate(); reject(new Error('Il PDF ha superato il tempo massimo di elaborazione (un’ora)')) }, 3600000)
    w.on('message', (r) => { if (r.avanzamento) { avanza(r.avanzamento); return } clearTimeout(timer); w.terminate(); r.error ? reject(new Error(r.error)) : resolve(r.esito) })
    w.once('error', (e) => { clearTimeout(timer); reject(e) })
    w.once('exit', (c) => { clearTimeout(timer); if (c !== 0) reject(new Error('Elaborazione interrotta: il PDF potrebbe essere troppo grande per la memoria disponibile')) })
  })
}
/** «Contratto.pdf» → «Contratto (compresso).pdf», «Contratto (compresso 2).pdf»… senza sovrascrivere nulla. */
function nomeNuovo(file, cartella, suffisso) {
  const base = path.basename(file, path.extname(file))
  for (let i = 1; i < 1000; i++) { const p = path.join(cartella, `${base} (${suffisso}${i > 1 ? ' ' + i : ''}).pdf`); if (!fs.existsSync(p)) return p }
  throw new Error('Troppi file con lo stesso nome nella cartella')
}
const nomeCompresso = (file, cartella) => nomeNuovo(file, cartella, 'compresso')

module.exports = function registra({ handle, changed, getWindow, autorizza }) {
  // ---------- Comprimi PDF: si leggono solo i file scelti dall'utente, si scrive un file nuovo, l'originale resta com'è
  const compressi = new Set(), autorizzati = new Set()
  handle('pdf:scegliDaComprimere', async () => {
    // prove automatiche e immagini del sito: i file arrivano dalla variabile invece che dalla finestra di sistema
    if (process.env.MNGMNT_TEST && process.env.MNGMNT_TEST_PDF_COMPRIMI) return process.env.MNGMNT_TEST_PDF_COMPRIMI.split('|').filter(Boolean).map((p) => { autorizzati.add(p); return { percorso: p, nome: path.basename(p), byte: fs.statSync(p).size } })
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Scegli i PDF da comprimere', properties: ['openFile', 'multiSelections'], filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (r.canceled) return []
    return r.filePaths.map((p) => { autorizzati.add(p); return { percorso: p, nome: path.basename(p), byte: fs.statSync(p).size } })
  })
  handle('pdf:infoFile', (percorso) => { if (!process.env.MNGMNT_TEST) autorizza(percorso); autorizzati.add(percorso); const st = fs.statSync(percorso); if (!st.isFile() || !/\.pdf$/i.test(percorso)) throw new Error('Non è un PDF'); return { percorso, nome: path.basename(percorso), byte: st.size } })
  handle('pdf:comprimi', async (percorso, livello, chiedi, password) => {
    if (typeof percorso !== 'string' || !autorizzati.has(percorso)) throw new Error('Scegli di nuovo il file da comprimere')
    if (!['minima', 'media', 'massima'].includes(livello)) throw new Error('Livello di compressione non valido')
    let uscita = null
    const cartella = path.dirname(percorso)
    let scrivibile = true
    try { fs.accessSync(cartella, fs.constants.W_OK) } catch { scrivibile = false }
    if (chiedi || !scrivibile) {
      const r = await dialog.showSaveDialog(getWindow(), { title: 'Salva il PDF compresso', defaultPath: nomeCompresso(percorso, scrivibile ? cartella : app.getPath('documents')), filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (r.canceled || !r.filePath) return null
      uscita = r.filePath
    } else uscita = nomeCompresso(percorso, cartella)
    if (path.resolve(uscita) === path.resolve(percorso)) throw new Error('Scegli un nome diverso dall’originale')
    const avanza = (info) => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send('avanzamento', { operazione: 'comprimi', fase: info.fase, fatti: info.fatto, totale: info.totale }) }
    try {
      const esito = await lavoroComprimi({ file: percorso, uscita, livello, password: typeof password === 'string' ? password : '' }, avanza)
      compressi.add(uscita); autorizzati.add(uscita)
      return { ...esito, uscita, nome: path.basename(uscita) }
    } finally { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send('avanzamento', { operazione: 'comprimi', fine: true }) }
  })
  // ---------- Editor PDF: unisci, dividi, modifica. Stesse regole: solo file scelti dall'utente, solo file nuovi in uscita
  const scrivibile = (cartella) => { try { fs.accessSync(cartella, fs.constants.W_OK); return true } catch { return false } }
  const diProva = () => (process.env.MNGMNT_TEST && process.env.MNGMNT_TEST_PDF_DIR) || null
  const controlla = (percorso) => { if (typeof percorso !== 'string' || !autorizzati.has(percorso)) throw new Error('Scegli di nuovo il file PDF'); return percorso }
  const pwd = (x) => (typeof x === 'string' ? x.slice(0, 256) : '')
  const conAvanzamento = async (operazione, dati) => {
    const avanza = (info) => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send('avanzamento', { operazione, fase: info.fase, fatti: Math.floor(info.fatto), totale: info.totale }) }
    try { return await lavoroComprimi(dati, avanza) } finally { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send('avanzamento', { operazione, fine: true }) }
  }
  const salvaCome = async (titolo, proposto) => {
    if (diProva()) return path.join(diProva(), path.basename(proposto))
    const r = await dialog.showSaveDialog(getWindow(), { title: titolo, defaultPath: proposto, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    return r.canceled || !r.filePath ? null : r.filePath
  }
  handle('pdf:unisci', async (file) => {
    if (!Array.isArray(file) || file.length < 2 || file.length > 2000) throw new Error('Scegli almeno due PDF da unire')
    const lista = file.map((f) => ({ percorso: controlla(f?.percorso), password: pwd(f?.password) }))
    const primo = lista[0].percorso, cartella = scrivibile(path.dirname(primo)) ? path.dirname(primo) : app.getPath('documents')
    const uscita = await salvaCome('Salva il PDF unito', nomeNuovo(primo, cartella, 'unito')); if (!uscita) return null
    if (lista.some((f) => path.resolve(f.percorso) === path.resolve(uscita))) throw new Error('Scegli un nome diverso da quello dei file da unire')
    const esito = await conAvanzamento('unisci', { azione: 'unisci', dati: { file: lista, uscita } })
    compressi.add(uscita); autorizzati.add(uscita)
    return { ...esito, uscita, nome: path.basename(uscita) }
  })
  handle('pdf:dividi', async (percorso, opzioni) => {
    controlla(percorso)
    const o = opzioni && typeof opzioni === 'object' ? opzioni : {}
    if (!['pagine', 'ogni', 'intervalli'].includes(o.modo)) throw new Error('Modo di divisione non valido')
    let cartella = diProva()
    if (!cartella) {
      const r = await dialog.showOpenDialog(getWindow(), { title: 'Cartella in cui salvare le parti', defaultPath: path.dirname(percorso), buttonLabel: 'Salva qui', properties: ['openDirectory', 'createDirectory'] })
      if (r.canceled || !r.filePaths[0]) return null
      cartella = r.filePaths[0]
    }
    const esito = await conAvanzamento('dividi', { azione: 'dividi', dati: { percorso, password: pwd(o.password), modo: o.modo, ogni: Number(o.ogni) || 0, intervalli: String(o.intervalli || '').slice(0, 5000), unico: !!o.unico, cartella } })
    for (const c of esito.creati) { compressi.add(c.percorso); autorizzati.add(c.percorso) }
    compressi.add(cartella)
    return esito
  })
  handle('pdf:modifica', async (dati) => {
    const fonti = (Array.isArray(dati?.fonti) ? dati.fonti : []).map((f) => ({ percorso: controlla(f?.percorso), password: pwd(f?.password) }))
    if (!fonti.length && !(dati?.pagine || []).some((p) => p?.bianca)) throw new Error('Apri un PDF da modificare')
    if (!Array.isArray(dati?.pagine) || JSON.stringify(dati.pagine).length > 200 * 1024 * 1024) throw new Error('Modifiche non valide o troppo grandi')
    const primo = fonti[0]?.percorso || path.join(app.getPath('documents'), 'Documento.pdf')
    const cartella = scrivibile(path.dirname(primo)) ? path.dirname(primo) : app.getPath('documents')
    const uscita = await salvaCome('Salva il PDF modificato', nomeNuovo(primo, cartella, 'modificato')); if (!uscita) return null
    if (fonti.some((f) => path.resolve(f.percorso) === path.resolve(uscita))) throw new Error('Scegli un nome diverso dall’originale: il file aperto non viene mai sovrascritto')
    const esito = await conAvanzamento('modifica', { azione: 'modifica', dati: { fonti, pagine: dati.pagine, numeri: dati.numeri && typeof dati.numeri === 'object' ? dati.numeri : null, uscita } })
    compressi.add(uscita); autorizzati.add(uscita)
    return { ...esito, uscita, nome: path.basename(uscita) }
  })
  handle('pdf:scegliImmagine', async () => {
    let file = process.env.MNGMNT_TEST && process.env.MNGMNT_TEST_PDF_IMMAGINE
    if (!file) {
      const r = await dialog.showOpenDialog(getWindow(), { title: 'Immagine da mettere sulla pagina (firma, timbro, logo)', properties: ['openFile'], filters: [{ name: 'Immagini', extensions: ['png', 'jpg', 'jpeg'] }] })
      if (r.canceled || !r.filePaths[0]) return null
      file = r.filePaths[0]
    }
    const dati = fs.readFileSync(file)
    if (dati.length > 12 * 1024 * 1024) throw new Error('L’immagine supera i 12 MB')
    const png = dati.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), jpg = dati[0] === 0xff && dati[1] === 0xd8
    if (!png && !jpg) throw new Error('Usa un’immagine PNG o JPEG')
    return { nome: path.basename(file), dati: `data:image/${png ? 'png' : 'jpeg'};base64,${dati.toString('base64')}` }
  })
  // anteprima delle pagine: un processo per documento aperto nell'editor, chiuso quando l'editor lo lascia
  const { Worker } = require('node:worker_threads')
  const editor = new Map()
  let prossimoEditor = 1
  const chiudiEditor = (id) => { const e = editor.get(id); if (!e) return; editor.delete(id); for (const a of e.attese.values()) a.reject(new Error('Documento chiuso')); e.worker.terminate() }
  handle('pdf:editorApri', (percorso, password) => {
    controlla(percorso)
    while (editor.size >= 24) chiudiEditor(editor.keys().next().value) // documenti rimasti aperti (finestra ricaricata): si chiude il più vecchio
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, '..', 'pdf-pagine-worker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'), { workerData: { percorso, password: pwd(password) }, resourceLimits: { maxOldGenerationSizeMb: 4096 } })
      const id = prossimoEditor++, attese = new Map()
      let pronto = false
      worker.on('message', (m) => {
        if (m.pronto) { pronto = true; editor.set(id, { worker, attese, n: 0, pagine: m.pronto.pagine.length }); resolve({ id, percorso, nome: path.basename(percorso), byte: m.pronto.byte, pagine: m.pronto.pagine }); return }
        if (!pronto) { reject(new Error(m.error || 'PDF non leggibile')); worker.terminate(); return }
        const a = attese.get(m.id); if (!a) return
        attese.delete(m.id); m.error ? a.reject(new Error(m.error)) : a.resolve(m.immagine)
      })
      worker.once('error', (e) => { if (!pronto) reject(e); else chiudiEditor(id) })
      worker.once('exit', () => { if (!pronto) reject(new Error('PDF non leggibile')); else chiudiEditor(id) })
    })
  })
  handle('pdf:editorPagina', (id, numero, larghezza, rotazione) => {
    const e = editor.get(id); if (!e) throw new Error('Documento non più aperto: riaprilo')
    if (!Number.isInteger(numero) || numero < 1 || numero > e.pagine) throw new Error('Pagina non valida')
    const l = Math.min(2400, Math.max(60, Math.round(Number(larghezza) || 200))), r = [0, 90, 180, 270].includes(rotazione) ? rotazione : 0
    return new Promise((resolve, reject) => { const k = ++e.n; e.attese.set(k, { resolve, reject }); e.worker.postMessage({ tipo: 'pagina', id: k, numero, larghezza: l, rotazione: r }) })
  })
  handle('pdf:editorChiudi', (id) => { chiudiEditor(id); return true })

  handle('pdf:mostraCompresso', (uscita, apri) => {
    if (!compressi.has(uscita)) throw new Error('File non trovato')
    if (apri) return shell.openPath(uscita).then((e) => { if (e) throw new Error(e); return true })
    shell.showItemInFolder(uscita); return true
  })

  // file aperti in questa sessione: il .docx originale serve per salvarne la copia anonimizzata con la stessa impaginazione
  const aperti = new Map()
  let prossimo = 1
  const ultimaCartella = () => { const s = db.getSettings(); return s.cartella_pdf && fs.existsSync(s.cartella_pdf) ? s.cartella_pdf : app.getPath('documents') }

  async function leggi(file, ocr) {
    const st = fs.statSync(file)
    if (!st.isFile()) throw new Error('Non è un file')
    if (st.size > MAX_FILE) throw new Error('Il file supera i 60 MB')
    const ext = path.extname(file).slice(1).toLowerCase()
    if (!LEGGIBILI.includes(ext)) throw new Error('Formato non supportato: usa PDF, Word, OpenDocument, RTF, testo, email o immagini')
    let testo = '', stato = 'testo'
    let mappa = null
    if (ext === 'rtf') testo = rtfTesto(fs.readFileSync(file, 'latin1'))
    else if (ext === 'pdf') {
      // testo e posizione di ogni parola: servono per la copia oscurata con l'impaginazione originale
      const r = await lavoroPdf({ azione: 'mappa', file, conOcr: !!ocr }, ocr ? 600000 : 120000)
      testo = r.testo; stato = r.stato; mappa = r
    } else if (['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp'].includes(ext)) {
      const r = await require('../doctext').estraiFileAsync(file, file, ocr || ext !== 'pdf')
      testo = r.text; stato = r.status
    } else testo = require('../doctext').estrai(fs.readFileSync(file), file)
    if (!testo.trim()) return { nome: path.basename(file), testo: '', tipo: ext, stato: ext === 'pdf' ? 'scansione' : 'vuoto' }
    const id = prossimo++
    aperti.set(id, { file, ext, mappa, testo })
    if (aperti.size > 20) aperti.delete(aperti.keys().next().value)
    return { id, nome: path.basename(file), testo: testo.slice(0, MAX_TESTO), tipo: ext, stato }
  }

  handle('anonimizza:apri', async (ocr = false) => {
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Scegli il documento da anonimizzare', properties: ['openFile'], filters: [{ name: 'Documenti', extensions: LEGGIBILI }] })
    if (r.canceled || !r.filePaths[0]) return null
    return leggi(r.filePaths[0], !!ocr)
  })
  // file trascinato nella finestra: il percorso è stato autorizzato dal preload al momento del rilascio
  handle('anonimizza:apriPercorso', (file, ocr = false) => leggi(process.env.MNGMNT_TEST ? String(file) : autorizza(String(file)), !!ocr))
  handle('anonimizza:rileggi', (id, ocr = true) => { const a = aperti.get(Number(id)); if (!a) throw new Error('Apri di nuovo il documento'); return leggi(a.file, !!ocr) })

  async function scegliDestinazione(nome, formato) {
    const base = safeName(String(nome || 'documento')).replace(/\.[a-z0-9]{2,5}$/i, '') + '.' + formato
    if (process.env.MNGMNT_TEST_PDF_DIR) return path.join(process.env.MNGMNT_TEST_PDF_DIR, base)
    const r = await dialog.showSaveDialog(getWindow(), { title: 'Scegli dove salvare', buttonLabel: 'Salva', defaultPath: path.join(ultimaCartella(), base), filters: [{ name: NOMI_FORMATO[formato] || formato.toUpperCase(), extensions: [formato] }], properties: ['createDirectory', 'showOverwriteConfirmation'] })
    if (r.canceled || !r.filePath) return null
    const dest = r.filePath.toLowerCase().endsWith('.' + formato) ? r.filePath : r.filePath + '.' + formato
    db.setSettings({ cartella_pdf: path.dirname(dest) })
    return dest
  }
  const scrivi = (dest, dati) => { fs.writeFileSync(dest, dati, { mode: 0o600 }); if (!process.env.MNGMNT_TEST) shell.showItemInFolder(dest); return dest }

  // documento anonimizzato: nuovo file da testo, oppure copia del .docx originale con le sostituzioni (impaginazione intatta)
  // contenuto della copia anonimizzata: Word e PDF con l'impaginazione originale, gli altri formati dal testo
  async function copiaAnonimizzata({ formato, documento: d, sorgente, sostituzioni }) {
    if (formato === 'docx-originale') {
      const a = aperti.get(Number(sorgente))
      if (!a || a.ext !== 'docx') throw new Error('Il documento Word originale non è più disponibile: aprilo di nuovo')
      if (!Array.isArray(sostituzioni) || sostituzioni.length > 50000) throw new Error('Sostituzioni non valide')
      const regole = sostituzioni.filter((s) => typeof s?.da === 'string' && s.da.trim() && typeof s?.a === 'string')
        .sort((x, y) => y.da.length - x.da.length)
        .map((s, i) => ({ id: String(i), varianti: [{ re: new RegExp(s.da.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gu'), nuovo: () => s.a }] }))
      const w = docx.apri(fs.readFileSync(a.file))
      const modificate = {}
      let totale = 0
      for (const parte of w.nomi.filter((n) => docx.PARTI_TESTO.test(n))) {
        const r = docx.elabora(w.testo(parte), regole, { evidenzia: false })
        modificate[parte] = r.xml; for (const v of r.usati.values()) totale += v
      }
      // anche titolo, autore e oggetto nelle proprietà del file possono contenere dati personali
      for (const parte of ['docProps/core.xml', 'docProps/app.xml', 'docProps/custom.xml']) {
        const x = w.testo(parte); if (!x) continue
        modificate[parte] = x.replace(/>([^<]+)</g, (m, t) => '>' + docx.esc(docx.sostituisciTesto(docx.unesc(t), regole).testo) + '<')
      }
      // commenti, revisioni e testo nascosto restano nel file: si avvisa chi salva
      const residui = w.nomi.some((n) => n.startsWith('word/comments')) || /<w:del\b|<w:vanish\/>/.test(w.testo('word/document.xml') || '')
      return { buf: docx.salva(w, modificate), ext: 'docx', sostituzioni: totale, residui }
    }
    if (formato === 'pdf-originale') {
      const a = aperti.get(Number(sorgente))
      if (!a || a.ext !== 'pdf' || !a.mappa) throw new Error('Il PDF originale non è più disponibile: aprilo di nuovo')
      if (!Array.isArray(sostituzioni) || sostituzioni.length > 100000) throw new Error('Dati da oscurare non validi')
      const spans = sostituzioni.filter((x) => Number.isInteger(x?.start) && Number.isInteger(x?.end) && x.end > x.start && x.end <= a.testo.length && typeof x.a === 'string').map((x) => ({ start: x.start, end: x.end, ph: x.a.slice(0, 40) }))
      const r = await lavoroPdf({ azione: 'oscura', file: a.file, mappa: a.mappa, spans }, 600000)
      return { buf: Buffer.from(r.pdf), ext: 'pdf', sostituzioni: r.riquadri }
    }
    if (!documento.FORMATI.includes(formato)) throw new Error('Formato non supportato')
    return { buf: documento.genera(formato, d), ext: formato }
  }
  handle('anonimizza:salva', async (o = {}) => {
    const originale = o.formato === 'docx-originale' || o.formato === 'pdf-originale'
    const base = originale ? String(o.nome || 'documento').replace(/\.(docx|pdf)$/i, '') + ' anonimizzato' : o.nome
    const dest = await scegliDestinazione(base, o.formato === 'docx-originale' ? 'docx' : o.formato === 'pdf-originale' ? 'pdf' : o.formato)
    if (!dest) return null
    const r = await copiaAnonimizzata(o)
    scrivi(dest, r.buf)
    return { percorso: dest, sostituzioni: r.sostituzioni, residui: r.residui }
  })

  // Anonimizza in blocco: i documenti di una pratica, senza finestre per ogni file; la cartella si sceglie una volta
  const cartelleScelte = new Set()
  handle('anonimizza:scegliCartella', async (praticaId) => {
    let dir
    if (process.env.MNGMNT_TEST && process.env.MNGMNT_TEST_PDF_DIR) dir = path.join(process.env.MNGMNT_TEST_PDF_DIR, 'Anonimizzati')
    else {
      const p = praticaId ? db.get('pratiche', Number(praticaId)) : null
      const r = await dialog.showOpenDialog(getWindow(), { title: 'Scegli la cartella per le copie anonimizzate', buttonLabel: 'Usa questa cartella', defaultPath: p ? docfile.cartellaPer(p.id) : ultimaCartella(), properties: ['openDirectory', 'createDirectory'] })
      if (r.canceled || !r.filePaths[0]) return null
      dir = r.filePaths[0]
    }
    fs.mkdirSync(dir, { recursive: true })
    cartelleScelte.add(dir)
    return dir
  })
  const inCartella = (dir, nome, ext) => {
    if (!cartelleScelte.has(dir)) throw new Error('Scegli di nuovo la cartella di destinazione')
    const base = safeName(String(nome || 'documento')).replace(/\.[a-z0-9]{2,5}$/i, '')
    let dest = path.join(dir, `${base}.${ext}`)
    for (let k = 2; fs.existsSync(dest); k++) dest = path.join(dir, `${base} (${k}).${ext}`)
    return dest
  }
  handle('anonimizza:apriDocumento', (id, ocr = false) => {
    const d = db.get('documenti', Number(id)); if (!d) throw new Error('Documento non trovato')
    return leggi(docfile.risolvi(d), !!ocr)
  })
  handle('anonimizza:salvaIn', async (dir, o = {}) => {
    const r = await copiaAnonimizzata(o)
    const dest = inCartella(dir, `${String(o.nome || 'documento').replace(/\.[a-z0-9]{2,5}$/i, '')} anonimizzato`, r.ext)
    fs.writeFileSync(dest, r.buf, { mode: 0o600 })
    return { percorso: dest, sostituzioni: r.sostituzioni, residui: r.residui }
  })
  handle('anonimizza:salvaChiaveIn', (dir, nome, mappa) => {
    const pulita = Object.fromEntries(Object.entries(mappa || {}).filter(([k, v]) => /^\[[A-Z_]+_\d+\]$/.test(k) && typeof v === 'string'))
    const dest = inCartella(dir, `${nome} - chiave di ripristino`, 'json')
    fs.writeFileSync(dest, JSON.stringify({ formato: 'tio-chiave-anonimizzazione', versione: 1, creata: new Date().toISOString(), avviso: 'Contiene i dati personali originali: conservala come i documenti non anonimizzati.', mappa: pulita }, null, 2), { mode: 0o600 })
    return dest
  })
  handle('anonimizza:mostraCartella', (dir) => { if (!cartelleScelte.has(dir)) throw new Error('Cartella non disponibile'); if (!process.env.MNGMNT_TEST) shell.openPath(dir); return true })

  handle('anonimizza:salvaChiave', async (nome, mappa) => {
    if (!mappa || typeof mappa !== 'object' || Object.keys(mappa).length > 100000) throw new Error('Chiave non valida')
    const pulita = Object.fromEntries(Object.entries(mappa).filter(([k, v]) => /^\[[A-Z_]+_\d+\]$/.test(k) && typeof v === 'string'))
    const dest = await scegliDestinazione(String(nome || 'documento') + ' - chiave di ripristino', 'json')
    if (!dest) return null
    return scrivi(dest, JSON.stringify({ formato: 'tio-chiave-anonimizzazione', versione: 1, creata: new Date().toISOString(), avviso: 'Contiene i dati personali originali: conservala come il documento non anonimizzato.', mappa: pulita }, null, 2))
  })
  handle('anonimizza:apriChiave', async () => {
    let file = process.env.MNGMNT_TEST_CHIAVE
    if (!file || !process.env.MNGMNT_TEST) {
      const r = await dialog.showOpenDialog(getWindow(), { title: 'Apri la chiave di ripristino', properties: ['openFile'], filters: [{ name: 'Chiave di ripristino', extensions: ['json'] }] })
      if (r.canceled || !r.filePaths[0]) return null
      file = r.filePaths[0]
    }
    if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('File troppo grande')
    let dati
    try { dati = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { throw new Error('Il file non è una chiave di ripristino valida') }
    const mappa = dati?.mappa && typeof dati.mappa === 'object' ? dati.mappa : dati
    const pulita = Object.fromEntries(Object.entries(mappa || {}).filter(([k, v]) => /^\[[A-Z_]+_\d+\]$/.test(k) && typeof v === 'string'))
    if (!Object.keys(pulita).length) throw new Error('Il file non contiene segnaposto da ripristinare')
    return { nome: path.basename(file), mappa: pulita }
  })
  handle('anonimizza:salvaTesto', async (nome, formato, contenuto) => {
    if (!['txt', 'md'].includes(formato)) throw new Error('Formato non supportato')
    const testo = String(contenuto ?? ''); if (testo.length > MAX_TESTO) throw new Error('Testo troppo grande')
    const dest = await scegliDestinazione(nome, formato)
    return dest ? scrivi(dest, testo) : null
  })

  // modelli Word dell'utente: il file si sceglie con la finestra di sistema e viene conservato nell'archivio
  const word = () => require('../modelli-word')
  const scegliDocx = async (titolo) => {
    if (process.env.MNGMNT_TEST && process.env.MNGMNT_TEST_WORD) return process.env.MNGMNT_TEST_WORD
    const r = await dialog.showOpenDialog(getWindow(), { title: titolo, properties: ['openFile'], filters: [{ name: 'Documento Word (.docx)', extensions: ['docx'] }] })
    return r.canceled ? null : r.filePaths[0]
  }
  const leggiDocx = (file) => { if (fs.statSync(file).size > 15 * 1024 * 1024) throw new Error('Il file Word supera i 15 MB'); return fs.readFileSync(file) }
  handle('modelli:importaWord', async () => { const file = await scegliDocx('Scegli il documento Word da usare come modello'); return file ? word().importa(leggiDocx(file), path.basename(file)) : null })
  handle('modelli:sostituisciWord', async (id) => { const file = await scegliDocx('Scegli la nuova versione del modello Word'); return file ? word().sostituisci(id, leggiDocx(file)) : null })
  handle('modelli:infoWord', (id) => word().info(id))
  handle('modelli:duplicaWord', (id, nuovo) => word().duplica(id, nuovo))
  handle('modelli:eliminaWord', (id) => word().elimina(id))
  handle('modelli:scaricaWord', async (id) => {
    const { nome, buf } = word().esporta(id)
    const dest = await scegliDestinazione(nome, 'docx')
    return dest ? scrivi(dest, buf) : null
  })
  handle('modelli:creaDaWord', async ({ id, valori, nome, praticaId } = {}) => {
    const r = word().compila(id, valori && typeof valori === 'object' ? valori : {})
    const pratica = praticaId ? db.get('pratiche', Number(praticaId)) : null
    let dest
    if (process.env.MNGMNT_TEST_PDF_DIR) dest = path.join(process.env.MNGMNT_TEST_PDF_DIR, safeName(nome || 'documento') + '.docx')
    else {
      const cartella = pratica ? docfile.cartellaPer(pratica.id) : ultimaCartella()
      const scelta = await dialog.showSaveDialog(getWindow(), { title: 'Scegli dove salvare il documento', buttonLabel: 'Salva', defaultPath: path.join(cartella, safeName(nome || 'documento') + '.docx'), filters: [{ name: 'Word', extensions: ['docx'] }], properties: ['createDirectory', 'showOverwriteConfirmation'] })
      if (scelta.canceled || !scelta.filePath) return null
      dest = scelta.filePath.toLowerCase().endsWith('.docx') ? scelta.filePath : scelta.filePath + '.docx'
      if (!pratica) db.setSettings({ cartella_pdf: path.dirname(dest) })
    }
    fs.writeFileSync(dest, r.buf)
    if (pratica) { docfile.collega(pratica.id, dest, { categoria: 'Documenti' }); changed('documenti') }
    if (!process.env.MNGMNT_TEST) shell.showItemInFolder(dest)
    return { percorso: dest, mancanti: r.mancanti }
  })

  // documento da un modello: tutti i formati tranne il PDF, che passa dalla stampa isolata (pdf:print)
  handle('modelli:esporta', async ({ nome, formato, documento: d, praticaId } = {}) => {
    if (!documento.FORMATI.includes(formato)) throw new Error('Formato non supportato')
    const dati = documento.genera(formato, d)
    const pratica = praticaId ? db.get('pratiche', Number(praticaId)) : null
    let dest
    if (process.env.MNGMNT_TEST_PDF_DIR) dest = path.join(process.env.MNGMNT_TEST_PDF_DIR, safeName(nome || 'documento') + '.' + formato)
    else {
      const cartella = pratica ? docfile.cartellaPer(pratica.id) : ultimaCartella()
      const r = await dialog.showSaveDialog(getWindow(), { title: 'Scegli dove salvare il documento', buttonLabel: 'Salva', defaultPath: path.join(cartella, safeName(nome || 'documento') + '.' + formato), filters: [{ name: NOMI_FORMATO[formato], extensions: [formato] }], properties: ['createDirectory', 'showOverwriteConfirmation'] })
      if (r.canceled || !r.filePath) return null
      dest = r.filePath.toLowerCase().endsWith('.' + formato) ? r.filePath : r.filePath + '.' + formato
      if (!pratica) db.setSettings({ cartella_pdf: path.dirname(dest) })
    }
    fs.writeFileSync(dest, dati)
    if (pratica) { docfile.collega(pratica.id, dest, { categoria: 'Documenti' }); changed('documenti') }
    if (!process.env.MNGMNT_TEST) shell.showItemInFolder(dest)
    return dest
  })
}
module.exports.rtfTesto = rtfTesto
