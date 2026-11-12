// Pagamenti: movimenti di denaro dell'attività (incassi dei documenti di vendita e voci da pagare) raggruppati per mese,
// e la ripartizione di una pratica o commessa (incassato, da incassare, pagato, da pagare) per il grafico a torta.
import type { Parcella } from '../types'
import { incassatoNetto, residuo } from './report'

export type StatoMovimento = 'incassate' | 'da_incassare' | 'pagate' | 'da_pagare'
export const STATI_MOVIMENTO: StatoMovimento[] = ['incassate', 'da_incassare', 'pagate', 'da_pagare']
export const NOMI_MOVIMENTO: Record<StatoMovimento, string> = { incassate: 'Incassate', da_incassare: 'Da incassare', pagate: 'Pagate', da_pagare: 'Da pagare' }
/** Colori predefiniti (scelti per essere distinguibili anche da chi non vede bene rosso e verde: diversi anche di luminosità). */
export const COLORI_MOVIMENTO: Record<StatoMovimento, string> = { incassate: '#15803d', da_incassare: '#60a5fa', pagate: '#475569', da_pagare: '#f97316' }
export const coloriMovimento = (s: { colori_pagamenti?: Partial<Record<StatoMovimento, string>> }): Record<StatoMovimento, string> => {
  const c = s.colori_pagamenti || {}
  return Object.fromEntries(STATI_MOVIMENTO.map((k) => [k, /^#[0-9a-f]{6}$/i.test(c[k] || '') ? c[k]! : COLORI_MOVIMENTO[k]])) as Record<StatoMovimento, string>
}

export interface CostoBase { id: number; pratica_id: number | null; fornitore_id: number | null; data: string; descrizione: string; categoria: string; importo: number; scadenza: string | null; pagata: number; contabile?: string | null }
export interface PagamentoBase { id: number; parcella_id: number; data: string | null; importo: number; metodo: string }
export interface Movimento {
  chiave: string; data: string; stato: StatoMovimento; importo: number; descrizione: string; dettaglio?: string
  pratica_id: number | null; parcella?: Parcella; costo?: CostoBase; scaduto: boolean
}

const giorno = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const piuGiorni = (s: string, n: number) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return giorno(new Date(y, m - 1, d + n)) }
const tondo = (n: number) => Math.round(n * 100) / 100

/**
 * Tutti i movimenti: per ogni documento di vendita emesso gli incassi (dal registro dei pagamenti se c'è, altrimenti
 * l'importo incassato alla data di pagamento) e il residuo alla scadenza (o a 30 giorni dall'emissione); per ogni voce
 * da pagare l'importo alla scadenza (o alla data della voce). Bozze, preventivi, note pro forma e documenti annullati non contano.
 */
export function movimenti(parcelle: Parcella[], costi: CostoBase[], pagamenti: PagamentoBase[], oggi = giorno(new Date()), terminiGiorni = 30): Movimento[] {
  const out: Movimento[] = []
  const perDoc = new Map<number, PagamentoBase[]>()
  for (const x of pagamenti) perDoc.set(x.parcella_id, [...(perDoc.get(x.parcella_id) || []), x])
  for (const p of parcelle) {
    if (p.tipo !== 'parcella' || !['emessa', 'pagata'].includes(p.stato)) continue
    const base = { pratica_id: p.pratica_id, parcella: p, descrizione: `Documento n. ${p.numero}`, dettaglio: p.oggetto || undefined }
    const registro = p.incassi_dettagliati ? perDoc.get(p.id) || [] : []
    if (registro.length) registro.forEach((x) => out.push({ ...base, chiave: `inc-${x.id}`, data: (x.data || p.data_pagamento || p.data).slice(0, 10), stato: 'incassate', importo: tondo(x.importo), scaduto: false }))
    else { const inc = incassatoNetto(p); if (inc > 0) out.push({ ...base, chiave: `inc-p${p.id}`, data: (p.data_pagamento || p.data).slice(0, 10), stato: 'incassate', importo: tondo(inc), scaduto: false }) }
    const r = residuo(p)
    if (r > 0 && p.stato === 'emessa') { const sc = (p.scadenza_pagamento || piuGiorni(p.data, terminiGiorni)).slice(0, 10); out.push({ ...base, chiave: `res-${p.id}`, data: sc, stato: 'da_incassare', importo: r, scaduto: sc < oggi }) }
  }
  for (const c of costi) {
    const data = (c.scadenza || c.data).slice(0, 10)
    out.push({ chiave: `costo-${c.id}`, data, stato: c.pagata ? 'pagate' : 'da_pagare', importo: tondo(c.importo), descrizione: c.descrizione, dettaglio: c.categoria, pratica_id: c.pratica_id, costo: c, scaduto: !c.pagata && data < oggi })
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.chiave.localeCompare(b.chiave))
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
