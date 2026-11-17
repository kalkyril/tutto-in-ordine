'use strict'
// Sezione Budget: conti, movimenti, fatture lette dal servizio di fatturazione (sola lettura) e pacchetto per il commercialista.
const { dialog, shell, app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const db = require('../db')
const budget = require('../budget')
const { safeName } = require('../files')

module.exports = function registra({ handle, changed, getWindow }) {
  const prova = (nome) => (process.env.MNGMNT_TEST && process.env[nome]) || null // solo per le prove automatiche
  const avanza = (info) => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send('avanzamento', { operazione: 'fatture', ...info }) }
  const fine = () => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send('avanzamento', { operazione: 'fatture', fine: true }) }
  const mieiCodici = () => { const s = db.getSettings().studio || {}; return [s.piva, s.cf].filter(Boolean) }
  handle('budget:esegui', (azione, dati) => { const r = budget.esegui(azione, dati); if (azione !== 'leggi') changed('budget', 'gestione'); return r })

  // ---- fatture del servizio di fatturazione: si leggono i file esportati, il servizio non viene mai contattato né modificato
  const leggiCartella = async (cartella) => {
    try { const esito = await budget.leggiFatture(await budget.fileFatture(cartella), mieiCodici(), avanza); changed('budget'); return { ...esito, cartella } } finally { fine() }
  }
  handle('budget:cartellaFatture', async () => {
    let cartella = prova('MNGMNT_TEST_CARTELLA_FATTURE')
    if (!cartella) {
      const r = await dialog.showOpenDialog(getWindow(), { title: 'Cartella in cui salvi le fatture esportate dal servizio di fatturazione', properties: ['openDirectory'] })
      if (r.canceled || !r.filePaths[0]) return null
      cartella = r.filePaths[0]
    }
    db.setSettings({ cartella_fatture: cartella }); changed('settings')
    return leggiCartella(cartella)
  })
  handle('budget:rileggiFatture', async () => {
    const cartella = db.getSettings().cartella_fatture
    if (!cartella || !fs.existsSync(cartella)) throw new Error('La cartella delle fatture non si trova più: sceglila di nuovo')
    return leggiCartella(cartella)
  })
  handle('budget:fileFatture', async () => {
    let file = prova('MNGMNT_TEST_FILE_FATTURE')?.split('|')
    if (!file) {
      const r = await dialog.showOpenDialog(getWindow(), { title: 'Fatture elettroniche da leggere', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Fatture elettroniche', extensions: ['xml', 'p7m', 'zip'] }] })
      if (r.canceled || !r.filePaths.length) return null
      file = r.filePaths
    }
    try { const esito = await budget.leggiFatture(file, mieiCodici(), avanza); changed('budget'); return esito } finally { fine() }
  })

  // ---- pacchetto per il commercialista: una cartella con il riepilogo in PDF, i file CSV e le contabili dei pagamenti
  const creati = new Set()
  handle('budget:pacchettoCommercialista', async (p) => {
    if (!p || typeof p !== 'object' || !Array.isArray(p.file) || p.file.length > 30 || typeof p.nome !== 'string') throw new Error('Pacchetto non valido')
    let base = prova('MNGMNT_TEST_PDF_DIR')
    if (!base) {
      const r = await dialog.showOpenDialog(getWindow(), { title: 'Dove salvare il pacchetto per il commercialista', defaultPath: app.getPath('documents'), buttonLabel: 'Salva qui', properties: ['openDirectory', 'createDirectory'] })
      if (r.canceled || !r.filePaths[0]) return null
      base = r.filePaths[0]
    }
    const nome = safeName(p.nome.slice(0, 80), 'Per il commercialista')
    let cartella = path.join(base, nome); for (let i = 2; fs.existsSync(cartella); i++) cartella = path.join(base, `${nome} ${i}`)
    fs.mkdirSync(cartella, { recursive: true })
    for (const f of p.file) {
      if (!f || typeof f.nome !== 'string' || typeof f.testo !== 'string' || f.testo.length > 50 * 1024 * 1024) throw new Error('File del pacchetto non valido')
      fs.writeFileSync(path.join(cartella, safeName(f.nome, 'file.csv')), f.testo, 'utf8')
    }
    if (typeof p.riepilogo === 'string' && p.riepilogo.length < 16 * 1024 * 1024) fs.writeFileSync(path.join(cartella, 'Riepilogo.pdf'), await require('../print-pdf').renderPdf(p.riepilogo))
    // contabili: copie dei file allegati ai pagamenti del periodo
    let contabili = 0
    const dir = path.join(db.getDataDir(), 'documenti', 'contabili')
    for (const c of Array.isArray(p.contabili) ? p.contabili.slice(0, 5000) : []) {
      if (!c || typeof c.file !== 'string' || !/^[\w.-]+$/.test(c.file) || typeof c.nome !== 'string') continue
      const da = path.join(dir, c.file); if (!fs.existsSync(da)) continue
      fs.mkdirSync(path.join(cartella, 'Contabili'), { recursive: true })
      let dest = path.join(cartella, 'Contabili', safeName(c.nome, c.file)); const ext = path.extname(dest), stem = dest.slice(0, -ext.length || undefined)
      for (let i = 2; fs.existsSync(dest); i++) dest = `${stem} ${i}${ext}`
      fs.copyFileSync(da, dest); contabili++
    }
    creati.add(cartella)
    return { cartella, contabili }
  })
  handle('budget:apriCartella', (cartella) => { if (!creati.has(cartella)) throw new Error('Cartella non trovata'); if (!process.env.MNGMNT_TEST) shell.openPath(cartella); return true })
}
