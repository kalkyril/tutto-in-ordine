import type { Pratica, Scadenza, Todo } from '../types'
import { isLate } from './dates'

export interface PraticaStats { nextScad?: Scadenza; late: number; todoOpen: number; todoTotal: number }

export function praticaStats(scadenze: Scadenza[], todos: Todo[]): Map<number, PraticaStats> {
  const m = new Map<number, PraticaStats>()
  const get = (id: number) => { let s = m.get(id); if (!s) { s = { late: 0, todoOpen: 0, todoTotal: 0 }; m.set(id, s) } return s }
  for (const s of scadenze) {
    if (!s.pratica_id || s.completata) continue
    const st = get(s.pratica_id)
    if (isLate(s)) st.late++
    else if (!st.nextScad || s.data_ora < st.nextScad.data_ora) st.nextScad = s
  }
  for (const t of todos) {
    if (!t.pratica_id) continue
    const st = get(t.pratica_id)
    st.todoTotal++
    if (!t.completata) st.todoOpen++
  }
  return m
}

export const matchPratica = (p: Pratica, q: string, extra: string[]) => {
  const hay = [p.titolo, p.numero, p.rg, p.autorita, p.giudice, p.descrizione, p.tipo, ...extra].join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))
}

export function loadPref<T>(k: string, def: T): T {
  try { const v = localStorage.getItem('mngmnt:' + k); return v === null ? def : (JSON.parse(v) as T) } catch { return def }
}
export function savePref(k: string, v: unknown) {
  try { localStorage.setItem('mngmnt:' + k, JSON.stringify(v)) } catch { /* non disponibile */ }
}
