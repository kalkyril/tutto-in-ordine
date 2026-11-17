import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { Conto, MovimentoConto } from '../../lib/budget'
import type { FatturaServizio } from '../../lib/pagamenti'

export interface DatiBudget { conti: Conto[]; movimenti: MovimentoConto[]; fatture: FatturaServizio[] }
/** Conti, movimenti scritti a mano e fatture lette dal servizio, riletti a ogni cambiamento dell'archivio. */
export function useBudgetDati(): DatiBudget & { errore: string } {
  const [dati, setDati] = useState<DatiBudget>({ conti: [], movimenti: [], fatture: [] })
  const [errore, setErrore] = useState('')
  useEffect(() => {
    let attivo = true, ticket = 0
    const carica = async () => { const n = ++ticket; try { const r = await api.budget('leggi'); if (attivo && ticket === n) { setDati(r); setErrore('') } } catch (e: any) { if (attivo && ticket === n) setErrore(String(e?.message || e)) } }
    carica(); const off = window.mngmnt.on('data-changed', carica)
    return () => { attivo = false; ticket++; off() }
  }, [])
  return { ...dati, errore }
}
