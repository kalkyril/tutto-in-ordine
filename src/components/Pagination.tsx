import { useEffect, useState } from 'react'
import { Btn } from './ui'

export function usePagination<T>(items: T[], resetKey: string, size = 60) {
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [resetKey])
  const pages = Math.max(1, Math.ceil(items.length / size)), current = Math.min(page, pages - 1)
  const visible = items.slice(current * size, (current + 1) * size)
  const controls = items.length > size ? <nav className="pagination" aria-label="Pagine dell’elenco">
    <span className="muted small">{current * size + 1}–{Math.min((current + 1) * size, items.length)} di {items.length}</span>
    <Btn size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Precedente</Btn>
    <span className="small" aria-live="polite">Pagina {current + 1} di {pages}</span>
    <Btn size="sm" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Successiva</Btn>
  </nav> : null
  return { visible, controls }
}
