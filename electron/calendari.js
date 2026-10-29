'use strict'
// Calendari esterni collegati in SOLA LETTURA.
// Unica operazione di rete: una richiesta HTTP GET all'indirizzo del calendario indicato dall'utente (nessun corpo, nessuna credenziale,
// nessuna autenticazione OAuth). L'app non scrive, non modifica e non cancella nulla nel servizio esterno.
const db = require('./db')
const ical = require('./ical')
const fs = require('node:fs')
const { fileURLToPath, pathToFileURL } = require('node:url')

const MAX_BYTES = 25 * 1024 * 1024
const UA = 'TIO/1.0 (lettura calendario)'

// link che si confondono facilmente con quello giusto: si spiega quale copiare invece di provare a leggerli
const GOOGLE_ICAL = 'In Google Calendar (dal computer) apri ⚙ Impostazioni › nella colonna a sinistra il tuo calendario › Integra il calendario, e copia «Indirizzo segreto in formato iCal» (termina con basic.ics) senza cliccarlo.'
function linkSbagliato(url) {
  if (/(^|\.)calendar\.google\.com$/i.test(url.hostname) && !/\.ics$/i.test(url.pathname)) return `Questo è il link per condividere o incorporare il calendario Google, non quello da usare qui. ${GOOGLE_ICAL}`
  if (/(^|\.)(outlook\.office365\.com|outlook\.live\.com|outlook\.office\.com)$/i.test(url.hostname) && /\.html?$/i.test(url.pathname)) return 'Questo è il link HTML del calendario di Outlook: copia invece il link ICS (termina con .ics) dalla stessa pagina «Pubblica un calendario».'
  return null
}

/** webcal:// → https://; accetta http(s) e, per i file .ics scelti dall'utente, file:// */
function normalizzaUrl(u) {
  let t = String(u ?? '').trim()
  if (/^webcals?:\/\//i.test(t)) t = t.replace(/^webcals:\/\//i, 'https://').replace(/^webcal:\/\//i, 'https://')
  let url
  try { url = new URL(t) } catch { throw new Error('Indirizzo non valido: incolla il link del calendario (inizia con https:// o webcal://)') }
  if (url.protocol === 'file:') return url.toString()
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Sono consentiti solo indirizzi http, https o webcal')
  const sbagliato = linkSbagliato(url)
  if (sbagliato) throw new Error(sbagliato)
  return url.toString()
}
const fileDaUrl = (u) => fileURLToPath(u)
const urlDaFile = (percorso) => pathToFileURL(percorso).toString()

function messaggioErrore(e) {
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return 'Il servizio non ha risposto in tempo'
  if (e?.cause?.code === 'ENOTFOUND' || e?.cause?.code === 'EAI_AGAIN') return 'Indirizzo non raggiungibile: controlla la connessione a Internet'
  if (e?.cause?.code === 'ECONNREFUSED') return 'Connessione rifiutata dal servizio'
  return e?.message || String(e)
}

/** Calendario da un file .ics scelto dall'utente: si rilegge a ogni aggiornamento (se il file è cambiato). */
function leggiFile(url, etag) {
  const percorso = fileDaUrl(url)
  let st
  try { st = fs.statSync(percorso) } catch { throw new Error('File del calendario non trovato: forse è stato spostato o cancellato. Scegli di nuovo il file .ics') }
  if (!st.isFile()) throw new Error('Il percorso indicato non è un file .ics')
  if (st.size > MAX_BYTES) throw new Error('Il calendario è troppo grande (oltre 25 MB)')
  const firma = `file-${st.size}-${Math.round(st.mtimeMs)}`
  if (etag && etag === firma) return { notModified: true, etag }
  return { testo: fs.readFileSync(percorso, 'utf8'), etag: firma }
}

/** Scarica il calendario con una sola richiesta GET (o rilegge il file .ics scelto). Restituisce { testo, etag, notModified }. */
async function scarica(url, etag) {
  if (/^file:/i.test(url)) return leggiFile(url, etag)
  const headers = { 'User-Agent': UA, Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5' }
  if (etag) headers['If-None-Match'] = etag
  const res = await fetch(normalizzaUrl(url), { method: 'GET', headers, redirect: 'follow', signal: AbortSignal.timeout(20000) })
  if (res.status === 304) return { notModified: true, etag }
  if (res.status === 401 || res.status === 403) throw new Error(`Accesso negato (HTTP ${res.status}): il link potrebbe essere scaduto o non più valido, genera un nuovo link di esportazione`)
  if (res.status === 404 || res.status === 410) throw new Error(`Calendario non trovato (HTTP ${res.status}): il link non è più valido`)
  if (!res.ok) throw new Error(`Il servizio ha risposto con errore HTTP ${res.status}`)
  const lunghezza = Number(res.headers.get('content-length') || 0)
  if (lunghezza > MAX_BYTES) { await res.body?.cancel(); throw new Error('Il calendario è troppo grande (oltre 25 MB)') }
  const chunks = []; let bytes = 0
  if (res.body) {
    const reader = res.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('Il calendario è troppo grande (oltre 25 MB)') }
        chunks.push(Buffer.from(value))
      }
    } finally { reader.releaseLock() }
  }
  const buf = Buffer.concat(chunks, bytes)
  return { testo: buf.toString('utf8'), etag: res.headers.get('etag') || null }
}

