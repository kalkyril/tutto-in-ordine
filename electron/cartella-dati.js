'use strict'
// Cartella dei dati dell'app: <AppData>/TIO. Al primo avvio dopo un cambio di nome si copiano i dati della versione
// precedente (MNGMNT, prima ancora «LARA Studio»); la cartella vecchia resta com'era, come copia di sicurezza.
const fs = require('node:fs'), path = require('node:path')

const NOME = 'TIO'
const PRECEDENTI = ['MNGMNT', 'LARA Studio']
const haDati = (d) => fs.existsSync(path.join(d, 'mngmnt.db')) || fs.existsSync(path.join(d, 'lara.db'))

/** Restituisce la cartella da usare; se serve copia i dati della versione precedente. `log` riceve gli errori di copia. */
function preparaCartellaDati(base, log = () => {}) {
  const nuova = path.join(base, NOME)
  if (haDati(nuova)) return { cartella: nuova, copiataDa: null }
  const vecchia = PRECEDENTI.map((n) => path.join(base, n)).find(haDati)
  if (!vecchia) return { cartella: nuova, copiataDa: null }
  try {
    fs.cpSync(vecchia, nuova, { recursive: true, force: false, errorOnExist: false })
    return { cartella: nuova, copiataDa: vecchia }
  } catch (e) {
    log('Copia dei dati della versione precedente non riuscita: ' + e.message)
    return { cartella: nuova, copiataDa: null }
  }
}

module.exports = { preparaCartellaDati, NOME, PRECEDENTI }
