import { fmtNum, round2 } from './format'

/** Parametri forensi — attività stragiudiziale (DM 55/2014, tabelle aggiornate dal DM 147/2022). */
export const SCAGLIONE_OLTRE_520K = 140 // 2022, assistenza stragiudiziale: percentuale decrescente
export const SCAGLIONE_OLTRE_32M = 130 // oltre 32.000.000: tariffa calcolata dal sito in base al valore

export const PCT_MAX_COMPENSO = 5 // la percentuale non può eccedere il 5% del valore
// Percentuale decrescente per valori oltre 520.000 (stessi parametri del calcolatore online)
export const PCT_DECRESCENTE = { inizio: 3, minimo: 0.25, passo: 0.25, scaglione: 2_000_000, soglia: 520_000 }

export type Terna = [number, number, number] // min, medio, max
export type Scelta = 1 | 2 | 3 | 'libero'

export interface CompensoInput {
  anno: 2022 | 2014
  competenza: number // codice della competenza (360/380 stragiudiziale, 100-390 civile, 500-640 penale)
  competenzaNome?: string // nome mostrato dal sito (per il prospetto)
  tipo: 'tabellare' | 'percentuale'
  scaglione: number
  valore: number
  metodo: 'F' | 'S' // percentuale secca | a scaglioni
  pct: number
  variazione: [number, number] // % sotto/sopra il medio
  fasi: { cod: string; nome: string; attiva: boolean; scelta: Scelta; libero: number; terna: Terna }[]
  ulteriorePct: number // art. 19 c.1
  esitoPositivo: boolean
  esitoImporto: number // art. 20 c.1-bis: +30% sull'importo indicato
  praticantePct: number // art. 24 (stragiudiziale), art. 9 (civile), art. 17 (penale)
  variazioni?: Variazioni // aumenti e riduzioni propri del civile e del penale
  speseEsenti: number
  speseTrasferta: number
  speseAltre: number
  sgOn: boolean
  sgPct: number
}

/** Compenso con percentuale decrescente per scaglioni di valore (valori > 520.000). */
export function percentualeDecrescente(valore: number, metodo: 'F' | 'S'): { compenso: number; pct: number } {
  const P = PCT_DECRESCENTE
  if (valore <= P.soglia) return { compenso: 0, pct: 0 }
  if (metodo === 'F') {
    const pct = Math.max(P.minimo, P.inizio - Math.floor((valore - 0.01) / P.scaglione) * P.passo)
    return { compenso: Math.round((valore * pct) / 100), pct }
  }
  let tot = 0, da = 0, a = 0, h = P.inizio
  while (a < valore) {
    a = h - P.passo < P.minimo ? valore : a + P.scaglione
    if (a > valore) a = valore
    tot += Math.round(((a - da) * h) / 100)
    h = Math.max(P.minimo, h - P.passo)
    da = a
  }
  return { compenso: tot, pct: valore ? round2((tot / valore) * 100) : 0 }
}

/** Terna min/medio/max in base alla variazione dell'anno (es. ±50%). */
export function ternaDaMedio(medio: number, variazione: [number, number]): Terna {
  return [Math.round((medio * (100 - variazione[0])) / 100), medio, Math.round((medio * (100 + variazione[1])) / 100)]
}

/** Terna per un compenso in percentuale (o per lo scaglione "oltre 520.000"). */
export function ternaCalcolata(i: Pick<CompensoInput, 'tipo' | 'scaglione' | 'valore' | 'metodo' | 'pct' | 'variazione' | 'competenza' | 'anno'>): { terna: Terna; pctApplicata: number } {
  const autom = i.tipo === 'tabellare' && i.anno === 2022 && i.competenza === 360 && i.scaglione === SCAGLIONE_OLTRE_520K
  if (autom) {
    const r = percentualeDecrescente(i.valore, i.metodo)
    return { terna: ternaDaMedio(r.compenso, i.variazione), pctApplicata: r.pct }
  }
  const pct = Math.min(Math.max(i.pct || 0, 0), PCT_MAX_COMPENSO)
  return { terna: ternaDaMedio(Math.round((i.valore * pct) / 100), i.variazione), pctApplicata: pct }
}


