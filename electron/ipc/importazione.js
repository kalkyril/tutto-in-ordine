'use strict'
// Importazione da file e cartelle (i file di origine vengono solo letti).
const { dialog, app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const importer = require('../importer')

module.exports = function registra({ handle, changed, getWindow, scelti, autorizza }) {
  handle('import:proforma', async () => {
    const current = require('../db').getDb()
    let file = process.env.MNGMNT_TEST_PROFORMA_FILE
    if (!file) {
      const result = await dialog.showOpenDialog(getWindow(), { title: 'Importa una pro forma da PDF o Word', properties: ['openFile'], filters: [{ name: 'Documento esportato', extensions: ['pdf','docx'] }] })
      if (result.canceled) return null
      file = result.filePaths[0]
    }
    const data = await require('../proforma-import').leggi(file)
    if (require('../db').getDb() !== current) throw new Error('Archivio cambiato durante la lettura: ripeti l’importazione')
    return data
  })
  handle('import:scegliFile', async () => {
    let file = process.env.MNGMNT_TEST_IMPORT_FILE
    if (!file) {
      const r = await dialog.showOpenDialog(getWindow(), { title: "Scegli il file da importare", properties: ['openFile'], filters: [{ name: 'Fogli di calcolo e CSV', extensions: ['csv', 'xlsx', 'xlsm', 'txt', 'tsv'] }, { name: 'Tutti i file', extensions: ['*'] }] })
      if (r.canceled) return null
      file = r.filePaths[0]
    }
    scelti.add(file); return { percorso: file, nome: path.basename(file) }
  })
  handle('import:proponi', (tipo, file) => importer.proponi(tipo, autorizza(file)))
  handle('import:anteprima', (tipo, file, map, opz) => importer.anteprima(tipo, autorizza(file), map, opz))
  handle('import:esegui', (tipo, file, map, opz) => {
    const r = importer.importa(tipo, autorizza(file), map, opz)
    changed('anagrafica', 'pratiche', 'scadenze', 'parcelle', 'voci_parcella')
    return r
  })
  handle('import:modello', async (tipo) => {
    const nome = `modello-${tipo}.csv`
    let dest = process.env.MNGMNT_TEST_PDF_DIR ? path.join(process.env.MNGMNT_TEST_PDF_DIR, nome) : null
    if (!dest) {
      const r = await dialog.showSaveDialog(getWindow(), { title: 'Salva il modello da compilare', defaultPath: path.join(app.getPath('documents'), nome), filters: [{ name: 'CSV (apribile con Excel)', extensions: ['csv'] }] })
      if (r.canceled || !r.filePath) return null
      dest = r.filePath
    }
    fs.writeFileSync(dest, importer.modelloCsv(tipo), 'utf8'); return dest
  })
  handle('import:scegliCartella', async () => {
    let dir = process.env.MNGMNT_TEST_IMPORT_DIR
    if (!dir) {
      const r = await dialog.showOpenDialog(getWindow(), { title: 'Scegli la cartella con i documenti delle pratiche', properties: ['openDirectory'] })
      if (r.canceled) return null
      dir = r.filePaths[0]
    }
    scelti.add(dir); return { percorso: dir, nome: path.basename(dir) }
  })
  // cartella di pratiche (una sottocartella per pratica): anteprima e importazione, i file restano dove sono
  handle('import:cartellaAnteprima', (dir) => importer.anteprimaCartella(autorizza(dir)))
  handle('import:cartellaEsegui', (dir, scelte, opz) => {
    const r = importer.importaCartella(autorizza(dir), scelte || {}, opz || {})
    changed('pratiche', 'documenti'); return r
  })
}
