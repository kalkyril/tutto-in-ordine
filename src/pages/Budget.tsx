import { useEffect, useState } from 'react'
import { api } from '../api'
import { useData } from '../store'
import { PageHeader, Tabs, useFeedback } from '../components/ui'
import { useContestoBudget } from '../components/budget/contesto'
import { Panoramica } from '../components/budget/Panoramica'
import { Conti } from '../components/budget/Conti'
import { Spese } from '../components/budget/Spese'
import { Tasse } from '../components/budget/Tasse'
import { FattureServizio } from '../components/budget/FattureServizio'
import { Commercialista } from '../components/budget/Commercialista'
import { Indicatori } from '../components/budget/Indicatori'

export type SchedaBudget = 'panoramica' | 'conti' | 'spese' | 'tasse' | 'indicatori' | 'fatture' | 'commercialista'
const SCHEDE: { id: SchedaBudget; label: string; sottotitolo: string }[] = [
  { id: 'panoramica', label: 'Panoramica', sottotitolo: 'Quanto hai davvero a disposizione e come andrà la cassa nei prossimi dodici mesi.' },
  { id: 'conti', label: 'Conti', sottotitolo: 'Conto corrente, carte e contanti con il loro saldo reale.' },
  { id: 'spese', label: 'Spese e budget', sottotitolo: 'Obiettivo di incasso, soglia del forfettario e spese per categoria rispetto al budget.' },
  { id: 'tasse', label: 'Tasse', sottotitolo: 'Quanto mettere da parte per imposte e contributi, e quando si paga.' },
  { id: 'indicatori', label: 'Indicatori', sottotitolo: 'Tempi di incasso, andamento sull’anno prima, peso dei clienti e margine dei lavori.' },
  { id: 'fatture', label: 'Fatture del servizio', sottotitolo: 'Le fatture del tuo servizio di fatturazione, lette dai file esportati. Il servizio non viene mai modificato.' },
  { id: 'commercialista', label: 'Commercialista', sottotitolo: 'Un pacchetto con riepilogo, elenchi e contabili da mandare al commercialista.' },
]

/**
 * Rilettura automatica della cartella delle fatture del servizio di fatturazione: aprendo il Budget e tornando sulla
 * finestra, al più ogni 5 minuti. Le fatture già lette non si ripetono; un errore (cartella scollegata, disco esterno
 * assente) non disturba: resta il pulsante «Rileggi la cartella», che lo spiega.
 */
let ultimaRilettura = 0
function useRiletturaFatture(cartella: string | undefined) {
  const { toast } = useFeedback()
  useEffect(() => {
    if (!cartella) return
    const rileggi = () => {
      if (Date.now() - ultimaRilettura < 5 * 60 * 1000) return
      ultimaRilettura = Date.now()
      api.budgetRileggiFatture().then((r) => { if (r?.nuove) toast(r.nuove === 1 ? '1 fattura nuova dal servizio di fatturazione' : `${r.nuove} fatture nuove dal servizio di fatturazione`) }).catch(() => {})
    }
    rileggi(); window.addEventListener('focus', rileggi)
    return () => window.removeEventListener('focus', rileggi)
  }, [cartella, toast])
}

/**
 * Budget (1.0.4): sezione separata da Pagamenti. Pagamenti resta il posto in cui si registra il denaro (incassi, voci
 * da pagare); qui si guarda avanti (previsione, budget, tasse) e si prepara ciò che serve al commercialista.
 */
export default function Budget({ scheda: iniziale = 'panoramica' }: { scheda?: SchedaBudget }) {
  const [scheda, setScheda] = useState<SchedaBudget>(SCHEDE.some((s) => s.id === iniziale) ? iniziale : 'panoramica')
  const c = useContestoBudget()
  const { settings } = useData()
  useRiletturaFatture(settings.cartella_fatture)
  return <div className="page budget-sezione">
    <PageHeader title="Budget" subtitle={SCHEDE.find((s) => s.id === scheda)!.sottotitolo} />
    <div className="pagamenti-schede"><Tabs<SchedaBudget> value={scheda} onChange={setScheda} tabs={SCHEDE.map(({ id, label }) => ({ id, label }))} /></div>
    {c.errore && <p className="late-text" role="alert">{String(c.errore)}</p>}
    {scheda === 'panoramica' && <Panoramica c={c} onScheda={(s) => setScheda(s as SchedaBudget)} />}
    {scheda === 'conti' && <Conti c={c} />}
    {scheda === 'spese' && <Spese c={c} />}
    {scheda === 'tasse' && <Tasse c={c} />}
    {scheda === 'indicatori' && <Indicatori c={c} />}
    {scheda === 'fatture' && <FattureServizio c={c} />}
    {scheda === 'commercialista' && <Commercialista c={c} />}
  </div>
}
