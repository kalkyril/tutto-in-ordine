import type { VoceParcella } from '../types'
import { round2 } from './format'

export interface Aliquote { sg: number; cpa: number; iva: number; rit: number; bollo: number; contributo_ritenuta?: boolean }

/**
 * Calcolo parcella forense italiana (identico al prospetto del prospetto dei parametri ministeriali):
 * compensi + spese generali (% sui compensi) + spese imponibili (trasferte, altre) → base della CPA (% su tutto);
 * imponibile IVA = compensi + spese generali + spese imponibili + CPA; IVA sull'imponibile;
 * + spese esenti art. 15 (+ bollo se non c'è IVA); ritenuta d'acconto su compensi + spese generali + spese imponibili.
 */
export function calcolaParcella(voci: VoceParcella[], a: Aliquote) {
  const tot = (tipo: VoceParcella['tipo']) =>
    round2(voci.filter((v) => v.tipo === tipo).reduce((s, v) => s + (Number(v.quantita) || 0) * (Number(v.importo) || 0), 0))
  const compensi = tot('compenso')
  const speseImponibili = tot('spesa_imponibile')
  const speseEsenti = tot('spesa_esente')
  const spese_generali = round2(compensi * (a.sg / 100))
  const baseCpa = round2(compensi + spese_generali + speseImponibili)
  const cpa = round2(baseCpa * (a.cpa / 100))
  const imponibile = round2(baseCpa + cpa)
  const iva = round2(imponibile * (a.iva / 100))
  const ritenuta = round2((baseCpa + (a.contributo_ritenuta ? cpa : 0)) * (a.rit / 100))
  const bollo = speseEsenti + imponibile > 77.47 && a.iva === 0 ? a.bollo : 0
  const totale = round2(imponibile + iva + speseEsenti + bollo)
  const netto = round2(totale - ritenuta)
  return { compensi, spese_generali, cpa, imponibile, iva, spese_esenti: speseEsenti, ritenuta, totale, netto, bollo }
}
