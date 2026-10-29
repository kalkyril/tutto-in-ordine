'use strict'
// Calendari esterni collegati: SOLA LETTURA (una richiesta GET all'indirizzo indicato; nulla viene scritto all'esterno).
const { dialog } = require('electron')
const path = require('node:path')
const db = require('../db')
const calendari = require('../calendari')
const praticheDaEventi = require('../pratiche-da-eventi')

module.exports = function registra({ handle, changed, getWindow, scelti, autorizza }) {
  // un file locale si può leggere solo se l'utente l'ha scelto con la finestra di sistema (o se era già quello del calendario)
  const urlConsentito = (url, id) => {
    if (!/^file:/i.test(url)) return url
    if (id && db.get('calendari', id)?.url === url) return url
    autorizza(calendari.fileDaUrl(url)); return url
  }
  const campiCalendario = (o) => {
    const nome = String(o.nome || '').trim(); if (!nome) throw new Error('Dai un nome al calendario')
    const url = urlConsentito(calendari.normalizzaUrl(o.url), o.id)
    const intervallo = Math.min(1440, Math.max(5, Number(o.intervallo_min) || 30))
    const prom = (Array.isArray(o.promemoria) ? o.promemoria : []).map(Number).filter((m) => Number.isFinite(m) && m >= 0 && m <= 60 * 24 * 30)
    return { nome, url, colore: /^#[0-9a-f]{6}$/i.test(o.colore || '') ? o.colore : '#0ea5e9', attivo: o.attivo === 0 || o.attivo === false ? 0 : 1, intervallo_min: intervallo, promemoria: [...new Set(prom)] }
  }
  handle('calendari:salva', async (o) => {
    const dati = campiCalendario(o)
    const cambiaUrl = o.id && db.get('calendari', o.id)?.url !== dati.url
    const salvato = db.save('calendari', { ...(o.id ? { id: o.id } : {}), ...dati, ...(cambiaUrl ? { etag: null } : {}) })
    changed('calendari')
    if (salvato.attivo) { try { await calendari.sincronizza(salvato.id) } catch { /* l'errore resta registrato nel calendario */ } changed('calendari', 'eventi_esterni', 'pratiche', 'notifiche') }
    return db.get('calendari', salvato.id)
  })
  handle('calendari:elimina', (id) => { db.remove('calendari', id); changed('calendari', 'eventi_esterni'); return true })
  handle('calendari:sincronizza', async (id) => {
    if (id) { try { return await calendari.sincronizza(id) } finally { changed('calendari', 'eventi_esterni', 'pratiche', 'notifiche') } }
    const fatti = await calendari.sincronizzaScaduti(new Date(), true); changed('calendari', 'eventi_esterni', 'pratiche', 'notifiche'); return { calendari: fatti.length }
  })
  handle('calendari:prova', (url) => calendari.prova(urlConsentito(calendari.normalizzaUrl(url))))
  // file .ics già scaricato (per esempio da Google Calendar): si collega come un link e si rilegge a ogni aggiornamento
  handle('calendari:scegliFile', async () => {
    let file = process.env.MNGMNT_TEST_ICS_FILE
    if (!file) {
      const r = await dialog.showOpenDialog(getWindow(), { title: 'Scegli il file del calendario (.ics)', properties: ['openFile'], filters: [{ name: 'Calendario iCal', extensions: ['ics'] }] })
      if (r.canceled) return null
      file = r.filePaths[0]
    }
    scelti.add(file)
    return { url: calendari.urlDaFile(file), nome: path.basename(file, path.extname(file)) }
  })
  // pratiche riconosciute negli eventi (es. Cliens Cube): anteprima senza modifiche, poi importazione delle scelte
  handle('calendari:anteprimaPratiche', (id) => praticheDaEventi.anteprima(Number(id)))
  handle('calendari:importaPratiche', (id, scelte, automatico) => {
    id = Number(id)
    if (!db.get('calendari', id)) throw new Error('Calendario non trovato')
    const pulite = Object.fromEntries(Object.entries(scelte && typeof scelte === 'object' ? scelte : {}).map(([k, v]) => [String(k), !!v]))
    db.save('calendari', { id, crea_pratiche: automatico ? 1 : 0 })
    const esito = praticheDaEventi.applica(id, pulite)
    changed('pratiche', 'eventi_esterni', 'calendari')
    return esito
  })
  handle('eventi:collega', (id, praticaId) => { db.save('eventi_esterni', { id, pratica_id: praticaId || null }); changed('eventi_esterni'); return true })
}
