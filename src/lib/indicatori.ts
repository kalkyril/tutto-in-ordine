// Indicatori (1.0.4): pochi numeri che dicono come va l'attività, calcolati sui dati che TIO ha già.
// Tempi di incasso, andamento rispetto all'anno prima, peso dei clienti e margine di clienti e lavori.
import type { Parcella } from '../types'
import type { FatturaServizio, Movimento } from './pagamenti'

const tondo = (n: number) => Math.round(n * 100) / 100
const giorni = (da: string, a: string) => Math.round((Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+da.slice(0, 4), +da.slice(5, 7) - 1, +da.slice(8, 10))) / 86400000)
const piuGiorni = (s: string, n: number) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
const valido = (p: Parcella) => (p.tipo === 'parcella' || p.tipo === 'nota_credito') && p.stato !== 'bozza' && p.stato !== 'annullata'
const segno = (p: Parcella) => (p.tipo === 'nota_credito' ? -1 : 1)

export interface DatiIndicatori {
  anno: number; oggi: string; terminiGiorni?: number
  parcelle: Parcella[]; movimenti: Movimento[]; fatture?: FatturaServizio[]
  costi: { pratica_id: number | null; data: string; importo: number }[]
  spese: { pratica_id: number | null; data: string; importo: number }[]
  pratiche: { id: number; titolo: string; numero?: string; cliente_id: number | null }[]
  nomeCliente: (id: number) => string | undefined
}
export interface RigaMargine { chiave: string; nome: string; dettaglio?: string; fatturato: number; costi: number; margine: number; quota?: number; percentuale: number | null }
export interface Indicatori {
  incasso: { giorniMedi: number | null; puntuali: number | null; documenti: number; scaduti: number; etaScaduti: number | null }
  andamento: { incassato: number; incassatoPrima: number; variazione: number | null; pagato: number; pagatoPrima: number; mediaEntrate: number; mediaUscite: number }
  clienti: RigaMargine[]; primoCliente: number | null; primiTre: number | null
  lavori: RigaMargine[]; inPerdita: number
}

