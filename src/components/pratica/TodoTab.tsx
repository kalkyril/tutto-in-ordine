import { useRef, useState } from 'react'
import { Plus, FilePlus2, GripVertical } from 'lucide-react'
import { api } from '../../api'
import { Btn, Empty, useAction } from '../ui'
import { TodoRow } from '../items'
import type { Todo } from '../../types'

export function TodoTab({ praticaId, todos, onEdit, focus }: { praticaId: number; todos: Todo[]; onEdit: (t: Todo) => void; focus?: number }) {
  const run = useAction()
  const [titolo, setTitolo] = useState('')
  const [showDone, setShowDone] = useState(false)
  const dragId = useRef<number | null>(null)
  const open = [...todos].filter((t) => !t.completata).sort((a, b) => a.ordine - b.ordine || a.id - b.id)
  const done = todos.filter((t) => t.completata).sort((a, b) => (b.completata_il || '').localeCompare(a.completata_il || ''))
  const pct = todos.length ? Math.round((done.length / todos.length) * 100) : 0
  const add = async () => {
    const t = titolo.trim()
    if (!t) return
    setTitolo('')
    await run(() => api.save('todos', { pratica_id: praticaId, titolo: t, ordine: (Math.max(-1, ...todos.map((x) => x.ordine)) + 1) }))
  }
  const drop = (targetId: number) => {
    const from = dragId.current
    dragId.current = null
    if (from === null || from === targetId) return
    const ids = open.map((t) => t.id).filter((i) => i !== from)
    ids.splice(ids.indexOf(targetId), 0, from)
    run(() => api.reorderTodos(ids))
  }
  return (
    <section className="card">
      <header className="card-head">
        <h2>Lista dei compiti</h2>
        {todos.length > 0 && <div className="progress-wrap"><div className="progress"><i style={{ width: pct + '%' }} /></div><span className="muted small">{done.length}/{todos.length}</span></div>}
      </header>
      <form className="quick-add" onSubmit={(e) => { e.preventDefault(); add() }}>
        <Plus size={16} /><input value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Aggiungi un compito e premi Invio…" aria-label="Nuovo compito" />
        <Btn type="submit" size="sm" variant="primary" disabled={!titolo.trim()}>Aggiungi</Btn>
      </form>
      {open.map((t) => (
        <div key={t.id} className="drag-row" draggable onDragStart={() => { dragId.current = t.id }} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(t.id)}>
          <span className="grip" aria-hidden><GripVertical size={14} /></span>
          <div className="grow"><TodoRow t={t} showPratica={false} onEdit={onEdit} highlight={t.id === focus} /></div>
        </div>
      ))}
      {!open.length && !done.length && <Empty icon={<FilePlus2 size={28} />} title="Nessun compito" text="Scrivi qui sopra la prima cosa da fare per questa pratica. Puoi assegnare scadenza, priorità e un avviso." />}
      {!open.length && done.length > 0 && <p className="muted pad">Tutti i compiti sono completati.</p>}
      {done.length > 0 && (
        <>
          <button className="link-btn" onClick={() => setShowDone(!showDone)}>{showDone ? 'Nascondi' : 'Mostra'} completate ({done.length})</button>
          {showDone && done.map((t) => <TodoRow key={t.id} t={t} showPratica={false} onEdit={onEdit} />)}
        </>
      )}
    </section>
  )
}
