import { useCallback, useState, type ReactNode } from 'react'
import { AnagraficaForm, LinkForm, PraticaForm, ScadenzaForm, TodoForm } from './forms'
import type { Anagrafica, Link, Pratica, Scadenza, Todo } from '../types'

type M =
  | { kind: 'scadenza'; item?: Partial<Scadenza>; praticaId?: number | null }
  | { kind: 'todo'; item?: Partial<Todo>; praticaId?: number | null }
  | { kind: 'pratica'; item?: Partial<Pratica>; onSaved?: (p: Pratica) => void }
  | { kind: 'anagrafica'; item?: Partial<Anagrafica>; ruolo?: Anagrafica['ruolo']; onSaved?: (a: Anagrafica) => void }
  | { kind: 'link'; item?: Partial<Link>; praticaId?: number | null }

/** Gestisce l'apertura dei moduli di modifica da qualunque pagina. */
export function useEditors(): { open: (m: M) => void; element: ReactNode } {
  const [m, setM] = useState<M | null>(null)
  const close = useCallback(() => setM(null), [])
  let element: ReactNode = null
  if (m) {
    switch (m.kind) {
      case 'scadenza': element = <ScadenzaForm item={m.item} praticaId={m.praticaId} onClose={close} />; break
      case 'todo': element = <TodoForm item={m.item} praticaId={m.praticaId} onClose={close} />; break
      case 'pratica': element = <PraticaForm item={m.item} onClose={close} onSaved={m.onSaved} />; break
      case 'anagrafica': element = <AnagraficaForm item={m.item} ruolo={m.ruolo} onClose={close} onSaved={m.onSaved} />; break
      case 'link': element = <LinkForm item={m.item} praticaId={m.praticaId} onClose={close} />; break
    }
  }
  return { open: setM, element }
}
