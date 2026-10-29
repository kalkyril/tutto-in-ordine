import { CalendarPlus, CheckSquare, FolderPlus, Settings, UserPlus, Wallet, Globe, Users, CalendarDays, LayoutDashboard, FolderKanban, Calculator, FilePen, ShieldCheck, HandCoins, BookOpen, type LucideIcon } from 'lucide-react'
import { api } from '../api'
import type { Page, Route } from '../nav'
import { nuovo } from './defaults'
import type { Settings as Impostazioni } from '../types'
import type { useEditors } from '../components/editors'

export interface Azione { id: string; etichetta: string; gruppo: 'Crea' | 'Vai a'; icona: LucideIcon; tasto?: string; esegui: () => void }

/** Il tasto di scelta rapida: ⌘ su Mac, Ctrl su Windows e Linux (nelle scorciatoie si accettano entrambi). */
export const tastoMod = (): string => (window.mngmnt.platform === 'darwin' ? '⌘' : 'Ctrl')
export const scorciatoia = (...tasti: string[]): string => [tastoMod(), ...tasti].join(window.mngmnt.platform === 'darwin' ? '' : '+')

/** Azioni disponibili dalla ricerca (⌘K / Ctrl+K): creare cose e andare nelle pagine, senza prendere il mouse. */
export function azioniRapide({ go, apri, L, calcolaTermine, avvocato = true }: { avvocato?: boolean; go: (r: Route | Page) => void; apri: ReturnType<typeof useEditors>['open']; L: Impostazioni['etichette']; calcolaTermine: () => void }): Azione[] {
  const vai = (id: string, etichetta: string, icona: LucideIcon, page: Page, tasto?: string): Azione => ({ id, etichetta, gruppo: 'Vai a', icona, tasto, esegui: () => go(page) })
  return [
    { id: 'nuova-pratica', etichetta: nuovo(L.pratica), gruppo: 'Crea', icona: FolderPlus, tasto: scorciatoia('N'), esegui: () => apri({ kind: 'pratica', onSaved: (p) => go({ page: 'pratica', id: p.id }) }) },
    { id: 'nuovo-compito', etichetta: 'Nuovo compito', gruppo: 'Crea', icona: CheckSquare, esegui: () => apri({ kind: 'todo' }) },
    { id: 'nuova-scadenza', etichetta: 'Nuova scadenza', gruppo: 'Crea', icona: CalendarPlus, esegui: () => apri({ kind: 'scadenza' }) },
    { id: 'nuovo-contatto', etichetta: 'Nuovo contatto', gruppo: 'Crea', icona: UserPlus, esegui: () => apri({ kind: 'anagrafica' }) },
    ...(avvocato ? [{ id: 'calcola-termine', etichetta: 'Calcola un termine', gruppo: 'Crea', icona: Calculator, esegui: calcolaTermine } as Azione] : []),
    vai('vai-panoramica', 'Panoramica', LayoutDashboard, 'dashboard'),
    vai('vai-pratiche', L.pratiche, FolderKanban, 'pratiche'),
    vai('vai-agenda', 'Agenda', CalendarDays, 'agenda'),
    vai('vai-compiti', 'Compiti', CheckSquare, 'todo'),
    vai('vai-anagrafica', 'Anagrafica', Users, 'anagrafica'),
    vai('vai-parcelle', L.parcelle, Wallet, 'parcelle'),
    vai('vai-dapagare', 'Da pagare', HandCoins, 'dapagare'),
    vai('vai-collegamenti', 'Collegamenti', Globe, 'collegamenti'),
    vai('vai-documenti', 'Documenti', FilePen, 'documenti'),
    vai('vai-anonimizza', 'Anonimizza un documento', ShieldCheck, 'anonimizza'),
    vai('vai-impostazioni', 'Impostazioni', Settings, 'impostazioni', scorciatoia(',')),
    { id: 'guida', etichetta: 'Guida di TIO', gruppo: 'Vai a', icona: BookOpen, tasto: 'F1', esegui: () => { api.apriGuida().catch(() => {}) } },
  ]
}
