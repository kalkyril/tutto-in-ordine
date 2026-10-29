'use strict'
// Esportazione (calendario .ics, PDF) e backup/ripristino.
const { dialog, shell, app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const db = require('../db')
const backup = require('../backup')
const backupKey = require('../backup-key')
const ics = require('../ics')
const { safeName } = require('../files')
const docfile = require('../docfile')

module.exports = function registra({ handle, changed, getWindow }) {
  handle('pdf:preview', (html, pagina) => require('../pdf-preview').previewPdf(html, pagina))
  handle('ics:export', async (praticaId) => {
    const r = await dialog.showSaveDialog(getWindow(), {
      title: 'Esporta calendario', defaultPath: path.join(app.getPath('documents'), praticaId ? 'pratica.ics' : 'TIO-agenda.ics'),
      filters: [{ name: 'Calendario (.ics)', extensions: ['ics'] }],
    })
    if (r.canceled || !r.filePath) return null
    fs.writeFileSync(r.filePath, ics.build(praticaId || null), 'utf8')
    return r.filePath
  })
  // Il PDF si salva con la finestra nativa di Mac, Windows e Linux. Se appartiene a una pratica la finestra si apre nella
  // cartella locale della pratica (quella collegata, oppure <Documenti>/TIO/<numero titolo>) e il file salvato viene collegato ai
  // documenti della pratica (nessuna copia). Senza pratica si riparte dall'ultima cartella usata.
  handle('pdf:print', async (html, nome, praticaId, categoria) => {
    const pdf = await require('../print-pdf').renderPdf(html)
      const fileName = safeName(nome || 'documento') + '.pdf'
      let dest
      const cartellaPratica = praticaId ? docfile.cartellaPer(praticaId) : null
      if (process.env.MNGMNT_TEST_PDF_DIR) { // solo per i test automatici (con MNGMNT_TEST_PDF_NELLA_PRATICA salva dove proporrebbe la finestra)
        dest = path.join(process.env.MNGMNT_TEST_PDF_NELLA_PRATICA && cartellaPratica ? cartellaPratica : process.env.MNGMNT_TEST_PDF_DIR, fileName)
      } else {
        const last = db.getSettings().cartella_pdf
        const startDir = cartellaPratica || (last && fs.existsSync(last) ? last : app.getPath('documents'))
        const r = await dialog.showSaveDialog(getWindow(), {
          title: 'Scegli dove salvare il PDF', buttonLabel: 'Salva PDF',
          defaultPath: path.join(startDir, fileName),
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        })
        if (r.canceled || !r.filePath) return null
        dest = /\.pdf$/i.test(r.filePath) ? r.filePath : r.filePath + '.pdf'
        if (!cartellaPratica) db.setSettings({ cartella_pdf: path.dirname(dest) })
      }
      fs.writeFileSync(dest, pdf)
      if (praticaId) { // il PDF resta dove l'utente l'ha salvato: nella pratica compare come collegamento, senza una seconda copia
        docfile.collega(praticaId, dest, { categoria: categoria === 'Documenti' ? 'Documenti' : 'Parcelle' })
        changed('documenti')
      }
      if (!process.env.MNGMNT_TEST_PDF_DIR) shell.showItemInFolder(dest)
      return dest
  })


  const keyStatus = async () => ({ ...await backupKey.status(), enabled: db.getSettings().backup_cifrato === true })
  handle('backup:keyStatus', keyStatus)
  handle('backup:keyConfigure', async (password) => { await backupKey.configure(password); db.setSettings({ backup_cifrato: true, backup_ultimo: '', backup_tentativo: '' }); changed('settings'); return keyStatus() })
  handle('backup:keyDisable', async () => { await backupKey.disable(); db.setSettings({ backup_cifrato: false }); changed('settings'); return keyStatus() })

  handle('backup:chooseFolder', async () => {
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Scegli la cartella di destinazione', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  handle('backup:run', async (folder, options = {}) => {
    let dest = folder
    if (!dest) {
      const r = await dialog.showOpenDialog(getWindow(), { title: 'Dove salvare il backup?', properties: ['openDirectory', 'createDirectory'] })
      if (r.canceled) return null
      dest = r.filePaths[0]
    }
    try {
      const out = await backup.runAsync(dest, { includeLinked: !!options.includeLinked, password: String(options.password || '') })
      db.setSettings({ backup_ultimo: new Date().toISOString(), backup_esito: 'ok', backup_errore: '' })
      changed('settings')
      return out
    } catch (error) {
      db.setSettings({ backup_esito: 'errore', backup_errore: error.message, backup_tentativo: new Date().toISOString() })
      changed('settings'); throw error
    }
  })
  handle('backup:restore', async (password = '', verifyOnly = false) => {
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Seleziona la cartella di backup da ripristinare', properties: ['openDirectory'] })
    if (r.canceled) return null
    const details = await backup.inspectAsync(r.filePaths[0], String(password || ''))
    if (verifyOnly) return details
    const conf = await dialog.showMessageBox(getWindow(), {
      type: 'warning', buttons: ['Annulla', 'Ripristina'], defaultId: 0, cancelId: 0,
      message: 'Ripristinare questo backup?',
      detail: 'I dati attuali verranno sostituiti. Una copia di sicurezza non cifrata dei dati correnti viene salvata nella cartella locale privata prima di procedere.',
    })
    if (conf.response !== 1) return null
    const res = backup.restore(r.filePaths[0], String(password || ''))
    changed('anagrafica', 'pratiche', 'scadenze', 'todos', 'note', 'documenti', 'link', 'ore', 'spese', 'parcelle', 'notifiche', 'settings', 'calendari', 'eventi_esterni', 'cronologia')
    return res
  })
}