/* ------------------------------ Aumenti e riduzioni (civile e penale) ------------------------------ */
export type Ambito = 'civile' | 'penale' | 'stragiudiziale'
export const ambitoDi = (competenza: number): Ambito => (competenza === 360 || competenza === 380 ? 'stragiudiziale' : competenza >= 500 ? 'penale' : 'civile')

export type VarId = 'piuParti' | 'conciliazione' | 'classAction' | 'fondatezza' | 'predisposizioni' | 'motiviAggiunti' | 'ricorsoIncidentale' | 'memoria378'
  | 'assenzaQfd' | 'responsabilita' | 'respProc' | 'pronunce' | 'ritardo' | 'gp'
export interface VarInput { pct: number; importo?: number }
export type Variazioni = Partial<Record<VarId, VarInput>>

export interface VarDef {
  id: VarId; tipo: 'aumento' | 'riduzione'; nome: string
  range?: { min: number; max: number; step: number } // percentuale scelta dall'utente
  fissa?: number // percentuale fissa (riduzioni previste dal decreto)
  fase?: string // aumento calcolato su una singola fase (codice) e non sul compenso
  valida: (a: Ambito, anno: number, competenza: number) => boolean
}
const TAR_CDS = [320, 330, 335]
const solo = (...a: Ambito[]) => (x: Ambito) => a.includes(x)
/** Stesso elenco, ordine e disponibilità dei calcolatori del sito (civile e penale). */
export const VARIAZIONI: VarDef[] = [
  { id: 'piuParti', tipo: 'aumento', nome: 'Più parti', valida: solo('civile', 'penale') },
  { id: 'conciliazione', tipo: 'aumento', nome: 'Conciliazione', range: { min: 1, max: 25, step: 1 }, fase: '40', valida: solo('civile') },
  { id: 'classAction', tipo: 'aumento', nome: 'Class action', range: { min: 10, max: 300, step: 10 }, valida: solo('civile') },
  { id: 'fondatezza', tipo: 'aumento', nome: 'Manifesta fondatezza', range: { min: 1, max: 33, step: 1 }, valida: solo('civile') },
  { id: 'predisposizioni', tipo: 'aumento', nome: 'Predisposizioni informatiche (PCT)', range: { min: 1, max: 30, step: 1 }, valida: solo('civile') },
  { id: 'motiviAggiunti', tipo: 'aumento', nome: 'Motivi aggiunti', range: { min: 1, max: 50, step: 1 }, fase: '20', valida: (a, _y, c) => a === 'civile' && TAR_CDS.includes(c) },
  { id: 'ricorsoIncidentale', tipo: 'aumento', nome: 'Ricorso incidentale', range: { min: 1, max: 20, step: 1 }, fase: '20', valida: (a, y, c) => a === 'civile' && y >= 2022 && TAR_CDS.includes(c) },
  { id: 'memoria378', tipo: 'aumento', nome: 'Memoria ex art. 378 c.p.c.', range: { min: 1, max: 50, step: 1 }, fase: '40', valida: (a, y, c) => a === 'civile' && y >= 2022 && c === 220 },
  { id: 'assenzaQfd', tipo: 'riduzione', nome: 'Assenza questioni di fatto e diritto', range: { min: 1, max: 30, step: 1 }, valida: solo('civile', 'penale') },
  { id: 'responsabilita', tipo: 'riduzione', nome: 'Resp. art. 96 c.p.c. e pronunce in rito', fissa: 50, valida: (a, y) => a === 'civile' && y < 2022 },
  { id: 'respProc', tipo: 'riduzione', nome: 'Resp. art. 96 c.p.c.', fissa: 75, valida: (a, y) => a === 'civile' && y >= 2022 },
  { id: 'pronunce', tipo: 'riduzione', nome: 'Pronunce in rito', fissa: 50, valida: (a, y) => a === 'civile' && y >= 2022 },
  { id: 'ritardo', tipo: 'riduzione', nome: 'Condotte ostative', range: { min: 1, max: 50, step: 1 }, valida: solo('civile') },
  { id: 'gp', tipo: 'riduzione', nome: 'Gratuito patrocinio', fissa: 50, valida: solo('civile', 'penale') }, // penale: un terzo
]
export const variazioniValide = (ambito: Ambito, anno: number, competenza: number, tipo: VarDef['tipo']) => VARIAZIONI.filter((v) => v.tipo === tipo && v.valida(ambito, anno, competenza))
/** Il decreto del 2022 sostituisce la fase decisionale con il compenso aumentato (modo "+"); prima l'aumento si somma (modo "%"). */
export const conciliazioneSostituisceFase = (anno: number) => anno >= 2022

