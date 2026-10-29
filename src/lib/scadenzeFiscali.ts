// Scadenze fiscali e previdenziali ricorrenti, pronte da aggiungere alle attività ricorrenti (un compito a ogni scadenza).
// Date ordinarie del calendario fiscale italiano: proroghe, sabati e festivi le spostano; vanno sempre verificate con il
// commercialista. Sabati e festivi slittano da soli al primo giorno lavorativo (art. 7 DL 70/2011). Ogni voce diventa
// una o più ricorrenze annuali (o una mensile), modificabili e eliminabili come le altre.
import type { Settings } from '../types'
import { primoLavorativo } from './termini'

export type Regime = 'mensile' | 'trimestrale' | 'forfettario'
type Profilo = 'avvocato' | 'professionista' | 'impresa'
export interface ScadenzaFiscale {
  id: string; titolo: string; descrizione: string
  /** «MM-GG» per le ricorrenze annuali, oppure il giorno del mese per quelle mensili */
  date: { quando: string; etichetta?: string }[]; mensile?: number
  profili: Profilo[]; regimi: Regime[]; consigliata: boolean
}

const TUTTI: Profilo[] = ['avvocato', 'professionista', 'impresa']
const ORDINARIO: Regime[] = ['mensile', 'trimestrale']
const OGNI_REGIME: Regime[] = ['mensile', 'trimestrale', 'forfettario']

export const SCADENZE_FISCALI: ScadenzaFiscale[] = [
  { id: 'iva-mensile', titolo: 'Liquidazione e versamento IVA (F24)', descrizione: 'Ogni mese, per il mese precedente', date: [], mensile: 16, profili: TUTTI, regimi: ['mensile'], consigliata: true },
  { id: 'iva-trimestrale', titolo: 'Liquidazione e versamento IVA trimestrale (F24)', descrizione: '16 maggio, 20 agosto e 16 novembre; il quarto trimestre con il saldo annuale', date: [{ quando: '05-16', etichetta: '1° trimestre' }, { quando: '08-20', etichetta: '2° trimestre' }, { quando: '11-16', etichetta: '3° trimestre' }], profili: TUTTI, regimi: ['trimestrale'], consigliata: true },
  { id: 'iva-saldo', titolo: 'Saldo IVA annuale (F24)', descrizione: '16 marzo, oppure rateizzato o con le imposte sui redditi', date: [{ quando: '03-16' }], profili: TUTTI, regimi: ORDINARIO, consigliata: true },
  { id: 'lipe', titolo: 'Comunicazione liquidazioni periodiche IVA (LIPE)', descrizione: 'Fine del secondo mese dopo il trimestre', date: [{ quando: '05-31', etichetta: '1° trimestre' }, { quando: '09-30', etichetta: '2° trimestre' }, { quando: '11-30', etichetta: '3° trimestre' }, { quando: '02-28', etichetta: '4° trimestre' }], profili: TUTTI, regimi: ORDINARIO, consigliata: true },
  { id: 'dichiarazione-iva', titolo: 'Dichiarazione IVA annuale', descrizione: 'Entro il 30 aprile', date: [{ quando: '04-30' }], profili: TUTTI, regimi: ORDINARIO, consigliata: true },
  { id: 'redditi-saldo', titolo: 'Imposte sui redditi: saldo e primo acconto (F24)', descrizione: 'Entro il 30 giugno (31 luglio con la maggiorazione dello 0,40%)', date: [{ quando: '06-30' }], profili: TUTTI, regimi: OGNI_REGIME, consigliata: true },
  { id: 'redditi-acconto', titolo: 'Imposte sui redditi: secondo acconto (F24)', descrizione: 'Entro il 30 novembre', date: [{ quando: '11-30' }], profili: TUTTI, regimi: OGNI_REGIME, consigliata: true },
  { id: 'redditi-dichiarazione', titolo: 'Dichiarazione dei redditi (Modello Redditi PF)', descrizione: 'Invio telematico entro il 31 ottobre', date: [{ quando: '10-31' }], profili: TUTTI, regimi: OGNI_REGIME, consigliata: true },
  { id: 'ritenute', titolo: 'Versamento ritenute operate (F24)', descrizione: 'Ogni mese, se paghi dipendenti, collaboratori o altri professionisti', date: [], mensile: 16, profili: TUTTI, regimi: ORDINARIO, consigliata: false },
  { id: 'cu', titolo: 'Certificazione Unica ai percipienti e all’Agenzia delle Entrate', descrizione: 'Entro il 16 marzo, se hai operato ritenute', date: [{ quando: '03-16' }], profili: TUTTI, regimi: ORDINARIO, consigliata: false },
  { id: 'bollo-fe', titolo: 'Imposta di bollo sulle fatture elettroniche (F24)', descrizione: 'Per le fatture senza IVA oltre 77,47 €: trimestrale, con soglie che possono accorpare i versamenti', date: [{ quando: '05-31', etichetta: '1° trimestre' }, { quando: '09-30', etichetta: '2° trimestre' }, { quando: '11-30', etichetta: '3° trimestre' }, { quando: '02-28', etichetta: '4° trimestre' }], profili: TUTTI, regimi: OGNI_REGIME, consigliata: false },
  // previdenza per profilo
  { id: 'cassa-forense-minimi', titolo: 'Cassa Forense: contributi minimi', descrizione: 'Quattro rate: 28 febbraio, 30 aprile, 30 giugno, 30 settembre', date: [{ quando: '02-28', etichetta: '1ª rata' }, { quando: '04-30', etichetta: '2ª rata' }, { quando: '06-30', etichetta: '3ª rata' }, { quando: '09-30', etichetta: '4ª rata' }], profili: ['avvocato'], regimi: OGNI_REGIME, consigliata: true },
  { id: 'cassa-forense-mod5', titolo: 'Cassa Forense: invio del Modello 5', descrizione: 'Dichiarazione di reddito e volume d’affari, entro il 30 settembre', date: [{ quando: '09-30' }], profili: ['avvocato'], regimi: OGNI_REGIME, consigliata: true },
  { id: 'cassa-forense-autoliquidazione', titolo: 'Cassa Forense: autoliquidazione dei contributi eccedenti', descrizione: '31 luglio e 31 dicembre', date: [{ quando: '07-31', etichetta: '1ª rata' }, { quando: '12-31', etichetta: '2ª rata' }], profili: ['avvocato'], regimi: OGNI_REGIME, consigliata: true },
  { id: 'inps-gs', titolo: 'INPS gestione separata: saldo e acconti', descrizione: 'Con le imposte sui redditi, 30 giugno e 30 novembre (per chi non ha una cassa professionale)', date: [{ quando: '06-30', etichetta: 'saldo e 1° acconto' }, { quando: '11-30', etichetta: '2° acconto' }], profili: ['professionista'], regimi: OGNI_REGIME, consigliata: true },
  { id: 'cassa-professionale', titolo: 'Cassa professionale: contributi e dichiarazione', descrizione: 'Date della tua cassa (ingegneri, architetti, commercialisti…): imposta il giorno corretto', date: [{ quando: '09-30' }], profili: ['professionista'], regimi: OGNI_REGIME, consigliata: false },
  { id: 'inps-fissi', titolo: 'INPS artigiani e commercianti: contributi fissi', descrizione: 'Quattro rate: 16 maggio, 20 agosto, 16 novembre, 16 febbraio', date: [{ quando: '05-16', etichetta: '1ª rata' }, { quando: '08-20', etichetta: '2ª rata' }, { quando: '11-16', etichetta: '3ª rata' }, { quando: '02-16', etichetta: '4ª rata' }], profili: ['impresa'], regimi: OGNI_REGIME, consigliata: true },
  { id: 'inps-eccedenti', titolo: 'INPS artigiani e commercianti: contributi oltre il minimale', descrizione: 'Con le imposte sui redditi, 30 giugno e 30 novembre', date: [{ quando: '06-30', etichetta: 'saldo e 1° acconto' }, { quando: '11-30', etichetta: '2° acconto' }], profili: ['impresa'], regimi: OGNI_REGIME, consigliata: true },
  { id: 'diritto-camerale', titolo: 'Diritto annuale della Camera di Commercio', descrizione: 'Con il saldo delle imposte, entro il 30 giugno', date: [{ quando: '06-30' }], profili: ['impresa'], regimi: OGNI_REGIME, consigliata: true },
]

