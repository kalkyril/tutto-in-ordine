'use strict'
// Registro locale degli errori, per l'assistenza durante la prova: resta sul computer, non viene mai inviato da solo
// I percorsi e gli URL vengono rimossi; altri dati citati da un errore richiedono comunque una verifica prima dell'invio.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')

const MAX = 512 * 1024 // oltre mezzo megabyte il registro passa a «registro.log.1» e se ne apre uno nuovo
let file = null

const pulisci = (testo) => String(testo ?? '')
  .replace(/\b(?:https?|webcal):\/\/[^\s<>«»"']+/gi, '[indirizzo rimosso]')
  .replace(/«(?:[A-Za-z]:[\\/]|\/|\\\\|~[\\/])[^»]*»/g, '«[percorso rimosso]»')
  .replace(/(["'])(?:[A-Za-z]:[\\/]|\/|\\\\|~[\\/])[^\r\n]*?\1/g, '[percorso rimosso]')
  .split(os.homedir()).join('~')
  .replace(/(?:[A-Za-z]:[\\/]|\\\\|~[\\/]|(?<![\w./])\/(?=[^\s/]+\/))[^\r\n<>«»"']*/g, '[percorso rimosso]') // date, R.G. ed «e/o» non sono percorsi
  .replace(/\s+/g, ' ').slice(0, 2000)

function scrivi(tipo, testo) {
  if (!file) return
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > MAX) fs.renameSync(file, file + '.1')
    fs.appendFileSync(file, `${new Date().toISOString()} [${tipo}] ${pulisci(testo)}\n`, { mode: 0o600 })
  } catch { /* il registro non deve mai bloccare l'app */ }
}

/** Sistema e versione, come compaiono in «Segnala un problema». */
function descriviSistema(versione) {
  const nomi = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }
  // getSystemVersion dà la versione che l'utente conosce (macOS 26.x, Windows 10.0.x), non quella del kernel
  const versioneSistema = typeof process.getSystemVersion === 'function' ? process.getSystemVersion() : os.release()
  return `TIO ${versione} · ${nomi[process.platform] || process.platform} ${versioneSistema} (${process.arch}) · Electron ${process.versions.electron}`
}

// tempi di avvio, in secondi dall'inizio del processo: si scrivono una volta sola, quando l'interfaccia mostra i dati.
// Servono a capire se l'avvio è lento su un computer che non abbiamo davanti (per esempio il PC di chi prova la beta).
const tempi = {}
const secondi = (s) => s.toFixed(2).replace('.', ',') + ' s'
function segnaTempo(fase) {
  if (tempi.scritto || tempi[fase] !== undefined) return
  tempi[fase] = process.uptime()
  if (fase !== 'dati') return
  tempi.scritto = true
  scrivi('tempi', `avvio: motore pronto ${secondi(tempi.pronto ?? 0)} · finestra pronta ${secondi(tempi.finestra ?? 0)} · dati mostrati ${secondi(tempi.dati)}`)
}

// sorveglianza dei blocchi: se il processo principale resta fermo (Windows mostra «non risponde») il registro dice per quanto
// e qual era l'ultima operazione iniziata, così una segnalazione basta a capire dove si è bloccato
let ultimaAttivita = 'avvio'
const segnaAttivita = (nome) => { ultimaAttivita = nome }
function sorvegliaBlocchi(soglia = 2000) {
  let atteso = Date.now() + 500
  const timer = setInterval(() => {
    const fermo = Date.now() - atteso
    if (fermo > soglia) scrivi('blocco', `processo principale fermo per ${secondi(fermo / 1000)}; ultima operazione iniziata: ${ultimaAttivita}`)
    atteso = Date.now() + 500
  }, 500)
  timer.unref?.()
}

function init(cartella, versione) {
  file = path.join(cartella, 'registro.log')
  scrivi('avvio', descriviSistema(versione))
  // si osserva senza cambiare il comportamento predefinito di Electron in caso di errore grave
  process.on('uncaughtExceptionMonitor', (e) => scrivi('errore grave', e?.stack || e))
  process.on('unhandledRejection', (e) => { console.error(e); scrivi('promessa non gestita', e?.stack || e) })
  sorvegliaBlocchi()
}

module.exports = { init, scrivi, descriviSistema, segnaTempo, segnaAttivita, percorso: () => file }
