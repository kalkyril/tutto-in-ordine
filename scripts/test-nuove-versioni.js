'use strict'
// Controllo facoltativo degli aggiornamenti (electron/aggiornamenti.js): numeri di versione, risposta di GitHub, regole del controllo automatico.
// Nessuna rete: `fetch` è sostituito da risposte preparate qui.
const assert = require('node:assert/strict')
const a = require('../electron/aggiornamenti')
let n = 0; const ok = (t) => console.log(`ok ${++n} - ${t}`)

const PROG = { utente: 'studio', nome: 'tio' }
let chiamate = []
function risposta(corpo, { status = 200, url = 'https://api.github.com/repos/studio/tio/releases/latest', headers = {} } = {}) {
  const res = new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } })
  Object.defineProperty(res, 'url', { value: url })
  return res
}
const usa = (fn) => { chiamate = []; globalThis.fetch = async (url, init) => { chiamate.push({ url, init }); return fn(url, init) } }

;(async () => {
  assert.deepEqual(a.progetto('github:studio/tio'), PROG)
  assert.deepEqual(a.progetto('studio/tio'), PROG)
  assert.deepEqual(a.progetto({ type: 'git', url: 'git+https://github.com/studio/tio.git' }), PROG)
  for (const x of [undefined, '', 'gitlab:studio/tio', 'https://example.com/studio/tio', 'studio/../tio', 'studio/tio/altro', 'studio /tio']) assert.equal(a.progetto(x), null, String(x))
  ok('progetto letto da package.json solo se è davvero un indirizzo GitHub')

  const ordine = ['1.3.3', '1.4.0-alpha', '1.4.0-beta.1', '1.4.0-beta.2', '1.4.0-beta.10', '1.4.0-rc.1', '1.4.0', '1.4.1', '1.10.0', '2.0.0']
  for (let i = 1; i < ordine.length; i++) assert.ok(a.confronta(ordine[i], ordine[i - 1]) > 0, `${ordine[i]} > ${ordine[i - 1]}`)
  assert.equal(a.confronta('v1.4.0', '1.4.0'), 0)
  assert.throws(() => a.confronta('1.4', '1.4.0'))
  ok('numeri di versione confrontati come semver: la stabile supera la beta, beta.10 supera beta.2, 1.10 supera 1.4')

  usa(() => risposta({ tag_name: 'v1.4.0', html_url: 'https://truffa.example/scarica', draft: false, prerelease: false }))
  let r = await a.ultimaVersione(PROG, '1.3.3')
  assert.deepEqual(r, { versione: '1.4.0', nuova: true, pagina: 'https://github.com/studio/tio/releases/tag/v1.4.0' })
  assert.equal(chiamate.length, 1); assert.equal(chiamate[0].url, 'https://api.github.com/repos/studio/tio/releases/latest')
  assert.equal(chiamate[0].init.method, 'GET'); assert.equal(chiamate[0].init.headers['User-Agent'], 'TIO/1.3.3'); assert.equal(chiamate[0].init.credentials, 'omit')
  ok('versione nuova riconosciuta; la pagina di download la compone TIO e ignora l\'indirizzo arrivato da GitHub')

  r = await a.ultimaVersione(PROG, '1.4.0'); assert.equal(r.nuova, false)
  r = await a.ultimaVersione(PROG, '1.5.0'); assert.equal(r.nuova, false)
  ok('stessa versione o versione in uso più recente: nessun aggiornamento proposto')

  const ELENCO = 'https://api.github.com/repos/studio/tio/releases?per_page=30'
  const elenco = (...tag) => () => risposta(tag.map((t) => (typeof t === 'string' ? { tag_name: t, prerelease: t.includes('-'), draft: false } : t)), { url: ELENCO })
  usa(elenco('v1.4.0-beta.5', 'v1.4.0-beta.6', { tag_name: 'v1.4.0-beta.9', draft: true }, '<script>', 'v1.3.3'))
  r = await a.ultimaVersione(PROG, '1.4.0-beta.5')
  assert.deepEqual(r, { versione: '1.4.0-beta.6', nuova: true, pagina: 'https://github.com/studio/tio/releases/tag/v1.4.0-beta.6' })
  assert.equal(chiamate.length, 1); assert.equal(chiamate[0].url, ELENCO)
  usa(elenco('v1.4.0-beta.6', 'v1.4.0', 'v1.4.0-beta.10'))
  assert.equal((await a.ultimaVersione(PROG, '1.4.0-beta.5')).versione, '1.4.0')
  usa(elenco('v1.4.0-beta.5'))
  assert.equal((await a.ultimaVersione(PROG, '1.4.0-beta.5')).nuova, false)
  usa(elenco()); await assert.rejects(a.ultimaVersione(PROG, '1.4.0-beta.5'), /non c'è ancora una versione pubblicata/)
  usa(() => risposta({ tag_name: 'v9.9.9' }, { url: ELENCO })); await assert.rejects(a.ultimaVersione(PROG, '1.4.0-beta.5'), /non leggibile/)
  ok('chi usa una beta riceve anche le beta successive (bozze escluse) e la stabile quando esce; chi usa una stabile solo le stabili')

  const errore = async (fn, re) => { usa(fn); await assert.rejects(a.ultimaVersione(PROG, '1.4.0'), re) }
  await errore(() => risposta({ message: 'Not Found' }, { status: 404 }), /non c'è ancora una versione pubblicata/)
  await errore(() => risposta({}, { status: 403 }), /limitato temporaneamente/)
  await errore(() => risposta({}, { status: 500 }), /HTTP 500/)
  await errore(() => risposta({ tag_name: 'v9.9.9' }, { url: 'https://altro.example/x' }), /indirizzo inatteso/)
  await errore(() => risposta({ tag_name: 'v9.9.9', prerelease: true }), /non riconosciuto/)
  await errore(() => risposta({ tag_name: '<script>' }), /non riconosciuto/)
  await errore(() => risposta('non è json'), /non leggibile/)
  await errore(() => risposta('x'.repeat(10), { headers: { 'content-length': String(5 * 1024 * 1024) } }), /troppo grande/)
  await errore(() => risposta(JSON.stringify({ tag_name: 'v9.9.9', body: 'x'.repeat(2 * 1024 * 1024) })), /troppo grande/)
  await errore(() => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }) }, /controlla la connessione/)
  ok('errori di GitHub, rinvii verso altri siti, versioni di prova, risposte illeggibili o enormi e assenza di rete gestiti con messaggi chiari')

  const giorno = 24 * 3600000, ADESSO = Date.parse('2026-10-22T10:00:00Z')
  const prova = async (settings, opzioni = {}) => {
    a._azzera(); const salvate = [], avvisi = []
    const esito = await a.controlla({ settings, versione: '1.3.3', prog: PROG, salva: (p) => salvate.push(p), avvisa: (x) => avvisi.push(x), adesso: ADESSO, ...opzioni })
    return { esito, salvate, avvisi }
  }
  usa(() => risposta({ tag_name: 'v1.4.0' }))
  let p = await prova({ aggiornamenti_controllo: false })
  assert.equal(p.esito, null); assert.equal(chiamate.length, 0)
  p = await prova({})
  assert.equal(p.esito, null); assert.equal(chiamate.length, 0)
  ok('spento di default: senza il consenso il controllo automatico non fa nessuna richiesta')

  p = await prova({ aggiornamenti_controllo: true, aggiornamenti_ultimo: new Date(ADESSO - giorno / 2).toISOString() })
  assert.equal(p.esito, null); assert.equal(chiamate.length, 0)
  p = await prova({ aggiornamenti_controllo: true, aggiornamenti_ultimo: new Date(ADESSO - giorno - 1).toISOString() })
  assert.equal(chiamate.length, 1); assert.equal(p.esito.nuova, true)
  assert.deepEqual(p.salvate[0], { aggiornamenti_ultimo: new Date(ADESSO).toISOString(), aggiornamenti_errore: null, aggiornamento: { versione: '1.4.0', pagina: 'https://github.com/studio/tio/releases/tag/v1.4.0' } })
  assert.equal(p.avvisi.length, 1); assert.deepEqual(p.salvate[1], { aggiornamento_notificato: '1.4.0' })
  ok('attivato: al massimo una richiesta al giorno; una versione nuova viene salvata e notificata')

  p = await prova({ aggiornamenti_controllo: true, aggiornamento_notificato: '1.4.0' })
  assert.equal(p.avvisi.length, 0)
  p = await prova({}, { manuale: true })
  assert.equal(p.esito.nuova, true); assert.equal(p.avvisi.length, 0); assert.deepEqual(p.salvate[1], { aggiornamento_notificato: '1.4.0' })
  ok('una sola notifica per versione; «Controlla ora» funziona anche a controllo spento e non aggiunge notifiche')

  usa(() => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'EAI_AGAIN' } }) })
  p = await prova({ aggiornamenti_controllo: true })
  assert.equal(p.esito, null); assert.match(p.salvate[0].aggiornamenti_errore, /connessione/)
  const dopoErrore = await a.controlla({ settings: { aggiornamenti_controllo: true }, versione: '1.4.0-beta.1', prog: PROG, salva: () => {}, avvisa: () => {}, adesso: ADESSO + 3600000 })
  assert.equal(dopoErrore, null); assert.equal(chiamate.length, 1)
  await a.controlla({ settings: { aggiornamenti_controllo: true }, versione: '1.4.0-beta.1', prog: PROG, salva: () => {}, avvisa: () => {}, adesso: ADESSO + a.RIPROVA + 1 })
  assert.equal(chiamate.length, 2)
  a._azzera()
  await assert.rejects(a.controlla({ settings: {}, versione: '1.4.0-beta.1', prog: PROG, salva: () => {}, avvisa: () => {}, manuale: true }), /connessione/)
  ok('senza rete: errore salvato, nuovo tentativo automatico dopo 6 ore; con «Controlla ora» l\'errore arriva all\'interfaccia')

  usa(() => risposta({ tag_name: 'v1.4.0' }))
  p = await prova({ aggiornamenti_controllo: true }, { prog: null })
  assert.equal(p.esito, null); assert.equal(chiamate.length, 0)
  a._azzera()
  await assert.rejects(a.controlla({ settings: {}, versione: '1.4.0-beta.1', prog: null, salva: () => {}, avvisa: () => {}, manuale: true }), /quando TIO verrà pubblicato/)
  ok('senza indirizzo GitHub nel progetto nessuna richiesta, e «Controlla ora» spiega perché')

  console.log(`\n${n} prove sul controllo degli aggiornamenti superate`)
})().catch((e) => { console.error(e); process.exit(1) })
