import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus, CheckSquare, Lock, Link2, Printer, Calculator } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useEditors } from '../components/editors'
import { CalcoloTerminiModal } from '../components/CalcoloTermini'
import { Btn, PageHeader, Segmented, useAction } from '../components/ui'
import { ScadenzaRow } from '../components/items'
import { EventoEsternoModal, EventoEsternoRow } from '../components/EventoEsterno'
import { useNav } from '../nav'
import { StampaAgendaModal } from '../components/StampaAgenda'
import { PraticaSelect } from '../components/forms'
import { GIORNI_BREVI, MESI, addDays, fmtLong, hasTime, isLate, parse, sameDay, startOfWeek, todayStr, ymd } from '../lib/dates'
import { tint } from '../lib/colors'
import { loadPref, savePref } from '../lib/stats'
import { nomeImpegni } from '../lib/defaults'
import type { EventoEsterno, Scadenza, Todo } from '../types'
import { useClock } from '../lib/clock'

type View = 'mese' | 'settimana' | 'elenco'
interface Ev { key: string; day: string; time: string; title: string; color?: string; done: boolean; late: boolean; kind: 'scad' | 'todo' | 'ext'; scad?: Scadenza; todo?: Todo; ext?: EventoEsterno; tipo?: string }

export default function Agenda() {
  const clock = useClock()
  const { scadenze, todos, praticaById, calendari, eventi, settings } = useData()
  const { go } = useNav()
  const ed = useEditors()
  const [termini, setTermini] = useState(false)
  const [ext, setExt] = useState<EventoEsterno | null>(null)
  const [showExt, setShowExt] = useState(() => loadPref('agenda.ext', true))
  const run = useAction()
  const [view, setViewS] = useState<View>(() => loadPref<View>('agenda.view', 'mese'))
  const setView = (v: View) => { setViewS(v); savePref('agenda.view', v) }
  const [cursor, setCursor] = useState(new Date())
  const [stampa, setStampa] = useState(false)
  const [pratica, setPratica] = useState<number | null>(null)
  const [showTodo, setShowTodo] = useState(() => loadPref('agenda.todo', true))
  const [showDone, setShowDone] = useState(false)

  const events = useMemo(() => {
    const list: Ev[] = []
    for (const s of scadenze) {
      if (pratica && s.pratica_id !== pratica) continue
      if (s.completata && !showDone) continue
      list.push({ key: 's' + s.id, day: s.data_ora.slice(0, 10), time: s.tutto_il_giorno || !hasTime(s.data_ora) ? '' : s.data_ora.slice(11, 16), title: s.titolo, color: s.pratica_id ? praticaById.get(s.pratica_id)?.colore : undefined, done: !!s.completata, late: !s.completata && isLate(s), kind: 'scad', scad: s, tipo: s.tipo })
    }
    if (showTodo) {
      for (const t of todos) {
        if (!t.scadenza || (pratica && t.pratica_id !== pratica)) continue
        if (t.completata && !showDone) continue
        list.push({ key: 't' + t.id, day: t.scadenza.slice(0, 10), time: hasTime(t.scadenza) ? t.scadenza.slice(11, 16) : '', title: t.titolo, color: t.pratica_id ? praticaById.get(t.pratica_id)?.colore : undefined, done: !!t.completata, late: !t.completata && t.scadenza.slice(0, 10) < todayStr(), kind: 'todo', todo: t })
      }
    }
    if (showExt) {
      const colori = new Map(calendari.filter((c) => c.attivo).map((c) => [c.id, c.colore]))
      for (const e of eventi) {
        if (!colori.has(e.calendario_id) || (pratica && e.pratica_id !== pratica)) continue
        // un evento su più giorni compare in ogni giorno (fino a 31)
        const d0 = parse(e.inizio.slice(0, 10))!, d1 = parse((e.fine || e.inizio).slice(0, 10))!
        for (let d = new Date(d0), k = 0; d <= d1 && k < 31; d = addDays(d, 1), k++) {
          const giorno = ymd(d)
          list.push({ key: `x${e.id}-${giorno}`, day: giorno, time: !e.tutto_il_giorno && k === 0 ? e.inizio.slice(11, 16) : '', title: e.titolo, color: colori.get(e.calendario_id), done: false, late: false, kind: 'ext', ext: e })
        }
      }
    }
    return list.sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title))
  }, [scadenze, todos, pratica, showTodo, showDone, praticaById, showExt, calendari, eventi, clock])

  const byDay = useMemo(() => { const m = new Map<string, Ev[]>(); events.forEach((e) => m.set(e.day, [...(m.get(e.day) || []), e])); return m }, [events])
  const today = new Date(clock)
  const open = (e: Ev) => (e.ext ? setExt(e.ext) : e.scad ? ed.open({ kind: 'scadenza', item: e.scad }) : ed.open({ kind: 'todo', item: e.todo }))
  const add = (d: Date) => ed.open({ kind: 'scadenza', item: { data_ora: ymd(d), tipo: 'scadenza' }, praticaId: pratica })

  const nav = (dir: number) => setCursor((c) => view === 'settimana' ? addDays(c, 7 * dir) : new Date(c.getFullYear(), c.getMonth() + dir, 1))
  const title = view === 'settimana'
    ? `${startOfWeek(cursor).getDate()} ${MESI[startOfWeek(cursor).getMonth()].slice(0, 3)} – ${addDays(startOfWeek(cursor), 6).getDate()} ${MESI[addDays(startOfWeek(cursor), 6).getMonth()].slice(0, 3)} ${addDays(startOfWeek(cursor), 6).getFullYear()}`
    : `${MESI[cursor.getMonth()][0].toUpperCase() + MESI[cursor.getMonth()].slice(1)} ${cursor.getFullYear()}`

  const chip = (e: Ev) => (
    <button key={e.key} className={`ev ${e.done ? 'done' : ''} ${e.late ? 'late' : ''} ${e.kind}`} title={e.title}
      style={{ background: tint(e.color || '#64748b', e.kind === 'todo' ? 0.08 : 0.2), borderLeftColor: e.color || '#64748b' }}
      onClick={(ev) => { ev.stopPropagation(); open(e) }}>
      {e.kind === 'todo' && <CheckSquare size={10} />}{e.kind === 'ext' && <Lock size={10} aria-label="sola lettura" />}{e.time && <b>{e.time}</b>}<span>{e.title}</span>
    </button>
  )

  let body
  if (view === 'mese') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = startOfWeek(first)
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
    const rows = days[35].getMonth() === cursor.getMonth() ? 6 : 5
    body = (
      <div className="cal">
        <div className="cal-head">{GIORNI_BREVI.map((g) => <div key={g}>{g}</div>)}</div>
        <div className="cal-grid" style={{ gridTemplateRows: `repeat(${rows}, minmax(96px, 1fr))` }}>
          {days.slice(0, rows * 7).map((d) => {
            const list = byDay.get(ymd(d)) || []
            const other = d.getMonth() !== cursor.getMonth()
            return (
              <div key={ymd(d)} className={`cal-cell ${other ? 'other' : ''} ${sameDay(d, today) ? 'today' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : ''}`} onClick={() => add(d)}>
                <div className="cal-day"><span>{d.getDate()}</span></div>
                {list.slice(0, 3).map(chip)}
                {list.length > 3 && <button className="more" onClick={(e) => { e.stopPropagation(); setCursor(d); setView('settimana') }}>+{list.length - 3} altri</button>}
              </div>
            )
          })}
        </div>
      </div>
    )
  } else if (view === 'settimana') {
    const start = startOfWeek(cursor)
    body = (
      <div className="week">
        {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => (
          <div key={ymd(d)} className={`week-col ${sameDay(d, today) ? 'today' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : ''}`} onClick={() => add(d)}>
            <header><span>{GIORNI_BREVI[(d.getDay() + 6) % 7]}</span><b>{d.getDate()}</b></header>
            {(byDay.get(ymd(d)) || []).map(chip)}
            <button className="add-day" onClick={(e) => { e.stopPropagation(); add(d) }} aria-label="Aggiungi"><Plus size={14} /></button>
          </div>
        ))}
      </div>
    )
  } else {
    const from = ymd(addDays(today, -0))
    const late = events.filter((e) => e.scad && e.late)
    const upcoming = events.filter((e) => (e.scad && !e.late && e.day >= from) || (e.ext && e.day >= from))
    const groups = new Map<string, Ev[]>()
    upcoming.forEach((e) => groups.set(e.day, [...(groups.get(e.day) || []), e]))
    body = (
      <div className="stack">
        {late.length > 0 && <section className="card"><header className="card-head"><h2 className="danger">In ritardo ({late.length})</h2></header>{late.map((e) => <ScadenzaRow key={e.key} s={e.scad!} onEdit={(s) => ed.open({ kind: 'scadenza', item: s })} />)}</section>}
        {[...groups.entries()].map(([k, list]) => (
          <section className="card" key={k}><header className="card-head"><h2>{fmtLong(parse(k)!)}</h2></header>{list.map((e) => (e.ext ? <EventoEsternoRow key={e.key} e={e.ext} onOpen={setExt} /> : <ScadenzaRow key={e.key} s={e.scad!} onEdit={(s) => ed.open({ kind: 'scadenza', item: s })} />))}</section>
        ))}
        {!late.length && !groups.size && <p className="muted pad">Nessuna scadenza in programma.</p>}
      </div>
    )
  }

  return (
    <div className="page wide">
      <PageHeader title="Agenda" subtitle={nomeImpegni(settings.profilo)}
        actions={<>
          <Btn variant="ghost" onClick={() => go({ page: 'impostazioni', tab: 'integrazioni' })} title="Collega Cliens Più, Google Calendar, Outlook… (sola lettura)"><Link2 size={16} /> Calendari collegati</Btn>
          <Btn variant="ghost" onClick={() => setStampa(true)} title="Stampa gli impegni di oggi, domani o della settimana"><Printer size={16} /> Stampa</Btn>
          <Btn variant="ghost" onClick={() => run(() => api.exportIcs(), undefined)} title="Esporta per Calendario di Apple, Google, Outlook"><Download size={16} /> Esporta .ics</Btn>
          {settings.profilo !== 'ditta' && <Btn onClick={() => setTermini(true)} title="Calcola un termine in avanti o a ritroso, con sospensione feriale e festivi"><Calculator size={16} /> Calcola termine</Btn>}
          <Btn variant="primary" onClick={() => add(new Date())}><Plus size={16} /> Nuova scadenza</Btn>
        </>} />
      <div className="toolbar">
        <div className="row">
          <Btn size="sm" variant="ghost" onClick={() => nav(-1)} aria-label="Precedente"><ChevronLeft size={16} /></Btn>
          <Btn size="sm" onClick={() => setCursor(new Date())}>Oggi</Btn>
          <Btn size="sm" variant="ghost" onClick={() => nav(1)} aria-label="Successivo"><ChevronRight size={16} /></Btn>
          {view !== 'elenco' && <h2 className="cal-title">{title}</h2>}
        </div>
        <div className="spacer" />
        <div style={{ width: 220 }}><PraticaSelect value={pratica} onChange={setPratica} noneLabel="Tutte le pratiche" ariaLabel="Filtra per pratica" /></div>
        <label className="check"><input type="checkbox" checked={showTodo} onChange={(e) => { setShowTodo(e.target.checked); savePref('agenda.todo', e.target.checked) }} /> Compiti</label>
        {calendari.length > 0 && <label className="check"><input type="checkbox" checked={showExt} onChange={(e) => { setShowExt(e.target.checked); savePref('agenda.ext', e.target.checked) }} /> Calendari collegati</label>}
        <label className="check"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Completate</label>
        <Segmented<View> value={view} onChange={setView} options={[{ id: 'mese', label: 'Mese' }, { id: 'settimana', label: 'Settimana' }, { id: 'elenco', label: 'Elenco' }]} />
      </div>
      {body}
      {ed.element}
      {termini && <CalcoloTerminiModal onClose={() => setTermini(false)} onCrea={(t) => { setTermini(false); ed.open({ kind: 'scadenza', item: { titolo: t.titolo, data_ora: t.data, tutto_il_giorno: 1, note: t.note } }) }} />}
      {stampa && <StampaAgendaModal onClose={() => setStampa(false)} />}
      {ext && <EventoEsternoModal evento={ext} onClose={() => setExt(null)} />}
    </div>
  )
}
