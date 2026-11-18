import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { accodaRighe, applicaRighe } from './lib/aggiornamentiRighe'
import { DEFAULT_SETTINGS } from './lib/defaults'
import type { Anagrafica, Calendario, Documento, EventoEsterno, Link, Nota, Notifica, Ora, Parcella, Pratica, Scadenza, Settings, Spesa, Todo } from './types'

interface Data {
  ready: boolean
  loading: boolean; error: string | null
  anagrafica: Anagrafica[]; pratiche: Pratica[]; scadenze: Scadenza[]; todos: Todo[]; note: Nota[]
  documenti: Documento[]; link: Link[]; ore: Ora[]; spese: Spesa[]; parcelle: Parcella[]; notifiche: Notifica[]
  calendari: Calendario[]; eventi: EventoEsterno[]
  settings: Settings
  praticaById: Map<number, Pratica>; anagraficaById: Map<number, Anagrafica>
  dettagliPronti: boolean
  apriDettagli: () => void
  reload: () => void
}

const EMPTY: Omit<Data, 'praticaById' | 'anagraficaById' | 'reload' | 'apriDettagli'> = {
  dettagliPronti: false, ready: false, loading: false, error: null, anagrafica: [], pratiche: [], scadenze: [], todos: [], note: [], documenti: [], link: [], ore: [], spese: [], parcelle: [], notifiche: [], calendari: [], eventi: [],
  settings: DEFAULT_SETTINGS,
}

const Ctx = createContext<Data>(null as unknown as Data)
export const useData = () => useContext(Ctx)

// Le pagine e i moduli che usano la rubrica o gli allegati attendono il primo caricamento.
export function ArchivioCompleto({ children }: { children: ReactNode }) {
  const { ready, dettagliPronti, apriDettagli } = useData()
  useEffect(() => { if (ready) apriDettagli() }, [ready, apriDettagli])
  return dettagliPronti ? children : <p role="status">Caricamento dell’archivio…</p>
}

const differite = ['anagrafica', 'documenti', 'note', 'link']

// tabelle caricate per intero nella finestra; la cronologia no: cresce a ogni modifica e si legge per pratica (CronologiaCard)
const TABLES: Record<string, string> = {
  anagrafica: 'denominazione COLLATE NOCASE, id ASC', pratiche: 'id DESC', scadenze: 'data_ora', todos: 'ordine, id', note: 'id DESC',
  documenti: 'id DESC', link: 'ordine, id', ore: 'data DESC, id DESC', spese: 'data DESC, id DESC', parcelle: 'anno DESC, progressivo DESC', notifiche: 'id DESC', calendari: 'nome COLLATE NOCASE', eventi_esterni: 'inizio',
}

export function mergeSettings(s: Record<string, any>): Settings {
  return {
    ...DEFAULT_SETTINGS, ...s,
    studio: { ...DEFAULT_SETTINGS.studio, ...s.studio },
    aliquote: { ...DEFAULT_SETTINGS.aliquote, ...s.aliquote },
    etichette: { ...DEFAULT_SETTINGS.etichette, ...s.etichette },
    stati_pratica: (s.stati_pratica || DEFAULT_SETTINGS.stati_pratica).map((state: Settings['stati_pratica'][number]) => ({ ...state, _nomePrecedente: state.nome })),
  }
}

let avvioSegnato = false

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(EMPTY)
  const richiedi = useRef<() => void>(() => {})
  const reload = useCallback(() => richiedi.current(), [])

  const attiva = useRef<() => void>(() => {})
  const apriDettagli = useCallback(() => attiva.current(), [])

  useEffect(() => {
    const tutte = new Set([...Object.keys(TABLES).filter(t => !differite.includes(t)), 'settings'])
    const coda = new Map<string, Set<number> | null>()
    let attivo = true, occupato = false, incompleto = true
    let timer: number | undefined
    const leggi = async () => {
      if (occupato || !attivo || !coda.size) return
      occupato = true
      if (incompleto) tutte.forEach(t => coda.set(t, null))
      const richieste = [...coda]
      coda.clear()
      try {
        const risultati = await Promise.all(richieste.map(async ([t, ids]) => {
          if (ids) return { t, ids, righe: await api.righe(t, [...ids]) }
          const righe = t === 'settings' ? mergeSettings(await api.settings()) : await api.list(t, {}, TABLES[t])
          return { t, ids: null, righe }
        }))
        if (!attivo) return
        incompleto = false
        setState(prev => {
          const patch = Object.fromEntries(risultati.map(({ t, ids, righe }) => [
            t === 'eventi_esterni' ? 'eventi' : t,
            ids ? applicaRighe(t, prev[t as 'anagrafica' | 'pratiche'], ids, righe) : righe,
          ]))
          return { ...prev, ...patch, dettagliPronti: prev.dettagliPronti || risultati.some(r => r.t === 'anagrafica' && !r.ids), ready: true, loading: false, error: null }
        })
        if (!avvioSegnato) { avvioSegnato = true; api.avvioCompletato().catch(() => {}) }
      } catch (error) {
        incompleto = true
        if (attivo) setState(prev => ({ ...prev, loading: false, error: String((error as Error)?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }))
      } finally {
        occupato = false
        if (attivo && coda.size) void leggi()
      }
    }
    attiva.current = () => {
      if (tutte.has('anagrafica')) return
      for (const t of differite) { tutte.add(t); coda.set(t, null) }
      void leggi()
    }
    richiedi.current = () => {
      tutte.forEach(t => coda.set(t, null))
      setState(prev => ({ ...prev, loading: true }))
      void leggi()
    }
    const off = window.mngmnt.on('data-changed', (tables: string[], ids) => {
      for (const t of tables) if (tutte.has(t)) accodaRighe(coda, t, ids?.[t])
      window.clearTimeout(timer)
      timer = window.setTimeout(leggi, 40)
    })
    richiedi.current()
    return () => { attivo = false; window.clearTimeout(timer); off() }
  }, [])

  const praticaById = useMemo(() => new Map(state.pratiche.map(p => [p.id, p])), [state.pratiche])
  const anagraficaById = useMemo(() => new Map(state.anagrafica.map(a => [a.id, a])), [state.anagrafica])
  const value = useMemo<Data>(() => ({ ...state, praticaById, anagraficaById, reload, apriDettagli }), [state, praticaById, anagraficaById, reload, apriDettagli])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