const pad = (n) => String(n).padStart(2, '0')
function finestra(adesso = new Date()) {
  const da = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() - 40)
  const a = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() + 400, 23, 59)
  return { da, a }
}
const oggiStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Prova un indirizzo senza salvare nulla: restituisce numero di eventi e alcuni esempi. */
async function prova(url, adesso = new Date()) {
  const { testo } = await scarica(url)
  const { da, a } = finestra(adesso)
  const occ = ical.occorrenze(testo, da, a)
  const futuri = occ.filter((o) => o.inizio.slice(0, 10) >= oggiStr(adesso))
  return { totali: occ.length, futuri: futuri.length, esempi: futuri.slice(0, 5).map((o) => ({ titolo: o.titolo, inizio: o.inizio, luogo: o.luogo })) }
}

/**
 * Aggiorna gli eventi locali di un calendario con il contenuto del feed.
 * Gli eventi passati non vengono mai cancellati (storico); quelli futuri non più presenti nel feed vengono rimossi.
 * In caso di errore i dati già importati restano intatti.
 */
async function sincronizza(id, adesso = new Date()) {
  const cal = db.get('calendari', id)
  if (!cal) throw new Error('Calendario non trovato')
  const d = db.getDb()
  const corrente = () => db.getDb() === d && db.get('calendari', id)?.url === cal.url && db.get('calendari', id)?.etag === cal.etag
  const registra = (campi) => { db.save('calendari', { id, ...campi }) }
  const stamp = `${oggiStr(adesso)} ${pad(adesso.getHours())}:${pad(adesso.getMinutes())}:${pad(adesso.getSeconds())}`
  registra({ ultimo_tentativo: stamp }) // serve alla pianificazione: dopo un errore si riprova dopo 5 minuti, non a ogni controllo
  try {
    const r = await scarica(cal.url, cal.etag)
    if (!corrente()) return { annullato: true, nuovi: 0, aggiornati: 0, rimossi: 0, totali: 0 }
    if (r.notModified) { registra({ ultimo_sync: stamp, ultimo_esito: 'ok', ultimo_errore: null }); return { nuovi: 0, aggiornati: 0, rimossi: 0, totali: cal.n_eventi, invariato: true } }
    const { da, a } = finestra(adesso)
    const occ = ical.occorrenze(r.testo, da, a)       // lancia errore se non è un calendario completo: nessuna modifica ai dati
    const esistenti = new Map(db.list('eventi_esterni', { calendario_id: id }).map((e) => [e.chiave, e]))
    const nuoveChiavi = new Set(occ.map((o) => o.chiave))
    let nuovi = 0, aggiornati = 0, rimossi = 0
    db.transaction(() => {
      for (const o of occ) {
        const e = esistenti.get(o.chiave)
        if (!e) { db.save('eventi_esterni', { calendario_id: id, ...o }); nuovi++ } else if (e.titolo !== o.titolo || e.descrizione !== o.descrizione || e.luogo !== o.luogo || e.inizio !== o.inizio || e.fine !== o.fine || e.tutto_il_giorno !== o.tutto_il_giorno) {
          db.save('eventi_esterni', { id: e.id, titolo: o.titolo, descrizione: o.descrizione, luogo: o.luogo, inizio: o.inizio, fine: o.fine, tutto_il_giorno: o.tutto_il_giorno }); aggiornati++
        }
      }
      const oggi = oggiStr(adesso)
      for (const [chiave, e] of esistenti) if (!nuoveChiavi.has(chiave) && e.inizio.slice(0, 10) >= oggi) { db.remove('eventi_esterni', e.id); rimossi++ }
      const totali = d.prepare('SELECT COUNT(*) c FROM eventi_esterni WHERE calendario_id = ?').get(id).c
      registra({ ultimo_sync: stamp, ultimo_esito: 'ok', ultimo_errore: null, etag: r.etag, n_eventi: totali })
    })
    const pratiche = praticheAutomatiche(id)
    return { nuovi, aggiornati, rimossi, totali: d.prepare('SELECT COUNT(*) c FROM eventi_esterni WHERE calendario_id = ?').get(id).c, pratiche }
  } catch (e) {
    if (!corrente()) return { annullato: true, nuovi: 0, aggiornati: 0, rimossi: 0, totali: 0 }
    const msg = messaggioErrore(e)
    registra({ ultimo_esito: 'errore', ultimo_errore: msg })
    throw new Error(msg)
  }
}