/** Percentuali selezionabili per il numero di parti (art. 4 c. 2 / art. 12 c. 2): 30% per ogni parte oltre la prima fino a 10, poi 10% fino a 30. */
export function maxPctPiuParti(parti: number): number {
  const A = 10, pa = 30, pb = 10
  return parti > 1 && parti <= A ? (parti - 1) * pa : parti > A ? (A - 1) * pa + (parti - A) * pb : 0
}
export function opzioniPctPiuParti(parti: number): number[] {
  const max = maxPctPiuParti(parti), lim = maxPctPiuParti(10), out: number[] = []
  for (let a = 0, passo = 10; a <= max; a += passo) { out.push(a); if (a >= lim) passo = 5 }
  return out
}
export const PRATICANTE_RANGE = (a: Ambito) => (a === 'civile' ? { min: 5, max: 50, step: 5 } : { min: 1, max: 50, step: 1 })

// aritmetica in centesimi: stessi arrotondamenti del sito (mezzo centesimo per eccesso)
const cent = (n: number) => Math.round(n * 100)
const euroC = (c: number) => c / 100
const quota = (importo: number, pct: number) => euroC(Math.round((cent(importo) * pct) / 100))
const fmtP = (n: number) => String(n).replace('.', ',')
/** Articolo davanti alla percentuale, come lo scrive il sito: «del 10 %» ma «dell' 8 %», «dell' 11 %», «dell' 80 %». */
export const delPct = (n: number) => (n === 1 || n === 8 || n === 11 || (n >= 80 && n <= 89) ? "dell'" : 'del')
const E = (n: number) => '€ ' + fmtNum(n)

const ART: Record<Ambito, { u: string; piu: string; qfd: string; prat: string; gp: string }> = {
  civile: { u: 'art. 4, comma 1', piu: 'art. 4, comma 2', qfd: 'art. 4, comma 4', prat: 'art. 9', gp: 'art. 130 Dpr 115/02' },
  penale: { u: 'art. 12, comma 1', piu: 'art. 12, comma 2', qfd: 'art. 12, comma 2', prat: 'art. 17', gp: 'art. 106 bis Dpr 115/02' },
  stragiudiziale: { u: 'art. 19, comma 1', piu: '', qfd: '', prat: 'art. 24', gp: '' },
}
export const riferimentoUlteriore = (a: Ambito) => ART[a].u
export const riferimentoPraticante = (a: Ambito) => ART[a].prat
/** Riferimenti normativi mostrati accanto ai controlli del form. */
export const RIFERIMENTO_VARIAZIONE: Record<VarId, (a: Ambito) => string> = {
  piuParti: (a) => ART[a].piu, conciliazione: () => 'art. 4, comma 6', classAction: () => 'art. 4, comma 10', fondatezza: () => 'art. 4, comma 8', predisposizioni: () => 'art. 4, comma 1 bis',
  motiviAggiunti: () => 'art. 4, comma 10 bis', ricorsoIncidentale: () => 'art. 4, comma 10 bis', memoria378: () => 'art. 4, comma 10 quater',
  assenzaQfd: (a) => ART[a].qfd, responsabilita: () => 'art. 4, comma 9', respProc: () => 'art. 4, comma 9', pronunce: () => 'art. 4, comma 9', ritardo: () => 'art. 4, comma 7', gp: (a) => ART[a].gp,
}
export const testoUlteriore = (a: Ambito) => a === 'penale'
  ? "per particolare complessità o gravità, entità e numero delle imputazioni, urgenza, pregio dell'opera prestata, risultati ottenuti, particolari circostanze"
  : "per particolare complessità, importanza, urgenza, pregio dell'opera prestata, risultati ottenuti"

