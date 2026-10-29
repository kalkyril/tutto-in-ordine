import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { Check, X } from 'lucide-react'
import { PALETTE } from '../lib/defaults'
import { textOn } from '../lib/colors'
import { useData } from '../store'
import { api } from '../api'

/* ---------- Modale ---------- */
// pila delle finestre aperte: Esc chiude solo quella in primo piano
const pilaModali: symbol[] = []
export function Modal({ title, onClose, children, footer, width = 560, subtitle, instant, protectChanges = true }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number; subtitle?: string; instant?: boolean; protectChanges?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dirty = useRef(false)
  const busy = useRef(false)
  const { confirm } = useFeedback()
  const requestClose = async () => {
    if (busy.current) return
    busy.current = true
    try {
      if (protectChanges && dirty.current && !(await confirm({ title: 'Modifiche non salvate', text: 'Vuoi chiudere e perdere le modifiche inserite?', ok: 'Scarta modifiche', danger: true }))) return
      onClose()
    } finally { busy.current = false }
  }
  // onClose spesso è una funzione creata a ogni disegno: va letta da un ref, altrimenti l'effetto si rieseguirebbe
  // a ogni lettera digitata e il cursore tornerebbe al primo campo della finestra.
  const chiudi = useRef(onClose)
  chiudi.current = requestClose
  useEffect(() => {
    const me = Symbol('modale')
    pilaModali.push(me)
    const prev = document.activeElement as HTMLElement | null
    const overlay = ref.current?.parentElement
    const hidden: HTMLElement[] = []
    const siblings = overlay?.parentElement?.children || []
    for (const node of siblings) if (node !== overlay && node instanceof HTMLElement && !node.inert) { node.inert = true; hidden.push(node) }
    // Rende inerte anche il ramo dell’app dietro alle modali annidate.
    let branch = overlay?.parentElement
    while (branch && branch !== document.body) {
      for (const node of branch.parentElement?.children || []) if (node !== branch && node instanceof HTMLElement && !node.inert) { node.inert = true; hidden.push(node) }
      branch = branch.parentElement
    }
    const first = ref.current?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=color]):not([type=radio]), textarea, select')
    if (!ref.current?.contains(document.activeElement)) (first || ref.current?.querySelector<HTMLElement>('button,[tabindex="0"]'))?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (pilaModali[pilaModali.length - 1] !== me) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudi.current(); return }
      if (e.key === 'Tab') {
        const elements = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]') || [])].filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'))
        const first = elements[0], last = elements[elements.length - 1]
        if (!first) { e.preventDefault(); return }
        if (e.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { e.preventDefault(); first.focus() }
      }
    }
    const saved = () => { if (pilaModali[pilaModali.length - 1] === me) dirty.current = false }
    window.addEventListener('mngmnt-saved', saved)
    const beforeUnload = (event: BeforeUnloadEvent) => { if (protectChanges && dirty.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('keydown', onKey, true); window.removeEventListener('mngmnt-saved', saved); window.removeEventListener('beforeunload', beforeUnload); hidden.forEach((node) => { node.inert = false }); const i = pilaModali.indexOf(me); if (i >= 0) pilaModali.splice(i, 1); prev?.focus?.() }
  }, [])
  return (
    <div className={`overlay${instant ? ' instant' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose() }}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title} ref={ref} onInputCapture={() => { dirty.current = true }} onChangeCapture={() => { dirty.current = true }} onClickCapture={(e) => { const button = (e.target as HTMLElement).closest('button'); if (protectChanges && dirty.current && button?.closest('.modal-foot') && /^(chiudi|annulla)$/i.test(button.textContent?.trim() || '')) { e.preventDefault(); e.stopPropagation(); requestClose() } }}>
        <header className="modal-head">
          <div><h2>{title}</h2>{subtitle && <p className="muted small">{subtitle}</p>}</div>
          <button className="icon-btn" onClick={requestClose} aria-label="Chiudi"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

/* ---------- Bottoni ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft'; size?: 'sm' | 'md' }
export function Btn({ variant = 'soft', size = 'md', className = '', ...p }: BtnProps) {
  return <button {...p} className={`btn btn-${variant} btn-${size} ${className}`} />
}

/* ---------- Campi ---------- */
export function Field({ label, children, hint, span }: { label: string; children: ReactNode; hint?: string; span?: number }) {
  const id = useId()
  return (
    <div className="field" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <label htmlFor={id}>{label}</label>
      <FieldCtx.Provider value={id}>{children}</FieldCtx.Provider>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}
const FieldCtx = createContext<string | undefined>(undefined)
export const useFieldId = () => useContext(FieldCtx)

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) { const id = useFieldId(); return <input {...p} id={p.id ?? id} /> }
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { const id = useFieldId(); return <textarea rows={3} {...p} id={p.id ?? id} /> }
export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) { const id = useFieldId(); return <select {...p} id={p.id ?? id} /> }

export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: number }) {
  return <div className="form-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>{children}</div>
}

/* ---------- Selettore colore (palette + personalizzato) ---------- */
export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { settings } = useData()
  const palette = settings.palette?.length ? settings.palette : PALETTE
  const custom = !palette.includes(value)
  return (
    <div className="colorpicker" role="radiogroup" aria-label="Colore">
      {palette.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c}
          className={`swatch ${value === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(c)}>
          {value === c && <Check size={14} color={textOn(c)} strokeWidth={3} />}
        </button>
      ))}
      <label className={`swatch custom ${custom ? 'on' : ''}`} style={custom ? { background: value } : undefined} title="Colore personalizzato">
        {custom ? <Check size={14} color={textOn(value)} strokeWidth={3} /> : <span>+</span>}
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#3b82f6'} onChange={(e) => onChange(e.target.value)} aria-label="Colore personalizzato" />
      </label>
    </div>
  )
}

