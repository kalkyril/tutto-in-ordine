'use strict'
// Blocco dell'applicazione con password. La password non è mai salvata: solo un'impronta scrypt con sale casuale, in un file a parte
// (non finisce nei backup). Attenzione: il blocco impedisce l'uso dell'app, ma il file dei dati NON è cifrato: per proteggerlo
// da chi ha accesso al computer serve la cifratura del disco (FileVault, BitLocker, LUKS).
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const MIN_LUNGHEZZA = 6
let file = null
let bloccato = false
let falliti = 0
let nonPrima = 0 // istante prima del quale non si accettano nuovi tentativi (rallenta chi prova a indovinare)

function init(dir) { file = path.join(dir, 'blocco.json'); falliti = 0; nonPrima = 0; bloccato = attivo() } // all'avvio, se c'è una password, l'app parte bloccata
function leggi() {
  if (!file || !fs.existsSync(file)) return null
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!j || !/^[0-9a-f]{64}$/.test(j.hash) || !/^[0-9a-f]{32}$/.test(j.sale) || !Number.isFinite(j.minuti)) throw new Error()
    return j
  } catch { return { errore: 'La configurazione del blocco è danneggiata. Ripristina blocco.json da una copia sicura o contatta l’assistenza; l’accesso ai dati resta bloccato.', minuti: 0 } }
}
const impronta = (password, sale) => crypto.scryptSync(String(password), Buffer.from(sale, 'hex'), 32, { N: 16384, r: 8, p: 1 })

function attivo() { return !!leggi() }
function stato() { const c = leggi(); return { attivo: !!c, bloccato: !!c && (bloccato || !!c.errore), minuti: c ? c.minuti : 0, ...(c?.errore ? { errore: c.errore } : {}) } }
function scrivi(password, minuti) {
  const sale = crypto.randomBytes(16).toString('hex')
  const temporary = file + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify({ sale, hash: impronta(password, sale).toString('hex'), minuti: Math.min(480, Math.max(0, Math.round(Number(minuti) || 0))) }), { mode: 0o600 })
  fs.renameSync(temporary, file)
}
function verifica(password, adesso = Date.now()) {
  const c = leggi(); if (!c) return true
  if (c.errore) throw new Error(c.errore)
  if (adesso < nonPrima) throw new Error(`Troppi tentativi: riprova tra ${Math.ceil((nonPrima - adesso) / 1000)} secondi`)
  const ok = crypto.timingSafeEqual(impronta(password, c.sale), Buffer.from(c.hash, 'hex'))
  if (ok) { falliti = 0; nonPrima = 0 } else { falliti++; nonPrima = adesso + Math.min(30000, 1000 * 2 ** Math.min(falliti - 1, 5)) }
  return ok
}

function imposta(nuova, minuti, vecchia) {
  if (String(nuova || '').length < MIN_LUNGHEZZA) throw new Error(`La password deve avere almeno ${MIN_LUNGHEZZA} caratteri`)
  if (attivo() && !verifica(vecchia)) throw new Error('Password attuale errata')
  scrivi(nuova, minuti)
}
function cambiaMinuti(minuti, password) {
  if (!attivo()) throw new Error('Il blocco non è attivo')
  if (!verifica(password)) throw new Error('Password errata')
  const c = leggi(); fs.writeFileSync(file, JSON.stringify({ ...c, minuti: Math.min(480, Math.max(0, Math.round(Number(minuti) || 0))) }), { mode: 0o600 })
}
function rimuovi(password) {
  if (!attivo()) return
  if (!verifica(password)) throw new Error('Password errata')
  fs.rmSync(file, { force: true }); bloccato = false
}
function blocca() { if (attivo()) bloccato = true; return stato() }
function sblocca(password) { if (!verifica(password)) return false; bloccato = false; return true }
const èBloccato = () => !!leggi()?.errore || (bloccato && attivo())

module.exports = { init, attivo, stato, imposta, cambiaMinuti, rimuovi, blocca, sblocca, verifica, èBloccato, MIN_LUNGHEZZA }