export interface RigaVariazione { id: string; testo: string; importo: number }

/** Importo di una fase, già aumentato dell'ulteriore valutazione (come fa il sito per gli aumenti collegati a una fase). */
const faseAumentata = (importoFase: number, ulteriorePct: number) => euroC(Math.round((cent(importoFase) * (100 + ulteriorePct)) / 100))

function rigaAumento(id: VarId, a: Ambito, anno: number, pct: number, baseUlteriore: number, importoFase: number, ulteriorePct: number): RigaVariazione | null {
  const art = a === 'civile' ? 'art. 4' : 'art. 12'
  const percentuale = (frase: string, art2: string): RigaVariazione => ({ id, testo: `Aumento ${delPct(pct)} ${fmtP(pct)} % ${frase} ( ${art2} )`, importo: quota(baseUlteriore, pct) })
  const sulla = (frase: string, comma: string): RigaVariazione => {
    const su = faseAumentata(importoFase, ulteriorePct)
    return { id, testo: `Aumento ${delPct(pct)} ${fmtP(pct)} % su ${E(su)} per ${frase} ( ${art}, comma ${comma} )`, importo: quota(su, pct) }
  }
  switch (id) {
    case 'piuParti': return percentuale('per presenza di più parti aventi stessa posizione processuale', ART[a].piu)
    case 'classAction': return percentuale('per class-action', 'art. 4, comma 10')
    case 'fondatezza': return percentuale('a carico del soccombente per manifesta fondatezza delle ragioni della parte vittoriosa', 'art. 4, comma 8')
    case 'predisposizioni': return percentuale("per utilizzo di tecniche informatiche che agevolano la consultazione o la fruizione di atti e allegati nell'ambito del PCT", 'art. 4, comma 1 bis')
    case 'conciliazione': {
      if (!conciliazioneSostituisceFase(anno)) return sulla('conciliazione giudiziale o transazione della controversia', '6')
      const su = faseAumentata(importoFase, ulteriorePct)
      return { id, testo: `Aumento di ${E(su)} + ${fmtP(pct)} % per conciliazione giudiziale o transazione della controversia ( art. 4, comma 6 )`, importo: euroC(Math.round((cent(su) * (100 + pct)) / 100)) }
    }
    case 'motiviAggiunti': return sulla('proposizione di motivi aggiunti', '10 bis')
    case 'ricorsoIncidentale': return sulla('proposizione di ricorso incidentale', '10 bis')
    case 'memoria378': return sulla('deposito memoria ex art. 378 c.p.c.', '10 quater')
    default: return null
  }
}
const ORDINE_AUMENTI: VarId[] = ['piuParti', 'conciliazione', 'classAction', 'fondatezza', 'predisposizioni', 'motiviAggiunti', 'ricorsoIncidentale', 'memoria378']
const ORDINE_RIDUZIONI: (VarId | 'praticante')[] = ['assenzaQfd', 'responsabilita', 'respProc', 'pronunce', 'ritardo', 'gp', 'praticante']

