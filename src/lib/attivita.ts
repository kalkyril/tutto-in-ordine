import type { Documento, Ora } from '../types'

/** Tempo scritto dall'utente → minuti. Accetta «1:30», «90m», «1h 30», «1,5» (ore decimali). 0 se non valido. */
export function parseDurata(s: string): number {
  const t = String(s ?? '').trim().toLowerCase().replace(',', '.')
  if (!t) return 0
  let m = t.match(/^(\d+):(\d{1,2})$/)
  if (m) return +m[1] * 60 + +m[2]
  m = t.match(/^(\d+(?:\.\d+)?)\s*m(?:in)?$/)
  if (m) return Math.round(+m[1])
  m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*(?:m(?:in)?)?)?)$/)
  if (m) return Math.round(+m[1] * 60) + (m[2] ? +m[2] : 0)
  if (/^\d+(?:\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60)
  return 0
}

/** Minuti → testo breve («1 h 30 min»). */
export function testoDurata(min: number): string {
  const m = Math.max(0, Math.round(min)), h = Math.floor(m / 60), r = m % 60
  return h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`
}

const chiave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export interface GruppoAttivita { titolo: string; volte: number; minuti: number; valore: number; allegati: number; quota: number }
export interface Riepilogo { minuti: number; valore: number; attivita: number; allegati: number; daFatturare: number; gruppi: GruppoAttivita[]; primaData?: string; ultimaData?: string }

/** Riassunto delle attività di una pratica: totali e raggruppamento per tipo di attività («Invio PEC» ripetuta più volte = una riga). */
export function riepilogoAttivita(ore: Ora[], documenti: Documento[]): Riepilogo {
  const perOra = new Map<number, number>(); for (const d of documenti) if (d.ora_id) perOra.set(d.ora_id, (perOra.get(d.ora_id) || 0) + 1)
  const gruppi = new Map<string, GruppoAttivita>()
  let minuti = 0, valore = 0, allegati = 0, daFatturare = 0
  for (const o of ore) {
    const v = (o.minuti / 60) * o.tariffa_oraria, a = perOra.get(o.id) || 0
    minuti += o.minuti; valore += v; allegati += a; if (!o.parcella_id) daFatturare += v
    const k = chiave(o.descrizione) || '(senza titolo)'
    const g = gruppi.get(k) || { titolo: o.descrizione.trim(), volte: 0, minuti: 0, valore: 0, allegati: 0, quota: 0 }
    g.volte++; g.minuti += o.minuti; g.valore += v; g.allegati += a; gruppi.set(k, g)
  }
  const lista = [...gruppi.values()].sort((x, y) => y.minuti - x.minuti || x.titolo.localeCompare(y.titolo)).map((g) => ({ ...g, quota: minuti ? g.minuti / minuti : 0 }))
  const date = ore.map((o) => o.data).filter(Boolean).sort()
  return { minuti, valore, attivita: ore.length, allegati, daFatturare, gruppi: lista, primaData: date[0], ultimaData: date[date.length - 1] }
}
