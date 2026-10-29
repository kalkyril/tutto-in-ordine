import { usePagination } from '../components/Pagination'
import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CheckSquare, FolderPlus, LayoutGrid, List, Columns3, Search, Star, FolderOpen } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { useEditors } from '../components/editors'
import { apriMenu } from '../lib/menuContestuale'
import { Btn, ColorDot, Empty, PageHeader, Pill, Segmented, useAction, useFeedback } from '../components/ui'
import { useZonaPratiche } from '../lib/trascina'
import { fmtDate, relative } from '../lib/dates'
import { loadPref, matchPratica, praticaStats, savePref } from '../lib/stats'
import type { Pratica } from '../types'
import { useClock } from '../lib/clock'

type View = 'schede' | 'elenco' | 'kanban'

export default function Pratiche() {
  const clock = useClock()
  const { pratiche, scadenze, todos, anagraficaById, settings } = useData()
  const { go } = useNav()
  const ed = useEditors()
  const run = useAction()
  const { toast, confirm } = useFeedback()
  // file rilasciati su una pratica dell'elenco: vengono collegati a quella pratica (come gli allegati di una email)
  const zona = useZonaPratiche(async (id, paths) => { const r = await run(() => api.addDocumentiPaths(id, paths)); if (r) toast(`${r.length === 1 ? '1 file collegato' : `${r.length} file collegati`} a «${pratiche.find((x) => x.id === id)?.titolo || 'pratica'}»`) })
  const L = settings.etichette
  const [view, setViewS] = useState<View>(() => loadPref<View>('pratiche.view', 'schede'))
  const setView = (v: View) => { setViewS(v); savePref('pratiche.view', v) }
  const [q, setQState] = useState(() => loadPref<string>('pratiche.q', ''))
  const setQ = (value: string) => { setQState(value); savePref('pratiche.q', value) }
  const [stato, setStatoState] = useState(() => loadPref<string>('pratiche.stato', '__attive'))
  const setStato = (value: string) => { setStatoState(value); savePref('pratiche.stato', value) }
  const [tipo, setTipoState] = useState(() => loadPref<string>('pratiche.tipo', ''))
  const setTipo = (value: string) => { setTipoState(value); savePref('pratiche.tipo', value) }
  const [sort, setSortState] = useState(() => loadPref<string>('pratiche.sort', 'recenti'))
  const setSort = (value: string) => { setSortState(value); savePref('pratiche.sort', value) }
  // ordinamento cliccando le intestazioni dell'elenco (ha la precedenza sul menu «Ordina»); selezione multipla per le azioni di gruppo
  const [col, setCol] = useState<{ k: string; dir: 1 | -1 } | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const stats = useMemo(() => praticaStats(scadenze, todos), [scadenze, todos, clock])
  const chiuse = useMemo(() => new Set(settings.stati_pratica.filter((s) => s.chiusa).map((s) => s.nome)), [settings.stati_pratica])

  const rows = useMemo(() => {
    let r = pratiche.filter((p) => {
      if (stato === '__attive' && chiuse.has(p.stato || '')) return false
      if (stato !== '__attive' && stato !== '__tutte' && p.stato !== stato) return false
      if (tipo && p.tipo !== tipo) return false
      if (q.trim()) return matchPratica(p, q, [anagraficaById.get(p.cliente_id ?? -1)?.denominazione || '', anagraficaById.get(p.controparte_id ?? -1)?.denominazione || ''])
      return true
    })
    const next = (p: Pratica) => stats.get(p.id)?.nextScad?.data_ora || '9999'
    if (sort === 'titolo') r = [...r].sort((a, b) => a.titolo.localeCompare(b.titolo))
    else if (sort === 'scadenza') r = [...r].sort((a, b) => next(a).localeCompare(next(b)))
    else if (sort === 'numero') r = [...r].sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))
    r = [...r].sort((a, b) => b.preferita - a.preferita)
    if (col && view === 'elenco') {
      const chiave = (p: Pratica): string => col.k === 'numero' ? p.numero || '' : col.k === 'titolo' ? p.titolo : col.k === 'cliente' ? anagraficaById.get(p.cliente_id ?? -1)?.denominazione || '' : col.k === 'tipo' ? p.tipo || '' : col.k === 'stato' ? p.stato || '' : next(p)
      r = [...r].sort((a, b) => col.dir * chiave(a).localeCompare(chiave(b), 'it', { numeric: true, sensitivity: 'base' }))
    }
    return r
  }, [pratiche, q, stato, tipo, sort, col, view, stats, chiuse, anagraficaById])
  const { visible, controls } = usePagination(rows, JSON.stringify([q, stato, tipo, sort, col, view]))
  const [limits, setLimits] = useState<Record<string, number>>({})
  const selezionate = useMemo(() => rows.filter((p) => sel.has(p.id)), [rows, sel])
  const ordinaPer = (k: string) => setCol((c) => (c?.k === k ? (c.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 }))
  const impostaStato = (p: Pratica, nome: string) => {
    const def = settings.stati_pratica.find((x) => x.nome === nome)
    if (p.stato === nome) return Promise.resolve(undefined)
    return run(() => api.save('pratiche', { id: p.id, stato: nome, data_chiusura: def?.chiusa ? (p.data_chiusura || new Date().toISOString().slice(0, 10)) : null }))
  }
  const statoSelezionate = async (nome: string) => {
    for (const p of selezionate) await impostaStato(p, nome)
    toast(`Stato «${nome}» impostato su ${selezionate.length} ${selezionate.length === 1 ? L.pratica.toLowerCase() : L.pratiche.toLowerCase()}`)
  }
  const preferiteSelezionate = async () => { for (const p of selezionate) if (!p.preferita) await run(() => api.save('pratiche', { id: p.id, preferita: 1 })); toast('Aggiunte ai preferiti') }
  const eliminaSelezionate = async () => {
    const n = selezionate.length
    if (!(await confirm({ title: `Eliminare ${n} ${n === 1 ? L.pratica.toLowerCase() : L.pratiche.toLowerCase()}?`, text: `${selezionate.slice(0, 5).map((p) => '“' + p.titolo + '”').join(', ')}${n > 5 ? ` e altre ${n - 5}` : ''} verranno eliminate con scadenze, compiti, note, collegamenti e documenti collegati (i file sul computer non vengono toccati). L'operazione non è reversibile.`, ok: `Elimina ${n}`, danger: true }))) return
    for (const p of selezionate) await run(() => api.remove('pratiche', p.id))
    setSel(new Set())
  }

  const toggleFav = (p: Pratica) => run(() => api.save('pratiche', { id: p.id, preferita: p.preferita ? 0 : 1 }))
  const open = (p: Pratica) => go({ page: 'pratica', id: p.id })
  const menuPratica = (p: Pratica) => apriMenu([
    { id: 'apri', label: 'Apri', fai: () => open(p) },
    { id: 'modifica', label: 'Modifica…', fai: () => ed.open({ kind: 'pratica', item: p }) },
    { id: 'preferita', label: p.preferita ? 'Togli dalle preferite' : 'Aggiungi alle preferite', fai: () => toggleFav(p) },
    '-',
    { id: 'scadenza', label: 'Nuova scadenza…', fai: () => ed.open({ kind: 'scadenza', praticaId: p.id }) },
    { id: 'compito', label: 'Nuovo compito…', fai: () => ed.open({ kind: 'todo', praticaId: p.id }) },
  ])
  const nuova = () => ed.open({ kind: 'pratica', onSaved: (p) => go({ page: 'pratica', id: p.id }) })

  return (
    <div className="page">
      <PageHeader title={L.pratiche} subtitle={`${rows.length} ${rows.length === 1 ? 'elemento' : 'elementi'}`}
        actions={<Btn variant="primary" onClick={nuova}><FolderPlus size={16} /> Nuova {L.pratica.toLowerCase()}</Btn>} />
      <div className="toolbar toolbar-pratiche">
        <div className="search-box"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cerca per titolo, numero, ${L.cliente.toLowerCase()}, ${L.rg.toLowerCase()}…`} aria-label="Cerca" /></div>
        <select value={stato} onChange={(e) => setStato(e.target.value)} aria-label="Stato">
          <option value="__attive">Solo attive</option><option value="__tutte">Tutte</option>
          {settings.stati_pratica.map((s) => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipologia">
          <option value="">Tutte le tipologie</option>{settings.tipi_pratica.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordina">
          <option value="recenti">Più recenti</option><option value="scadenza">Prossima scadenza</option><option value="titolo">Titolo A–Z</option><option value="numero">Numero</option>
        </select>
        <Segmented<View> value={view} onChange={setView} options={[
          { id: 'schede', label: <LayoutGrid size={16} />, title: 'Schede' }, { id: 'elenco', label: <List size={16} />, title: 'Elenco' }, { id: 'kanban', label: <Columns3 size={16} />, title: 'Per stato' }]} />
      </div>

      {!pratiche.length ? (
        <Empty icon={<FolderOpen size={32} />} title={`Nessuna ${L.pratica.toLowerCase()} ancora`} text="Ogni pratica ha un colore personalizzabile, scadenze con avviso e una propria lista di attività."
          action={<Btn variant="primary" onClick={nuova}><FolderPlus size={16} /> Crea la prima {L.pratica.toLowerCase()}</Btn>} />
      ) : !rows.length && view !== 'kanban' ? (
        <Empty icon={<Search size={28} />} title="Nessun risultato" text="Prova a cambiare i filtri di ricerca." />
      ) : view === 'schede' ? (
        <div className="cards-grid" {...zona}>
          {visible.map((p) => {
            const st = stats.get(p.id)
            const cli = p.cliente_id ? anagraficaById.get(p.cliente_id) : null
            const rel = st?.nextScad ? relative(st.nextScad.data_ora) : null
            return (
              <article key={p.id} data-pratica-id={p.id} className="pcard" onContextMenu={menuPratica(p)} style={{ ['--pc' as any]: p.colore }} tabIndex={0} onClick={() => open(p)} onKeyDown={(e) => { if (e.key === 'Enter') open(p) }}>
                <div className="pcard-bar" />
                <div className="pcard-body">
                  <div className="pcard-top">
                    <span className="muted small">{p.numero}{p.tipo ? ' · ' + p.tipo : ''}</span>
                    <button className={`icon-btn ${p.preferita ? 'fav-on' : ''}`} aria-label="Preferita" onClick={(e) => { e.stopPropagation(); toggleFav(p) }}><Star size={15} /></button>
                  </div>
                  <h2>{p.titolo}</h2>
                  {cli && <p className="muted small">{cli.denominazione}</p>}
                  <div className="pcard-meta">
                    <Pill color={settings.stati_pratica.find((s) => s.nome === p.stato)?.colore}>{p.stato}</Pill>
                    {st && st.late > 0 && <span className="rel rel-late"><AlertTriangle size={11} /> {st.late} in ritardo</span>}
                  </div>
                  <div className="pcard-foot">
                    {st?.nextScad ? <span className={`next rel-${rel!.tone}`} title={st.nextScad.titolo}>{fmtDate(st.nextScad.data_ora)} · {st.nextScad.titolo}</span> : <span className="muted small">Nessuna scadenza</span>}
                    {st && st.todoTotal > 0 && <span className="muted small todo-count"><CheckSquare size={12} /> {st.todoTotal - st.todoOpen}/{st.todoTotal}</span>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : view === 'elenco' ? (
        <>
        {selezionate.length > 0 && (
          <div className="bulkbar" role="region" aria-label="Azioni sulla selezione">
            <b>{selezionate.length} {selezionate.length === 1 ? 'selezionata' : 'selezionate'}</b>
            <select aria-label="Cambia stato delle selezionate" value="" onChange={(e) => { if (e.target.value) statoSelezionate(e.target.value) }}>
              <option value="">Cambia stato…</option>{settings.stati_pratica.map((x) => <option key={x.nome} value={x.nome}>{x.nome}</option>)}
            </select>
            <Btn size="sm" onClick={preferiteSelezionate}><Star size={14} /> Aggiungi ai preferiti</Btn>
            <Btn size="sm" variant="danger" onClick={eliminaSelezionate}>Elimina…</Btn>
            <div className="spacer" />
            <Btn size="sm" variant="ghost" onClick={() => setSel(new Set())}>Deseleziona</Btn>
          </div>
        )}
        <div className="table-wrap" {...zona}>
          <table className="table">
            <thead><tr>
              <th style={{ width: 34 }}><input type="checkbox" aria-label="Seleziona tutte" checked={rows.length > 0 && selezionate.length === rows.length} ref={(el) => { if (el) el.indeterminate = selezionate.length > 0 && selezionate.length < rows.length }} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((p) => p.id)) : new Set())} /></th>
              <th style={{ width: 18 }} />
              {([['numero', 'N.'], ['titolo', 'Titolo'], ['cliente', L.cliente], ['tipo', 'Tipologia'], ['stato', 'Stato'], ['scadenza', 'Prossima scadenza']] as const).map(([k, et]) => (
                <th key={k} className={k === 'scadenza' ? 'nowrap' : undefined} aria-sort={col?.k === k ? (col.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="th-sort" onClick={() => ordinaPer(k)} title="Clicca per ordinare">{et}{col?.k === k && (col.dir === 1 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}</button>
                </th>
              ))}
              <th>Compiti</th></tr></thead>
            <tbody>
              {visible.map((p) => {
                const st = stats.get(p.id)
                return (
                  <tr key={p.id} data-pratica-id={p.id} className={sel.has(p.id) ? 'selected' : undefined} onContextMenu={menuPratica(p)} onClick={() => open(p)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(p) }}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Seleziona ${p.titolo}`} checked={sel.has(p.id)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n })} /></td>
                    <td><ColorDot color={p.colore} size={12} /></td>
                    <td className="nowrap">{p.numero}</td>
                    <td><b>{p.titolo}</b>{p.preferita ? <Star size={12} className="fav" style={{ marginLeft: 6, verticalAlign: '-1px' }} /> : null}</td>
                    <td className="nowrap">{p.cliente_id ? anagraficaById.get(p.cliente_id)?.denominazione : ''}</td>
                    <td className="nowrap">{p.tipo}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select className="stato-inline" value={p.stato || ''} aria-label={`Stato di ${p.titolo}`} onChange={(e) => impostaStato(p, e.target.value)}
                        style={{ boxShadow: `inset 0 0 0 1px ${settings.stati_pratica.find((s) => s.nome === p.stato)?.colore || 'var(--border-strong)'}88` }}>
                        {!settings.stati_pratica.some((s) => s.nome === p.stato) && <option value={p.stato || ''}>{p.stato || '—'}</option>}
                        {settings.stati_pratica.map((s) => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
                      </select></td>
                    <td className="nowrap">{st?.nextScad ? <span className={`rel rel-${relative(st.nextScad.data_ora).tone}`}>{fmtDate(st.nextScad.data_ora)}</span> : <span className="muted">—</span>}{st && st.late > 0 && <span className="rel rel-late" style={{ marginLeft: 6 }}>{st.late} in ritardo</span>}</td>
                    <td>{st && st.todoTotal ? st.todoOpen === 1 ? '1 aperto' : `${st.todoOpen} aperti` : <span className="muted">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div className="kanban" {...zona}>
          {settings.stati_pratica.map((s) => {
            const col = rows.filter((p) => p.stato === s.nome)
            return (
              <div key={s.nome} className="kcol"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over') }}
                onDragLeave={(e) => e.currentTarget.classList.remove('over')}
                onDrop={(e) => {
                  e.currentTarget.classList.remove('over')
                  const id = Number(e.dataTransfer.getData('text/pratica'))
                  const p = pratiche.find((x) => x.id === id)
                  if (p && p.stato !== s.nome) run(() => api.save('pratiche', { id, stato: s.nome, data_chiusura: s.chiusa ? (p.data_chiusura || new Date().toISOString().slice(0, 10)) : null }))
                }}>
                <header><ColorDot color={s.colore} /> <b>{s.nome}</b> <span className="tab-count">{col.length}</span></header>
                {col.slice(0, limits[s.nome] || 60).map((p) => (
                  <div key={p.id} data-pratica-id={p.id} className="kcard" draggable onContextMenu={menuPratica(p)} style={{ borderLeftColor: p.colore, background: 'var(--surface)' }}
                    onDragStart={(e) => e.dataTransfer.setData('text/pratica', String(p.id))} onClick={() => open(p)}>
                    <span className="muted small">{p.numero}</span>
                    <b>{p.titolo}</b>
                    {p.cliente_id && <span className="muted small">{anagraficaById.get(p.cliente_id)?.denominazione}</span>}
                    {stats.get(p.id)?.nextScad && <span className={`rel rel-${relative(stats.get(p.id)!.nextScad!.data_ora).tone}`}>{fmtDate(stats.get(p.id)!.nextScad!.data_ora)}</span>}
                  </div>
                ))}
                {col.length > (limits[s.nome] || 60) && <Btn size="sm" onClick={() => setLimits((prev) => ({ ...prev, [s.nome]: (prev[s.nome] || 60) + 60 }))}>Mostra altre pratiche ({col.length - (limits[s.nome] || 60)})</Btn>}
              </div>
            )
          })}
        </div>
      )}
      {view !== 'kanban' && controls}
      {ed.element}
    </div>
  )
}
