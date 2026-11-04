// Fatture degli avvocati e relativi conti, come nella sezione «Fatturazione avvocati» di avvocatoandreani.it:
// fattura da onorari e spese, scorporo da un importo complessivo, ritenuta d'acconto e compenso a tempo.
// Stesse regole di calcolaParcella (spese generali sui compensi, CPA su compensi + spese generali + spese imponibili,
// IVA sull'imponibile, spese esenti art. 15 DPR 633/72 fuori campo, ritenuta su compensi + spese generali + spese imponibili).
import { calcolaParcella, type Aliquote } from './calc'
import { round2 } from './format'
import type { VoceParcella } from '../types'

/** Codici delle voci del menu «Competenza» (fuori dagli intervalli delle tabelle ministeriali). */
export const CONTI = [
  { cod: 800, nome: 'Fattura avvocati e studi legali' },
  { cod: 810, nome: 'Scorporo importi' },
  { cod: 820, nome: 'Calcolo ritenuta d’acconto' },
  { cod: 830, nome: 'Compenso a ore' },
] as const
export const eConti = (competenza: number) => CONTI.some((c) => c.cod === competenza)

export type Regime = 'ordinario' | 'forfettario'
export type BaseScorporo = 'totale' | 'netto' | 'imponibile'
export interface ContiStato {
  onorari: string; speseEsenti: string; speseImponibili: string
  sgOn: boolean; sgPct: string; cpaOn: boolean; ivaOn: boolean; ritOn: boolean; ritPct: string; cpaInRitenuta: boolean
  regime: Regime; bolloOn: boolean
  importo: string; base: BaseScorporo
  ore: string; minuti: string; tariffa: string
}

const BOLLO = 2
const SOGLIA_BOLLO = 77.47

/** Aliquote effettive: nel regime forfettario niente IVA né ritenuta; il bollo si addebita solo se scelto. */
export function aliquoteConti(s: Pick<ContiStato, 'sgOn' | 'cpaOn' | 'ivaOn' | 'ritOn' | 'regime' | 'bolloOn' | 'cpaInRitenuta'>, sgPct: number, base: { cpa: number; iva: number; rit: number }): Aliquote {
  const forf = s.regime === 'forfettario'
  return { sg: s.sgOn ? sgPct : 0, cpa: s.cpaOn ? base.cpa : 0, iva: !forf && s.ivaOn ? base.iva : 0, rit: !forf && s.ritOn ? base.rit : 0, bollo: s.bolloOn ? BOLLO : 0, contributo_ritenuta: s.cpaInRitenuta }
}

const voci = (onorari: number, speseImponibili: number, speseEsenti: number, descrizione = 'Onorari'): VoceParcella[] => [
  ...(onorari ? [{ tipo: 'compenso' as const, descrizione, quantita: 1, importo: onorari }] : []),
  ...(speseImponibili ? [{ tipo: 'spesa_imponibile' as const, descrizione: 'Spese imponibili', quantita: 1, importo: speseImponibili }] : []),
  ...(speseEsenti ? [{ tipo: 'spesa_esente' as const, descrizione: 'Spese anticipate (art. 15 DPR 633/72)', quantita: 1, importo: speseEsenti }] : []),
]

/** Valore che lo scorporo deve ritrovare, dal risultato del calcolo in avanti. */
const obiettivo = (t: ReturnType<typeof calcolaParcella>, base: BaseScorporo) => (base === 'totale' ? t.totale : base === 'netto' ? t.netto : t.imponibile)

/**
 * Scorporo: gli onorari che, con spese, spese generali, CPA, IVA, ritenuta e bollo, danno l'importo indicato
 * (totale del documento, netto a pagare o imponibile). Si risolve la formula inversa e poi si corregge di qualche
 * centesimo, perché ogni voce è arrotondata.
 */
export function scorpora(importo: number, base: BaseScorporo, a: Aliquote, speseEsenti: number, speseImponibili: number): { onorari: number; differenza: number } {
  if (!(importo > 0)) return { onorari: 0, differenza: 0 }
  const g = a.sg / 100, c = a.cpa / 100, v = a.iva / 100, r = a.rit / 100
  const bollo = a.iva === 0 && a.bollo && importo > SOGLIA_BOLLO ? a.bollo : 0
  const k = (1 + c) * (1 + v)
  // baseCpa = compensi × (1 + g) + spese imponibili
  const baseCpa = base === 'imponibile' ? importo / (1 + c)
    : base === 'totale' ? (importo - speseEsenti - bollo) / k
    : (importo - speseEsenti - bollo) / (k - r * (a.contributo_ritenuta ? 1 + c : 1))
  const stima = Math.max(0, round2((baseCpa - speseImponibili) / (1 + g)))
  const prova = (o: number) => obiettivo(calcolaParcella(voci(o, speseImponibili, speseEsenti), a), base)
  let migliore = stima, scarto = Math.abs(prova(stima) - importo)
  for (let d = -10; d <= 10 && scarto > 0.001; d++) {
    const o = round2(stima + d / 100); if (o < 0) continue
    const s = Math.abs(prova(o) - importo)
    if (s < scarto - 0.0001) { migliore = o; scarto = s }
  }
  return { onorari: migliore, differenza: round2(prova(migliore) - importo) }
}

/** Onorari del compenso a tempo: ore e minuti per la tariffa oraria. */
export const compensoOre = (ore: number, minuti: number, tariffa: number) => round2((Math.max(0, ore) + Math.max(0, minuti) / 60) * Math.max(0, tariffa))

export interface ContiRisultato { voci: VoceParcella[]; aliquote: Aliquote; onorari: number; differenza: number }
/** Voci e aliquote del documento per la voce scelta del menu. `n` legge i numeri scritti all'italiana. */
export function calcolaConti(cod: number, s: ContiStato, base: { cpa: number; iva: number; rit: number }, n: (x: string) => number): ContiRisultato {
  const ritBase = cod === 820 ? { ...base, rit: n(s.ritPct) || base.rit } : base
  const a = aliquoteConti(cod === 820 ? { ...s, ritOn: true } : s, n(s.sgPct), ritBase)
  const esenti = n(s.speseEsenti), imponibili = n(s.speseImponibili)
  if (cod === 810) {
    const sc = scorpora(n(s.importo), s.base, a, esenti, imponibili)
    return { voci: voci(sc.onorari, imponibili, esenti), aliquote: a, onorari: sc.onorari, differenza: sc.differenza }
  }
  if (cod === 830) {
    const h = n(s.ore), m = n(s.minuti), t = n(s.tariffa)
    const o = compensoOre(h, m, t)
    const durata = [h ? `${String(h).replace('.', ',')} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 h'
    return { voci: voci(o, imponibili, esenti, `Compenso a tempo: ${durata} × € ${t.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ora`), aliquote: a, onorari: o, differenza: 0 }
  }
  const o = round2(n(s.onorari))
  return { voci: voci(o, imponibili, esenti), aliquote: a, onorari: o, differenza: 0 }
}
