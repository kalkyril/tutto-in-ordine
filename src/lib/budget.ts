// Budget dell'anno (1.0.4): spese per categoria rispetto al budget, denaro da mettere da parte per tasse e contributi,
// obiettivo di incasso e, per il regime forfettario, la soglia dei ricavi. Logica pura: riceve i movimenti dello
// scadenzario (uscite ricorrenti previste comprese) e le impostazioni dell'utente.
import type { Movimento } from './pagamenti'

export interface ImpostazioniBudget {
  /** budget annuo per categoria di spesa, in euro */
  categorie?: Record<string, number>
  /** percentuale degli incassi da mettere da parte per tasse e contributi (0-100) */
  accantonamento?: number | null
  /** obiettivo di incasso dell'anno, in euro */
  obiettivo?: number | null
}
export type StatoBudget = 'nessuno' | 'ok' | 'attenzione' | 'superato'
export interface RigaBudget { categoria: string; budget: number | null; pagato: number; daPagare: number; totale: number; quota: number | null; stato: StatoBudget }
export interface Soglia { limite: number; uscita: number; ricavi: number; quota: number; stato: 'ok' | 'attenzione' | 'oltre' | 'uscita' }
export interface Budget {
  anno: number
  incassato: number; daIncassare: number
  righe: RigaBudget[]; totali: { budget: number; pagato: number; daPagare: number; totale: number }
  /** stima di quanto mettere da parte, quanto è già stato pagato in imposte e contributi, quanto resta */
  accantonamento: { percentuale: number; daParte: number; giaPagato: number; resta: number } | null
  obiettivo: { importo: number; raggiunto: number; quota: number } | null
  soglia: Soglia | null
}

/** Categoria in cui finiscono tasse e contributi pagati: contano come già accantonati. */
export const CATEGORIA_IMPOSTE = 'Imposte e contributi'
/** Regime forfettario: oltre 85.000 € di ricavi si esce dall'anno successivo, oltre 100.000 € subito. */
export const SOGLIA_FORFETTARIO = 85000, USCITA_FORFETTARIO = 100000

const tondo = (n: number) => Math.round(n * 100) / 100
const quota = (parte: number, tutto: number) => (tutto > 0 ? parte / tutto : 0)
export function statoDi(spesa: number, budget: number | null): StatoBudget {
  if (budget == null || !(budget > 0)) return 'nessuno'
  const q = spesa / budget
  return q > 1 ? 'superato' : q >= 0.8 ? 'attenzione' : 'ok'
}

/**
 * Budget dell'anno. `categorieNote`: categorie da mostrare anche senza movimenti (quelle con un budget compaiono sempre).
 * `forfettario`: mostra la soglia dei ricavi, misurata sugli incassi dell'anno (criterio di cassa).
 */
