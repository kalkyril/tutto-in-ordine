import { useEffect, useState } from 'react'
import { CheckCircle2, CircleDot, FilePlus2, History, PlusCircle, RotateCcw, Trash2, type LucideIcon } from 'lucide-react'
import { api } from '../../api'
import { fmtDateTime } from '../../lib/dates'
import type { Cronologia } from '../../types'

const ICONA: Record<Cronologia['azione'], LucideIcon> = { creato: PlusCircle, completato: CheckCircle2, riaperto: RotateCcw, eliminato: Trash2, stato: CircleDot }
const FEMMINILI = new Set(['scadenze', 'note', 'ore', 'spese'])
const PARTICIPI: Record<Cronologia['azione'], string> = { creato: 'aggiunt', completato: 'completat', riaperto: 'riapert', eliminato: 'eliminat', stato: '' }
/** «Scadenza «X» aggiunta», «Compito «X» completato»: il participio concorda con il genere. Pratica aperta, cambi di stato e riassunti restano frasi intere. */
function frase(c: Cronologia): string {
  if (c.azione === 'stato' || c.tabella === 'pratiche' || /^\d/.test(c.testo)) return c.testo
  return `${c.testo} ${PARTICIPI[c.azione]}${FEMMINILI.has(c.tabella) ? 'a' : 'o'}`
}

/** Registro delle cose successe nella pratica (aggiunte, completamenti, cambi di stato, eliminazioni), dalla più recente. */
export function CronologiaCard({ praticaId }: { praticaId: number }) {
  const [righe, setRighe] = useState<Cronologia[]>([])
  const [tutte, setTutte] = useState(false)
  // solo le righe di questa pratica, rilette quando cambia la cronologia: caricarla tutta nella finestra la appesantiva col tempo
  useEffect(() => {
    let attivo = true
    const carica = () => api.list<Cronologia>('cronologia', { pratica_id: praticaId }, 'id DESC').then((r) => { if (attivo) setRighe(r) }).catch(() => {})
    carica()
    const off = window.mngmnt.on('data-changed', (tabelle: string[]) => { if (tabelle.includes('cronologia')) carica() })
    return () => { attivo = false; off() }
  }, [praticaId])
  const visibili = tutte ? righe : righe.slice(0, 8)
  return (
    <section className="card" aria-labelledby="cronologia-titolo">
      <header className="card-head"><h2 id="cronologia-titolo"><History size={16} aria-hidden /> Cronologia</h2></header>
      {!righe.length && <p className="muted pad">Qui compariranno le attività della pratica: scadenze e compiti aggiunti o completati, documenti, cambi di stato.</p>}
      <ol className="crono">
        {visibili.map((c) => {
          const Icon = c.azione === 'creato' && c.tabella === 'documenti' ? FilePlus2 : ICONA[c.azione]
          return (
            <li key={c.id} className={`crono-${c.azione}`}>
              <Icon size={15} aria-hidden />
              <span className="crono-testo">{frase(c)}</span>
              <time className="muted small" dateTime={c.created_at.replace(' ', 'T')}>{fmtDateTime(c.created_at.replace(' ', 'T').slice(0, 16))}</time>
            </li>
          )
        })}
      </ol>
      {righe.length > 8 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTutte((x) => !x)}>{tutte ? 'Mostra meno' : `Mostra tutte (${righe.length})`}</button>}
    </section>
  )
}
