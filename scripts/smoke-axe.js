'use strict'
// Dettaglio delle violazioni di accessibilità (contrasti, nomi accessibili) per correggerle. Avvio: sh scripts/run-smoke.sh <cartella> smoke-axe
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
const pad = (n) => String(n).padStart(2, '0')
const iso = (dd, h = 9) => { const x = new Date(); x.setDate(x.getDate() + dd); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(h)}:00` }

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const js = (c) => wc.executeJavaScript(c, true)
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, studio: { nome: 'Studio Prova', titolare: 'Avv. Prova', intestazione: '', indirizzo: '', cap_citta: '', piva: '', cf: '', email: '', pec: '', telefono: '', iban: '', domicilio_fiscale: '', banca: '' } })
      const cli = db.save('anagrafica', { denominazione: 'Mario Rossi', ruolo: 'cliente', email: 'm@x.it', telefono: '333' })
      const p = db.save('pratiche', { numero: '2026/001', titolo: 'Rossi c. Bianchi', cliente_id: cli.id, tipo: 'Civile', stato: 'In corso', colore: '#ef4444', preferita: 1, autorita: 'Tribunale', rg: '1/2026', valore: 1000 })
      db.save('pratiche', { numero: '2026/002', titolo: 'Locazione', stato: 'Aperta', colore: '#10b981' })
      db.save('scadenze', { pratica_id: p.id, titolo: 'Udienza', tipo: 'udienza', data_ora: iso(0, 23), promemoria: [60] }); db.save('scadenze', { pratica_id: p.id, titolo: 'Termine scaduto', data_ora: iso(-3), tutto_il_giorno: 1, promemoria: [] })
      db.save('todos', { pratica_id: p.id, titolo: 'Memoria', scadenza: iso(2), priorita: 2, promemoria_min: 60 }); db.save('note', { pratica_id: p.id, testo: 'nota' }); db.save('link', { titolo: 'Normattiva', url: 'https://www.normattiva.it', categoria: 'Normativa' })
      db.save('ore', { pratica_id: p.id, data: iso(-1).slice(0, 10), minuti: 60, descrizione: 'studio', tariffa_oraria: 100 }); db.saveParcella({ data: iso(0).slice(0, 10), cliente_id: cli.id, pratica_id: p.id, stato: 'emessa', voci: [{ tipo: 'compenso', descrizione: 'x', quantita: 1, importo: 500 }] })
      db.getDb().exec("INSERT INTO notifiche(titolo,corpo,tipo) VALUES('Udienza oggi','corpo','udienza')")
      wc.send('data-changed', db.TABLES); await sleep(1500)
      const axeSrc = fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8'); await js(axeSrc + '; true')
      const contrasti = {}, nomi = {}, altri = {}
      const analizza = async (et, tema) => {
        const r = await js(`axe.run(document, { resultTypes: ['violations'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ t: n.target.join(' '), h: n.html.slice(0, 140), d: (n.any[0] && n.any[0].data) || (n.all[0] && n.all[0].data) || null })) })))`)
        for (const v of r) {
          if (v.id === 'color-contrast') for (const n of v.nodes) { const k = n.d ? `${tema} ${n.d.fgColor} su ${n.d.bgColor} = ${n.d.contrastRatio} (serve ${n.d.expectedContrastRatio})` : `${tema} ?`; (contrasti[k] = contrasti[k] || { n: 0, es: new Set() }).n++; if (contrasti[k].es.size < 3) contrasti[k].es.add(`${et}: ${n.t} ${n.h.replace(/\s+/g, ' ').slice(0, 90)}`) }
          else if (v.id === 'label-content-name-mismatch') for (const n of v.nodes) { const k = n.h.replace(/\s+/g, ' ').slice(0, 130); nomi[k] = (nomi[k] || 0) + 1 }
          else if (v.impact !== 'minor') for (const n of v.nodes) { const k = `${v.id} :: ${n.t} :: ${n.h.replace(/\s+/g, ' ').slice(0, 90)}`; altri[k] = (altri[k] || 0) + 1 }
        }
      }
      for (const tema of ['chiaro', 'scuro']) {
        db.setSettings({ tema }); wc.send('data-changed', ['settings']); await sleep(900)
        for (const nav of ['Panoramica', 'Pratiche', 'Agenda', 'Compiti', 'Anagrafica', 'Parcelle', 'Collegamenti', 'Impostazioni']) { await clickText('.nav-item', nav); await sleep(600); await analizza(nav, tema) }
        await clickText('.tabs button', 'Modello PDF'); await sleep(500); await analizza('ModelloPDF', tema)
        await clickText('.nav-item', 'Pratiche'); await sleep(400); await js(`document.querySelector('.pcard h2').click()`); await sleep(600); await analizza('Dettaglio', tema)
        for (const tab of ['Compiti', 'Scadenze', 'Attività e spese', 'Note']) { await clickText('.tabs button', tab); await sleep(400); await analizza('Dettaglio ' + tab, tema) }
        await clickText('.nav-item', 'Parcelle'); await sleep(400); await clickText('button', 'Nuovo documento'); await sleep(2500); await analizza('Editor', tema); await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(300)
        await js(`document.querySelector('.bell-btn').click()`); await sleep(400); await analizza('Notifiche', tema); await js(`document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))`)
      }
      // colori principali estremi scelti dall'utente
      for (const colore of ['#facc15', '#f5f5f5', '#111111', '#ff00ff', '#00ffff', '#7f7f7f']) {
        db.setSettings({ brand_colore: colore })
        for (const tema of ['chiaro', 'scuro']) {
          db.setSettings({ tema }); wc.send('data-changed', ['settings']); await sleep(700)
          for (const nav of ['Panoramica', 'Pratiche', 'Agenda', 'Impostazioni']) { await clickText('.nav-item', nav); await sleep(450); await analizza(`${nav} [${colore}]`, tema) }
          await clickText('.nav-item', 'Parcelle'); await sleep(300); await clickText('button', 'Nuovo documento'); await sleep(2200); await analizza(`Editor [${colore}]`, tema); await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await require('./smoke-ui').discardAfterEscape(js); await sleep(250)
        }
      }
      db.setSettings({ brand_colore: '#4338ca' })
      console.log('=== CONTRASTI ===')
      for (const [k, v] of Object.entries(contrasti).sort((a, b) => b[1].n - a[1].n).slice(0, 40)) console.log(`${v.n}x ${k}\n     ${[...v.es].join('\n     ')}`)
      console.log('=== NOMI ACCESSIBILI INCOERENTI ===')
      for (const [k, n] of Object.entries(nomi).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${n}x ${k}`)
      console.log('=== ALTRO ===')
      for (const [k, n] of Object.entries(altri).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`${n}x ${k}`)
    } catch (e) { console.log('ERRORE', e) } finally { setTimeout(() => process.exit(0), 300) }
  })
}
module.exports = { attach }
