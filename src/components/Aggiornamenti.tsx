import { useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { Btn, useAction, useFeedback } from './ui'
import { SettingsGroup, SettingsRow, SettingsToggle } from './SettingsGroup'
import type { Settings } from '../types'

const quando = (iso?: string) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
}

/**
 * Controllo facoltativo degli aggiornamenti (electron/aggiornamenti.js). Spento di default: attivandolo TIO chiede a GitHub,
 * al massimo una volta al giorno, il numero dell'ultima versione. «Controlla ora» fa la stessa richiesta solo quando si preme.
 * Nulla viene scaricato o installato da solo: si apre la pagina di download nel browser.
 */
export function AggiornamentiImpostazioni({ d, up, versione, disponibile }: { d: Settings; up: <K extends keyof Settings>(k: K, v: Settings[K]) => void; versione?: string; disponibile: boolean }) {
  const { settings } = useData() // esito dell'ultimo controllo: lo scrive il processo principale, non passa da «Salva»
  const run = useAction()
  const { toast } = useFeedback()
  const [inCorso, setInCorso] = useState(false)

  if (!disponibile) return (
    <SettingsGroup title="Aggiornamenti">
      <SettingsRow title="Controllo degli aggiornamenti" description="Sarà disponibile quando TIO verrà pubblicato su GitHub. Fino ad allora le nuove versioni arrivano da chi ti ha dato TIO." />
    </SettingsGroup>
  )

  const nuova = settings.aggiornamento && settings.aggiornamento.versione !== versione ? settings.aggiornamento as { versione: string; pagina: string } : null
  const controllaOra = async () => {
    setInCorso(true)
    const r = await run(() => api.controllaAggiornamenti())
    setInCorso(false)
    if (r) toast(r.nuova ? `È disponibile TIO ${r.versione}` : `Nessuna versione più recente: usi già TIO ${versione}`)
  }
  const stato = nuova ? `È disponibile TIO ${nuova.versione}`
    : settings.aggiornamenti_errore ? 'Ultimo controllo non riuscito'
    : settings.aggiornamenti_ultimo ? 'Nessun aggiornamento da installare' : 'Nessun controllo ancora eseguito'
  const dettaglio = nuova ? 'Scaricala dalla pagina di GitHub e installala sopra quella attuale: pratiche e impostazioni restano. Prima fai un backup.'
    : settings.aggiornamenti_errore ? settings.aggiornamenti_errore
    : settings.aggiornamenti_ultimo ? `Ultimo controllo: ${quando(settings.aggiornamenti_ultimo)}.` : `Versione in uso: ${versione || '…'}.`

  return (
    <SettingsGroup title="Aggiornamenti" footer="La richiesta a GitHub contiene solo il nome del programma e la versione in uso; GitHub vede l’indirizzo IP della connessione.">
      <SettingsToggle title="Controlla gli aggiornamenti ogni giorno" description="TIO chiede a GitHub il numero dell’ultima versione pubblicata. Non invia dati dell’archivio e non scarica né installa nulla da solo." checked={d.aggiornamenti_controllo === true} onChange={(v) => up('aggiornamenti_controllo', v)} />
      <SettingsRow title={stato} description={dettaglio}>
        {nuova && <Btn variant="primary" onClick={() => run(() => api.openExternal(nuova.pagina))}><Download size={15} /> Apri la pagina di download</Btn>}
        <Btn onClick={controllaOra} disabled={inCorso}><RefreshCw size={15} /> {inCorso ? 'Controllo…' : 'Controlla ora'}</Btn>
      </SettingsRow>
    </SettingsGroup>
  )
}