export const profiloFiscale = (s: Settings): Profilo => (s.profilo === 'ditta' ? (s.attivita === 'professionista' ? 'professionista' : 'impresa') : 'avvocato')
export const regimePredefinito = (s: Settings): Regime => (s.fatturapa?.regime === 'RF19' || s.fatturapa?.regime === 'RF02' || (s.aliquote?.iva === 0) ? 'forfettario' : 'trimestrale')
export const scadenzePer = (profilo: Profilo, regime: Regime) => SCADENZE_FISCALI.filter((x) => x.profili.includes(profilo) && x.regimi.includes(regime))

const p2 = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
/** Prima data (nominale) di una scadenza annuale «MM-GG» o mensile al giorno indicato che, spostata al primo giorno
 *  lavorativo, cade da oggi in poi: il 16 che è sabato resta valido fino al lunedì 18. */
export function prossima(quando: string | number, oggi = new Date()): string {
  const o = iso(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()))
  if (typeof quando === 'number') {
    const d = new Date(oggi.getFullYear(), oggi.getMonth(), Math.min(quando, 28))
    if (primoLavorativo(iso(d)) < o) d.setMonth(d.getMonth() + 1)
    return iso(d)
  }
  const [m, g] = quando.split('-').map(Number)
  const d = new Date(oggi.getFullYear(), m - 1, g)
  if (primoLavorativo(iso(d)) < o) d.setFullYear(d.getFullYear() + 1)
  return iso(d)
}

/** Ricorrenze da creare per le scadenze scelte (titolo con la rata o il trimestre, prima data futura, frequenza). */
export interface RicorrenzaFiscale { titolo: string; frequenza: 'mensile' | 'annuale'; prossima: string; lavorativo: true }
export function ricorrenzeDa(scelte: ScadenzaFiscale[], oggi = new Date()): RicorrenzaFiscale[] {
  return scelte.flatMap((x): RicorrenzaFiscale[] => x.mensile
    ? [{ titolo: `Fisco: ${x.titolo}`, frequenza: 'mensile' as const, prossima: prossima(x.mensile, oggi), lavorativo: true as const }]
    : x.date.map((d) => ({ titolo: `Fisco: ${x.titolo}${d.etichetta ? ` – ${d.etichetta}` : ''}`, frequenza: 'annuale' as const, prossima: prossima(d.quando, oggi), lavorativo: true as const })))
}
