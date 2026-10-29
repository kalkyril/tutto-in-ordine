import type { MouseEvent } from 'react'
import { api } from '../api'

export type Voce = { id: string; label: string; disattiva?: boolean; fai: () => void } | '-'

/** Menu col tasto destro: quello nativo del sistema (linee guida Apple), con le voci decise dall'interfaccia. */
export const apriMenu = (voci: Voce[]) => async (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  try {
    const id = await api.menuContestuale(voci.map((v) => (v === '-' ? '-' : { id: v.id, label: v.label, disattiva: v.disattiva })))
    const scelta = voci.find((v) => v !== '-' && v.id === id)
    if (scelta && scelta !== '-') scelta.fai()
  } catch { /* nessun menu: si continua con i pulsanti visibili */ }
}