export function calcolaBudget(m: Movimento[], anno: number, imp: ImpostazioniBudget = {}, opzioni: { forfettario?: boolean; categorieNote?: string[] } = {}): Budget {
  const delAnno = m.filter((x) => x.data.startsWith(String(anno)))
  const somma = (f: (x: Movimento) => boolean) => tondo(delAnno.filter(f).reduce((s, x) => s + x.importo, 0))
  const incassato = somma((x) => x.stato === 'incassate'), daIncassare = somma((x) => x.stato === 'da_incassare')
  const budgetDi = (c: string) => { const v = imp.categorie?.[c]; return typeof v === 'number' && v > 0 ? v : null }
  const nomi = new Set<string>([...(opzioni.categorieNote || []), ...Object.keys(imp.categorie || {}).filter((c) => budgetDi(c) != null)])
  for (const x of delAnno) if ((x.stato === 'pagate' || x.stato === 'da_pagare') && x.categoria) nomi.add(x.categoria)
  const righe: RigaBudget[] = [...nomi].map((categoria) => {
    const pagato = somma((x) => x.stato === 'pagate' && x.categoria === categoria), daPagare = somma((x) => x.stato === 'da_pagare' && x.categoria === categoria)
    const totale = tondo(pagato + daPagare), budget = budgetDi(categoria)
    return { categoria, budget, pagato, daPagare, totale, quota: budget ? totale / budget : null, stato: statoDi(totale, budget) }
  }).sort((a, b) => Number(b.budget != null) - Number(a.budget != null) || b.totale - a.totale || a.categoria.localeCompare(b.categoria, 'it'))
  const totali = righe.reduce((t, r) => ({ budget: tondo(t.budget + (r.budget || 0)), pagato: tondo(t.pagato + r.pagato), daPagare: tondo(t.daPagare + r.daPagare), totale: tondo(t.totale + r.totale) }), { budget: 0, pagato: 0, daPagare: 0, totale: 0 })
  const perc = Number(imp.accantonamento)
  const accantonamento = perc > 0 && perc <= 100 ? (() => {
    const daParte = tondo(incassato * perc / 100), giaPagato = somma((x) => x.stato === 'pagate' && x.categoria === CATEGORIA_IMPOSTE)
    return { percentuale: perc, daParte, giaPagato, resta: tondo(Math.max(0, daParte - giaPagato)) }
  })() : null
  const ob = Number(imp.obiettivo)
  const obiettivo = ob > 0 ? { importo: ob, raggiunto: incassato, quota: quota(incassato, ob) } : null
  const soglia: Soglia | null = opzioni.forfettario ? {
    limite: SOGLIA_FORFETTARIO, uscita: USCITA_FORFETTARIO, ricavi: incassato, quota: quota(incassato, SOGLIA_FORFETTARIO),
    stato: incassato > USCITA_FORFETTARIO ? 'uscita' : incassato > SOGLIA_FORFETTARIO ? 'oltre' : incassato >= SOGLIA_FORFETTARIO * 0.8 ? 'attenzione' : 'ok',
  } : null
  return { anno, incassato, daIncassare, righe, totali, accantonamento, obiettivo, soglia }
}

// ------------------------------------------------------------------ conti e saldo reale
export interface Conto { id: number; nome: string; tipo: string; iban: string | null; saldo_iniziale: number; data_saldo: string; predefinito: number; archiviato: number; note: string | null }
export interface MovimentoConto { id: number; conto_id: number; data: string; importo: number; descrizione: string; categoria: string | null; verso_conto_id: number | null }
export interface VoceConto { data: string; importo: number; descrizione: string; dettaglio?: string; chiave: string }
export interface SaldoConto { conto: Conto; saldo: number; voci: VoceConto[] }

/**
 * Saldo di ogni conto a una data (`al`, compresa): saldo iniziale, più incassi, meno pagamenti, più o meno i movimenti
 * scritti a mano e i giroconti, contando solo ciò che è avvenuto dopo la data del saldo iniziale. Incassi e pagamenti
 * senza un conto vanno sul conto predefinito.
 */
export function saldiConti(conti: Conto[], manuali: MovimentoConto[], m: Movimento[], al: string): SaldoConto[] {
  const predefinito = conti.find((c) => c.predefinito && !c.archiviato) || conti.find((c) => !c.archiviato) || conti[0]
  const per = new Map<number, VoceConto[]>(conti.map((c) => [c.id, []]))
  const metti = (id: number | null | undefined, v: VoceConto) => { const k = id != null && per.has(id) ? id : predefinito?.id; if (k != null) per.get(k)!.push(v) }
  for (const x of m) {
    if (x.data > al || (x.stato !== 'incassate' && x.stato !== 'pagate')) continue
    metti(x.conto_id, { data: x.data, importo: x.stato === 'incassate' ? x.importo : -x.importo, descrizione: x.descrizione, dettaglio: x.dettaglio, chiave: x.chiave })
  }
  for (const x of manuali) {
    if (x.data > al) continue
    if (x.verso_conto_id) {
      const verso = conti.find((c) => c.id === x.verso_conto_id)?.nome, da = conti.find((c) => c.id === x.conto_id)?.nome
      metti(x.conto_id, { data: x.data, importo: -Math.abs(x.importo), descrizione: x.descrizione, dettaglio: `Giroconto verso ${verso || 'altro conto'}`, chiave: `gc-${x.id}-da` })
      metti(x.verso_conto_id, { data: x.data, importo: Math.abs(x.importo), descrizione: x.descrizione, dettaglio: `Giroconto da ${da || 'altro conto'}`, chiave: `gc-${x.id}-a` })
    } else metti(x.conto_id, { data: x.data, importo: x.importo, descrizione: x.descrizione, dettaglio: x.categoria || 'Movimento del conto', chiave: `mc-${x.id}` })
  }
  return conti.map((conto) => {
    const voci = (per.get(conto.id) || []).filter((v) => v.data > conto.data_saldo).sort((a, b) => b.data.localeCompare(a.data) || a.chiave.localeCompare(b.chiave))
    return { conto, voci, saldo: tondo(conto.saldo_iniziale + voci.reduce((s, v) => s + v.importo, 0)) }
  })
}

