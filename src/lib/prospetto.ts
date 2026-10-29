import type { VoceParcella } from '../types'
import type { DettaglioCalcolo } from './compenso'
import { decimal, fmtNum } from './format'

/** Totali e aliquote necessari a comporre il prospetto finale. */
export interface TotaliProspetto {
  compensi: number; spese_generali: number; cpa: number; imponibile: number; iva: number
  spese_esenti: number; ritenuta: number; totale: number; netto: number; bollo: number
  sg_perc: number; cpa_perc: number; iva_perc: number; rit_perc: number
}
export interface RigaProspetto {
  label: string; valore?: string
  stile: 'riga' | 'sub' | 'barra' | 'totale' | 'sep'
}

const E = (n: number) => `€ ${fmtNum(n)}`
const pc = (n: number) => decimal(n).replace(/,00$/, '')
const imp = (v: VoceParcella) => (v.quantita || 0) * (v.importo || 0)

/**
 * Righe del «PROSPETTO FINALE», con le stesse voci e lo stesso ordine del prospetto dei parametri ministeriali.
 * `manuali` sono le voci inserite a mano oltre al calcolo; senza `dettaglio` tutte le voci sono manuali.
 * Usato sia dal pannello dell'editor sia dal PDF della nota pro forma.
 */
export function righeProspetto(t: TotaliProspetto, d: DettaglioCalcolo | null, manuali: VoceParcella[]): RigaProspetto[] {
  const r: RigaProspetto[] = []
  const riga = (label: string, valore: string, stile: RigaProspetto['stile'] = 'riga') => r.push({ label, valore, stile })
  const compManuali = manuali.filter((v) => v.tipo === 'compenso')
  const impManuali = manuali.filter((v) => v.tipo === 'spesa_imponibile')
  const esManuali = manuali.filter((v) => v.tipo === 'spesa_esente')
  const descr = (v: VoceParcella) => v.descrizione + (v.quantita && v.quantita !== 1 ? ` (${decimal(v.quantita)} × ${E(v.importo)})` : '')

  if (d) {
    const aum = d.aumentoEsito, dim = d.riduzionePraticante
    riga('Compenso tabellare', E(d.baseUlteriore))
    if (aum) riga('Totale variazioni in aumento', `+ ${E(aum)}`)
    if (dim) riga('Totale variazioni in diminuzione', `- ${E(dim)}`)
    compManuali.forEach((v) => riga(descr(v), E(imp(v))))
    if (aum || dim || compManuali.length) riga('Compenso totale', E(t.compensi), 'sub')
  } else if (compManuali.length > 1) {
    compManuali.forEach((v) => riga(descr(v), E(imp(v))))
    riga('Compenso totale', E(t.compensi), 'sub')
  } else {
    riga(compManuali.length === 1 ? descr(compManuali[0]) : 'Compenso totale', E(t.compensi))
  }
  if (t.spese_generali) riga(`Spese generali ( ${pc(t.sg_perc)}% sul compenso totale )`, E(t.spese_generali))
  if (d?.trasferta) riga('Spese di trasferta', E(d.trasferta))
  if (d?.altre) riga('Altre spese imponibili non relative a trasferte', E(d.altre))
  impManuali.forEach((v) => riga(descr(v), E(imp(v))))
  if (t.cpa_perc) riga(`Cassa Avvocati ( ${pc(t.cpa_perc)}% )`, E(t.cpa))
  if (t.iva_perc) {
    riga('Totale imponibile', E(t.imponibile), 'sub')
    r.push({ label: '', stile: 'sep' })
    riga(`IVA ${pc(t.iva_perc)}% su Imponibile`, E(t.iva))
  }
  const esCalcolo = t.spese_esenti - esManuali.reduce((s, v) => s + imp(v), 0)
  if (d && esCalcolo > 0.004) riga('Spese esenti ex art. 15, DPR 633/72', E(esCalcolo))
  esManuali.forEach((v) => riga(`${descr(v)} (esente art. 15)`, E(imp(v))))
  if (t.bollo) riga('Imposta di bollo', E(t.bollo))
  r.push({ label: '', stile: 'sep' })
  riga('IPOTESI DI COMPENSO LIQUIDABILE', E(t.totale), 'totale') // stessa dicitura del prospetto di avvocatoandreani.it (verificato il 21/10/2026)
  if (t.rit_perc) {
    r.push({ label: '', stile: 'sep' })
    riga(`A dedurre ritenuta d'acconto ${pc(t.rit_perc)}% (su compenso e spese imponibili)`, E(t.ritenuta))
    riga('Totale documento', E(t.netto), 'barra') // sul sito non è in corsivo: chiude il prospetto con una riga più marcata
  }
  return r
}
