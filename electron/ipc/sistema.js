'use strict'
// Tariffe forensi, collegamenti esterni, informazioni sull'app, blocco con password, notifiche.
const { shell, app, Menu, BrowserWindow } = require('electron')
const db = require('../db')
const fs = require('node:fs'), path = require('node:path')
const tariffe = require('../tariffe')
const blocco = require('../blocco')

module.exports = function registra({ handle, changed, runAlertCheck, controllaAggiornamenti }) {
  handle('tariffe:competenze', () => tariffe.competenze())
  handle('tariffe:struttura', (anno, competenza) => tariffe.struttura(Number(anno), Number(competenza)))
  handle('tariffe:valori', (q) => tariffe.valori(q))
  handle('tariffe:apriSito', async () => { await shell.openExternal(tariffe.PAGE); return true })


  handle('shell:openExternal', async (url) => {
    const u = new URL(String(url).trim())
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) throw new Error('Protocollo non consentito')
    await shell.openExternal(u.toString())
    return true
  })
  handle('app:info', () => ({
    version: app.getVersion(), platform: process.platform, dataDir: db.getDataDir(),
    electron: process.versions.electron, userData: app.getPath('userData'), sistema: require('../registro').descriviSistema(app.getVersion()),
    // il controllo degli aggiornamenti si può offrire solo quando il progetto ha un indirizzo GitHub
    aggiornamenti: !!require('../aggiornamenti').progettoConfigurato(),
    // la domanda «Vuoi sapere quando esce una nuova versione?» non compare nelle prove automatiche, salvo quella che la verifica
    chiediAggiornamenti: !!require('../aggiornamenti').progettoConfigurato() && (!process.env.MNGMNT_TEST || !!process.env.MNGMNT_TEST_REPO),
    cartelle: { backup: require('../cartelle-utente').backupPredefinito(app), documenti: require('../cartelle-utente').documentiPredefiniti(app) },
  }))
  // «Controlla ora»: una sola richiesta a GitHub, subito, anche con il controllo automatico spento (è l'utente a chiederla)
  handle('app:controllaAggiornamenti', async () => {
    const r = await controllaAggiornamenti(true)
    return r && { versione: r.versione, nuova: r.nuova, pagina: r.pagina }
  })
  // registro degli errori: l'interfaccia annota i propri errori, e si può mostrare il file per allegarlo a una segnalazione
  handle('app:avvioCompletato', () => { require('../registro').segnaTempo('dati'); return true })
  handle('app:registraErrore', (testo) => { require('../registro').scrivi('interfaccia', String(testo ?? '').slice(0, 2000)); return true })
  handle('app:mostraRegistro', () => {
    const file = require('../registro').percorso()
    if (!file || !fs.existsSync(file)) throw new Error('Il registro è vuoto: non si sono verificati errori.')
    if (!process.env.MNGMNT_TEST) shell.showItemInFolder(file)
    return file
  })
  const licenseFolder = () => app.isPackaged ? path.join(process.resourcesPath, 'licenses') : path.resolve(__dirname, '../../licenses')
  const openLicenses = async (folder = false) => {
    const target = folder ? licenseFolder() : path.join(licenseFolder(), 'index.html')
    if (!fs.existsSync(target)) throw new Error('Licenze non disponibili: rigenera la raccolta con npm run licenses')
    if (!process.env.MNGMNT_TEST) { const error = await shell.openPath(target); if (error) throw new Error(error) }
    return target
  }
  handle('app:licenses', () => openLicenses())
  // guida completa (cartella guida/), inclusa nell'installer e aperta nel browser predefinito, anche senza internet
  handle('app:guida', async () => {
    const target = app.isPackaged ? path.join(process.resourcesPath, 'guida', 'index.html') : path.resolve(__dirname, '../../guida/index.html')
    if (!fs.existsSync(target)) throw new Error('Guida non disponibile in questa copia di TIO')
    if (!process.env.MNGMNT_TEST) { const error = await shell.openPath(target); if (error) throw new Error(error) }
    return target
  })
  handle('app:licenseFolder', () => openLicenses(true))
  handle('app:statoBlocco', () => blocco.stato())
  handle('app:sblocca', (password) => blocco.sblocca(String(password ?? '')))
  handle('app:blocca', () => { require('../preview').closeAll(); const st = blocco.blocca(); return st })
  handle('app:impostaBlocco', (nuova, minuti, vecchia) => { blocco.imposta(nuova, minuti, vecchia); return blocco.stato() })
  handle('app:cambiaMinutiBlocco', (minuti, password) => { blocco.cambiaMinuti(minuti, password); return blocco.stato() })
  handle('app:rimuoviBlocco', (password) => { blocco.rimuovi(password); return blocco.stato() })
  handle('app:openDataDir', async () => { await shell.openPath(db.getDataDir()); return true })


  handle('notifiche:markRead', (id) => {
    if (id) db.getDb().prepare('UPDATE notifiche SET letta = 1 WHERE id = ?').run(id)
    else db.getDb().exec('UPDATE notifiche SET letta = 1')
    changed('notifiche')
    return true
  })
  handle('notifiche:clear', () => { db.getDb().exec('DELETE FROM notifiche'); changed('notifiche'); return true })
  // menu col tasto destro nativo: l'interfaccia passa le voci, il processo principale restituisce l'id scelto (o null)
  handle('app:menuContestuale', (voci) => new Promise((resolve) => {
    if (!Array.isArray(voci) || !voci.length || voci.length > 20) return resolve(null)
    const template = voci.map((v) => v === '-' || v?.separatore ? { type: 'separator' }
      : { label: String(v?.label ?? '').slice(0, 80), enabled: v?.disattiva !== true, click: () => { scelto = String(v.id) } })
    let scelto = null
    Menu.buildFromTemplate(template).popup({ window: BrowserWindow.getFocusedWindow() || undefined, callback: () => setTimeout(() => resolve(scelto), 30) })
  }))
  handle('alerts:check', () => { runAlertCheck(); return true })
  handle('alerts:test', () => runAlertCheck(true))
}
