import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { DEFAULT_SETTINGS } from './lib/defaults'
import type { Anagrafica, Calendario, Cronologia, Documento, EventoEsterno, Link, Nota, Notifica, Ora, Parcella, Pratica, Scadenza, Settings, Spesa, Todo } from './types'

interface Data {
  ready: boolean
  loading: boolean; error: string | null
  anagrafica: Anagrafica[]; pratiche: Pratica[]; scadenze: Scadenza[]; todos: Todo[]; note: Nota[]
  documenti: Documento[]; link: Link[]; ore: Ora[]; spese: Spesa[]; parcelle: Parcella[]; notifiche: Notifica[]
  calendari: Calendario[]; eventi: EventoEsterno[]; cronologia: Cronologia[]
  settings: Settings
  praticaById: Map<number, Pratica>; anagraficaById: Map<number, Anagrafica>
  reload: () => void
}

const EMPTY: Omit<Data, 'praticaById' | 'anagraficaById' | 'reload'> = {
  ready: false, loading: false, error: null, anagrafica: [], pratiche: [], scadenze: [], todos: [], note: [], documenti: [], link: [], ore: [], spese: [], parcelle: [], notifiche: [], calendari: [], eventi: [], cronologia: [],
  settings: DEFAULT_SETTINGS,
}

const Ctx = createContext<Data>(null as unknown as Data)
export const useData = () => useContext(Ctx)

const TABLES: Record<string, string> = {
  anagrafica: 'denominazione COLLATE NOCASE', pratiche: 'id DESC', scadenze: 'data_ora', todos: 'ordine, id', note: 'id DESC',
  documenti: 'id DESC', link: 'ordine, id', ore: 'data DESC, id DESC', spese: 'data DESC, id DESC', parcelle: 'anno DESC, progressivo DESC', notifiche: 'id DESC', calendari: 'nome COLLATE NOCASE', eventi_esterni: 'inizio', cronologia: 'id DESC',
}

export function mergeSettings(s: Record<string, any>): Settings {
  return {
    ...DEFAULT_SETTINGS, ...s,
    studio: { ...DEFAULT_SETTINGS.studio, ...(s.studio || {}) },
    aliquote: { ...DEFAULT_SETTINGS.aliquote, ...(s.aliquote || {}) },
    etichette: { ...DEFAULT_SETTINGS.etichette, ...(s.etichette || {}) },
    stati_pratica: (s.stati_pratica || DEFAULT_SETTINGS.stati_pratica).map((state: Settings['stati_pratica'][number]) => ({ ...state, _nomePrecedente: state.nome })),
  }
}

let avvioSegnato = false

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(EMPTY)
  const versions = useRef<Record<string, number>>({})
  const mounted = useRef(true)
  const pending = useRef<Set<string>>(new Set())
  const timer = useRef<number | null>(null)

  const load = useCallback(async (only?: string[]) => {
    const names = only && only.length ? only.filter((n) => n in TABLES || n === 'settings') : [...Object.keys(TABLES), 'settings']
    const tickets = Object.fromEntries(names.map((n) => [n, versions.current[n] = (versions.current[n] || 0) + 1]))
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const entries = await Promise.all(names.map(async (n) => {
        const value = n === 'settings' ? mergeSettings(await api.settings()) : await api.list(n, {}, TABLES[n])
        return { name: n, key: n === 'eventi_esterni' ? 'eventi' : n, value }
      }))
      if (!mounted.current) return
      const current = entries.filter((entry) => versions.current[entry.name] === tickets[entry.name])
      setState((prev) => ({ ...prev, ...Object.fromEntries(current.map((entry) => [entry.key, entry.value])), ready: true, loading: false, error: null }))
      if (!avvioSegnato) { avvioSegnato = true; api.avvioCompletato().catch(() => {}) } // tempi di avvio nel registro locale
    } catch (error) {
      if (mounted.current) setState((prev) => ({ ...prev, loading: false, error: String((error as Error)?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }))
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    const off = window.mngmnt.on('data-changed', (tables: string[]) => {
      tables.forEach((t) => pending.current.add(t))
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        const t = [...pending.current]
        pending.current.clear()
        load(t)
      }, 40)
    })
    return () => { mounted.current = false; if (timer.current) window.clearTimeout(timer.current); off() }
  }, [load])

  const value = useMemo<Data>(() => ({
    ...state,
    praticaById: new Map(state.pratiche.map((p) => [p.id, p])),
    anagraficaById: new Map(state.anagrafica.map((a) => [a.id, a])),
    reload: () => load(),
  }), [state, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
