import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { api } from '../api'

interface Stato { attivo: boolean; bloccato: boolean; minuti: number; errore?: string }
interface Ctx { attivo: boolean; minuti: number; blocca: () => void; aggiorna: () => Promise<void> }
const BloccoCtx = createContext<Ctx>({ attivo: false, minuti: 0, blocca: () => {}, aggiorna: async () => {} })
export const useBlocco = () => useContext(BloccoCtx)

const messaggio = (e: unknown) => String((e as Error)?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Se è impostata una password, i dati non vengono nemmeno caricati finché non si sblocca; si blocca da solo dopo inattività o quando si blocca lo schermo del computer. */
export function LockGate({ children, appName }: { children: ReactNode; appName?: string }) {
  const [st, setSt] = useState<Stato | null>(null)
  const [pw, setPw] = useState('')
  const [errore, setErrore] = useState('')
  const [lavoro, setLavoro] = useState(false)
  const timer = useRef<number | null>(null)

  const aggiorna = useCallback(async () => { try { setSt(await api.statoBlocco()) } catch { setSt({ attivo: true, bloccato: true, minuti: 0, errore: 'Impossibile verificare il blocco. Riprova prima di accedere ai dati.' }) } }, [])
  const blocca = useCallback(async () => { try { const s = await api.blocca(); setPw(''); setErrore(''); setSt(s) } catch { /* già bloccata */ } }, [])
  useEffect(() => { aggiorna(); return window.mngmnt.on('blocca', () => { setPw(''); setErrore(''); setSt((s) => (s?.attivo ? { ...s, bloccato: true } : s)) }) }, [aggiorna])

  // blocco automatico dopo inattività
  const minuti = st?.attivo && !st.bloccato ? st.minuti : 0
  useEffect(() => {
    if (!minuti) return
    const riparti = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(blocca, minuti * 60000) }
    const eventi = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const
    eventi.forEach((e) => window.addEventListener(e, riparti, { passive: true })); riparti()
    return () => { eventi.forEach((e) => window.removeEventListener(e, riparti)); if (timer.current) window.clearTimeout(timer.current) }
  }, [minuti, blocca])

  const sblocca = async (e: React.FormEvent) => {
    e.preventDefault(); if (!pw || lavoro) return
    setLavoro(true); setErrore('')
    try { if (await api.sblocca(pw)) { setPw(''); await aggiorna() } else setErrore('Password errata') } catch (x) { setErrore(messaggio(x)) }
    setLavoro(false)
  }

  const value = useMemo<Ctx>(() => ({ attivo: !!st?.attivo, minuti: st?.minuti || 0, blocca, aggiorna }), [st, blocca, aggiorna])
  if (!st) return null
  if (st.bloccato) {
    return (
      <main className="lock-screen" aria-label="Applicazione bloccata">
        <form className="lock-card" onSubmit={sblocca}>
          <Lock size={30} aria-hidden />
          <h1>{appName || 'TIO'} è bloccato</h1>
          <p className="muted small">{st.errore || 'Inserisci la password per continuare.'}</p>
          {st.errore && <button type="button" className="btn btn-primary" onClick={aggiorna}>Riprova</button>}
          <label className="sr-only" htmlFor="lock-pw">Password</label>
          <input id="lock-pw" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
          {errore && <p className="lock-err" role="alert">{errore}</p>}
          <button type="submit" className="btn btn-primary" disabled={!!st.errore || !pw || lavoro}>{lavoro ? 'Controllo…' : 'Sblocca'}</button>
        </form>
      </main>
    )
  }
  return <BloccoCtx.Provider value={value}>{children}</BloccoCtx.Provider>
}