/* ---------- Varie ---------- */
export function ColorDot({ color, size = 10 }: { color?: string; size?: number }) {
  return <span className="dot" style={{ background: color || '#94a3b8', width: size, height: size }} />
}

export function Pill({ children, color, title }: { children: ReactNode; color?: string; title?: string }) {
  return <span className="pill" title={title} style={color ? { background: color + '22', color: 'var(--text)', boxShadow: `inset 0 0 0 1px ${color}55` } : undefined}>{children}</span>
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, back, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-main">{back}<div>{eyebrow && <p className="page-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{subtitle && <p className="muted page-subtitle">{subtitle}</p>}</div></div>
      <div className="page-head-actions">{actions}</div>
    </header>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}{t.count ? <span className="tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, disabled = false }: { disabled?: boolean; options: { id: T; label: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.id} disabled={disabled} title={o.title} aria-label={o.title} className={value === o.id ? 'on' : ''} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

/* ---------- Toast + conferma ---------- */
interface Feedback {
  toast: (msg: string, kind?: 'ok' | 'err') => void
  /** Elimina subito e per qualche secondo propone «Annulla» (anche con ⌘Z / Ctrl+Z): niente finestra di conferma per dati recuperabili. */
  eliminaConAnnulla: (tabella: string, id: number, cosa: string) => Promise<boolean>
  confirm: (o: { title: string; text?: string; ok?: string; cancel?: string; danger?: boolean }) => Promise<boolean>
}
const FbCtx = createContext<Feedback>(null as unknown as Feedback)
export const useFeedback = () => useContext(FbCtx)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string; azione?: { label: string; fn: () => void } }[]>([])
  const [dlg, setDlg] = useState<null | { title: string; text?: string; ok?: string; cancel?: string; danger?: boolean; resolve: (v: boolean) => void }>(null)
  const idRef = useRef(1)
  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = idRef.current++
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 6000 : 3200)
  }, [])
  const ultimoAnnulla = useRef<(() => void) | null>(null)
  useEffect(() => {
    const clear = () => { ultimoAnnulla.current = null; setToasts([]) }
    window.addEventListener('archive-restored', clear)
    return () => window.removeEventListener('archive-restored', clear)
  }, [])
  const eliminaConAnnulla = useCallback(async (tabella: string, id: number, cosa: string) => {
    try {
      const snap = await api.removeUndo(tabella, id)
      if (!snap) return false
      const fem = /[aà]$/.test(cosa)
      const tid = idRef.current++
      const chiudi = () => { setToasts((t) => t.filter((x) => x.id !== tid)); if (ultimoAnnulla.current === annulla) ultimoAnnulla.current = null }
      const annulla = () => { chiudi(); api.undo(snap).then(() => toast(`${cosa} ripristinat${fem ? 'a' : 'o'}`), (e) => toast(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'err')) }
      ultimoAnnulla.current = annulla
      setToasts((t) => [...t, { id: tid, msg: `${cosa} eliminat${fem ? 'a' : 'o'}`, kind: 'ok', azione: { label: 'Annulla', fn: annulla } }])
      setTimeout(chiudi, 8000)
      return true
    } catch (e: any) {
      toast(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'err')
      return false
    }
  }, [toast])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z' || !ultimoAnnulla.current) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return // dentro un campo, ⌘Z annulla la digitazione
      e.preventDefault(); ultimoAnnulla.current()
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [])
  const confirm = useCallback((o: { title: string; text?: string; ok?: string; cancel?: string; danger?: boolean }) => new Promise<boolean>((resolve) => setDlg({ ...o, resolve })), [])
  const close = (v: boolean) => { dlg?.resolve(v); setDlg(null) }
  return (
    <FbCtx.Provider value={{ toast, confirm, eliminaConAnnulla }}>
      {children}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}{t.azione && <button type="button" className="toast-azione" onClick={t.azione.fn}>{t.azione.label}</button>}</div>)}</div>
      {dlg && (
        <Modal title={dlg.title} width={440} protectChanges={false} onClose={() => close(false)}
          footer={<><Btn variant="ghost" onClick={() => close(false)}>{dlg.cancel || 'Annulla'}</Btn><Btn variant={dlg.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{dlg.ok || 'Conferma'}</Btn></>}>
          {dlg.text && <p>{dlg.text}</p>}
        </Modal>
      )}
    </FbCtx.Provider>
  )
}

/** Esegue un'azione asincrona mostrando eventuali errori come toast. */
export function useAction() {
  const { toast } = useFeedback()
  return useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    try {
      const r = await fn()
      if (okMsg) toast(okMsg)
      return r
    } catch (e: any) {
      toast((e?.message || String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'err')
      return undefined
    }
  }, [toast])
}
