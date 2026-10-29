import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type Page = 'dashboard' | 'pratiche' | 'pratica' | 'agenda' | 'todo' | 'anagrafica' | 'parcelle' | 'dapagare' | 'collegamenti' | 'documenti' | 'anonimizza' | 'impostazioni'
export interface Route { page: Page; id?: number; tab?: string; focus?: number }

interface Nav {
  route: Route
  go: (r: Route | Page) => void
  back: () => void
  canBack: boolean
  guard: (fn: () => Promise<boolean>) => () => void
}

const Ctx = createContext<Nav>(null as unknown as Nav)
export const useNav = () => useContext(Ctx)

export function NavProvider({ children }: { children: ReactNode }) {
  const navigating = useRef(false)
  const guards = useRef(new Set<() => Promise<boolean>>())
  const guard = useCallback((fn: () => Promise<boolean>) => { guards.current.add(fn); return () => { guards.current.delete(fn) } }, [])
  const allowed = useCallback(async () => { for (const fn of guards.current) if (!(await fn())) return false; return true }, [])
  const [stack, setStack] = useState<Route[]>([{ page: 'dashboard' }])
  const go = useCallback((r: Route | Page) => {
    const route = typeof r === 'string' ? { page: r } : r
    if (navigating.current) return
    navigating.current = true
    allowed().then((ok) => { if (ok) setStack((s) => [...s.slice(-30), route]) }).finally(() => { navigating.current = false })
  }, [allowed])
  const back = useCallback(() => { allowed().then((ok) => { if (ok) setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)) }) }, [allowed])

  useEffect(() => {
    // click su un avviso desktop => apri l'elemento corrispondente
    return window.mngmnt.on('navigate', (p: { rif_tipo?: string; rif_id?: number; pratica_id?: number }) => {
      if (p.pratica_id) go({ page: 'pratica', id: p.pratica_id, tab: p.rif_tipo === 'todo' ? 'todo' : 'scadenze', focus: p.rif_id })
      else if (p.rif_tipo === 'todo') go('todo')
      else if (p.rif_tipo === 'aggiornamento') go({ page: 'impostazioni', tab: 'backup' })
      else go('agenda')
    })
  }, [go])

  const value = useMemo(() => ({ route: stack[stack.length - 1], go, back, guard, canBack: stack.length > 1 }), [stack, go, back, guard])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
