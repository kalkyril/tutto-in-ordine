import { AlarmClock, Bell, CalendarDays, Gavel, Pencil, Trash2, Users, Flag } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { useState } from 'react'
import { EsitoUdienzaModal } from './EsitoUdienza'
import { ColorDot, useAction, useFeedback } from './ui'
import { fmtDateTime, hasTime, isLate, relative, ymdhm } from '../lib/dates'
import { tint } from '../lib/colors'
import type { Pratica, Scadenza, Todo } from '../types'
import { apriMenu } from '../lib/menuContestuale'
import { useClock } from '../lib/clock'

export const TIPO_ICON: Record<string, any> = { scadenza: AlarmClock, udienza: Gavel, appuntamento: Users, altro: CalendarDays }

export function PraticaChip({ pratica, onClick }: { pratica?: Pratica | null; onClick?: boolean }) {
  const { go } = useNav()
  if (!pratica) return null
  return (
    <button className="pratica-chip" style={{ background: tint(pratica.colore, 0.14), boxShadow: `inset 0 0 0 1px ${tint(pratica.colore, 0.4)}` }}
      onClick={(e) => { e.stopPropagation(); if (onClick !== false) go({ page: 'pratica', id: pratica.id }) }} title={pratica.titolo}>
      <ColorDot color={pratica.colore} size={8} /><span>{pratica.numero ? pratica.numero + ' · ' : ''}{pratica.titolo}</span>
    </button>
  )
}

function RelBadge({ date, done }: { date: string; done?: boolean }) {
  const clock = useClock()
  if (done) return null
  const r = relative(date, new Date(clock))
  return <span className={`rel rel-${r.tone}`}>{r.text}</span>
}

/** Il bordo a sinistra dice l'urgenza (rosso = scaduto, ambra = oggi), mai il colore della pratica: quello sta nell'etichetta della pratica. */
const bordoUrgenza = (data?: string | null) => {
  const tono = data ? relative(data).tone : 'later'
  return tono === 'late' ? 'var(--danger)' : tono === 'today' ? 'var(--warn)' : 'var(--border-strong)'
}

export function ScadenzaRow({ s, showPratica = true, onEdit, highlight }: { s: Scadenza; showPratica?: boolean; onEdit: (s: Scadenza) => void; highlight?: boolean }) {
  const clock = useClock()
  const { praticaById } = useData()
  const { go } = useNav()
  const run = useAction()
  const { eliminaConAnnulla } = useFeedback()
  const p = s.pratica_id ? praticaById.get(s.pratica_id) : null
  const Icon = TIPO_ICON[s.tipo] || CalendarDays
  const hasAlerts = (() => { try { return JSON.parse(s.promemoria || '[]').length > 0 } catch { return false } })()
  const late = !s.completata && isLate(s, clock)
  const [esito, setEsito] = useState(false)
  const toggle = () => { if (!s.completata && s.tipo === 'udienza' && s.pratica_id) setEsito(true); else run(() => api.save('scadenze', { id: s.id, completata: s.completata ? 0 : 1 })) }
  return (
    <div className={`row-item ${s.completata ? 'done' : ''} ${highlight ? 'hl' : ''}`} style={{ borderLeftColor: bordoUrgenza(s.completata ? null : s.data_ora) }}
      onContextMenu={apriMenu([
        { id: 'modifica', label: 'Modifica…', fai: () => onEdit(s) },
        { id: 'completa', label: s.completata ? 'Segna come da fare' : 'Segna come completata', fai: toggle },
        ...(p ? [{ id: 'pratica', label: `Apri ${p.numero || p.titolo}`, fai: () => go({ page: 'pratica', id: p.id, tab: 'scadenze', focus: s.id }) }] : []),
        '-',
        { id: 'elimina', label: 'Elimina', fai: () => eliminaConAnnulla('scadenze', s.id, 'Scadenza') },
      ])}>
      <input type="checkbox" className="round" checked={!!s.completata} aria-label="Completata"
        onChange={toggle} />
      <div className="row-icon"><Icon size={16} /></div>
      <div className="row-main" onClick={() => onEdit(s)}>
        <div className="row-title" title={s.titolo}>{s.titolo}</div>
        <div className="row-sub">
          <span className={late ? 'late-text' : ''}>{fmtDateTime(s.data_ora, !!s.tutto_il_giorno)}</span>
          {s.luogo && <span> · {s.luogo}</span>}
          {hasAlerts && !s.completata && <span title="Avvisi attivi" className="bell"><Bell size={11} /></span>}
        </div>
        {showPratica && p && <div style={{ marginTop: 4 }}><PraticaChip pratica={p} /></div>}
      </div>
      <RelBadge date={s.data_ora} done={!!s.completata} />
      <div className="row-actions">
        <button className="icon-btn" onClick={() => onEdit(s)} aria-label="Modifica"><Pencil size={15} /></button>
        <button className="icon-btn" aria-label="Elimina" onClick={() => eliminaConAnnulla('scadenze', s.id, 'Scadenza')}><Trash2 size={15} /></button>
      </div>
      {esito && <EsitoUdienzaModal s={s} onClose={() => setEsito(false)} />}
    </div>
  )
}