/** Se per il calendario è attiva la creazione delle pratiche, crea quelle nuove riconosciute negli eventi e lo dice nel campanello. */
function praticheAutomatiche(id) {
  try {
    const esito = require('./pratiche-da-eventi').applicaAutomatico(id)
    if (esito?.create.length) {
      const cal = db.get('calendari', id)
      require('./alerts').pushNotifiche([{ tipo: 'riepilogo', titolo: esito.create.length === 1 ? `Nuova pratica dal calendario «${cal.nome}»` : `${esito.create.length} nuove pratiche dal calendario «${cal.nome}»`, corpo: esito.create.slice(0, 5).join('\n') + (esito.create.length > 5 ? '\n…' : '') }])
    }
    return esito
  } catch (e) { console.error('Pratiche dal calendario:', e.message); return null } // un problema qui non deve bloccare il calendario
}

/** Aggiorna i calendari attivi per cui è trascorso l'intervallo scelto. Restituisce gli id dei calendari per cui è stato fatto un tentativo. */
async function sincronizzaScaduti(adesso = new Date(), forza = false) {
  const fatti = [], archive = db.getDb()
  for (const c of db.list('calendari', { attivo: 1 })) {
    if (db.getDb() !== archive) break
    const ultimo = c.ultimo_tentativo ? new Date(c.ultimo_tentativo.replace(' ', 'T')) : null
    // dopo un errore si riprova dopo 5 minuti, altrimenti secondo l'intervallo scelto
    const attesaMin = c.ultimo_esito === 'errore' ? 5 : c.intervallo_min
    if (!forza && ultimo && adesso.getTime() - ultimo.getTime() < attesaMin * 60000) continue
    fatti.push(c.id) // tentativo effettuato (anche se fallisce, l'esito è registrato nel calendario)
    try { await sincronizza(c.id, adesso) } catch { /* l'errore è registrato nel calendario */ }
  }
  return fatti
}

module.exports = { normalizzaUrl, scarica, prova, sincronizza, sincronizzaScaduti, finestra, fileDaUrl, urlDaFile }
