'use strict'
// Controllo delle dipendenze per la CI, al posto di `npm audit --audit-level=high`.
//
// Regole:
//  1. nelle dipendenze dell'app installata (`npm audit --omit=dev`) nessuna vulnerabilità alta o critica, senza eccezioni;
//  2. negli strumenti di sviluppo e di compilazione (vite, electron-builder…) le vulnerabilità alte o critiche bloccano,
//     tranne gli avvisi elencati qui sotto: ognuno con il motivo e una scadenza. Un'eccezione scaduta blocca di nuovo,
//     così non resta dimenticata; un avviso che arriva a toccare l'app installata blocca comunque (regola 1).
//
// Uso: node scripts/controlla-audit.js
const { execSync } = require('node:child_process')

const ECCEZIONI = [
  {
    avviso: 'GHSA-fc5q-39xc-vjpf', pacchetto: 'picomatch', scade: '2027-01-31',
    motivo: 'ReDoS con schemi glob scelti da chi attacca; picomatch serve solo a vite durante la compilazione, con schemi del progetto. ' +
      'A novembre 2026 nessuna versione corretta: tutte le versioni fino alla 4.0.7 (l’ultima) sono coinvolte.',
  },
]

const audit = (...arg) => {
  // npm audit esce con codice diverso da zero quando trova qualcosa: il JSON arriva lo stesso
  let testo
  // un comando unico (argomenti fissi, nessun dato esterno): funziona uguale su macOS e Windows
  try { testo = execSync(['npm audit --json', ...arg].join(' '), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }) } catch (e) { testo = e.stdout }
  const r = JSON.parse(testo || '{}')
  if (r.error) throw new Error(`npm audit non riuscito: ${r.error.summary || JSON.stringify(r.error)}`)
  if (!r.metadata || !r.vulnerabilities || typeof r.vulnerabilities !== 'object') throw new Error('npm audit non ha restituito un rapporto completo')
  return r.vulnerabilities
}
const gravi = (v) => Object.values(v).filter((x) => x.severity === 'high' || x.severity === 'critical')
// gli avvisi da cui dipende davvero una voce: npm elenca come «via» o un avviso o il nome di un altro pacchetto vulnerabile
function avvisiDi(nome, tutte, visti = new Set()) {
  if (visti.has(nome)) return []
  visti.add(nome)
  const v = tutte[nome]; if (!v) return []
  return v.via.flatMap((x) => (typeof x === 'string' ? avvisiDi(x, tutte, visti) : [{ id: String(x.url || '').split('/').pop(), pacchetto: x.name, gravita: x.severity, titolo: x.title }]))
}

const oggi = new Date().toISOString().slice(0, 10)
let errori = 0
const errore = (t) => { errori++; console.log('ERRORE ' + t) }

// 1. app installata
const produzione = audit('--omit=dev')
const app = gravi(produzione)
for (const v of app) errore(`dipendenza dell'app installata: ${v.name} (${v.severity}) ${avvisiDi(v.name, produzione).map((a) => a.id).join(', ')}`)
if (!app.length) console.log('OK   dipendenze dell’app installata: nessuna vulnerabilità alta o critica')

// 2. strumenti di sviluppo
const tutte = audit()
const valide = new Map(ECCEZIONI.filter((e) => e.scade >= oggi).map((e) => [e.avviso, e]))
for (const e of ECCEZIONI) if (e.scade < oggi) errore(`eccezione scaduta il ${e.scade} per ${e.avviso} (${e.pacchetto}): aggiorna la dipendenza o rinnova l’eccezione con un motivo`)
const usate = new Set()
for (const v of gravi(tutte)) {
  const avvisi = avvisiDi(v.name, tutte).filter((a) => a.gravita === 'high' || a.gravita === 'critical')
  const scoperti = avvisi.filter((a) => !valide.has(a.id))
  avvisi.filter((a) => valide.has(a.id)).forEach((a) => usate.add(a.id))
  if (scoperti.length) errore(`${v.name} (${v.severity}): ${scoperti.map((a) => `${a.id} ${a.pacchetto} «${a.titolo}»`).join('; ')}`)
}
for (const id of usate) { const e = valide.get(id); console.log(`ECCEZIONE ${id} (${e.pacchetto}, fino al ${e.scade}): ${e.motivo}`) }
for (const e of ECCEZIONI) if (e.scade >= oggi && !usate.has(e.avviso)) console.log(`NOTA eccezione ${e.avviso} (${e.pacchetto}) non più necessaria: si può togliere`)
const medie = Object.values(tutte).filter((x) => x.severity === 'moderate').length
if (medie) console.log(`INFO ${medie} segnalazioni di gravità media negli strumenti di sviluppo (non bloccano, come prima)`)

if (errori) { console.log(`\n${errori} problemi nelle dipendenze`); process.exit(1) }
console.log('\nDipendenze in regola')
