import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useAction, useFeedback } from './ui'
import type { Link } from '../types'

export const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, '') } catch { return u } }
const iniziale = (l: Link) => (l.titolo.trim().match(/[\p{L}\p{N}]/u)?.[0] || hostOf(l.url)[0] || '?').toUpperCase()
// colore stabile ricavato dall'indirizzo del sito (nessuna richiesta in rete)
const tinta = (l: Link) => { let h = 0; for (const c of hostOf(l.url)) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

/** Siti scelti dall'utente, in riquadri quadrati come la schermata iniziale di un browser. */
export function LinkTiles({ links, onAdd, onEdit }: { links: Link[]; onAdd: () => void; onEdit: (l: Link) => void }) {
  const run = useAction()
  const { eliminaConAnnulla } = useFeedback()
  const { praticaById } = useData()
  return (
    <div className="tiles">
      {links.map((l) => {
        const p = l.pratica_id ? praticaById.get(l.pratica_id) : null
        return (
          <div key={l.id} className="tile-wrap">
            <button className="tile" onClick={() => run(() => api.openExternal(l.url))} title={`${l.titolo} — ${l.url}`}>
              <span className="tile-ico" style={{ ['--h' as string]: tinta(l) }} aria-hidden="true">{iniziale(l)}</span>
              <span className="tile-nome">{l.titolo}</span>
              <span className="tile-sub">{p ? (p.numero || p.titolo) : l.descrizione || hostOf(l.url)}</span>
            </button>
            <span className="tile-azioni">
              <button className="icon-btn" aria-label={`Modifica ${l.titolo}`} onClick={() => onEdit(l)}><Pencil size={13} /></button>
              <button className="icon-btn" aria-label={`Elimina ${l.titolo}`} onClick={() => eliminaConAnnulla('link', l.id, 'Collegamento')}><Trash2 size={13} /></button>
            </span>
          </div>
        )
      })}
      <button className="tile tile-add" onClick={onAdd} aria-label="Aggiungi un sito"><span className="tile-ico plus" aria-hidden="true"><Plus size={26} /></span><span className="tile-nome">Aggiungi un sito</span></button>
    </div>
  )
}