function testoRiduzione(id: VarId | 'praticante', a: Ambito, pct: number, su: number): string {
  const r = (frase: string, art: string) => `Riduzione ${delPct(pct)} ${fmtP(pct)} % su ${E(su)} ${frase} ( ${art} )`
  switch (id) {
    case 'assenzaQfd': return r('per assenza di specifiche e distinte questioni di fatto e diritto', ART[a].qfd)
    case 'ritardo': return r('per presenza di condotte ostative alla definizione del processo in tempi ragionevoli', 'art. 4, comma 7')
    case 'responsabilita': return r('resp. art 96 c.p.c. o pronunce in rito', 'art. 4, comma 9')
    case 'respProc': return r('resp. art 96 c.p.c.', 'art. 4, comma 9')
    case 'pronunce': return r('per inammissibilità, improponibilità o improcedibilità', 'art. 4, comma 9')
    case 'gp': return a === 'penale' ? `Riduzione di 1/3 su ${E(su)} per gratuito patrocinio ( ${ART[a].gp} )` : r('per gratuito patrocinio', ART[a].gp)
    default: return r('per compenso liquidato al praticante abilitato', ART[a].prat)
  }
}

export function importoFase(f: CompensoInput['fasi'][number]): number {
  if (!f.attiva) return 0
  if (f.scelta === 'libero') return f.libero || 0
  return f.terna[f.scelta - 1] || 0
}

export interface CompensoRisultato {
  base: number; aumentoUlteriore: number; baseUlteriore: number
  esitoBase: number; aumentoEsito: number // aumentoEsito = totale degli ulteriori aumenti (esito positivo, più parti, …)
  maggiorato: number
  riduzionePraticante: number // totale delle riduzioni (praticante, gratuito patrocinio, …)
  compenso: number; speseGenerali: number
  aumenti: RigaVariazione[]; riduzioni: RigaVariazione[]
}

/**
 * Ordine di calcolo (identico al prospetto del sito):
 * compenso tabellare → + ulteriore valutazione → + aumenti in % sul compenso aumentato (più parti, class action, …) e quelli calcolati
 * su una singola fase (conciliazione, motivi aggiunti, …) → riduzioni «a scalare»: ciascuna sul residuo della precedente, arrotondata al centesimo.
 */
export function calcolaCompenso(i: CompensoInput): CompensoRisultato {
  const ambito = ambitoDi(i.competenza)
  const u = i.ulteriorePct || 0
  const base = round2(i.fasi.reduce((s, f) => s + importoFase(f), 0))
  const aumentoUlteriore = quota(base, u)
  const baseUlteriore = round2(base + aumentoUlteriore)
  const aumenti: RigaVariazione[] = []
  const esitoBase = i.competenza === 380 && i.esitoPositivo ? faseAumentata(i.esitoImporto || 0, u) : 0
  if (esitoBase) aumenti.push({ id: 'esito', testo: `Aumento del 30 % su ${E(esitoBase)} per esito positivo ( art. 20, comma 1 bis )`, importo: quota(esitoBase, 30) })
  for (const id of ORDINE_AUMENTI) {
    const v = i.variazioni?.[id], def = VARIAZIONI.find((d) => d.id === id)!
    if (!v || !(v.pct > 0) || !def.valida(ambito, i.anno, i.competenza)) continue
    const riga = rigaAumento(id, ambito, i.anno, v.pct, baseUlteriore, v.importo || 0, u)
    if (riga) aumenti.push(riga)
  }
  const totAumenti = round2(aumenti.reduce((s, r) => s + r.importo, 0))
  const maggiorato = round2(baseUlteriore + totAumenti)
  const riduzioni: RigaVariazione[] = []
  let residuo = maggiorato
  for (const id of ORDINE_RIDUZIONI) {
    let pct = 0
    if (id === 'praticante') pct = i.praticantePct || 0
    else {
      const def = VARIAZIONI.find((d) => d.id === id)!, v = i.variazioni?.[id]
      if (!v || !def.valida(ambito, i.anno, i.competenza)) continue
      pct = def.fissa ?? v.pct
    }
    if (!(pct > 0)) continue
    const terzo = id === 'gp' && ambito === 'penale' // nel penale il gratuito patrocinio riduce di un terzo
    const importo = terzo ? euroC(Math.round(cent(residuo) / 3)) : quota(residuo, pct)
    riduzioni.push({ id, testo: testoRiduzione(id, ambito, pct, residuo), importo })
    residuo = euroC(cent(residuo) - cent(importo))
  }
  const compenso = round2(residuo)
  return {
    base, aumentoUlteriore, baseUlteriore, esitoBase, aumentoEsito: totAumenti, maggiorato,
    riduzionePraticante: round2(riduzioni.reduce((s, r) => s + r.importo, 0)), compenso,
    speseGenerali: i.sgOn ? quota(compenso, i.sgPct || 0) : 0, aumenti, riduzioni,
  }
}

