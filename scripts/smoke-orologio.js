'use strict'
// Regressione dell'audit: nessuna scrittura alle scadenze deve essere necessaria per riconoscere un ritardo.
const fs = require('node:fs'), path = require('node:path')
function attach({ getWindow, db }) {
  const wc = getWindow().webContents, js = code => wc.executeJavaScript(code, true), results = []
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(detail)) }
  const kpi = () => js("document.querySelector('.kpi:nth-child(2) b')?.textContent")
  wc.once('did-finish-load', async () => {
    try {
      await sleep(400)
      await js("window.__realDate=Date;window.__auditTime=new Date('2026-10-26T10:00:00').getTime();window.Date=class extends window.__realDate{constructor(...a){super(...(a.length?a:[window.__auditTime]))}static now(){return window.__auditTime}};window.dispatchEvent(new Event('focus'));true")
      db.setSettings({ onboarding_fatto: true, backup_automatico: false })
      const pratica = db.save('pratiche', { titolo: 'Pratica orologio' })
      db.save('scadenze', { pratica_id: pratica.id, titolo: 'Scadenza ore 10:01', data_ora: '2026-10-26T10:01', promemoria: [] })
      db.save('scadenze', { pratica_id: pratica.id, titolo: 'Scadenza tutto il giorno', data_ora: '2026-10-26', tutto_il_giorno: 1, promemoria: [] })
      wc.send('data-changed', ['settings', 'pratiche', 'scadenze']); await sleep(700)
      check('prima della scadenza nessun ritardo', await kpi() === '0', await kpi())
      await js("window.__auditTime=new window.__realDate('2026-10-26T10:05:00').getTime();true")
      await sleep(31_000)
      check('orologio periodico aggiorna Panoramica senza navigare o modificare dati', await kpi() === '1', await kpi())
      check('anche il contatore laterale segue l’ora', await js("[...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes('Agenda'))?.textContent.includes('1')"))
      await js("window.__auditTime=new window.__realDate('2026-10-27T00:01:00').getTime();window.dispatchEvent(new Event('focus'));true"); await sleep(250)
      check('mezzanotte: anche le scadenze di tutto il giorno diventano in ritardo', await kpi() === '2', await kpi())
      await js("window.__auditTime=new window.__realDate('2026-10-26T10:00:00').getTime();true"); wc.send('time-changed'); await sleep(250)
      check('ripresa del computer: aggiornamento immediato anche se l’ora torna indietro', await kpi() === '0', await kpi())
      await js("document.querySelectorAll('.nav-item')[1].click()"); await sleep(300)
      await js("window.__auditTime=new window.__realDate('2026-10-27T10:00:00').getTime();window.dispatchEvent(new Event('focus'));true"); await sleep(250)
      check('statistiche delle pratiche aggiornate a pagina aperta', await js("document.querySelector('.content').textContent.includes('2 in ritardo')"))
      const docFile = path.join(db.getDataDir(), 'Cliente-Sintetico-Rossi', 'ricorso-riservato.pdf')
      fs.mkdirSync(path.dirname(docFile)); fs.writeFileSync(docFile, 'sintetico')
      const doc = require('../electron/docfile').collega(pratica.id, docFile); fs.unlinkSync(docFile)
      await js(`window.mngmnt.invoke('documenti:open',${doc.id}).catch(e=>e.message)`)
      const log = fs.readFileSync(require('../electron/registro').percorso(), 'utf8')
      check('errore IPC del documento mancante senza nome del cliente o del file nel registro', !log.includes('Cliente-Sintetico-Rossi') && !log.includes('ricorso-riservato.pdf'))
    } catch (error) { check('scenario completato', false, error.stack) }
    finally {
      if (process.env.SMOKE_OUT) { fs.mkdirSync(process.env.SMOKE_OUT, { recursive: true }); fs.writeFileSync(path.join(process.env.SMOKE_OUT, 'risultati.json'), JSON.stringify(results, null, 2)) }
      console.log(`RISULTATO: ${results.filter(r => r.ok).length}/${results.length} controlli superati`)
      setTimeout(() => process.exit(results.length && results.every(r => r.ok) ? 0 : 1), 100)
    }
  })
}
module.exports = { attach }