const PRIO = ['Bassa', 'Normale', 'Alta']

export function TodoRow({ t, showPratica = true, onEdit, highlight }: { t: Todo; showPratica?: boolean; onEdit: (t: Todo) => void; highlight?: boolean }) {
  useClock()
  const { praticaById } = useData()
  const { go } = useNav()
  const run = useAction()
  const { eliminaConAnnulla } = useFeedback()
  const p = t.pratica_id ? praticaById.get(t.pratica_id) : null
  const toggle = () => run(() => api.save('todos', { id: t.id, completata: t.completata ? 0 : 1, completata_il: t.completata ? null : ymdhm(new Date()) }))
  return (
    <div className={`row-item todo ${t.completata ? 'done' : ''} ${highlight ? 'hl' : ''}`} style={{ borderLeftColor: bordoUrgenza(t.completata ? null : t.scadenza) }}
      onContextMenu={apriMenu([
        { id: 'modifica', label: 'Modifica…', fai: () => onEdit(t) },
        { id: 'completa', label: t.completata ? 'Segna come da fare' : 'Segna come fatto', fai: toggle },
        ...(p ? [{ id: 'pratica', label: `Apri ${p.numero || p.titolo}`, fai: () => go({ page: 'pratica', id: p.id, tab: 'todo', focus: t.id }) }] : []),
        '-',
        { id: 'elimina', label: 'Elimina', fai: () => eliminaConAnnulla('todos', t.id, 'Compito') },
      ])}>
      <input type="checkbox" className="round" checked={!!t.completata} onChange={toggle} aria-label="Fatto" />
      <div className="row-main" onClick={() => onEdit(t)}>
        <div className="row-title" title={t.titolo}>{t.titolo}</div>
        {(t.scadenza || t.note) && (
          <div className="row-sub">
            {t.scadenza && <span className={!t.completata && relative(t.scadenza).tone === 'late' ? 'late-text' : ''}>{fmtDateTime(t.scadenza)}</span>}
            {t.scadenza && t.promemoria_min !== null && !t.completata && <span title="Avviso attivo" className="bell"><Bell size={11} /></span>}
            {t.note && <span> · {t.note.split('\n')[0].slice(0, 80)}</span>}
          </div>
        )}
        {showPratica && p && <div style={{ marginTop: 4 }}><PraticaChip pratica={p} /></div>}
      </div>
      {t.priorita === 2 && !t.completata && <span className="prio-high" title={`Priorità ${PRIO[2]}`}><Flag size={13} /></span>}
      {t.scadenza && <RelBadge date={t.scadenza} done={!!t.completata} />}
      <div className="row-actions">
        <button className="icon-btn" onClick={() => onEdit(t)} aria-label="Modifica"><Pencil size={15} /></button>
        <button className="icon-btn" aria-label="Elimina" onClick={() => eliminaConAnnulla('todos', t.id, 'Compito')}><Trash2 size={15} /></button>
      </div>
    </div>
  )
}

export { hasTime }
