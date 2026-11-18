import { useMemo } from 'react'
import type { Anagrafica } from '../types'
import { normalizzaRicerca, testoRicercaContatto } from './recapiti'

export function useRicercaContatti(contatti: Anagrafica[], q: string) {
  const indice = useMemo(() => contatti.map(contatto => ({ contatto, testo: testoRicercaContatto(contatto) })), [contatti])
  return useMemo(() => {
    const termini = normalizzaRicerca(q).split(/\s+/).filter(Boolean)
    return indice.filter(x => termini.every(t => x.testo.includes(t))).map(x => x.contatto)
  }, [indice, q])
}
