// Avanzamento delle operazioni lunghe del processo principale (sincronizzazioni, cartelle intere, Cliens):
// la finestra resta utilizzabile e qui si vede a che punto è il lavoro.
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface Info { operazione: string; fase?: string; fatti?: number; totale?: number; pratica?: string; pratiche?: number; totalePratiche?: number; fine?: boolean }

const NOMI: Record<string, string> = { sincronizza: 'Ricerca dei file spostati', cartella: 'Collegamento della cartella', cliens: 'Sincronizzazione con Cliens' }
const FASI: Record<string, string> = { cerco: 'file trovati', controllo: 'documenti controllati', confronto: 'file confrontati', collego: 'file collegati', leggo: 'file letti', salvo: 'salvataggio' }

export function Avanzamento() {
  const [info, setInfo] = useState<Info | null>(null)
  useEffect(() => window.mngmnt.on('avanzamento', (x: Info) => setInfo(x.fine ? null : x)), [])
  if (!info) return null
  const pct = info.totale ? Math.min(100, Math.round(((info.fatti || 0) / info.totale) * 100)) : null
  const dettaglio = [
    info.totalePratiche ? `pratica ${info.pratiche}/${info.totalePratiche}${info.pratica ? ` (${info.pratica})` : ''}` : '',
    info.fase === 'salvo' ? 'salvataggio…' : info.fatti != null ? `${info.fatti}${info.totale ? `/${info.totale}` : ''} ${FASI[info.fase || ''] || ''}`.trim() : '',
  ].filter(Boolean).join(' · ')
  return (
    <div className="avanzamento" role="status" aria-live="polite" title={dettaglio}>
      <RefreshCw size={14} className="spin" aria-hidden="true" />
      <span className="avanzamento-testo"><b>{NOMI[info.operazione] || 'Operazione in corso'}</b>{dettaglio && <span> · {dettaglio}</span>}</span>
      {pct != null && <span className="avanzamento-barra" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>}
    </div>
  )
}
