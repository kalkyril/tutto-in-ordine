import { useData } from '../../store'
import { LinkTiles } from '../LinkTiles'
import type { Link } from '../../types'

export function CollegamentiTab({ links, onNew, onEdit }: { links: Link[]; onNew: () => void; onEdit: (l: Link) => void }) {
  const { link: all } = useData()
  const globali = all.filter((l) => !l.pratica_id)
  return (
    <div className="stack">
      <section className="card">
        <header className="card-head"><h2>Siti di questa pratica</h2></header>
        <div className="pad"><LinkTiles links={links} onAdd={onNew} onEdit={onEdit} /></div>
      </section>
      {globali.length > 0 && (
        <section className="card">
          <header className="card-head"><h2>I miei siti</h2></header>
          <div className="pad"><LinkTiles links={globali} onAdd={() => onNew()} onEdit={onEdit} /></div>
        </section>
      )}
    </div>
  )
}