// ------------------------------------------------------------------ previsione di cassa
export interface MesePrevisione { mese: string; entrate: number; uscite: number; saldo: number; entratePrudenti: number; saldoPrudente: number }
const piuGiorniData = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10) }
/**
 * Saldo previsto a fine mese per i prossimi `mesi` mesi, partendo dal saldo di oggi. Entrate attese e uscite (comprese
 * le ricorrenti previste) alla loro data; ciò che è già scaduto e non regolato cade nel mese corrente.
 * Scenario prudente: gli incassi scaduti da più di 60 giorni non arrivano, gli altri arrivano con 30 giorni di ritardo.
 */
export function previsione(m: Movimento[], saldoOggi: number, oggi: string, mesi = 12): MesePrevisione[] {
  const elenco = Array.from({ length: mesi }, (_, i) => { const [y, mm] = oggi.split('-').map(Number); const t = new Date(Date.UTC(y, mm - 1 + i, 1)); return t.toISOString().slice(0, 7) })
  const meseDi = (data: string) => (data < oggi ? elenco[0] : data.slice(0, 7))
  const entrate = new Map<string, number>(), uscite = new Map<string, number>(), prudenti = new Map<string, number>()
  const somma = (mappa: Map<string, number>, k: string, v: number) => mappa.set(k, (mappa.get(k) || 0) + v)
  for (const x of m) {
    if (x.stato === 'da_incassare') {
      somma(entrate, meseDi(x.data), x.importo)
      if (!(x.data < piuGiorniData(oggi, -60))) somma(prudenti, meseDi(piuGiorniData(x.data < oggi ? oggi : x.data, 30)), x.importo)
    } else if (x.stato === 'da_pagare') somma(uscite, meseDi(x.data), x.importo)
  }
  let saldo = saldoOggi, saldoP = saldoOggi
  return elenco.map((mese) => {
    const e = tondo(entrate.get(mese) || 0), u = tondo(uscite.get(mese) || 0), ep = tondo(prudenti.get(mese) || 0)
    saldo = tondo(saldo + e - u); saldoP = tondo(saldoP + ep - u)
    return { mese, entrate: e, uscite: u, saldo, entratePrudenti: ep, saldoPrudente: saldoP }
  })
}

// ------------------------------------------------------------------ tasse e contributi stimati
export type RegimeFiscale = 'forfettario' | 'ordinario'
export interface ImpostazioniFiscali {
  regime?: RegimeFiscale
  /** forfettario: coefficiente di redditività (%) e aliquota dell'imposta sostitutiva (5 o 15) */
  coefficiente?: number; aliquota?: number
  /** contributi previdenziali sul reddito (%), per entrambi i regimi */
  contributi?: number
  /** ordinario: aliquota media IRPEF e addizionali stimata (%) */
  irpef?: number
}
export interface DocumentoFiscale { data: string; imponibile: number; iva: number; ritenuta: number; verso: 'emesso' | 'ricevuto' }
export interface StimaFiscale {
  regime: RegimeFiscale; ricavi: number; costi: number; reddito: number
  contributi: number; imposta: number; ritenute: number
  ivaDebito: number; ivaCredito: number; iva: number
  totale: number; giaPagato: number; daAccantonare: number
  righe: { voce: string; importo: number; nota?: string }[]
}
/** Valori di partenza: da cambiare con il commercialista. */
export const FISCALE_PREDEFINITO: Required<ImpostazioniFiscali> = { regime: 'forfettario', coefficiente: 78, aliquota: 15, contributi: 26.07, irpef: 30 }

