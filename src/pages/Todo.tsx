import { usePagination } from '../components/Pagination'
import { useMemo, useState } from 'react'
import { CheckSquare, Plus } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useEditors } from '../components/editors'
import { Btn, Empty, PageHeader, Segmented, useAction } from '../components/ui'
import { TodoRow } from '../components/items'
import { PraticaSelect } from '../components/forms'
import { fmtLong, parse, ymd } from '../lib/dates'
import { useClock } from '../lib/clock'

type F = 'aperte' | 'oggi' | 'completate'

export default function TodoPage() {
  const { todos, settings } = useData()
  const ed = useEditors()
  const run = useAction()
  const [f, setF] = useState<F>('aperte')
  const [pratica, setPratica] = useState<number | null>(null)
  const [titolo, setTitolo] = useState('')
  const today = ymd(new Date(useClock()))

  const rows = useMemo(() => todos.filter((t) => (pratica ? t.pratica_id === pratica : true)).filter((t) =>
    f === 'completate' ? !!t.completata : f === 'oggi' ? !t.completata && !!t.scadenza && t.scadenza.slice(0, 10) <= today : !t.completata), [todos, f, pratica, today])

  const ordered = useMemo(() => [...rows].sort((a, b) => (a.scadenza || '9').localeCompare(b.scadenza || '9') || b.priorita - a.priorita), [rows])
  const { visible, controls } = usePagination(ordered, JSON.stringify([f, pratica]))
  const groups = useMemo(() => {
    const g = new Map<string, typeof rows>()
    const key = (t: (typeof rows)[number]) => f === 'completate' ? 'Completate' : !t.scadenza ? 'Senza scadenza' : t.scadenza.slice(0, 10) < today ? 'In ritardo' : t.scadenza.slice(0, 10) === today ? 'Oggi' : t.scadenza.slice(0, 10)
    const order = (k: string) => (k === 'In ritardo' ? '0' : k === 'Oggi' ? '1' : k === 'Senza scadenza' ? '9' : '2' + k)
    for (const t of visible) { const k = key(t); if (!g.has(k)) g.set(k, []); g.get(k)!.push(t) }
    return [...g.entries()].sort((a, b) => order(a[0]).localeCompare(order(b[0])))
  }, [visible, f, today])

  return (
    <div className="page">
      <PageHeader title="Compiti" subtitle="Tutte le cose da fare, di tutte le pratiche" actions={<Btn variant="primary" onClick={() => ed.open({ kind: 'todo' })}><Plus size={16} /> Nuovo compito</Btn>} />
      <form className="quick-add" onSubmit={(e) => { e.preventDefault(); const t = titolo.trim(); if (!t) return; run(() => api.save('todos', { titolo: t, pratica_id: pratica })).then((result) => { if (result) setTitolo('') }) }}>
        <Plus size={16} /><input value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Aggiungi un compito e premi Invio…" aria-label="Nuovo compito" />
        <Btn type="submit" size="sm" variant="primary" disabled={!titolo.trim()}>Aggiungi</Btn>
      </form>
      <div className="toolbar">
        <Segmented<F> value={f} onChange={setF} options={[{ id: 'aperte', label: 'Da fare' }, { id: 'oggi', label: 'Oggi e in ritardo' }, { id: 'completate', label: 'Completate' }]} />
        <div className="spacer" />
        <div style={{ width: 260 }}><PraticaSelect value={pratica} onChange={setPratica} noneLabel="Tutte le pratiche" ariaLabel="Filtra per pratica" /></div>
      </div>
      {groups.map(([k, list]) => (
        <section className="card" key={k}>
          <header className="card-head"><h2 className={k === 'In ritardo' ? 'danger' : ''}>{/^\d{4}-/.test(k) ? fmtLong(parse(k)!) : k} <span className="tab-count">{list.length}</span></h2></header>
          {list.map((t) => <TodoRow key={t.id} t={t} onEdit={(x) => ed.open({ kind: 'todo', item: x })} />)}
        </section>
      ))}
      {!groups.length && <Empty icon={<CheckSquare size={30} />} title={f === 'completate' ? 'Nessun compito completato' : 'Nessun compito da fare'} text={settings.etichette ? 'Aggiungine una qui sopra, oppure dentro una pratica.' : ''} />}
      {controls}
      {ed.element}
    </div>
  )
}
