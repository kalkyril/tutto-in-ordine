// Pagamenti: movimenti di denaro dell'attività (incassi dei documenti di vendita e voci da pagare) raggruppati per mese,
// e la ripartizione di una pratica o commessa (incassato, da incassare, pagato, da pagare) per il grafico a torta.
import type { Parcella } from '../types'
import { incassatoNetto, rateAperte, residuo, type RataBase } from './report'

export type StatoMovimento = 'incassate' | 'da_incassare' | 'pagate' | 'da_pagare'
export const STATI_MOVIMENTO: StatoMovimento[] = ['incassate', 'da_incassare', 'pagate', 'da_pagare']
export const NOMI_MOVIMENTO: Record<StatoMovimento, string> = { incassate: 'Incassate', da_incassare: 'Da incassare', pagate: 'Pagate', da_pagare: 'Da pagare' }
/** Colori predefiniti (scelti per essere distinguibili anche da chi non vede bene rosso e verde: diversi anche di luminosità). */
export const COLORI_MOVIMENTO: Record<StatoMovimento, string> = { incassate: '#15803d', da_incassare: '#60a5fa', pagate: '#475569', da_pagare: '#f97316' }
export const coloriMovimento = (s: { colori_pagamenti?: Partial<Record<StatoMovimento, string>> }): Record<StatoMovimento, string> => {
  const c = s.colori_pagamenti || {}
  return Object.fromEntries(STATI_MOVIMENTO.map((k) => [k, /^#[0-9a-f]{6}$/i.test(c[k] || '') ? c[k]! : COLORI_MOVIMENTO[k]])) as Record<StatoMovimento, string>
}

export interface CostoBase { id: number; pratica_id: number | null; fornitore_id: number | null; data: string; descrizione: string; categoria: string; importo: number; scadenza: string | null; pagata: number; contabile?: string | null
  /** 1.0.4: uscita ricorrente (ogni mese, ogni tre mesi, ogni anno), serie a cui appartiene e giorno del mese */
  ripeti?: string | null; serie?: number | null; ripeti_giorno?: number | null
  /** 1.0.4: quando è stata pagata e da quale conto */
  pagata_il?: string | null; conto_id?: number | null }
export const NOMI_RIPETI: Record<string, string> = { mensile: 'ogni mese', trimestrale: 'ogni 3 mesi', annuale: 'ogni anno' }
export { rateAperte, type RataAperta, type RataBase } from './report'
export interface PagamentoBase { id: number; parcella_id: number; data: string | null; importo: number; metodo: string; conto_id?: number | null }
/** Fattura letta dai file del servizio di fatturazione (sola lettura): dati del file e scelte fatte in TIO. */
export interface FatturaServizio { id: number; verso: 'emessa' | 'ricevuta'; tipo: string | null; numero: string; data: string; controparte: string | null; piva: string | null; cf: string | null; descrizione: string | null
  imponibile: number; iva: number; ritenuta: number; cassa: number; bollo: number; totale: number; netto: number; scadenza: string | null; file: string | null
  regolata_il: string | null; conto_id: number | null; categoria: string | null; nascosta: number }
export const CATEGORIA_FATTURE_RICEVUTE = 'Fatture ricevute'
/** Fatture emesse del servizio che sono già in TIO (stesso numero nello stesso anno): non si contano due volte. */
export function fattureDoppie(fatture: FatturaServizio[], parcelle: Parcella[]): Set<number> {
  const inTio = new Set(parcelle.filter((p) => (p.tipo === 'parcella' || p.tipo === 'nota_credito') && p.stato !== 'bozza' && p.stato !== 'annullata').map((p) => `${String(p.data).slice(0, 4)}|${String(p.numero).trim().toLowerCase()}`))
  return new Set(fatture.filter((f) => f.verso === 'emessa' && inTio.has(`${f.data.slice(0, 4)}|${f.numero.trim().toLowerCase()}`)).map((f) => f.id))
}
export interface Movimento {
  chiave: string; data: string; stato: StatoMovimento; importo: number; descrizione: string; dettaglio?: string
  pratica_id: number | null; parcella?: Parcella; costo?: CostoBase; scaduto: boolean
  /** conto su cui è arrivato o da cui è uscito il denaro (null: il conto predefinito) */
  conto_id?: number | null
  fattura?: FatturaServizio
  /** uscita ricorrente non ancora creata: solo una previsione */
  previsto?: boolean
  /** 1.0.4: rata di un piano di pagamento («rata 2 di 6») */
  rata?: string
  /** categoria di spesa (solo uscite) */
  categoria?: string
}

const giorno = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const piuGiorni = (s: string, n: number) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return giorno(new Date(y, m - 1, d + n)) }
const tondo = (n: number) => Math.round(n * 100) / 100

/**
 * Tutti i movimenti: per ogni documento di vendita emesso gli incassi (dal registro dei pagamenti se c'è, altrimenti
 * l'importo incassato alla data di pagamento) e il residuo alla scadenza (o a 30 giorni dall'emissione); per ogni voce
 * da pagare l'importo alla scadenza (o alla data della voce). Bozze, preventivi, note pro forma e documenti annullati non contano.
 */
export function movimenti(parcelle: Parcella[], costi: CostoBase[], pagamenti: PagamentoBase[], oggi = giorno(new Date()), terminiGiorni = 30, fatture: FatturaServizio[] = [], rate: RataBase[] = []): Movimento[] {
  const out: Movimento[] = []
  const ratePerDoc = new Map<number, RataBase[]>()
  for (const r of rate) ratePerDoc.set(r.parcella_id, [...(ratePerDoc.get(r.parcella_id) || []), r])
  const perDoc = new Map<number, PagamentoBase[]>()
  for (const x of pagamenti) perDoc.set(x.parcella_id, [...(perDoc.get(x.parcella_id) || []), x])
  for (const p of parcelle) {
    if (p.tipo !== 'parcella' || !['emessa', 'pagata'].includes(p.stato)) continue
    const base = { pratica_id: p.pratica_id, parcella: p, descrizione: `Documento n. ${p.numero}`, dettaglio: p.oggetto || undefined }
    const registro = p.incassi_dettagliati ? perDoc.get(p.id) || [] : []
    if (registro.length) registro.forEach((x) => out.push({ ...base, chiave: `inc-${x.id}`, data: (x.data || p.data_pagamento || p.data).slice(0, 10), stato: 'incassate', importo: tondo(x.importo), scaduto: false, conto_id: x.conto_id ?? null }))
    else { const inc = incassatoNetto(p); if (inc > 0) out.push({ ...base, chiave: `inc-p${p.id}`, data: (p.data_pagamento || p.data).slice(0, 10), stato: 'incassate', importo: tondo(inc), scaduto: false }) }
    const r = residuo(p)
    if (r > 0 && p.stato === 'emessa') {
      const sc = (p.scadenza_pagamento || piuGiorni(p.data, terminiGiorni)).slice(0, 10), piano = ratePerDoc.get(p.id)
      // 1.0.4: con un piano di pagamento il residuo è diviso nelle rate ancora aperte
      if (piano?.length) for (const x of rateAperte(piano, r, incassatoNetto(p), sc)) out.push({ ...base, chiave: x.id ? `rata-${x.id}` : `res-${p.id}`, data: x.data, stato: 'da_incassare', importo: x.importo, scaduto: x.data < oggi, rata: x.id ? `rata ${x.numero} di ${x.di}` : undefined, dettaglio: [x.id ? `rata ${x.numero} di ${x.di}` : 'oltre le rate', p.oggetto].filter(Boolean).join(' · ') })
      else out.push({ ...base, chiave: `res-${p.id}`, data: sc, stato: 'da_incassare', importo: r, scaduto: sc < oggi })
    }
  }
  for (const c of costi) {
    // pagata: conta il giorno in cui è stata pagata (dalla 1.0.4), altrimenti la scadenza
    const data = ((c.pagata && c.pagata_il) || c.scadenza || c.data).slice(0, 10)
    out.push({ chiave: `costo-${c.id}`, data, stato: c.pagata ? 'pagate' : 'da_pagare', importo: tondo(c.importo), descrizione: c.descrizione, dettaglio: c.categoria, categoria: c.categoria, pratica_id: c.pratica_id, costo: c, scaduto: !c.pagata && data < oggi, conto_id: c.conto_id ?? null })
  }
  // fatture lette dal servizio di fatturazione: incassate o pagate quando lo indica l'utente in TIO, altrimenti attese alla scadenza
  const doppie = fattureDoppie(fatture, parcelle)
  for (const f of fatture) {
    if (f.nascosta || doppie.has(f.id) || !f.netto) continue
    const emessa = f.verso === 'emessa', regolata = !!f.regolata_il
    const data = (f.regolata_il || f.scadenza || piuGiorni(f.data, terminiGiorni)).slice(0, 10)
    out.push({ chiave: `fs-${f.id}`, data, stato: emessa ? (regolata ? 'incassate' : 'da_incassare') : (regolata ? 'pagate' : 'da_pagare'), importo: tondo(Math.abs(f.netto)) * Math.sign(f.netto),
      descrizione: `Fattura n. ${f.numero}`, dettaglio: [f.controparte, 'dal servizio di fatturazione'].filter(Boolean).join(' · '), categoria: emessa ? undefined : f.categoria || CATEGORIA_FATTURE_RICEVUTE,
      pratica_id: null, fattura: f, scaduto: !regolata && data < oggi, conto_id: f.conto_id })
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.chiave.localeCompare(b.chiave))
}

/** Scadenza successiva di un'uscita ricorrente, con il giorno del mese riportato all'ultimo se il mese è più corto. */
export function prossimaScadenza(data: string, frequenza: string, giornoMese: number): string {
  const [y, m] = data.split('-').map(Number), passo = frequenza === 'annuale' ? 12 : frequenza === 'trimestrale' ? 3 : 1
  const t = new Date(Date.UTC(y, m - 1 + passo, 1)), ultimo = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(giornoMese, ultimo)); return t.toISOString().slice(0, 10)
}
/**
 * Uscite ricorrenti previste oltre quelle già create, fino a `fino` (compreso): servono allo scadenzario e al budget per
 * vedere l'affitto di marzo già a novembre. Copiano l'ultima voce della serie.
 */
export function usciteRicorrentiPreviste(costi: CostoBase[], fino: string): Movimento[] {
  const serie = new Map<number, CostoBase[]>()
  for (const c of costi) if (c.ripeti && c.serie) serie.set(c.serie, [...(serie.get(c.serie) || []), c])
  const out: Movimento[] = []
  for (const [id, voci] of serie) {
    const ultima = [...voci].sort((a, b) => (a.scadenza || a.data).localeCompare(b.scadenza || b.data) || a.id - b.id).at(-1)!
    if (!ultima.ripeti || !NOMI_RIPETI[ultima.ripeti]) continue
    let data = (ultima.scadenza || ultima.data).slice(0, 10)
    const g = ultima.ripeti_giorno || Number(data.slice(8))
    for (let i = 0; i < 400; i++) {
      data = prossimaScadenza(data, ultima.ripeti, g); if (data > fino) break
      out.push({ chiave: `prev-${id}-${data}`, data, stato: 'da_pagare', importo: tondo(ultima.importo), descrizione: ultima.descrizione, dettaglio: `${ultima.categoria} · prevista`, categoria: ultima.categoria, pratica_id: ultima.pratica_id, scaduto: false, previsto: true })
    }
  }
  return out
}

export interface Mese { mese: string; movimenti: Movimento[]; totali: Record<StatoMovimento, number>; saldo: number; previsto: number }
/** Movimenti divisi per mese («2026-11»), con i totali per stato, il saldo effettivo (incassato − pagato) e quello previsto. */
export function perMese(m: Movimento[]): Mese[] {
  const mesi = new Map<string, Movimento[]>()
  for (const x of m) mesi.set(x.data.slice(0, 7), [...(mesi.get(x.data.slice(0, 7)) || []), x])
  return [...mesi].sort(([a], [b]) => a.localeCompare(b)).map(([mese, movimenti]) => {
    const totali = ripartizione(movimenti)
    return { mese, movimenti, totali, saldo: tondo(totali.incassate - totali.pagate), previsto: tondo(totali.incassate + totali.da_incassare - totali.pagate - totali.da_pagare) }
  })
}
export interface MeseAnno { mese: string; totali: Record<StatoMovimento, number>; entrate: number; uscite: number; saldo: number; movimenti: number }
/** Panoramica dell'anno: sempre dodici mesi, ciascuno con entrate (incassate + da incassare), uscite (pagate + da pagare) e la loro differenza. */
export function annuale(m: Movimento[], anno: number): MeseAnno[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mese = `${anno}-${String(i + 1).padStart(2, '0')}`, suoi = m.filter((x) => x.data.startsWith(mese)), totali = ripartizione(suoi)
    const entrate = tondo(totali.incassate + totali.da_incassare), uscite = tondo(totali.pagate + totali.da_pagare)
    return { mese, totali, entrate, uscite, saldo: tondo(entrate - uscite), movimenti: suoi.length }
  })
}
export const ripartizione = (m: Movimento[]): Record<StatoMovimento, number> => {
  const t = { incassate: 0, da_incassare: 0, pagate: 0, da_pagare: 0 }
  for (const x of m) t[x.stato] = tondo(t[x.stato] + x.importo)
  return t
}