/**
 * Stima di imposte, contributi e IVA dell'anno. È un aiuto per mettere da parte il denaro, non un calcolo da
 * dichiarazione. Forfettario: reddito = incassi × coefficiente; contributi sul reddito; imposta sostitutiva sul reddito
 * meno i contributi. Ordinario: reddito = incassi imponibili − costi pagati; IRPEF media sul reddito meno contributi,
 * meno le ritenute subite; IVA dei documenti emessi meno quella delle fatture ricevute.
 */
export function stimaFiscale(m: Movimento[], documenti: DocumentoFiscale[], anno: number, cfg: ImpostazioniFiscali = {}, giaPagato = 0): StimaFiscale {
  const c = { ...FISCALE_PREDEFINITO, ...Object.fromEntries(Object.entries(cfg).filter(([, v]) => v != null && v !== '')) } as Required<ImpostazioniFiscali>
  const delAnno = m.filter((x) => x.data.startsWith(String(anno)))
  const docs = documenti.filter((d) => d.data.startsWith(String(anno)))
  const incassi = delAnno.filter((x) => x.stato === 'incassate')
  // dell'incasso conta la parte di compenso: senza IVA e senza la ritenuta trattenuta dal cliente
  const ricavi = tondo(incassi.reduce((s, x) => {
    const p = x.parcella, f = x.fattura
    if (p && p.netto > 0) return s + x.importo * (p.imponibile / p.netto)
    if (f && f.netto) return s + x.importo * (f.imponibile / f.netto)
    return s + x.importo
  }, 0))
  const costi = tondo(delAnno.filter((x) => x.stato === 'pagate' && x.categoria !== CATEGORIA_IMPOSTE).reduce((s, x) => s + x.importo, 0))
  const ivaDebito = tondo(docs.filter((d) => d.verso === 'emesso').reduce((s, d) => s + d.iva, 0))
  const ivaCredito = tondo(docs.filter((d) => d.verso === 'ricevuto').reduce((s, d) => s + d.iva, 0))
  const ritenute = tondo(docs.filter((d) => d.verso === 'emesso').reduce((s, d) => s + d.ritenuta, 0))
  if (c.regime === 'forfettario') {
    const reddito = tondo(ricavi * c.coefficiente / 100), contributi = tondo(reddito * c.contributi / 100)
    const imposta = tondo(Math.max(0, reddito - contributi) * c.aliquota / 100), totale = tondo(imposta + contributi)
    return { regime: 'forfettario', ricavi, costi, reddito, contributi, imposta, ritenute: 0, ivaDebito: 0, ivaCredito: 0, iva: 0, totale, giaPagato, daAccantonare: tondo(Math.max(0, totale - giaPagato)),
      righe: [
        { voce: 'Ricavi incassati', importo: ricavi },
        { voce: `Reddito (coefficiente ${c.coefficiente}%)`, importo: reddito },
        { voce: `Contributi previdenziali (${c.contributi}% del reddito)`, importo: contributi },
        { voce: `Imposta sostitutiva (${c.aliquota}% del reddito meno i contributi)`, importo: imposta },
      ] }
  }
  const reddito = tondo(Math.max(0, ricavi - costi)), contributi = tondo(reddito * c.contributi / 100)
  const irpef = tondo(Math.max(0, reddito - contributi) * c.irpef / 100), imposta = tondo(Math.max(0, irpef - ritenute))
  const iva = tondo(Math.max(0, ivaDebito - ivaCredito)), totale = tondo(imposta + contributi + iva)
  return { regime: 'ordinario', ricavi, costi, reddito, contributi, imposta, ritenute, ivaDebito, ivaCredito, iva, totale, giaPagato, daAccantonare: tondo(Math.max(0, totale - giaPagato)),
    righe: [
      { voce: 'Compensi incassati (senza IVA)', importo: ricavi },
      { voce: 'Costi pagati', importo: -costi },
      { voce: 'Reddito stimato', importo: reddito },
      { voce: `Contributi previdenziali (${c.contributi}% del reddito)`, importo: contributi },
      { voce: `IRPEF e addizionali (${c.irpef}% medio)`, importo: irpef },
      { voce: 'Ritenute d’acconto subite', importo: -ritenute, nota: 'già versate dai clienti, si scalano dall’IRPEF' },
      { voce: 'IVA dei documenti emessi', importo: ivaDebito },
      { voce: 'IVA delle fatture ricevute', importo: -ivaCredito },
    ] }
}