export const NOME_COMPETENZA: Record<number, string> = { 360: 'assistenza stragiudiziale', 380: 'mediazione e negoziazione assistita' }
/** Nome della competenza come lo scrive il sito nel prospetto (minuscolo). */
export const nomeCompetenza = (i: Pick<CompensoInput, 'competenza' | 'competenzaNome'>) => (i.competenzaNome || NOME_COMPETENZA[i.competenza] || `competenza ${i.competenza}`).toLowerCase()

/** Etichetta del tipo di compenso scelto (minimo, medio, massimo, personalizzato) — con le denominazioni delle fasi ministeriali. */
export function tipoCompensoLabel(f: CompensoInput['fasi'][number]): string {
  return f.scelta === 'libero' ? 'personalizzato' : (['minimo', 'medio', 'massimo'] as const)[(f.scelta as number) - 1]
}

/** Descrizione sintetica da riportare nella voce di parcella. */
export function descrizioneCompenso(i: CompensoInput, scaglioneLabel: string, nascondiTipo = false): string {
  const attive = i.fasi.filter((f) => f.attiva)
  const ambito = ambitoDi(i.competenza)
  const settore = ambito === 'civile' ? 'liquidazione giudiziale in ambito civile' : ambito === 'penale' ? 'liquidazione giudiziale in ambito penale' : null
  const parti = [settore
    ? `Compenso per ${nomeCompetenza(i)} (${settore}, parametri forensi DM 55/2014${i.anno === 2022 ? ' agg. DM 147/2022' : ''})`
    : `Compenso per ${nomeCompetenza(i)} (parametri forensi DM 55/2014${i.anno === 2022 ? ' agg. DM 147/2022' : ''})`]
  if (i.tipo === 'percentuale') parti.push(`${String(i.pct).replace('.', ',')}% sul valore dell'affare`)
  else if (scaglioneLabel) parti.push(scaglioneLabel.toLowerCase().replace(/^da /, 'scaglione da '))
  if ((i.competenza === 380 && attive.length) || (ambito !== 'stragiudiziale' && attive.length > 1)) parti.push(`fasi: ${attive.map((f) => (nascondiTipo ? nomeFase(f.cod, f.nome) : `${nomeFase(f.cod, f.nome)} (${tipoCompensoLabel(f)})`)).join(', ').toLowerCase()}`)
  else if (!nascondiTipo && attive.length === 1) parti.push(`compenso ${tipoCompensoLabel(attive[0])}`)
  return parti.join(' — ')
}

/** Fotografia del calcolo, salvata con il documento e usata per riprodurre l'impaginazione del prospetto del sito nel PDF. */
export interface DettaglioCalcolo {
  tabelle: string; competenza: string; valoreAffare: string
  fasi: { nome: string; tipo: string; importo: number }[]
  base: number
  ulteriorePct: number; aumentoUlteriore: number; baseUlteriore: number
  esitoPct: number; esitoBase: number; aumentoEsito: number; maggiorato: number
  praticantePct: number; riduzionePraticante: number; compenso: number
  nascondiTipo: boolean; nVociCalcolate: number
  trasferta: number; altre: number
  // dal calcolatore civile e penale (assenti nei documenti salvati prima)
  ambito?: Ambito
  intestazione?: string[] // es. «Liquidazione giudiziale compenso avvocati in ambito Civile», «Artt. 1 - 11 D.M. 55/2014»
  etichettaValore?: string // «Valore della causa» / «Valore dell'affare»; vuoto = riga omessa (penale)
  ulterioreTesto?: string; ulterioreArt?: string
  aumenti?: RigaVariazione[]; riduzioni?: RigaVariazione[]
}

