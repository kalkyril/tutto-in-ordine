'use strict'
// Canali di comunicazione tra l'interfaccia e il processo principale, divisi per area.
// Ogni modulo registra i propri canali con gli strumenti comuni (`handle`, `changed`, …) costruiti qui.
const { ipcMain } = require('electron')
const blocco = require('../blocco')

// con l'app bloccata nessun canale restituisce dati, tranne quelli per vedere lo stato e sbloccare
const LIBERI = new Set(['app:statoBlocco', 'app:sblocca'])

function register({ getWindow, notifyChanged, onSettings, runAlertCheck, controllaAggiornamenti }) {
  const trusted = (event) => {
    const win = getWindow()
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return false
    const current = event.senderFrame.url
    return require('../web-policy').isAppUrl(current, !!process.env.MNGMNT_DEV)
  }
  const handle = (ch, fn) => ipcMain.handle(ch, async (event, ...args) => {
    if (!trusted(event)) throw new Error('Origine della richiesta non consentita')
    if (!LIBERI.has(ch) && blocco.èBloccato()) throw new Error('Applicazione bloccata: inserisci la password')
    require('../registro').segnaAttivita(ch) // se il programma si blocca, il registro sa da quale richiesta
    // nel registro l'errore originale; all'interfaccia, per le scritture negate, la spiegazione di cosa fare
    try { return await fn(...args) } catch (e) { require('../registro').scrivi(ch, e?.message || e); throw require('../cartelle-utente').spiegaAccessoNegato(e) }
  })
  // qualsiasi modifica ai dati di una pratica può aggiungere righe alla sua cronologia: la schermata si aggiorna da sola
  const CON_CRONOLOGIA = new Set(['pratiche', 'scadenze', 'todos', 'note', 'documenti', 'ore', 'spese', 'parcelle'])
  const changed = (...tables) => notifyChanged(tables.some((t) => CON_CRONOLOGIA.has(t)) && !tables.includes('cronologia') ? [...tables, 'cronologia'] : tables)
  // il renderer può chiedere di leggere solo percorsi scelti dall'utente con la finestra di sistema
  const scelti = new Set()
  const autorizza = (p) => { if (!scelti.has(p)) throw new Error('Seleziona di nuovo il file o la cartella'); return p }
  ipcMain.on('authorize-dropped-file', (event, file) => {
    if (!trusted(event) || blocco.èBloccato()) { event.returnValue = false; return }
    if (typeof file !== 'string' || !require('node:path').isAbsolute(file) || !require('node:fs').existsSync(file)) { event.returnValue = false; return }
    scelti.add(file); event.returnValue = true
  })
  const ctx = { handle, changed, getWindow, onSettings, runAlertCheck, controllaAggiornamenti, scelti, autorizza }
  for (const modulo of ['dati', 'documenti', 'calendari', 'importazione', 'sistema', 'esportazione', 'strumenti', 'fatture']) require('./' + modulo)(ctx)
}

module.exports = { register }
