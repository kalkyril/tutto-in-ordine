'use strict'
// Tariffe dei parametri forensi (stragiudiziale, civile e penale). Ordine di ricerca:
// Tabelle normative incluse: nessuna chiamata a servizi privati o cache di provenienza esterna.
const fs = require('node:fs')
const path = require('node:path')
const db = require('./db')
const PAGE = 'https://www.gazzettaufficiale.it/eli/id/2022/10/08/22G00157/sg'

let bundled = null
function getBundled() {
  if (!bundled) bundled = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'tariffe-dm55.json'), 'utf8'))
  return bundled
}

const online = () => false

/** Elenco delle competenze dei calcolatori del sito, con gli anni delle tabelle in cui sono previste. */
// Nomi e ordine delle competenze come nei calcolatori di avvocatoandreani.it (civile, penale, stragiudiziale; verificati il 21/10/2026).
// I codici sono gli stessi del sito; i nomi del decreto restano nei dati inclusi.
const NOMI_SITO = {
  100: 'Giudice di pace', 110: 'Giudizi di cognizione innanzi al tribunale', 200: 'Corte dei Conti', 210: "Corte d' Appello", 220: 'Corte di Cassazione',
  230: 'Magistrature superiori', 240: 'Corte Costituzionale', 250: 'Corte Europea', 260: 'Corte di Giustizia UE', 320: 'T.A.R.', 330: 'Consiglio di Stato',
  335: 'Consiglio di Stato (appello cautelare)', 340: 'Corte di Giustizia Tributaria di primo grado', 350: 'Corte di Giustizia Tributaria di secondo grado',
  370: 'Arbitrato', 120: 'Cause di lavoro', 130: 'Cause di previdenza', 140: 'Procedimenti per convalida locatizia', 150: 'Atto di precetto',
  160: 'Volontaria giurisdizione', 170: 'Procedimenti monitori', 180: 'Procedimenti di istruzione preventiva', 190: 'Procedimenti cautelari',
  270: 'Esecuzioni mobiliari', 280: 'Esecuzioni presso terzi, per consegna e rilascio', 290: 'Esecuzioni immobiliari',
  300: 'Iscrizione ipotecaria / Affari tavolari', 310: 'Dichiarazione di fallimento', 390: 'Accertamento del passivo',
  500: 'Giudice di pace', 510: 'Indagini preliminari', 520: 'Indagini difensive', 525: "Convalida dell'arresto", 530: 'Cautelari personali',
  540: 'Cautelari reali', 550: 'GIP', 560: 'GUP', 570: 'Tribunale monocratico', 580: 'Tribunale collegiale', 590: "Corte d'Assise", 600: "Corte d'Appello",
  610: 'Tribunale di sorveglianza', 615: 'Magistrato di sorveglianza', 620: "Corte d'Assise d'Appello", 630: 'Corte di Cassazione', 640: 'Magistrature superiori',
  360: 'Assistenza stragiudiziale', 380: 'Mediazione e Negoziazione assistita',
}
// ordine dei menu del sito (le chiavi numeriche di un oggetto verrebbero riordinate: serve un elenco)
const ORDINE_SITO = [100, 110, 200, 210, 220, 230, 240, 250, 260, 320, 330, 335, 340, 350, 370, 120, 130, 140, 150, 160, 170, 180, 190, 270, 280, 290, 300, 310, 390,
  500, 510, 520, 525, 530, 540, 550, 560, 570, 580, 590, 600, 610, 615, 620, 630, 640, 360, 380]
const posizione = (cod) => { const i = ORDINE_SITO.indexOf(cod); return i < 0 ? ORDINE_SITO.length : i }

function competenze() {
  const b = getBundled()
  return (b.competenze || [])
    .map((c) => ({ ...c, nome: NOMI_SITO[c.cod] || c.nome, anni: [2022, 2014].filter((a) => !!b.tabelle?.[a]?.[c.cod]) }))
    .sort((a, b) => posizione(a.cod) - posizione(b.cod))
}

