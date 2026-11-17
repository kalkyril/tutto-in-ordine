// Dati comuni alle schede della sezione Budget, calcolati una volta sola.
import { useMemo } from 'react'
import { api } from '../../api'
import { useData } from '../../store'
import { useGestione } from '../GestioneAttivita'
import { useBudgetDati } from './dati'
import { todayStr } from '../../lib/dates'
import { fattureDoppie, movimenti, usciteRicorrentiPreviste, type Movimento } from '../../lib/pagamenti'
import { CATEGORIA_IMPOSTE, saldiConti, stimaFiscale, type DocumentoFiscale, type ImpostazioniBudget, type ImpostazioniFiscali, type SaldoConto, type StimaFiscale } from '../../lib/budget'
import { regimePredefinito } from '../../lib/scadenzeFiscali'

export interface ImpostazioniSezione extends ImpostazioniBudget { metodoTasse?: 'percentuale' | 'regime'; fiscale?: ImpostazioniFiscali }
export interface Tasse { metodo: 'percentuale' | 'regime' | 'nessuno'; daAccantonare: number; giaPagato: number; totale: number; stima: StimaFiscale | null }

/**
 * Salvataggi delle impostazioni del Budget uno dopo l'altro, sempre sui valori appena riletti: due campi cambiati in
 * fretta (o da due schede) non si cancellano a vicenda partendo da una copia vecchia.
 */
let coda: Promise<unknown> = Promise.resolve()
export function salvaBudget(modifica: (attuale: ImpostazioniSezione) => Partial<ImpostazioniSezione>): Promise<void> {
  const fatto = coda.then(async () => { const attuale: ImpostazioniSezione = (await api.settings()).budget || {}; await api.setSettings({ budget: { ...attuale, ...modifica(attuale) } }) })
  coda = fatto.catch(() => {})
  return fatto
}

export function useContestoBudget() {
  const g = useGestione(), b = useBudgetDati()
  const { parcelle, settings } = useData()
  const oggi = todayStr(), anno = Number(oggi.slice(0, 4))
  const imp: ImpostazioniSezione = useMemo(() => settings.budget || {}, [settings.budget])
  const tutti: Movimento[] = useMemo(() => {
    const [y, m, d] = oggi.split('-')
    return [...movimenti(parcelle, g.costi, g.pagamenti, oggi, 30, b.fatture, g.rate), ...usciteRicorrentiPreviste(g.costi, `${Number(y) + 1}-${m}-${d}`)].sort((a, c) => a.data.localeCompare(c.data) || a.chiave.localeCompare(c.chiave))
  }, [parcelle, g.costi, g.pagamenti, b.fatture, g.rate, oggi])
  const saldi: SaldoConto[] = useMemo(() => saldiConti(b.conti, b.movimenti, tutti, oggi), [b.conti, b.movimenti, tutti, oggi])
  const saldoOggi = saldi.filter((s) => !s.conto.archiviato).reduce((t, s) => t + s.saldo, 0)
  const documenti: DocumentoFiscale[] = useMemo(() => {
    const doppie = fattureDoppie(b.fatture, parcelle)
    return [
      ...parcelle.filter((p) => (p.tipo === 'parcella' || p.tipo === 'nota_credito') && p.stato !== 'bozza' && p.stato !== 'annullata').map((p) => ({ data: p.data, imponibile: p.imponibile, iva: p.iva, ritenuta: p.ritenuta, verso: 'emesso' as const })),
      ...b.fatture.filter((f) => !f.nascosta && !doppie.has(f.id)).map((f) => ({ data: f.data, imponibile: f.imponibile, iva: f.iva, ritenuta: f.ritenuta, verso: f.verso === 'emessa' ? 'emesso' as const : 'ricevuto' as const })),
    ]
  }, [parcelle, b.fatture])
  const tasseDi = (a: number): Tasse => {
    const giaPagato = Math.round(tutti.filter((x) => x.stato === 'pagate' && x.categoria === CATEGORIA_IMPOSTE && x.data.startsWith(String(a))).reduce((s, x) => s + x.importo, 0) * 100) / 100
    if (imp.metodoTasse === 'regime') {
      const stima = stimaFiscale(tutti, documenti, a, { regime: regimePredefinito(settings) === 'forfettario' ? 'forfettario' : 'ordinario', ...imp.fiscale }, giaPagato)
      return { metodo: 'regime', daAccantonare: stima.daAccantonare, giaPagato, totale: stima.totale, stima }
    }
    const perc = Number(imp.accantonamento)
    if (perc > 0) {
      const incassato = tutti.filter((x) => x.stato === 'incassate' && x.data.startsWith(String(a))).reduce((s, x) => s + x.importo, 0)
      const totale = Math.round(incassato * perc) / 100
      return { metodo: 'percentuale', daAccantonare: Math.max(0, Math.round((totale - giaPagato) * 100) / 100), giaPagato, totale, stima: null }
    }
    return { metodo: 'nessuno', daAccantonare: 0, giaPagato, totale: 0, stima: null }
  }
  return { g, b, oggi, anno, imp, tutti, saldi, saldoOggi: Math.round(saldoOggi * 100) / 100, documenti, tasseDi, errore: g.errore || b.errore }
}
export type ContestoBudget = ReturnType<typeof useContestoBudget>
