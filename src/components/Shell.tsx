import { useEffect, useMemo, useRef, useState } from 'react'
import { Lock, AlarmClock, Bell, CalendarDays, CheckCheck, CheckSquare, FolderKanban, Globe, LayoutDashboard, Search, Settings, Trash2, Users, Wallet, FileText, StickyNote, Folder, Users2, PanelLeft, ChevronRight, Download, FilePen, ShieldCheck, HandCoins } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav, type Page } from '../nav'
import { ColorDot, Modal, useAction } from './ui'
import type { SearchHit } from '../types'
import { fmtDateTime, isLate } from '../lib/dates'
import { nomeAttivita } from '../lib/brand'
import { useBlocco } from './LockGate'
import { scorciatoia, type Azione } from '../lib/azioni'
import { useClock } from '../lib/clock'

export function Sidebar() {
  const { route, go } = useNav()
  const { settings, scadenze, todos } = useData()
  const L = settings.etichette
  const clock = useClock()
  const lateCount = useMemo(() => scadenze.filter((s) => !s.completata && isLate(s, clock)).length, [scadenze, clock])
  const items: { page: Page; label: string; icon: any; badge?: number }[] = [
    { page: 'dashboard', label: 'Panoramica', icon: LayoutDashboard },
    { page: 'pratiche', label: L.pratiche, icon: FolderKanban },
    { page: 'agenda', label: 'Agenda', icon: CalendarDays, badge: lateCount },
    { page: 'todo', label: 'Compiti', icon: CheckSquare, badge: todos.filter((t) => !t.completata).length },
    { page: 'anagrafica', label: 'Anagrafica', icon: Users },
    { page: 'parcelle', label: L.parcelle, icon: Wallet },
    { page: 'dapagare', label: 'Da pagare', icon: HandCoins },
    { page: 'collegamenti', label: 'Collegamenti', icon: Globe },
    { page: 'documenti', label: 'Documenti', icon: FilePen },
    { page: 'anonimizza', label: 'Anonimizza', icon: ShieldCheck },
  ]
  const active = route.page === 'pratica' ? 'pratiche' : route.page
  return (
    <nav className="sidebar" id="sidebar" aria-label="Navigazione principale">
      <div className="brand" title={nomeAttivita(settings)}>
        {settings.brand_logo && <img className="brand-logo" src={settings.brand_logo} alt="" />}
        <span className="brand-text"><span className="brand-name">{nomeAttivita(settings)}</span><span className="brand-app">TIO</span></span>
      </div>
      <div className="nav-list">
        {[{ label: 'Lavoro', items: items.slice(0, 4) }, { label: 'Gestione', items: items.slice(4, 8) }, { label: 'Strumenti', items: items.slice(8) }].map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-section">{group.label}</p>
            {group.items.map(({ page, label, icon: Icon, badge }) => (
              <button key={page} className={`nav-item ${active === page ? 'on' : ''}`} onClick={() => go(page)} aria-current={active === page ? 'page' : undefined}>
                <Icon size={18} aria-hidden="true" /><span>{label}</span>{badge ? <em className={page === 'agenda' ? 'badge danger' : 'badge'} title={page === 'agenda' ? `${badge} scadenze in ritardo` : `${badge} compiti da fare`}>{badge > 99 ? '99+' : badge}</em> : null}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="nav-bottom">
        <button className={`nav-item ${active === 'impostazioni' ? 'on' : ''}`} onClick={() => go('impostazioni')} aria-current={active === 'impostazioni' ? 'page' : undefined}><Settings size={18} aria-hidden="true" /><span>Impostazioni</span></button>
      </div>
    </nav>
  )
}

export function Topbar({ onSearch, sidebarVisible, onToggleSidebar }: { onSearch: () => void; sidebarVisible: boolean; onToggleSidebar: () => void }) {
  const { notifiche, settings, praticaById } = useData()
  const { route, go } = useNav()
  const labels: Record<Page, string> = { dashboard: 'Panoramica', pratiche: settings.etichette.pratiche, pratica: settings.etichette.pratiche, agenda: 'Agenda', todo: 'Compiti', anagrafica: 'Anagrafica', parcelle: settings.etichette.parcelle, dapagare: 'Da pagare', collegamenti: 'Collegamenti', documenti: 'Documenti', anonimizza: 'Anonimizza', impostazioni: 'Impostazioni' }
  const pratica = route.page === 'pratica' && route.id ? praticaById.get(route.id) : null
  const blocco = useBlocco()
  const [open, setOpen] = useState(false)
  const unread = notifiche.filter((n) => !n.letta).length
  const testoBadge = unread > 99 ? '99+' : String(unread) // lo stesso testo compare nel badge e nel nome accessibile
  // versione più recente trovata dal controllo facoltativo (electron/aggiornamenti.js); sparisce dopo l'installazione
  const [versione, setVersione] = useState<string>()
  useEffect(() => { api.appInfo().then((i: any) => setVersione(i?.version)).catch(() => {}) }, [])
  const nuova = versione && settings.aggiornamento && settings.aggiornamento.versione !== versione ? settings.aggiornamento : null
  return (
    <header className="topbar">
      <button className="icon-btn sidebar-toggle" onClick={onToggleSidebar} aria-label={sidebarVisible ? 'Nascondi barra laterale' : 'Mostra barra laterale'} title={sidebarVisible ? 'Nascondi barra laterale' : 'Mostra barra laterale'} aria-expanded={sidebarVisible} aria-controls={sidebarVisible ? 'sidebar' : undefined}><PanelLeft size={19} /></button>
      <div className="toolbar-context">
        {pratica ? <><button className="context-link" onClick={() => go('pratiche')}>{labels.pratiche}</button><ChevronRight size={13} aria-hidden="true" /><span title={pratica.titolo}>{pratica.numero || pratica.titolo}</span></> : <span>{labels[route.page]}</span>}
      </div>
      <div className="spacer" />
      {nuova && <button className="update-pill" aria-label={`Aggiornamento disponibile: TIO ${nuova.versione}`} onClick={() => go({ page: 'impostazioni', tab: 'backup' })} title={`È disponibile TIO ${nuova.versione}: apri Impostazioni › Backup e sicurezza › Aggiornamenti per scaricarla (prima fai un backup)`}>
        <Download size={14} aria-hidden="true" /><span>Aggiornamento <b>{nuova.versione}</b></span>
      </button>}
      <button className="search-trigger" onClick={onSearch}>
        <Search size={15} aria-hidden="true" /><span>Cerca nell’archivio…</span><kbd>{scorciatoia('K')}</kbd>
      </button>
      {blocco.attivo && <button className="icon-btn" onClick={blocco.blocca} aria-label="Blocca TIO" title="Blocca TIO: per riaprirlo serve la password"><Lock size={18} /></button>}
      <button className="icon-btn bell-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" aria-label={`Notifiche${unread ? `, ${testoBadge} non lette` : ''}`}>
        <Bell size={19} />{unread > 0 && <i className="bell-badge" aria-hidden="true">{testoBadge}</i>}
      </button>
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </header>
  )
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { notifiche } = useData()
  const { go } = useNav()
  const run = useAction()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.bell-btn')) onClose() }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [onClose])
  const openItem = (n: (typeof notifiche)[number]) => {
    run(() => api.markRead(n.id))
    onClose()
    if (n.pratica_id) go({ page: 'pratica', id: n.pratica_id, tab: n.rif_tipo === 'todo' ? 'todo' : 'scadenze', focus: n.rif_id || undefined })
    else if (n.rif_tipo === 'todo') go('todo')
    else if (n.rif_tipo === 'scadenza' || n.rif_tipo === 'evento_esterno') go('agenda')
    else if (n.rif_tipo === 'aggiornamento') go({ page: 'impostazioni', tab: 'backup' })
  }
  return (
    <div className="popover notif" ref={ref} role="dialog" aria-label="Notifiche">
      <div className="notif-head"><h2>Notifiche</h2>
        <div className="row">
          <button className="icon-btn" title="Segna tutte come lette" aria-label="Segna tutte come lette" onClick={() => run(() => api.markRead())}><CheckCheck size={16} /></button>
          <button className="icon-btn" title="Svuota" aria-label="Svuota le notifiche" onClick={() => run(() => api.clearNotifiche())}><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="notif-list">
        {notifiche.map((n) => (
          <button key={n.id} className={`notif-item ${n.letta ? '' : 'unread'}`} onClick={() => openItem(n)}>
            <span className="n-ico">{n.tipo === 'aggiornamento' ? <Download size={15} /> : <AlarmClock size={15} />}</span>
            <span className="grow"><b>{n.titolo}</b>{n.corpo && <small className="prewrap">{n.corpo}</small>}<small className="muted">{fmtDateTime(n.created_at.replace(' ', 'T').slice(0, 16))}</small></span>
          </button>
        ))}
        {!notifiche.length && <p className="muted pad" style={{ textAlign: 'center' }}>Nessuna notifica.<br />Gli avvisi di scadenze e compiti compariranno qui.</p>}
      </div>
    </div>
  )
}

const KIND_ICON: Record<string, any> = { evento: CalendarDays, pratica: Folder, anagrafica: Users2, scadenza: AlarmClock, todo: CheckSquare, documento: FileText, nota: StickyNote }
const KIND_LABEL: Record<string, string> = { evento: 'Calendario', pratica: 'Pratica', anagrafica: 'Contatto', scadenza: 'Scadenza', todo: 'Compito', documento: 'Documento', nota: 'Nota' }

export function SearchPalette({ onClose, azioni = [] }: { onClose: () => void; azioni?: Azione[] }) {
  const { go } = useNav()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [i, setI] = useState(0)
  // azioni rapide: con la casella vuota si vedono tutte, scrivendo restano quelle che corrispondono
  const qa = q.trim().toLowerCase()
  const azioniVisibili = useMemo(() => (qa ? azioni.filter((a) => a.etichetta.toLowerCase().includes(qa) || `${a.gruppo} ${a.etichetta}`.toLowerCase().includes(qa)) : azioni).slice(0, qa ? 5 : 12), [azioni, qa])
  const voci = useMemo<{ az?: Azione; h?: SearchHit }[]>(() => [...azioniVisibili.map((a) => ({ az: a })), ...hits.map((h) => ({ h }))], [azioniVisibili, hits])
  useEffect(() => { setI(0) }, [qa])
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    let cancel = false
    const t = setTimeout(() => api.search(q).then((r) => { if (!cancel) { setHits(r); setI(0) } }), 120)
    return () => { cancel = true; clearTimeout(t) }
  }, [q])
  const esegui = (v: (typeof voci)[number]) => { if (v.az) { onClose(); v.az.esegui() } else if (v.h) pick(v.h) }
  const pick = (h: SearchHit) => {
    onClose()
    if (h.kind === 'pratica') go({ page: 'pratica', id: h.id })
    else if (h.kind === 'anagrafica') go('anagrafica')
    else if (h.kind === 'evento') go('agenda')
    else if (h.pratica_id) go({ page: 'pratica', id: h.pratica_id, tab: h.kind === 'scadenza' ? 'scadenze' : h.kind === 'todo' ? 'todo' : h.kind === 'documento' ? 'documenti' : 'note', focus: h.id })
    else go(h.kind === 'todo' ? 'todo' : 'agenda')
  }
  return (
    <Modal protectChanges={false} title="Cerca" onClose={onClose} width={600} instant>
      <div className="search-box big"><Search size={16} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca, oppure scrivi un comando (es. «nuova»)…" aria-label="Cerca"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(voci.length - 1, x + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
            else if (e.key === 'Enter' && voci[i]) esegui(voci[i])
          }} />
      </div>
      <div className="results">
        {azioniVisibili.map((a, idx) => (
          <button key={a.id} className={`result ${idx === i ? 'on' : ''}`} onMouseEnter={() => setI(idx)} onClick={() => esegui({ az: a })}>
            <a.icona size={15} />
            <span className="grow"><b>{a.etichetta}</b></span>
            {a.tasto && <kbd>{a.tasto}</kbd>}
            <span className="pill">{a.gruppo}</span>
          </button>
        ))}
        {hits.map((h, hidx) => {
          const idx = azioniVisibili.length + hidx
          const Icon = KIND_ICON[h.kind] || Folder
          return (
            <button key={h.kind + h.id} className={`result ${idx === i ? 'on' : ''}`} onMouseEnter={() => setI(idx)} onClick={() => pick(h)}>
              {h.color ? <ColorDot color={h.color} size={10} /> : <Icon size={15} />}
              <span className="grow"><b>{h.title}</b>{h.sub && <small className="muted">{h.sub}</small>}</span>
              <span className="pill">{KIND_LABEL[h.kind]}</span>
            </button>
          )
        })}
        {q.trim().length >= 2 && !hits.length && !azioniVisibili.length && <p className="muted pad">Nessun risultato per “{q}”.</p>}
      </div>
    </Modal>
  )
}
