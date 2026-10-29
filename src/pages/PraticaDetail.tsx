import { useMemo, useState } from 'react'
import { Link2, ArrowLeft, Download, Pencil, Plus, Receipt, Star, Trash2, Palette, CalendarPlus, Calculator } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { useZonaFile } from '../lib/trascina'
import { useEditors } from '../components/editors'
import { CalcoloTerminiModal } from '../components/CalcoloTermini'
import { Btn, ColorDot, ColorPicker, Empty, Modal, Pill, Tabs, useAction, useFeedback } from '../components/ui'
import { ScadenzaRow, TodoRow } from '../components/items'
import { EconomiaTab } from '../components/pratica/EconomiaTab'
import { TodoTab } from '../components/pratica/TodoTab'
import { DocumentiTab } from '../components/pratica/DocumentiTab'
import { NoteTab } from '../components/pratica/NoteTab'
import { CronologiaCard } from '../components/pratica/CronologiaCard'
import { CollegamentiTab } from '../components/pratica/CollegamentiTab'
import { ParcellaEditor } from '../components/ParcellaEditor'
import { EventoEsternoModal, EventoEsternoRow } from '../components/EventoEsterno'
import { money } from '../lib/format'
import { fmtDate } from '../lib/dates'
import { nomeImpegni } from '../lib/defaults'
import type { Parcella } from '../types'

type Tab = 'panoramica' | 'todo' | 'scadenze' | 'documenti' | 'note' | 'economia' | 'parcelle' | 'collegamenti'

