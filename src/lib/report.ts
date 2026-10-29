import type { Anagrafica, Ora, Parcella, Pratica, Settings, Spesa } from '../types'
import { parse } from './dates'
import { fmtNum } from './format'

export const incassatoNetto = (p: Parcella) => p.stato === 'pagata' ? p.netto : p.stato === 'emessa' ? Math.min(p.netto, Math.max(0, p.incassato || 0)) : 0
export const residuo = (p: Parcella) => Math.max(0, Math.round((p.netto - incassatoNetto(p)) * 100) / 100)

const num = (n: number) => (Math.round((n || 0) * 100) / 100).toFixed(2).replace('.', ',')
// una cella che inizia con = + - @ verrebbe interpretata da Excel come formula: si antepone un apice
const testo = (s: unknown) => { let t = String(s ?? '').replace(/\r?\n/g, ' ').trim(); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t }
const dataIt = (s?: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '')

const TIPO: Record<string, string> = { preventivo: 'Preventivo', parcella: 'Parcella', proforma: 'Nota pro forma', nota_credito: 'Nota di credito' }

/** Prima nota / registro dei documenti dell'anno in CSV (separatore «;», decimali con virgola, apribile con Excel). */
export function primaNotaCsv(parcelle: Parcella[], anagrafica: Map<number, Anagrafica>, pratiche: Map<number, Pratica>, anno: number, nomeDocumento = 'Parcella'): string {
  const intest = ['Numero', 'Data', 'Tipo', 'Stato', 'Cliente', 'Codice fiscale', 'Partita IVA', 'Pratica', 'Oggetto', 'Compensi', 'Spese generali', 'CPA', 'Imponibile', 'IVA', 'Spese esenti art. 15', 'Bollo', 'Ritenuta', 'Totale', 'Netto a pagare', 'Data pagamento']
  const righe = parcelle.filter((p) => p.anno === anno).sort((a, b) => a.data.localeCompare(b.data) || a.progressivo - b.progressivo).map((p) => {
    const c = p.cliente_id ? anagrafica.get(p.cliente_id) : undefined, pr = p.pratica_id ? pratiche.get(p.pratica_id) : undefined
    const annullata = p.stato === 'annullata'
    // la nota di credito compensa la fattura stornata: importi negativi
    const v = (n: number) => (annullata ? num(0) : num(p.tipo === 'nota_credito' ? -n : n))
    return [p.numero, dataIt(p.data), p.tipo === 'parcella' ? nomeDocumento : TIPO[p.tipo] || p.tipo, p.stato, c?.denominazione, c?.codice_fiscale, c?.partita_iva, pr ? `${pr.numero ? pr.numero + ' ' : ''}${pr.titolo}` : '', p.oggetto,
      v(p.compensi), v(p.spese_generali), v(p.cpa), v(p.imponibile), v(p.iva), v(p.spese_esenti), v(p.bollo), v(p.ritenuta), v(p.totale), v(p.netto), dataIt(p.data_pagamento)].map((x, i) => (i >= 9 && i <= 18 ? String(x) : testo(x))).join(';')
  })
  const tot = parcelle.filter((p) => p.anno === anno && (p.tipo === 'parcella' || p.tipo === 'nota_credito') && p.stato !== 'annullata' && p.stato !== 'bozza')
  const somma = (k: keyof Parcella) => tot.reduce((s, p) => s + (Number(p[k]) || 0) * (p.tipo === 'nota_credito' ? -1 : 1), 0)
  const riga = ['', '', '', '', '', '', '', '', 'TOTALE parcelle emesse e pagate', ...(['compensi', 'spese_generali', 'cpa', 'imponibile', 'iva', 'spese_esenti', 'bollo', 'ritenuta', 'totale', 'netto'] as (keyof Parcella)[]).map((k) => num(somma(k))), ''].join(';')
  return '﻿' + [intest.join(';'), ...righe, riga].join('\r\n') + '\r\n'
}

export interface Sollecito { parcella: Parcella; cliente?: Anagrafica; giorni: number; scadenza: string }
/** Parcelle emesse e non ancora pagate: giorni dalla scadenza (data di emissione + termine di pagamento), dalla più vecchia. */
export function solleciti(parcelle: Parcella[], anagrafica: Map<number, Anagrafica>, oggi = new Date(), terminiGiorni = 30): Sollecito[] {
  const o = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  return parcelle.filter((p) => p.tipo === 'parcella' && p.stato === 'emessa' && residuo(p) > 0).map((p) => {
    const d = parse(p.data, 0) || o
    const sc = p.scadenza_pagamento ? parse(p.scadenza_pagamento, 0) || d : new Date(d.getFullYear(), d.getMonth(), d.getDate() + terminiGiorni)
    return { parcella: p, cliente: p.cliente_id ? anagrafica.get(p.cliente_id) : undefined, giorni: Math.round((o.getTime() - sc.getTime()) / 86400000), scadenza: `${sc.getFullYear()}-${String(sc.getMonth() + 1).padStart(2, '0')}-${String(sc.getDate()).padStart(2, '0')}` }
  }).sort((a, b) => b.giorni - a.giorni)
}

