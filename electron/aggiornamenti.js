'use strict'
// Controllo FACOLTATIVO degli aggiornamenti, spento finché l'utente non lo attiva: TIO glielo chiede una volta (App.tsx),
// poi si cambia da Impostazioni › Backup e sicurezza › Aggiornamenti.
// Unica operazione di rete: una richiesta GET a api.github.com per leggere il numero dell'ultima versione pubblicata del progetto
// (nessun dato dell'archivio, nessun identificativo, nessun cookie). TIO non scarica e non installa nulla da solo:
// se c'è una versione nuova lo dice e apre la pagina di download nel browser, dove l'utente sceglie.

const MAX_BYTES = 1024 * 1024
const OGNI = 24 * 3600000 // dopo un controllo riuscito il successivo non prima di un giorno
const RIPROVA = 6 * 3600000 // dopo un errore (per esempio senza connessione) si riprova più tardi, non a ogni ora
const VERSIONE = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]{1,40}))?$/

/** Progetto GitHub dal campo `repository` di package.json: «github:utente/nome», «utente/nome» o l'indirizzo https di github.com. */
function progetto(repository) {
  const testo = typeof repository === 'string' ? repository : repository?.url || ''
  const m = String(testo).trim().match(/^(?:github:|(?:git\+)?https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/)
  if (!m || m[2] === '.' || m[2] === '..') return null
  return { utente: m[1], nome: m[2] }
}

/** Progetto configurato per questa copia di TIO (nei test si può indicare con MNGMNT_TEST_REPO). */
function progettoConfigurato() {
  if (process.env.MNGMNT_TEST && process.env.MNGMNT_TEST_REPO) return progetto(process.env.MNGMNT_TEST_REPO)
  try { return progetto(require('../package.json').repository) } catch { return null }
}

function analizza(v) {
  const m = VERSIONE.exec(String(v ?? '').trim())
  return m ? { numeri: [Number(m[1]), Number(m[2]), Number(m[3])], prova: m[4] ? m[4].split('.') : [] } : null
}

/** > 0 se `a` è più recente di `b` (regole semver: 1.4.0 è più recente di 1.4.0-beta.1, beta.10 di beta.2). */
function confronta(a, b) {
  const x = analizza(a), y = analizza(b)
  if (!x || !y) throw new Error('Numero di versione non riconosciuto')
  for (let i = 0; i < 3; i++) if (x.numeri[i] !== y.numeri[i]) return x.numeri[i] - y.numeri[i]
  if (!x.prova.length || !y.prova.length) return (y.prova.length ? 1 : 0) - (x.prova.length ? 1 : 0)
  for (let i = 0; i < Math.max(x.prova.length, y.prova.length); i++) {
    const p = x.prova[i], q = y.prova[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    const np = /^\d+$/.test(p), nq = /^\d+$/.test(q)
    if (np && nq && Number(p) !== Number(q)) return Number(p) - Number(q)
    if (np !== nq) return np ? -1 : 1
    if (p !== q) return p < q ? -1 : 1
  }
  return 0
}

function messaggioErrore(e) {
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return 'GitHub non ha risposto in tempo: riprova più tardi'
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(e?.cause?.code)) return 'GitHub non è raggiungibile: controlla la connessione a Internet'
  return e?.message || String(e)
}

async function leggiConLimite(res) {
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) { await res.body?.cancel(); throw new Error('Risposta di GitHub troppo grande') }
  if (!res.body) return ''
  const chunks = []; let bytes = 0
  const reader = res.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('Risposta di GitHub troppo grande') }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks, bytes).toString('utf8')
}

/** Una richiesta GET all'API di GitHub, con le stesse difese per ogni indirizzo: tempo massimo, solo api.github.com, risposta limitata. */
async function chiedi(url, versioneAttuale) {
  let res
  try {
    res = await globalThis.fetch(url, {
      method: 'GET', redirect: 'follow', credentials: 'omit', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': `TIO/${versioneAttuale}` },
    })
  } catch (e) { throw new Error(messaggioErrore(e)) }
  // un progetto rinominato risponde con un rinvio: si accetta solo se resta su api.github.com
  if (res.url && new URL(res.url).hostname !== 'api.github.com') { await res.body?.cancel(); throw new Error('Risposta da un indirizzo inatteso: controllo annullato') }
  if (res.status === 404) { await res.body?.cancel(); throw new Error('Su GitHub non c\'è ancora una versione pubblicata') }
  if (res.status === 403 || res.status === 429) { await res.body?.cancel(); throw new Error('GitHub ha limitato temporaneamente le richieste: riprova più tardi') }
  if (!res.ok) { await res.body?.cancel(); throw new Error(`GitHub ha risposto con errore HTTP ${res.status}`) }
  try { return JSON.parse(await leggiConLimite(res)) } catch (e) { throw new Error(/troppo grande/.test(e.message) ? e.message : 'Risposta di GitHub non leggibile') }
}

