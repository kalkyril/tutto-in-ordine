'use strict'
// Fattura elettronica: file XML FatturaPA dai dati dell'archivio. TIO non invia nulla allo SdI.
const { dialog, app, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const db = require('../db')
const docfile = require('../docfile')
const fatturapa = require('../fatturapa')

module.exports = function registra({ handle, changed, getWindow }) {
  const prepara = (id, opzioni) => {
    const parcella = db.getParcella(Number(id))
    if (!parcella) throw new Error('Documento non trovato')
    const cliente = parcella.cliente_id ? db.get('anagrafica', parcella.cliente_id) : null
    const originale = parcella.storno_di ? db.get('parcelle', parcella.storno_di) : null
    return { parcella, ...fatturapa.genera({ parcella, voci: parcella.voci, cliente, studio: db.getSettings().studio || {}, opzioni: opzioni || {}, collegata: originale && { numero: originale.numero, data: originale.data } }) }
  }
  handle('parcella:opzioniXml', () => ({ tipiDocumento: fatturapa.TIPI_DOCUMENTO, regimi: fatturapa.REGIMI, casse: fatturapa.CASSE, nature: fatturapa.NATURE }))
  // nota di credito che storna per intero una fattura emessa
  handle('parcella:notaCredito', (id) => { const r = db.creaNotaCredito(id); changed('parcelle', 'voci_parcella'); return r })
  // controllo dal vivo nella finestra: errori, avvisi e nome del file, senza scrivere nulla
  handle('parcella:verificaXml', (id, opzioni) => { const r = prepara(id, opzioni); return { errori: r.errori, avvisi: r.avvisi, nomeFile: r.nomeFile } })
  handle('parcella:salvaXml', async (id, opzioni) => {
    const r = prepara(id, opzioni)
    if (r.errori.length) throw new Error(r.errori[0])
    const p = r.parcella
    let dest
    if (process.env.MNGMNT_TEST_PDF_DIR) dest = path.join(process.env.MNGMNT_TEST_PDF_DIR, r.nomeFile)
    else {
      const s = db.getSettings()
      const cartella = p.pratica_id ? docfile.cartellaPer(p.pratica_id) : (s.cartella_pdf && fs.existsSync(s.cartella_pdf) ? s.cartella_pdf : app.getPath('documents'))
      const scelta = await dialog.showSaveDialog(getWindow(), { title: 'Salva la fattura elettronica', buttonLabel: 'Salva XML', defaultPath: path.join(cartella, r.nomeFile), filters: [{ name: 'Fattura elettronica (XML)', extensions: ['xml'] }], properties: ['createDirectory', 'showOverwriteConfirmation'] })
      if (scelta.canceled || !scelta.filePath) return null
      dest = scelta.filePath.toLowerCase().endsWith('.xml') ? scelta.filePath : scelta.filePath + '.xml'
      if (!p.pratica_id) db.setSettings({ cartella_pdf: path.dirname(dest) })
    }
    fs.writeFileSync(dest, r.xml, 'utf8')
    if (p.pratica_id) { docfile.collega(p.pratica_id, dest, { categoria: 'Parcelle' }); changed('documenti') }
    if (!process.env.MNGMNT_TEST) shell.showItemInFolder(dest)
    return { percorso: dest, avvisi: r.avvisi }
  })
}