export default function PraticaDetail({ id, tab: initialTab, focus }: { id: number; tab?: string; focus?: number }) {
  const data = useData()
  const { praticaById, anagraficaById, scadenze, todos, documenti, note, ore, spese, parcelle, link, settings, eventi } = data
  const [extAperto, setExtAperto] = useState<import('../types').EventoEsterno | null>(null)
  const { go, back } = useNav()
  const run = useAction()
  const { confirm, toast } = useFeedback()
  // tutta la scheda della pratica accetta file trascinati dal computer (come allegati di una email): vengono collegati ai documenti
  const { props: zonaFile, over: sopra } = useZonaFile(async (paths) => { const r = await run(() => api.addDocumentiPaths(id, paths)); if (r) toast(r.length === 1 ? '1 file collegato alla pratica' : `${r.length} file collegati alla pratica`) })
  const ed = useEditors()
  const [termini, setTermini] = useState(false)
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'panoramica')
  const [colorOpen, setColorOpen] = useState(false)
  const [parcellaEd, setParcellaEd] = useState<null | { parcella?: Parcella; preset?: any }>(null)
  const p = praticaById.get(id)
  const L = settings.etichette

  const mine = useMemo(() => ({
    scad: scadenze.filter((s) => s.pratica_id === id),
    todo: todos.filter((t) => t.pratica_id === id),
    doc: documenti.filter((d) => d.pratica_id === id),
    note: note.filter((n) => n.pratica_id === id),
    ore: ore.filter((o) => o.pratica_id === id),
    spese: spese.filter((s) => s.pratica_id === id),
    parc: parcelle.filter((x) => x.pratica_id === id),
    link: link.filter((l) => l.pratica_id === id),
  }), [id, scadenze, todos, documenti, note, ore, spese, parcelle, link])

  if (!p) return <div className="page"><Empty title="Pratica non trovata" action={<Btn onClick={() => go('pratiche')}>Torna all'elenco</Btn>} /></div>

  const cli = p.cliente_id ? anagraficaById.get(p.cliente_id) : null
  const ctr = p.controparte_id ? anagraficaById.get(p.controparte_id) : null
  const statoObj = settings.stati_pratica.find((s) => s.nome === p.stato)
  const scadAperte = mine.scad.filter((s) => !s.completata).sort((a, b) => a.data_ora.localeCompare(b.data_ora))
  const todoAperti = mine.todo.filter((t) => !t.completata)

  const elimina = async () => {
    if (await confirm({ title: `Eliminare ${L.pratica.toLowerCase()}?`, text: `“${p.titolo}” verrà eliminata con scadenze, compiti, note, documenti e collegamenti. L'operazione non è reversibile.`, ok: 'Elimina definitivamente', danger: true })) {
      if (await run(() => api.remove('pratiche', p.id))) { go('pratiche') }
    }
  }
  const setColor = (c: string) => run(() => api.save('pratiche', { id: p.id, colore: c }))

  return (
    <div className="page" data-zona-file style={{ ['--pc' as any]: p.colore }} {...zonaFile}>
      {sopra && <div className="drop-overlay" aria-hidden="true"><div><Link2 size={28} /><b>Rilascia per collegare i file a questa pratica</b><span>Restano dove sono: TIO ne ricorda la posizione</span></div></div>}
      <div className="detail-head">
        <div className="detail-bar" />
        <div className="detail-main">
          <button className="icon-btn" onClick={back} aria-label="Indietro"><ArrowLeft size={18} /></button>
          <div className="grow">
            <div className="muted small">{p.numero}{p.tipo ? ' · ' + p.tipo : ''}</div>
            <h1>{p.titolo}</h1>
            <div className="row wrap" style={{ marginTop: 6 }}>
              <Pill color={statoObj?.colore}>{p.stato}</Pill>
              {cli && <span className="muted small">{L.cliente}: <b>{cli.denominazione}</b></span>}
              {ctr && <span className="muted small">{L.controparte}: <b>{ctr.denominazione}</b></span>}
            </div>
          </div>
          <div className="row">
            <Btn size="sm" onClick={() => setColorOpen(true)} title="Cambia colore"><Palette size={15} /> <ColorDot color={p.colore} size={12} /></Btn>
            <Btn size="sm" onClick={() => run(() => api.save('pratiche', { id: p.id, preferita: p.preferita ? 0 : 1 }))} title="Preferita"><Star size={15} className={p.preferita ? 'fav' : ''} /></Btn>
            <Btn size="sm" onClick={() => ed.open({ kind: 'pratica', item: p })}><Pencil size={15} /> Modifica</Btn>
            <Btn size="sm" variant="danger" onClick={elimina} title="Elimina" aria-label="Elimina la pratica"><Trash2 size={15} /></Btn>
          </div>
        </div>
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: 'panoramica', label: 'Panoramica' },
        { id: 'todo', label: 'Compiti', count: todoAperti.length },
        { id: 'scadenze', label: 'Scadenze', count: scadAperte.length },
        { id: 'documenti', label: 'Documenti', count: mine.doc.length },
        { id: 'note', label: 'Note', count: mine.note.length },
        { id: 'economia', label: 'Attività e spese', count: mine.ore.length },
        { id: 'parcelle', label: L.parcelle, count: mine.parc.length },
        { id: 'collegamenti', label: 'Collegamenti', count: mine.link.length },
      ]} />

      {tab === 'panoramica' && (
        <div className="grid-2">
          <div className="stack">
          <section className="card">
            <header className="card-head"><h2>Dettagli</h2></header>
            <dl className="defs">
              <dt>{L.cliente}</dt><dd>{cli ? cli.denominazione : '—'}</dd>
              <dt>{L.controparte}</dt><dd>{ctr ? ctr.denominazione : '—'}</dd>
              <dt>{L.autorita}</dt><dd>{p.autorita || '—'}</dd>
              <dt>{L.rg}</dt><dd>{p.rg || '—'}</dd>
              <dt>{L.giudice}</dt><dd>{p.giudice || '—'}</dd>
              <dt>Valore</dt><dd>{p.valore ? money(p.valore) : '—'}</dd>
              <dt>Apertura</dt><dd>{fmtDate(p.data_apertura) || '—'}</dd>
              {p.data_chiusura && <><dt>Chiusura</dt><dd>{fmtDate(p.data_chiusura)}</dd></>}
            </dl>
            {p.descrizione && <><h3 className="sub-title">Descrizione</h3><p className="prewrap">{p.descrizione}</p></>}
          </section>
          <CronologiaCard praticaId={p.id} />
          </div>
          <div className="stack">
            <section className="card">
              <header className="card-head"><h2>Prossime scadenze</h2><Btn size="sm" onClick={() => ed.open({ kind: 'scadenza', praticaId: p.id })}><CalendarPlus size={14} /> Aggiungi</Btn></header>
              {scadAperte.slice(0, 4).map((s) => <ScadenzaRow key={s.id} s={s} showPratica={false} onEdit={(x) => ed.open({ kind: 'scadenza', item: x })} />)}
              {!scadAperte.length && <p className="muted pad">Nessuna scadenza aperta.</p>}
            </section>
            <section className="card">
              <header className="card-head"><h2>Compiti da fare</h2><Btn size="sm" onClick={() => setTab('todo')}>Apri lista</Btn></header>
              {todoAperti.slice(0, 5).map((t) => <TodoRow key={t.id} t={t} showPratica={false} onEdit={(x) => ed.open({ kind: 'todo', item: x })} />)}
              {!todoAperti.length && <p className="muted pad">Nessun compito aperto.</p>}
            </section>
          </div>
        </div>
      )}

      {tab === 'todo' && <TodoTab praticaId={p.id} todos={mine.todo} onEdit={(t) => ed.open({ kind: 'todo', item: t, praticaId: p.id })} focus={focus} />}

      {tab === 'scadenze' && (
        <section className="card">
          <header className="card-head"><h2>{nomeImpegni(settings.profilo)}</h2>
            <div className="row">
              <Btn size="sm" variant="ghost" onClick={() => run(async () => { const f = await api.exportIcs(p.id); return f }, undefined)} title="Esporta .ics"><Download size={14} /> .ics</Btn>
              <Btn size="sm" onClick={() => setTermini(true)} title="Calcola un termine e crealo come scadenza di questa pratica"><Calculator size={14} /> Calcola termine</Btn>
              <Btn size="sm" variant="primary" onClick={() => ed.open({ kind: 'scadenza', praticaId: p.id })}><Plus size={14} /> Nuova scadenza</Btn>
            </div>
          </header>
          {[...mine.scad].sort((a, b) => Number(a.completata) - Number(b.completata) || a.data_ora.localeCompare(b.data_ora)).map((s) => <ScadenzaRow key={s.id} s={s} showPratica={false} highlight={s.id === focus} onEdit={(x) => ed.open({ kind: 'scadenza', item: x })} />)}
          {eventi.filter((e) => e.pratica_id === id).length > 0 && <><h3 className="sub-title">Dai calendari collegati (sola lettura)</h3>{eventi.filter((e) => e.pratica_id === id).sort((a, b) => a.inizio.localeCompare(b.inizio)).map((e) => <EventoEsternoRow key={e.id} e={e} onOpen={setExtAperto} />)}</>}
          {!mine.scad.length && !eventi.some((e) => e.pratica_id === id) && <Empty icon={<CalendarPlus size={28} />} title="Nessuna scadenza" text={settings.profilo === 'ditta' ? 'Aggiungi scadenze, consegne, sopralluoghi o appuntamenti: TIO ti avviserà prima di ognuno.' : 'Aggiungi termini, udienze o appuntamenti: TIO ti avviserà prima di ognuno.'}
            action={<Btn variant="primary" onClick={() => ed.open({ kind: 'scadenza', praticaId: p.id })}>Aggiungi scadenza</Btn>} />}
        </section>
      )}

      {tab === 'documenti' && <DocumentiTab praticaId={p.id} docs={mine.doc} />}
      {tab === 'note' && <NoteTab praticaId={p.id} note={mine.note} />}
      {tab === 'economia' && <EconomiaTab praticaId={p.id} ore={mine.ore} spese={mine.spese} onParcella={(preset) => setParcellaEd({ preset })} />}

      {tab === 'parcelle' && (
        <section className="card">
          <header className="card-head"><h2>{L.parcelle}</h2><Btn size="sm" variant="primary" onClick={() => setParcellaEd({ preset: {} })}><Plus size={14} /> Nuova {L.parcella.toLowerCase()}</Btn></header>
          {mine.parc.map((x) => (
            <button key={x.id} className="plain-row" onClick={() => setParcellaEd({ parcella: x })}>
              <Receipt size={16} /><span className="grow"><b>{x.tipo === 'preventivo' ? 'Preventivo' : x.tipo === 'proforma' ? 'Nota pro forma' : L.parcella} {x.numero}</b> <span className="muted small">{fmtDate(x.data)} {x.oggetto ? '· ' + x.oggetto : ''}</span></span>
              <Pill>{x.stato}</Pill><b>{money(x.totale)}</b>
            </button>
          ))}
          {!mine.parc.length && <Empty icon={<Receipt size={28} />} title={`Nessuna ${L.parcella.toLowerCase()}`} text="Crea un preventivo o una parcella partendo dalle ore e spese registrate." />}
        </section>
      )}

      {tab === 'collegamenti' && <CollegamentiTab links={mine.link} onNew={() => ed.open({ kind: 'link', praticaId: p.id })} onEdit={(l) => ed.open({ kind: 'link', item: l, praticaId: p.id })} />}

      {colorOpen && (
        <Modal title="Colore della pratica" onClose={() => setColorOpen(false)} width={420} footer={<Btn variant="primary" onClick={() => setColorOpen(false)}>Fatto</Btn>}>
          <p className="muted small" style={{ marginBottom: 10 }}>Il colore compare in elenchi, agenda, scadenze e compiti collegati.</p>
          <ColorPicker value={p.colore} onChange={setColor} />
        </Modal>
      )}
      {parcellaEd && <ParcellaEditor parcella={parcellaEd.parcella} preset={{ pratica_id: p.id, cliente_id: p.cliente_id, oggetto: p.titolo, ...parcellaEd.preset }} onClose={() => setParcellaEd(null)} />}
      {ed.element}
      {termini && <CalcoloTerminiModal onClose={() => setTermini(false)} onCrea={(t) => { setTermini(false); ed.open({ kind: 'scadenza', praticaId: p.id, item: { titolo: t.titolo, data_ora: t.data, tutto_il_giorno: 1, note: t.note, pratica_id: p.id } }) }} />}
      {extAperto && <EventoEsternoModal evento={extAperto} onClose={() => setExtAperto(null)} />}
    </div>
  )
}