/**
 * Chiede a GitHub l'ultima versione pubblicata e la confronta con quella in uso. Chi usa una versione stabile riceve solo
 * le stabili (releases/latest esclude bozze e versioni di prova); chi usa una beta riceve anche le beta successive,
 * scelte fra le ultime versioni pubblicate (bozze escluse).
 */
async function ultimaVersione(prog, versioneAttuale) {
  const base = `https://api.github.com/repos/${prog.utente}/${prog.nome}/releases`
  let tag
  if (analizza(versioneAttuale)?.prova.length) {
    const elenco = await chiedi(`${base}?per_page=30`, versioneAttuale)
    if (!Array.isArray(elenco)) throw new Error('Risposta di GitHub non leggibile')
    const candidati = elenco.filter((x) => x && !x.draft && typeof x.tag_name === 'string' && analizza(x.tag_name.trim())).map((x) => x.tag_name.trim())
    if (!candidati.length) throw new Error('Su GitHub non c\'è ancora una versione pubblicata')
    tag = candidati.reduce((a, b) => (confronta(b, a) > 0 ? b : a))
  } else {
    const dati = await chiedi(`${base}/latest`, versioneAttuale)
    tag = typeof dati?.tag_name === 'string' ? dati.tag_name.trim() : ''
    if (!analizza(tag) || dati.draft || dati.prerelease) throw new Error('L\'ultima versione su GitHub ha un numero non riconosciuto')
  }
  const versione = tag.replace(/^v/, '')
  return {
    versione,
    nuova: confronta(versione, versioneAttuale) > 0,
    // l'indirizzo della pagina lo compone TIO: dalla risposta si prende solo il numero di versione
    pagina: `https://github.com/${prog.utente}/${prog.nome}/releases/tag/${encodeURIComponent(tag)}`,
  }
}

let ultimoTentativo = 0
let inCorso = null

/**
 * Controllo con le regole delle impostazioni. Automatico: solo se attivato, al massimo una volta al giorno (dopo un errore ogni 6 ore).
 * Manuale («Controlla ora»): subito, anche se il controllo automatico è spento, e gli errori arrivano all'interfaccia.
 * `salva` scrive nelle impostazioni, `avvisa` mostra la notifica di una versione nuova (una volta per versione).
 */
async function controlla({ settings, versione, prog = progettoConfigurato(), salva, avvisa, manuale = false, adesso = Date.now() }) {
  if (!manuale && settings.aggiornamenti_controllo !== true) return null
  if (!prog) { if (manuale) throw new Error('Il controllo sarà disponibile quando TIO verrà pubblicato su GitHub'); return null }
  if (!manuale) {
    const ultimo = Date.parse(settings.aggiornamenti_ultimo || '')
    if (Number.isFinite(ultimo) && adesso - ultimo < OGNI && ultimo <= adesso) return null
    if (ultimoTentativo && adesso - ultimoTentativo < RIPROVA) return null
  }
  if (inCorso) return inCorso
  ultimoTentativo = adesso
  inCorso = (async () => {
    try {
      const r = await ultimaVersione(prog, versione)
      salva({ aggiornamenti_ultimo: new Date(adesso).toISOString(), aggiornamenti_errore: null, aggiornamento: r.nuova ? { versione: r.versione, pagina: r.pagina } : null })
      // una notifica per versione, solo dal controllo automatico: con «Controlla ora» l'esito è già sullo schermo
      if (r.nuova && settings.aggiornamento_notificato !== r.versione) { if (!manuale) avvisa(r); salva({ aggiornamento_notificato: r.versione }) }
      return r
    } catch (e) {
      salva({ aggiornamenti_errore: e.message })
      if (manuale) throw e
      return null
    } finally { inCorso = null }
  })()
  return inCorso
}

const _azzera = () => { ultimoTentativo = 0; inCorso = null } // solo per i test

module.exports = { progetto, progettoConfigurato, analizza, confronta, ultimaVersione, controlla, _azzera, OGNI, RIPROVA }
