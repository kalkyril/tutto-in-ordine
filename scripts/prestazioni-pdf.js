'use strict'
// Processo Electron di scripts/test-prestazioni.mjs: trasforma in PDF l'HTML di un documento lungo con la stessa stampa
// isolata dell'app (electron/print-pdf.js, finestra nascosta e sessione separata). L'avvio di Electron non entra nel tempo:
// si misura solo renderPdf, più volte, e si stampa una riga JSON con i risultati.
// Uso (lo avvia la prova): TIO_PDF_HTML=<file.html> TIO_PDF_PROFILO=<cartella> TIO_PDF_GIRI=3 electron scripts/prestazioni-pdf.js
//
// La cartella del profilo la crea e la cancella chi avvia questo processo, dopo la sua uscita: finché Electron è aperto
// Windows tiene bloccati i file di Chromium e la cancellazione da qui fallirebbe (EPERM).
const { app } = require('electron')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')

const profilo = process.env.TIO_PDF_PROFILO || fs.mkdtempSync(path.join(os.tmpdir(), 'tio-prestazioni-pdf-'))
fs.mkdirSync(profilo, { recursive: true })
app.setPath('userData', profilo)
app.dock?.hide()
const fine = (codice, dati) => {
  process.stdout.write(JSON.stringify(dati) + '\n')
  app.exit(codice)
}
// una stampa bloccata non deve tenere ferma la suite: la prova principale segnala l'errore
const scadenza = setTimeout(() => fine(1, { errore: 'stampa PDF ferma da 120 secondi' }), 120000)

app.on('window-all-closed', () => { /* la finestra di stampa si chiude a ogni giro: l'app resta aperta fino alla fine */ })
app.whenReady().then(async () => {
  try {
    const { renderPdf } = require('../electron/print-pdf')
    const html = fs.readFileSync(process.env.TIO_PDF_HTML, 'utf8')
    const giri = Math.max(1, Number(process.env.TIO_PDF_GIRI) || 3)
    const tempi = []
    let pdf
    for (let i = 0; i < giri; i++) {
      const t = process.hrtime.bigint()
      pdf = await renderPdf(html)
      tempi.push(Number(process.hrtime.bigint() - t) / 1e6)
    }
    const pagine = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
    clearTimeout(scadenza)
    fine(0, { tempi, byte: pdf.length, pagine })
  } catch (e) {
    clearTimeout(scadenza)
    fine(1, { errore: String(e?.stack || e) })
  }
})