// Valore indeterminabile (art. 5, comma 6, DM 55/2014): di regola tra 26.000 e 260.000 €, fino a 520.000 se di particolare
// importanza. Come nei calcolatori di avvocatoandreani.it (verificato il 22/10/2026): complessità bassa = scaglione 26.001–52.000,
// alta = 52.001–260.000, media = valore medio fra i due (minimo e massimo nelle proporzioni della tabella),
// particolare importanza = 260.001–520.000. Le tabelle incluse lasciano questi scaglioni vuoti: si calcolano qui.
const INDETERMINABILE = {
  901: { label: 'Indeterminabile - complessità bassa', da: [40] },
  902: { label: 'Indeterminabile - complessità media', da: [40, 50] },
  903: { label: 'Indeterminabile - complessità alta', da: [50] },
  910: { label: 'Indeterminabile di particolare importanza', da: [60] },
}
// stesse proporzioni delle terne incluse (scripts/genera-tabelle-normative.py): 2014 fase istruttoria −70%/+100%, altrimenti −50% e +80% (2014) o +50% (2022)
const fattori = (anno, competenza, fase) => (anno === 2014 && competenza < 500 && ['30', '50'].includes(fase)) ? [0.3, 2] : [0.5, anno === 2014 ? 1.8 : 1.5]
const arrotonda = (n) => Math.floor(n + 0.5)

function valoriIndeterminabile(anno, competenza, scaglione) {
  const regola = INDETERMINABILE[scaglione], t = getBundled().tabelle?.[anno]?.[competenza]
  const fonti = regola && t ? regola.da.map((id) => t.scaglioni.find((s) => s.id === id)?.valori) : []
  if (!regola || !fonti.length || fonti.some((v) => !v)) return null
  if (fonti.length === 1) return fonti[0]
  return Object.fromEntries(Object.keys(fonti[0]).map((fase) => {
    const medio = arrotonda((fonti[0][fase][1] + fonti[1][fase][1]) / 2), [fmin, fmax] = fattori(anno, competenza, fase)
    return [fase, [arrotonda(medio * fmin), medio, arrotonda(medio * fmax)]]
  }))
}

function struttura(anno, competenza) {
  const b = getBundled()
  const t = b.tabelle?.[anno]?.[competenza]
  if (!t) throw new Error(anno === 2014 && b.tabelle?.[2022]?.[competenza] ? 'Questa competenza non è prevista nelle tabelle 2014: usa le tabelle 2022' : 'Tabella non disponibile')
  return {
    anno, competenza, fasi: t.fasi,
    scaglioni: t.scaglioni.map((s) => INDETERMINABILE[s.id] ? { id: s.id, label: INDETERMINABILE[s.id].label, calcolato: false } : { id: s.id, label: s.label, calcolato: !!s.calcolato }),
    senzaScaglioni: !t.scaglioni.length, // penale: importi fissi per fase
    variazione: b.variazione[anno] || [50, 50],
    fonte: b.fonte, scaricato_il: b.scaricato_il, pagina: b.pagina, online: online(),
  }
}

// voce delle tabelle incluse per uno scaglione (nel penale, senza scaglioni, gli importi stanno in `fisse`)
function vociIncluse(anno, competenza, scaglione) {
  const t = getBundled().tabelle?.[anno]?.[competenza]
  if (!t) return null
  if (!t.scaglioni.length) return t.fisse ? { id: 0, valori: t.fisse } : null
  return t.scaglioni.find((s) => s.id === scaglione) || null
}

function cacheKey(a) { return `${a.anno}:${a.competenza}:${a.scaglione}:${a.valore || 0}` }

async function valori({ anno, competenza, scaglione, valore = 0 }) {
  anno = Number(anno); competenza = Number(competenza); scaglione = Number(scaglione); valore = Math.max(0, Math.round(Number(valore) || 0))
  const bundledEntry = vociIncluse(anno, competenza, scaglione)
  const errore = null
  if (bundledEntry?.valori) return { valori: bundledEntry.valori, fonte: 'incluse', ts: getBundled().scaricato_il, errore }
  const indeterminabile = valoriIndeterminabile(anno, competenza, scaglione)
  if (indeterminabile) return { valori: indeterminabile, fonte: 'incluse', ts: getBundled().scaricato_il, errore }
  throw new Error(errore ? `Tariffa non disponibile offline (${errore}). Inserisci il compenso manualmente.` : 'Valore soggetto a valutazione professionale: inserisci il compenso manualmente.')
}

module.exports = { struttura, valori, competenze, PAGE }