/** Nome lungo delle fasi, con le denominazioni delle fasi ministeriali (il calcolatore le elenca con nomi brevi). */
const NOMI_FASE: Record<string, string> = {
  '0': 'Fase unica', '10': 'Fase di studio della controversia', '20': 'Fase introduttiva del giudizio', '30': 'Fase istruttoria e/o di trattazione', '40': 'Fase decisionale',
  '50': 'Fase istruttoria', '60': 'Fase istruttoria e/o dibattimentale', '70': 'Fase cautelare', '72': 'Fase cautelare collegiale', '74': 'Fase cautelare monocratica',
  '80': 'Fase di trattazione e conclusiva', '90': 'Fase decisionale', '99': 'Compenso', '110': "Fase dell'attivazione", '120': 'Fase di negoziazione', '130': 'Conciliazione',
}
export const nomeFase = (cod: string, nomeBreve: string) => NOMI_FASE[cod] || nomeBreve

export function costruisciDettaglio(i: CompensoInput, r: CompensoRisultato, scaglioneLabel: string, nascondiTipo: boolean, nVociCalcolate: number): DettaglioCalcolo {
  const eur = (n: number) => '€ ' + fmtNum(n)
  const ambito = ambitoDi(i.competenza)
  const lab = scaglioneLabel.replace(/^Da /, 'da ').replace(/^Fino/, 'fino').replace(/^Oltre/, 'oltre')
  let valoreAffare = lab
  if (i.tipo === 'percentuale') valoreAffare = `${eur(i.valore)} — compenso in percentuale (${String(i.pct).replace('.', ',')}%)`
  else if (/^(oltre)/.test(lab) && i.valore) valoreAffare = `${lab} (valore ${eur(i.valore)})`
  return {
    tabelle: i.anno === 2022 ? '2022 (D.M. n. 147 del 13/08/2022)' : '2014 (D.M. n. 55 del 10/03/2014)',
    competenza: nomeCompetenza(i), valoreAffare,
    fasi: i.fasi.filter((f) => f.attiva).map((f) => ({ nome: nomeFase(f.cod, f.nome), tipo: `valore ${tipoCompensoLabel(f)}`, importo: importoFase(f) })),
    base: r.base, ulteriorePct: i.ulteriorePct || 0, aumentoUlteriore: r.aumentoUlteriore, baseUlteriore: r.baseUlteriore,
    esitoPct: 30, esitoBase: r.esitoBase, aumentoEsito: r.aumentoEsito, maggiorato: r.maggiorato,
    praticantePct: i.praticantePct || 0, riduzionePraticante: r.riduzionePraticante, compenso: r.compenso,
    nascondiTipo, nVociCalcolate, trasferta: i.speseTrasferta, altre: i.speseAltre,
    ambito,
    intestazione: ambito === 'civile' ? ['Liquidazione giudiziale compenso avvocati in ambito Civile', 'Artt. 1 - 11 D.M. 55/2014']
      : ambito === 'penale' ? ['Liquidazione giudiziale compenso avvocati in ambito Penale', 'Artt. 1 - 3 e 12 - 17 D.M. 55/2014'] : undefined,
    etichettaValore: ambito === 'civile' ? 'Valore della causa' : ambito === 'penale' ? '' : "Valore dell'affare",
    ulterioreTesto: testoUlteriore(ambito), ulterioreArt: riferimentoUlteriore(ambito),
    aumenti: r.aumenti, riduzioni: r.riduzioni,
  }
}