/** Spicchi della torta (angoli in gradi da ore 12, in senso orario); niente spicchi vuoti. */
export function spicchi(t: Record<StatoMovimento, number>) {
  const tot = STATI_MOVIMENTO.reduce((s, k) => s + Math.max(0, t[k]), 0)
  let da = 0
  return STATI_MOVIMENTO.filter((k) => t[k] > 0).map((k) => { const ampiezza = tot ? (t[k] / tot) * 360 : 0, s = { stato: k, da, a: da + ampiezza, quota: tot ? t[k] / tot : 0 }; da += ampiezza; return s })
}
/** Percorso SVG di uno spicchio di ciambella (centro 50,50). */
export function arco(da: number, a: number, r = 46, ri = 26): string {
  if (a - da >= 359.999) return `M50 ${50 - r}A${r} ${r} 0 1 1 49.99 ${50 - r}ZM50 ${50 - ri}A${ri} ${ri} 0 1 0 50.01 ${50 - ri}Z`
  const p = (ang: number, rr: number) => { const t = (ang - 90) * Math.PI / 180; return `${(50 + rr * Math.cos(t)).toFixed(3)} ${(50 + rr * Math.sin(t)).toFixed(3)}` }
  const grande = a - da > 180 ? 1 : 0
  return `M${p(da, r)}A${r} ${r} 0 ${grande} 1 ${p(a, r)}L${p(a, ri)}A${ri} ${ri} 0 ${grande} 0 ${p(da, ri)}Z`
}
