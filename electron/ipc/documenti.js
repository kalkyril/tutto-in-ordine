'use strict'
// Documenti allegati alle pratiche: aggiunta, apertura, rinomina, copie e salvataggio di file di testo.
const { dialog, shell, app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const db = require('../db')
const { safeName, eseguibile } = require('../files')
const docfile = require('../docfile')
const doctext = require('../doctext')
const { docsDir, docPath, uniqueFile } = require('./percorsi')

module.exports = function registra({ handle, changed, getWindow, scelti, autorizza }) {
  const daTest = (nome) => (process.env.MNGMNT_TEST && process.env[nome] !== undefined ? process.env[nome].split('|').filter(Boolean) : null) // solo per le prove automatiche
  const verificaAttivita = (praticaId, oraId) => { if (oraId) { const o = db.get('ore', oraId); if (!o || o.pratica_id !== Number(praticaId)) throw new Error('Attività non trovata in questa pratica') } }
  /** Collega i file alla pratica: restano dove sono, l'app ne ricorda il percorso (nessuna copia). */
  function collegaFile(praticaId, paths, categoria, oraId) {
    verificaAttivita(praticaId, oraId)
    const aggiunti = []
    for (const src of paths) {
      try {
        if (fs.statSync(src).isDirectory() && !oraId) aggiunti.push(...docfile.collegaCartella(praticaId, src).documenti) // cartella trascinata: si collegano tutti i suoi file
        else aggiunti.push(docfile.collega(praticaId, src, { categoria: categoria || null, oraId: oraId || null }))
      } catch { /* non è un file o non è leggibile: saltato */ }
    }
    changed('documenti', 'pratiche')
    return aggiunti
  }
  handle('documenti:add', async (praticaId, categoria, oraId) => {
    const scelti = daTest('MNGMNT_TEST_COLLEGA')
    if (scelti) return collegaFile(praticaId, scelti, categoria, oraId)
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Collega file alla pratica', message: 'I file restano dove sono: TIO ne ricorda la posizione.', properties: ['openFile', 'multiSelection'] })
    return r.canceled ? [] : collegaFile(praticaId, r.filePaths, categoria, oraId)
  })
  // scelta dei file senza collegarli ancora (allegati di un'attività non ancora salvata)
  handle('documenti:scegli', async () => {
    if (process.env.MNGMNT_TEST_ALLEGATI !== undefined && process.env.MNGMNT_TEST) return process.env.MNGMNT_TEST_ALLEGATI.split('|').filter(Boolean)
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Scegli gli allegati', properties: ['openFile', 'multiSelection'] })
    if (!r.canceled) r.filePaths.forEach((file) => scelti.add(file))
    return r.canceled ? [] : r.filePaths
  })
  handle('documenti:addPaths', (praticaId, paths, categoria, oraId) => {
    if (!Array.isArray(paths) || paths.length > 10000) throw new Error('Elenco dei file non valido')
    if (!process.env.MNGMNT_TEST) paths.forEach(autorizza)
    return collegaFile(praticaId, paths, categoria, oraId)
  })

  const trova = (id) => { const d = db.get('documenti', id); if (!d) throw new Error('Documento non trovato'); return d }
  const percorsoOk = (d) => {
    const p = docfile.risolvi(d)
    if (!docfile.esiste(d)) throw new Error(`Il file non si trova più in «${p}». È stato spostato o rinominato? Usa «Sincronizza» per ritrovarlo o «Ricollega» per indicarlo.`)
    return p
  }
  handle('documenti:anteprima', (id) => { const document = trova(id); return require('../preview').open(percorsoOk(document), document.nome, getWindow()) })
  handle('documenti:open', async (id) => {
    const p = percorsoOk(trova(id))
    if (eseguibile(p)) throw new Error('Per sicurezza TIO non avvia programmi o script dai documenti collegati. Usa «Mostra nella cartella» se ti serve il file.')
    if (process.env.MNGMNT_TEST) return true // nelle prove non si apre nessun programma
    const err = await shell.openPath(p)
    if (err) throw new Error(err)
    return true
  })
  handle('documenti:reveal', (id) => { const p = percorsoOk(trova(id)); if (!process.env.MNGMNT_TEST) shell.showItemInFolder(p); return true })
  handle('documenti:rename', (id, nome) => {
    const d = trova(id)
    if (d.percorso) { const r = db.save('documenti', { id, nome: String(nome || '').trim() || d.nome }); changed('documenti'); return r } // nome mostrato nell'app: il file dell'utente non viene toccato
    const clean = safeName(nome), from = docPath(d.file), to = uniqueFile(path.dirname(from), clean)
    fs.renameSync(from, to)
    const r = db.save('documenti', { id, nome: path.basename(to), file: path.relative(docsDir(), to) })
    changed('documenti')
    return r
  })

  // ---- collegamenti: controllo, ritrovamento dei file spostati, cartella della pratica ----
  handle('documenti:indice', (praticaId) => { db.get('pratiche', praticaId); return doctext.statoIndice(praticaId) })
  handle('documenti:indicizza', async (id, ocr) => { const result = await doctext.indicizzaDocumento(id, !!ocr); changed('documenti'); return result })
  handle('documenti:stato', (praticaId) => docfile.stato(praticaId || null))
  // candidati proposti all'utente nell'ultimo controllo: solo questi percorsi si possono scegliere dall'interfaccia
  const candidati = new Map()
  const rapporto = (praticaId, radici) => {
    const r = docfile.sincronizza({ praticaId: praticaId || null, radici })
    candidati.clear(); for (const a of r.ambigui) candidati.set(a.id, new Set(a.candidati))
    changed('documenti'); return r
  }
  handle('documenti:sincronizza', (praticaId) => rapporto(praticaId, []))
  handle('documenti:sincronizzaIn', async (praticaId) => {
    const dir = await scegliCartellaDocumenti('Cerca i file spostati in questa cartella', 'MNGMNT_TEST_CARTELLA'); if (!dir) return null
    return rapporto(praticaId, [dir])
  })
  handle('documenti:ricollegaA', (id, percorso) => {
    if (!candidati.get(Number(id))?.has(percorso)) throw new Error('Scegli uno dei file proposti')
    const out = docfile.ricollega(id, percorso); changed('documenti'); return out
  })
  handle('documenti:ricollega', async (id) => {
    trova(id)
    let file = daTest('MNGMNT_TEST_RICOLLEGA')?.[0]
    if (!file) { const r = await dialog.showOpenDialog(getWindow(), { title: 'Dov\'è ora questo file?', properties: ['openFile'] }); if (r.canceled) return null; file = r.filePaths[0] }
    const out = docfile.ricollega(id, file); changed('documenti'); return out
  })
  const scegliCartellaDocumenti = async (titolo, nomeTest) => {
    const t = daTest(nomeTest)?.[0]; if (t) return t
    const r = await dialog.showOpenDialog(getWindow(), { title: titolo, properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  }
  handle('documenti:cartellaPratica', async (praticaId) => {
    const dir = await scegliCartellaDocumenti('Cartella dei documenti di questa pratica', 'MNGMNT_TEST_CARTELLA'); if (!dir) return null
    const r = docfile.impostaCartella(praticaId, dir); changed('documenti', 'pratiche'); return r
  })
  handle('documenti:collegaCartella', async (praticaId) => {
    const dir = await scegliCartellaDocumenti('Collega tutti i file di una cartella', 'MNGMNT_TEST_CARTELLA'); if (!dir) return null
    const r = docfile.collegaCartella(praticaId, dir); changed('documenti', 'pratiche'); return r
  })
  handle('documenti:apriCartella', (praticaId) => {
    const p = db.get('pratiche', praticaId); if (!p?.cartella) throw new Error('Nessuna cartella impostata per questa pratica')
    if (!process.env.MNGMNT_TEST) shell.openPath(p.cartella)
    return p.cartella
  })

  handle('documenti:salvaCopia', async (id) => {
    const d = db.get('documenti', id); if (!d) throw new Error('Documento non trovato')
    let dest = process.env.MNGMNT_TEST_PDF_DIR ? path.join(process.env.MNGMNT_TEST_PDF_DIR, d.nome) : null
    if (!dest) {
      const s = db.getSettings()
      const r = await dialog.showSaveDialog(getWindow(), { title: 'Salva una copia del documento', defaultPath: path.join(s.cartella_pdf && fs.existsSync(s.cartella_pdf) ? s.cartella_pdf : app.getPath('documents'), d.nome) })
      if (r.canceled || !r.filePath) return null
      dest = r.filePath
    }
    fs.copyFileSync(docfile.risolvi(d), dest); return dest
  })

  handle('documenti:salvaTesto', async (nome, contenuto) => {
    const base = safeName(String(nome || 'report.csv')); const testo = String(contenuto ?? '')
    if (testo.length > 20 * 1024 * 1024) throw new Error('File troppo grande')
    let dest = process.env.MNGMNT_TEST_PDF_DIR ? path.join(process.env.MNGMNT_TEST_PDF_DIR, base) : null
    if (!dest) {
      const s = db.getSettings()
      const r = await dialog.showSaveDialog(getWindow(), { title: 'Salva il file', defaultPath: path.join(s.cartella_pdf && fs.existsSync(s.cartella_pdf) ? s.cartella_pdf : app.getPath('documents'), base), filters: [{ name: 'CSV (apribile con Excel)', extensions: ['csv'] }] })
      if (r.canceled || !r.filePath) return null
      dest = r.filePath
    }
    fs.writeFileSync(dest, testo, 'utf8'); return dest
  })
}
