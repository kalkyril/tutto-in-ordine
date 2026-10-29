'use strict'
// Cartelle predefinite per i backup automatici e per i documenti creati da TIO.
// Su Windows non si usa «Documenti»: con «Accesso alle cartelle controllato» (la protezione ransomware di Sicurezza di Windows)
// un programma non firmato non può scriverci, ogni tentativo viene bloccato e mostra un avviso. Si usa la cartella dell'utente,
// che la protezione non sorveglia. Su Mac e Linux resta «Documenti».
const path = require('node:path')

const basePredefinita = (app, piattaforma = process.platform) => app.getPath(piattaforma === 'win32' ? 'home' : 'documents')
const backupPredefinito = (app, piattaforma = process.platform) => path.join(basePredefinita(app, piattaforma), 'TIO Backup')
const documentiPredefiniti = (app, piattaforma = process.platform) => path.join(basePredefinita(app, piattaforma), 'TIO')

const accessoNegato = (error) => ['EPERM', 'EACCES'].includes(error?.code) || /\b(EPERM|EACCES)\b/.test(String(error?.message || error))

/** Una scrittura negata (permessi o protezione di Windows) spiegata in parole semplici; gli altri errori restano com'erano. */
function spiegaAccessoNegato(error, piattaforma = process.platform) {
  if (!accessoNegato(error)) return error
  const p = piattaforma === 'win32' ? path.win32 : path.posix
  const file = (String(error?.message || '').match(/'([^']+)'/) || [])[1]
  const dove = file ? ` in «${p.extname(file) ? p.dirname(file) : file}»` : ''
  const spiegato = new Error(piattaforma === 'win32'
    ? `Windows non permette a TIO di scrivere${dove}. Se è attivo «Accesso alle cartelle controllato» (Sicurezza di Windows › Protezione da virus e minacce › Protezione ransomware), aggiungi TIO tra le app consentite oppure scegli un'altra cartella.`
    : `Non hai i permessi per scrivere${dove}: scegli un'altra cartella.`)
  spiegato.code = error?.code || 'EACCES'
  return spiegato
}

module.exports = { basePredefinita, backupPredefinito, documentiPredefiniti, accessoNegato, spiegaAccessoNegato }