export function calcolaIndicatori(x: DatiIndicatori): Indicatori {
  const { anno, oggi } = x, termini = x.terminiGiorni ?? 30
  // ---- tempi di incasso: documenti pagati negli ultimi 12 mesi, media dei giorni pesata sull'importo
  const daUnAnno = piuGiorni(oggi, -365)
  const pagati = x.parcelle.filter((p) => p.tipo === 'parcella' && p.stato === 'pagata' && p.data_pagamento && p.data_pagamento.slice(0, 10) >= daUnAnno && p.data_pagamento.slice(0, 10) <= oggi && p.netto > 0)
  const peso = pagati.reduce((s, p) => s + p.netto, 0)
  const giorniMedi = peso ? Math.round(pagati.reduce((s, p) => s + Math.max(0, giorni(p.data.slice(0, 10), p.data_pagamento!.slice(0, 10))) * p.netto, 0) / peso) : null
  const puntuali = pagati.length ? pagati.filter((p) => p.data_pagamento!.slice(0, 10) <= (p.scadenza_pagamento || piuGiorni(p.data, termini)).slice(0, 10)).length / pagati.length : null
  const scadutiM = x.movimenti.filter((m) => m.stato === 'da_incassare' && m.scaduto)
  const scaduti = tondo(scadutiM.reduce((s, m) => s + m.importo, 0))
  const etaScaduti = scaduti > 0 ? Math.round(scadutiM.reduce((s, m) => s + giorni(m.data, oggi) * m.importo, 0) / scaduti) : null

  // ---- andamento: da inizio anno a oggi, confrontato con lo stesso periodo dell'anno prima; media mensile degli ultimi 12 mesi
  const fino = oggi.slice(5), stessoPeriodo = (d: string, a: number) => d.startsWith(String(a)) && d.slice(5) <= fino
  const somma = (stato: string, f: (d: string) => boolean) => tondo(x.movimenti.filter((m) => m.stato === stato && !m.previsto && f(m.data)).reduce((s, m) => s + m.importo, 0))
  const incassato = somma('incassate', (d) => stessoPeriodo(d, anno)), incassatoPrima = somma('incassate', (d) => stessoPeriodo(d, anno - 1))
  const ultimi = (d: string) => d > daUnAnno && d <= oggi
  const andamento = { incassato, incassatoPrima, variazione: incassatoPrima > 0 ? (incassato - incassatoPrima) / incassatoPrima : null,
    pagato: somma('pagate', (d) => stessoPeriodo(d, anno)), pagatoPrima: somma('pagate', (d) => stessoPeriodo(d, anno - 1)),
    mediaEntrate: tondo(somma('incassate', ultimi) / 12), mediaUscite: tondo(somma('pagate', ultimi) / 12) }

  // ---- margine: fatturato (imponibile dei documenti emessi) meno costi diretti (spese anticipate e voci da pagare del lavoro)
  const praticaDi = new Map(x.pratiche.map((p) => [p.id, p]))
  const costiDi = (f: (pratica_id: number, data: string) => boolean) => { const m = new Map<number, number>(); for (const c of [...x.costi, ...x.spese]) if (c.pratica_id != null && f(c.pratica_id, c.data)) m.set(c.pratica_id, (m.get(c.pratica_id) || 0) + Number(c.importo || 0)); return m }
  const riga = (chiave: string, nome: string, fatturato: number, costi: number, dettaglio?: string): RigaMargine => { const margine = tondo(fatturato - costi); return { chiave, nome, dettaglio, fatturato: tondo(fatturato), costi: tondo(costi), margine, percentuale: fatturato > 0 ? margine / fatturato : null } }

  // clienti, nell'anno: documenti di TIO per cliente e fatture emesse lette dal servizio per controparte
  const clienti = new Map<string, { nome: string; fatturato: number; costi: number }>()
  const cliente = (k: string, nome: string) => { let c = clienti.get(k); if (!c) clienti.set(k, (c = { nome, fatturato: 0, costi: 0 })); return c }
  for (const p of x.parcelle) if (valido(p) && p.data.startsWith(String(anno))) cliente(`c${p.cliente_id ?? 0}`, (p.cliente_id && x.nomeCliente(p.cliente_id)) || 'Senza cliente').fatturato += segno(p) * (p.imponibile || 0)
  const numeriTio = new Set(x.parcelle.filter(valido).map((p) => `${String(p.data).slice(0, 4)}|${String(p.numero).trim().toLowerCase()}`))
  for (const f of x.fatture || []) if (f.verso === 'emessa' && !f.nascosta && f.data.startsWith(String(anno)) && !numeriTio.has(`${f.data.slice(0, 4)}|${f.numero.trim().toLowerCase()}`)) cliente(`f${(f.piva || f.cf || f.controparte || '').toLowerCase()}`, f.controparte || 'Senza nome').fatturato += f.imponibile
  for (const [pid, importo] of costiDi((_, d) => d.startsWith(String(anno)))) { const p = praticaDi.get(pid); if (p?.cliente_id) cliente(`c${p.cliente_id}`, x.nomeCliente(p.cliente_id) || 'Senza cliente').costi += importo }
  const totale = [...clienti.values()].reduce((s, c) => s + Math.max(0, c.fatturato), 0)
  const righeClienti = [...clienti.entries()].map(([k, c]) => ({ ...riga(k, c.nome, c.fatturato, c.costi), quota: totale > 0 ? Math.max(0, c.fatturato) / totale : 0 }))
    .filter((r) => r.fatturato || r.costi).sort((a, b) => b.fatturato - a.fatturato)
  const quote = righeClienti.map((r) => r.quota || 0)

  // lavori: dall'inizio del lavoro, perché un lavoro attraversa spesso più anni
  const fattLavoro = new Map<number, number>()
  for (const p of x.parcelle) if (valido(p) && p.pratica_id != null) fattLavoro.set(p.pratica_id, (fattLavoro.get(p.pratica_id) || 0) + segno(p) * (p.imponibile || 0))
  const costiLavoro = costiDi(() => true)
  const lavori = [...new Set([...fattLavoro.keys(), ...costiLavoro.keys()])].map((id) => { const p = praticaDi.get(id); return riga(`p${id}`, p?.titolo || `Lavoro ${id}`, fattLavoro.get(id) || 0, costiLavoro.get(id) || 0, [p?.numero, p?.cliente_id ? x.nomeCliente(p.cliente_id) : undefined].filter(Boolean).join(' · ') || undefined) })
    .sort((a, b) => a.margine - b.margine)

  return {
    incasso: { giorniMedi, puntuali, documenti: pagati.length, scaduti, etaScaduti },
    andamento,
    clienti: righeClienti, primoCliente: quote.length ? quote[0] : null, primiTre: quote.length ? quote.slice(0, 3).reduce((s, q) => s + q, 0) : null,
    lavori, inPerdita: lavori.filter((l) => l.margine < 0).length,
  }
}