/** Testo cortese di sollecito (da rileggere e adattare prima dell'invio). */
export function testoSollecito(s: Sollecito, st: Settings['studio']): { oggetto: string; corpo: string } {
  const p = s.parcella, nome = s.cliente?.denominazione || ''
  const importo = `€ ${fmtNum(residuo(p))}`
  const ritardo = s.giorni > 0
  return {
    oggetto: `Promemoria di pagamento — nota n. ${p.numero}`,
    corpo: [`Gentile ${nome || 'cliente'},`, '',
      `con la presente Le ricordo che la nota n. ${p.numero} del ${dataIt(p.data)}${p.oggetto ? ` (${p.oggetto.replace(/\s+/g, ' ').trim()})` : ''}, dell'importo di ${importo}, ${ritardo ? `risulta ancora da saldare (scadenza ${dataIt(s.scadenza)})` : `scade il ${dataIt(s.scadenza)}`}.`,
      ...(st?.iban ? ['', `Le coordinate per il pagamento sono: ${st.iban}.`] : []),
      '', 'Se ha già provveduto, La prego di ignorare questo messaggio e di inviarmi, se possibile, la contabile.', '', 'Cordiali saluti',
      st?.titolare || st?.nome || ''].join('\n'),
  }
}

export interface RedditivitaPratica { pratica: Pratica; minuti: number; valoreOre: number; spese: number; fatturato: number; incassato: number; daIncassare: number; oreNonFatturate: number }
/** Per ogni pratica: ore, valore delle ore, spese anticipate, fatturato e incassato; utile per capire quali pratiche rendono. */
export function redditivita(pratiche: Pratica[], ore: Ora[], spese: Spesa[], parcelle: Parcella[]): RedditivitaPratica[] {
  return pratiche.map((pratica) => {
    const o = ore.filter((x) => x.pratica_id === pratica.id), s = spese.filter((x) => x.pratica_id === pratica.id)
    const f = parcelle.filter((x) => x.pratica_id === pratica.id && x.tipo === 'parcella' && (x.stato === 'emessa' || x.stato === 'pagata'))
    return {
      pratica, minuti: o.reduce((t, x) => t + x.minuti, 0), valoreOre: o.reduce((t, x) => t + (x.minuti / 60) * x.tariffa_oraria, 0), spese: s.reduce((t, x) => t + x.importo, 0),
      fatturato: f.reduce((t, x) => t + x.imponibile, 0), incassato: f.reduce((t, x) => t + (x.netto ? x.imponibile * incassatoNetto(x) / x.netto : 0), 0), daIncassare: f.filter((x) => x.stato === 'emessa').reduce((t, x) => t + residuo(x), 0),
      oreNonFatturate: o.filter((x) => !x.parcella_id).reduce((t, x) => t + (x.minuti / 60) * x.tariffa_oraria, 0),
    }
  }).filter((r) => r.minuti || r.spese || r.fatturato).sort((a, b) => b.fatturato - a.fatturato || b.valoreOre - a.valoreOre)
}

export const csvPratiche = (righe: RedditivitaPratica[]) => '﻿' + [['Pratica', 'Titolo', 'Ore', 'Valore ore', 'Spese anticipate', 'Fatturato (imponibile)', 'Incassato (imponibile)', 'Da incassare', 'Ore non ancora fatturate (valore)'].join(';'),
  ...righe.map((r) => [testo(r.pratica.numero), testo(r.pratica.titolo), num(r.minuti / 60), num(r.valoreOre), num(r.spese), num(r.fatturato), num(r.incassato), num(r.daIncassare), num(r.oreNonFatturate)].join(';'))].join('\r\n') + '\r\n'

/** Una riga per voce, da verificare e adattare al proprio servizio fiscale. Nessuna trasmissione. */
export function datiFatturazioneCsv(documenti: Parcella[], anagrafica: Map<number, Anagrafica>): string {
  const header=['Documento TIO','Data','Tipo','Cliente','CF','Partita IVA','Indirizzo','CAP','Città','Provincia','PEC','Email','Oggetto','Tipo voce','Descrizione voce','Quantità','Importo unitario','Contributo','Contributo %','IVA %','Ritenuta %','Bollo','Netto documento']
  const rows=documenti.flatMap(p=>{const c=anagrafica.get(p.cliente_id||0);return (p.voci||[]).map(v=>[p.numero,p.data,TIPO[p.tipo],c?.denominazione,c?.codice_fiscale,c?.partita_iva,c?.indirizzo,c?.cap,c?.citta,c?.provincia,c?.pec,c?.email,p.oggetto,v.tipo,v.descrizione,num(v.quantita),num(v.importo),p.contributo_nome||'CPA',num(p.cpa_perc),num(p.iva_perc),num(p.rit_perc),num(p.bollo),num(p.netto)].map(testo).join(';'))})
  return '\uFEFF'+[header.join(';'),...rows].join('\r\n')+'\r\n'
}
