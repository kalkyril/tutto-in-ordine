// Budget della pratica (1.0.4): ore previste, importo concordato e consegna confrontati con ciò che è registrato.
// Gli avvisi scattano all'80% (attenzione) e oltre il 100% (superato); la consegna avvisa nei 7 giorni prima e dopo.
import { valoreOra } from './attivita'

export interface PraticaBudget { id: number; titolo: string; numero?: string; stato?: string | null; budget_ore?: number | null; budget_importo?: number | null; consegna?: string | null }
export interface Consumo { ore: number; valoreOre: number; costi: number }
export type LivelloAvviso = 'attenzione' | 'superato'
export interface AvvisoPratica { pratica_id: number; tipo: 'ore' | 'importo' | 'consegna'; livello: LivelloAvviso; quota?: number; testo: string }

const tondo = (n: number) => Math.round(n * 100) / 100
const giorniTra = (da: string, a: string) => Math.round((Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+da.slice(0, 4), +da.slice(5, 7) - 1, +da.slice(8, 10))) / 86400000)
const livello = (q: number): LivelloAvviso | null => (q > 1 ? 'superato' : q >= 0.8 ? 'attenzione' : null)
const ore = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 })
const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

/** Ore, valore delle ore e costi registrati per ogni pratica: attività, spese anticipate e voci da pagare collegate. */
export function consumoPratiche(
  oreReg: { pratica_id: number | null; minuti: number; tariffa_oraria?: number | null; tariffa_totale?: number | null; tariffa_da_decidere?: number }[],
  spese: { pratica_id: number | null; importo: number }[],
  costi: { pratica_id: number | null; importo: number }[],
): Map<number, Consumo> {
  const m = new Map<number, Consumo>()
  const di = (id: number) => { let c = m.get(id); if (!c) m.set(id, (c = { ore: 0, valoreOre: 0, costi: 0 })); return c }
  for (const o of oreReg) if (o.pratica_id != null) { const c = di(o.pratica_id); c.ore += o.minuti / 60; c.valoreOre += valoreOra({ ...o, tariffa_oraria: Number(o.tariffa_oraria) || 0 }) }
  for (const s of [...spese, ...costi]) if (s.pratica_id != null) di(s.pratica_id).costi += Number(s.importo) || 0
  for (const c of m.values()) { c.ore = tondo(c.ore); c.valoreOre = tondo(c.valoreOre); c.costi = tondo(c.costi) }
  return m
}

/**
 * Avvisi di una pratica. Ore: registrate rispetto alle previste. Importo: costi più valore delle ore rispetto
 * all'importo concordato (è il margine che si consuma). Consegna: entro 7 giorni o già passata, solo se la pratica è aperta.
 */
export function avvisiPratica(p: PraticaBudget, c: Consumo | undefined, oggi: string, chiusa = false): AvvisoPratica[] {
  const out: AvvisoPratica[] = [], u = c || { ore: 0, valoreOre: 0, costi: 0 }
  if (p.budget_ore != null && p.budget_ore > 0) {
    const q = u.ore / p.budget_ore, l = livello(q)
    if (l) out.push({ pratica_id: p.id, tipo: 'ore', livello: l, quota: q, testo: l === 'superato' ? `ore oltre il previsto: ${ore(u.ore)} su ${ore(p.budget_ore)}` : `ore all’${Math.round(q * 100)}% del previsto (${ore(u.ore)} su ${ore(p.budget_ore)})` })
  }
  if (p.budget_importo != null && p.budget_importo > 0) {
    const speso = tondo(u.costi + u.valoreOre), q = speso / p.budget_importo, l = livello(q)
    if (l) out.push({ pratica_id: p.id, tipo: 'importo', livello: l, quota: q, testo: l === 'superato' ? `costi e ore oltre l’importo concordato: ${euro(speso)} su ${euro(p.budget_importo)}` : `costi e ore all’${Math.round(q * 100)}% dell’importo concordato` })
  }
  if (p.consegna && !chiusa) {
    const g = giorniTra(oggi, p.consegna.slice(0, 10))
    if (g < 0) out.push({ pratica_id: p.id, tipo: 'consegna', livello: 'superato', testo: `consegna passata da ${-g} ${g === -1 ? 'giorno' : 'giorni'}` })
    else if (g <= 7) out.push({ pratica_id: p.id, tipo: 'consegna', livello: 'attenzione', testo: g === 0 ? 'consegna oggi' : `consegna tra ${g} ${g === 1 ? 'giorno' : 'giorni'}` })
  }
  return out
}

/** Gli avvisi di tutte le pratiche aperte, i più gravi prima. */
export function avvisiPratiche(pratiche: PraticaBudget[], consumi: Map<number, Consumo>, oggi: string, chiuse: Set<string>): AvvisoPratica[] {
  return pratiche.filter((p) => !chiuse.has(p.stato || '')).flatMap((p) => avvisiPratica(p, consumi.get(p.id), oggi))
    .sort((a, b) => (a.livello === b.livello ? 0 : a.livello === 'superato' ? -1 : 1) || (b.quota ?? 0) - (a.quota ?? 0))
}
