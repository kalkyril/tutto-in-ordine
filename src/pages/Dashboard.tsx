import { residuo } from '../lib/report'
import { useMemo, useState, type CSSProperties } from 'react'
import { AlarmClock, AlertTriangle, CalendarPlus, CheckSquare, FolderPlus, UserPlus, FolderOpen, Star, Wallet } from 'lucide-react'
import { useData } from '../store'
import { useNav } from '../nav'
import { useEditors } from '../components/editors'
import { Btn, ColorDot, PageHeader } from '../components/ui'
import { ScadenzaRow, TodoRow } from '../components/items'
import { EventoEsternoModal, EventoEsternoRow } from '../components/EventoEsterno'
import { addDays, fmtDate, fmtLong, fmtTime, isLate, parse, ymd } from '../lib/dates'
import { money } from '../lib/format'
import { apriMenu } from '../lib/menuContestuale'
import { useClock } from '../lib/clock'

export default function Dashboard() {
  const { scadenze, todos, pratiche, parcelle, settings, ready, eventi, calendari } = useData()
  const [extAperto, setExtAperto] = useState<import('../types').EventoEsterno | null>(null)
  const { go } = useNav()
  const ed = useEditors()
  const L = settings.etichette
  const clock = useClock()
  const now = new Date(clock)
  const today = ymd(now)
  const lim = ymd(addDays(now, 14))

  const aperte = useMemo(() => scadenze.filter((s) => !s.completata), [scadenze])
  const ritardo = useMemo(() => aperte.filter((s) => isLate(s, clock)).sort((a, b) => a.data_ora.localeCompare(b.data_ora)), [aperte, clock])
  const prossime = useMemo(() => aperte.filter((s) => !isLate(s, clock) && s.data_ora.slice(0, 10) <= lim).sort((a, b) => a.data_ora.localeCompare(b.data_ora)), [aperte, lim, clock])
  const attivi = useMemo(() => new Set(calendari.filter((c) => c.attivo).map((c) => c.id)), [calendari])
  const extProssimi = useMemo(() => eventi.filter((e) => attivi.has(e.calendario_id) && e.inizio.slice(0, 10) >= today && e.inizio.slice(0, 10) <= lim).sort((a, b) => a.inizio.localeCompare(b.inizio)), [eventi, attivi, today, lim])
  const oggi = prossime.filter((s) => s.data_ora.slice(0, 10) === today)
  const extOggi = extProssimi.filter((e) => e.inizio.slice(0, 10) === today)
  const todoAperti = useMemo(() => todos.filter((t) => !t.completata).sort((a, b) =>
    (a.scadenza ? 0 : 1) - (b.scadenza ? 0 : 1) || (a.scadenza || '').localeCompare(b.scadenza || '') || b.priorita - a.priorita), [todos])
  const chiuse = new Set(settings.stati_pratica.filter((s) => s.chiusa).map((s) => s.nome))
  const attive = pratiche.filter((p) => !chiuse.has(p.stato || ''))
  const daIncassare = parcelle.filter((p) => p.tipo === 'parcella' && p.stato === 'emessa').reduce((s, p) => s + residuo(p), 0)
  const settimana = prossime.filter((s) => s.data_ora.slice(0, 10) <= ymd(addDays(now, 7))).length

  const ora = now.getHours()
  const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera'
  const nome = settings.studio.titolare?.trim()
  // preferite prima, poi le altre attive: la colonna mostra sempre il lavoro aperto
  const elencoPratiche = [...attive.filter((p) => p.preferita), ...attive.filter((p) => !p.preferita)]
  const nScadenzario = ritardo.length + prossime.length + extProssimi.length
  // la cosa da sapere per prima, sotto il saluto: il ritardo più vecchio, altrimenti il primo impegno di oggi, altrimenti il prossimo
  const primoOggi = [...oggi.map((s) => ({ titolo: s.titolo, quando: s.data_ora, tuttoIlGiorno: !!s.tutto_il_giorno })), ...extOggi.map((e) => ({ titolo: e.titolo, quando: e.inizio, tuttoIlGiorno: e.inizio.length <= 10 }))].sort((a, b) => a.quando.localeCompare(b.quando))[0]
  const notizia = ritardo.length
    ? `${ritardo.length === 1 ? '1 scadenza in ritardo' : `${ritardo.length} scadenze in ritardo`}: la più vecchia è «${ritardo[0].titolo}» del ${fmtDate(ritardo[0].data_ora)}.`
    : primoOggi
      ? `${oggi.length + extOggi.length === 1 ? '1 impegno oggi' : `${oggi.length + extOggi.length} impegni oggi`}: ${primoOggi.tuttoIlGiorno ? `«${primoOggi.titolo}», tutto il giorno` : `il primo è «${primoOggi.titolo}» alle ${fmtTime(primoOggi.quando)}`}.`
      : prossime[0]
        ? `Nessun ritardo. Prossima scadenza: «${prossime[0].titolo}», ${fmtLong(parse(prossime[0].data_ora.slice(0, 10))!)}.`
        : 'Nessuna scadenza nei prossimi 14 giorni.'

  const byDay = new Map<string, typeof prossime>()
  prossime.forEach((s) => { const k = s.data_ora.slice(0, 10); byDay.set(k, [...(byDay.get(k) || []), s]) })
  const extPerGiorno = new Map<string, typeof extProssimi>()
  extProssimi.forEach((e) => { const k = e.inizio.slice(0, 10); extPerGiorno.set(k, [...(extPerGiorno.get(k) || []), e]) })
  const giorniOrdinati = [...new Set([...byDay.keys(), ...extPerGiorno.keys()])].sort().filter((k) => k !== today)

  if (!ready) return null
  return (
    <div className="page dashboard">
      <PageHeader title={`${saluto}${nome ? ', ' + nome : ''}`} subtitle={<><span className="dash-data">{fmtLong(now)}</span> · <span className={ritardo.length ? 'dash-notizia late-text' : 'dash-notizia'}>{notizia}</span></>}
        actions={<>
          <Btn onClick={() => ed.open({ kind: 'anagrafica' })}><UserPlus size={16} /> Nuovo {L.cliente.toLowerCase()}</Btn>
          <Btn onClick={() => ed.open({ kind: 'todo' })}><CheckSquare size={16} /> Nuovo compito</Btn>
          <Btn onClick={() => ed.open({ kind: 'scadenza' })}><CalendarPlus size={16} /> Nuova scadenza</Btn>
          <Btn variant="primary" onClick={() => ed.open({ kind: 'pratica', onSaved: (p) => go({ page: 'pratica', id: p.id }) })}><FolderPlus size={16} /> Nuova {L.pratica.toLowerCase()}</Btn>
        </>} />

      {/* un solo contenitore diviso da righe sottili: etichetta sopra, numero sotto, niente icone */}
      <div className="kpis fascia-numeri">
        {/* un colore per significato, come nel resto dell'app: pratiche = colore principale, ritardo = rosso, scadenze = arancio, compiti = blu, incassi = verde */}
        <button className="kpi col-accento" onClick={() => go('pratiche')}><span><FolderOpen size={15} aria-hidden="true" /> {L.pratiche} attive</span><b>{attive.length}</b></button>
        <button className={`kpi ${ritardo.length ? 'danger col-rosso' : 'col-spento'}`} onClick={() => go('agenda')}><span><AlertTriangle size={15} aria-hidden="true" /> Scadenze in ritardo</span><b>{ritardo.length}</b></button>
        <button className="kpi col-arancio" onClick={() => go('agenda')}><span><AlarmClock size={15} aria-hidden="true" /> Scadenze entro 7 giorni</span><b>{settimana}</b></button>
        <button className="kpi col-blu" onClick={() => go('todo')}><span><CheckSquare size={15} aria-hidden="true" /> Compiti da fare</span><b>{todoAperti.length}</b></button>
        <button className="kpi kpi-money col-verde" onClick={() => go('parcelle')}><span><Wallet size={15} aria-hidden="true" /> Da incassare</span><b style={{ '--cifre': money(daIncassare).length } as CSSProperties}>{money(daIncassare)}</b></button>
      </div>

      <div className="dashboard-board">
        <section className="card dash-card">
          <header className="card-head col-arancio"><h2><AlarmClock size={16} /> Scadenzario {nScadenzario > 0 && <span className="pill">{nScadenzario}</span>}</h2><Btn size="sm" variant="ghost" onClick={() => go('agenda')}>Apri agenda</Btn></header>
          <div className="dash-body">
            {ritardo.length > 0 && (
              <div className="block">
                <h3 className="sub-title danger">In ritardo</h3>
                {ritardo.slice(0, 6).map((s) => <ScadenzaRow key={s.id} s={s} onEdit={(x) => ed.open({ kind: 'scadenza', item: x })} />)}
                {ritardo.length > 6 && <p className="muted small" style={{ padding: '4px 8px' }}>e altre {ritardo.length - 6}…</p>}
              </div>
            )}
            {(oggi.length > 0 || extOggi.length > 0) && <div className="block"><h3 className="sub-title today">Oggi</h3>{oggi.map((s) => <ScadenzaRow key={s.id} s={s} onEdit={(x) => ed.open({ kind: 'scadenza', item: x })} />)}{extOggi.map((e) => <EventoEsternoRow key={'e' + e.id} e={e} onOpen={setExtAperto} />)}</div>}
            {giorniOrdinati.map((k) => (
              <div className="block" key={k}>
                <h3 className="sub-title">{fmtLong(parse(k)!)}</h3>
                {(byDay.get(k) || []).map((s) => <ScadenzaRow key={s.id} s={s} onEdit={(x) => ed.open({ kind: 'scadenza', item: x })} />)}
                {(extPerGiorno.get(k) || []).map((e) => <EventoEsternoRow key={'e' + e.id} e={e} onOpen={setExtAperto} />)}
              </div>
            ))}
            {!ritardo.length && !prossime.length && !extProssimi.length && <div className="dash-vuoto"><p>Nessuna scadenza nei prossimi 14 giorni. {settings.profilo === 'ditta' ? 'Scadenze e appuntamenti' : 'Udienze, termini e appuntamenti'} compaiono qui, con un avviso prima di ognuno.</p>
              <Btn size="sm" variant="ghost" onClick={() => ed.open({ kind: 'scadenza' })}><CalendarPlus size={15} /> Aggiungi scadenza</Btn></div>}
          </div>
        </section>

        <section className="card dash-card">
          <header className="card-head col-blu"><h2><CheckSquare size={16} /> Da fare {todoAperti.length > 0 && <span className="pill">{todoAperti.length}</span>}</h2><Btn size="sm" variant="ghost" onClick={() => go('todo')}>Tutte</Btn></header>
          <div className="dash-body">
            {todoAperti.slice(0, 20).map((t) => <TodoRow key={t.id} t={t} onEdit={(x) => ed.open({ kind: 'todo', item: x })} />)}
            {todoAperti.length > 20 && <p className="muted small" style={{ padding: '4px 8px' }}>e altri {todoAperti.length - 20}…</p>}
            {!todoAperti.length && <div className="dash-vuoto"><p>Nessun compito in sospeso.</p>
              <Btn size="sm" variant="ghost" onClick={() => ed.open({ kind: 'todo' })}><CheckSquare size={15} /> Nuovo compito</Btn></div>}
          </div>
        </section>

        <section className="card dash-card">
          <header className="card-head col-accento"><h2><FolderOpen size={16} /> {L.pratiche} attive {attive.length > 0 && <span className="pill">{attive.length}</span>}</h2><Btn size="sm" variant="ghost" onClick={() => go('pratiche')}>Tutte</Btn></header>
          <div className="dash-body">
            {elencoPratiche.slice(0, 20).map((p) => (
              <button key={p.id} className="plain-row" onClick={() => go({ page: 'pratica', id: p.id })} onContextMenu={apriMenu([
                { id: 'apri', label: 'Apri', fai: () => go({ page: 'pratica', id: p.id }) },
                { id: 'modifica', label: 'Modifica…', fai: () => ed.open({ kind: 'pratica', item: p }) },
                '-',
                { id: 'scadenza', label: 'Nuova scadenza…', fai: () => ed.open({ kind: 'scadenza', praticaId: p.id }) },
                { id: 'compito', label: 'Nuovo compito…', fai: () => ed.open({ kind: 'todo', praticaId: p.id }) },
              ])}>
                <ColorDot color={p.colore} size={12} />
                <span className="grow"><b>{p.titolo}</b><small className="muted"> {p.numero}</small></span>
                {p.preferita ? <Star size={13} className="fav" /> : null}
                <span className="muted small">{p.stato}</span>
              </button>
            ))}
            {!attive.length && <div className="dash-vuoto"><p>{pratiche.length ? `Nessuna ${L.pratica.toLowerCase()} attiva.` : `Nessuna ${L.pratica.toLowerCase()} ancora: crea la prima, scegli un colore e aggiungi scadenze e attività.`}</p>
              <Btn size="sm" variant="ghost" onClick={() => ed.open({ kind: 'pratica', onSaved: (p) => go({ page: 'pratica', id: p.id }) })}><FolderPlus size={15} /> Nuova {L.pratica.toLowerCase()}</Btn></div>}
          </div>
        </section>
      </div>
      {ed.element}
      {extAperto && <EventoEsternoModal evento={extAperto} onClose={() => setExtAperto(null)} />}
    </div>
  )
}
