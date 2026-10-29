import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const Clock = createContext(Date.now())

/** Un solo orologio per scadenze, contatori e date relative, anche dopo una sospensione. */
export function ClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const visible = () => { if (!document.hidden) refresh() }
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', visible)
    const off = window.mngmnt.on('time-changed', refresh)
    refresh()
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', visible)
      off()
    }
  }, [])
  return <Clock.Provider value={now}>{children}</Clock.Provider>
}

export const useClock = () => useContext(Clock)
