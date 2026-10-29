import { useState } from 'react'
import { Pencil, Trash2, StickyNote } from 'lucide-react'
import { api } from '../../api'
import { Btn, Textarea, useAction, useFeedback } from '../ui'
import { fmtDateTime } from '../../lib/dates'
import type { Nota } from '../../types'

export function NoteTab({ praticaId, note }: { praticaId: number; note: Nota[] }) {
  const run = useAction()
  const { eliminaConAnnulla } = useFeedback()
  const [testo, setTesto] = useState('')
  const [editing, setEditing] = useState<{ id: number; testo: string } | null>(null)
  return (
    <section className="card">
      <header className="card-head"><h2>Diario della pratica</h2></header>
      <div className="note-add">
        <Textarea value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Annota colloqui, telefonate, strategie…" rows={3} aria-label="Nuova nota" />
        <Btn variant="primary" disabled={!testo.trim()} onClick={async () => { if (await run(() => api.save('note', { pratica_id: praticaId, testo: testo.trim() }))) setTesto('') }}><StickyNote size={15} /> Aggiungi nota</Btn>
      </div>
      {note.map((n) => (
        <article key={n.id} className="note">
          <header><span className="muted small">{fmtDateTime(n.created_at.replace(' ', 'T').slice(0, 16))}</span>
            <span className="row-actions always">
              <button className="icon-btn" aria-label="Modifica" onClick={() => setEditing({ id: n.id, testo: n.testo })}><Pencil size={14} /></button>
              <button className="icon-btn" aria-label="Elimina" onClick={() => eliminaConAnnulla('note', n.id, 'Nota')}><Trash2 size={14} /></button>
            </span></header>
          {editing?.id === n.id ? (
            <>
              <Textarea value={editing.testo} onChange={(e) => setEditing({ ...editing, testo: e.target.value })} rows={4} autoFocus />
              <div className="row" style={{ marginTop: 6 }}><Btn size="sm" variant="primary" onClick={async () => { if (await run(() => api.save('note', { id: n.id, testo: editing.testo.trim() }))) setEditing(null) }}>Salva</Btn><Btn size="sm" variant="ghost" onClick={() => setEditing(null)}>Annulla</Btn></div>
            </>
          ) : <p className="prewrap">{n.testo}</p>}
        </article>
      ))}
      {!note.length && <p className="muted pad">Nessuna nota.</p>}
    </section>
  )
}
