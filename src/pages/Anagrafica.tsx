import { usePagination } from '../components/Pagination'
import { Fragment, useMemo, useState } from 'react'
import { Building2, Mail, Pencil, Phone, Plus, Search, Trash2, User, Users } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { useEditors } from '../components/editors'
import { conflittiPer } from '../lib/conflitti'
import { Btn, ColorDot, Empty, PageHeader, Pill, Segmented, useAction, useFeedback } from '../components/ui'
import { indirizzoInRiga, leggiIndirizzi, leggiRecapiti, nomeConTitolo, nomeRuolo, ruoliAnagrafica } from '../lib/recapiti'
import { ruoliIn } from '../lib/persone'

type R = 'tutti' | 'cliente' | 'controparte' | 'fornitore' | 'collaboratore' | 'altro'

export default function AnagraficaPage({ id }: { id?: number }) {
  const { anagrafica, pratiche, settings, anagraficaById } = useData()
  const { go } = useNav()
  const ed = useEditors()
  const run = useAction()
  const { confirm } = useFeedback()
  const L = settings.etichette
  const [q, setQ] = useState('')
  const [ruolo, setRuolo] = useState<R>('tutti')
  const [sel, setSel] = useState<number | null>(id ?? null)
  const ditta = settings.profilo === 'ditta'
  // per le ditte le vecchie «controparti» (fornitore o altro) compaiono tra i fornitori
  const delRuolo = (a: { ruolo: string }) => ruolo === 'tutti' || a.ruolo === ruolo || (ditta && ruolo === 'fornitore' && a.ruolo === 'controparte')
  const rows = useMemo(() => anagrafica.filter((a) => delRuolo(a) &&
    (!q.trim() || [a.denominazione, a.titolo, a.codice_fiscale, a.partita_iva, a.sdi, a.email, a.telefono, a.recapiti, a.citta, a.indirizzi].join(' ').toLowerCase().includes(q.toLowerCase()))), [anagrafica, q, ruolo]) // eslint-disable-line react-hooks/exhaustive-deps -- delRuolo dipende solo da ruolo e profilo
  const nomeR = (r: string) => nomeRuolo(r, settings.profilo, L)
  const { visible, controls } = usePagination(rows, JSON.stringify([q, ruolo]))
  const cur = anagrafica.find((a) => a.id === sel) || rows[0]
  const comeCliente = useMemo(() => cur ? pratiche.filter((p) => p.cliente_id && anagraficaById.get(p.cliente_id) && conflittiPer(cur, 'controparte', [p], anagraficaById).length) : [], [cur, pratiche, anagraficaById])
  const comeControparte = useMemo(() => cur ? pratiche.filter((p) => p.controparte_id && anagraficaById.get(p.controparte_id) && conflittiPer(cur, 'cliente', [p], anagraficaById).length) : [], [cur, pratiche, anagraficaById])
  // conflitto di interessi: concetto degli studi legali; per una ditta un cliente può essere anche fornitore
  const conflitto = settings.profilo !== 'ditta' && comeCliente.length > 0 && comeControparte.length > 0
  const sue = cur ? pratiche.filter((p) => ruoliIn(p, cur.id).length) : []
  const recapiti = leggiRecapiti(cur)

  return (
    <div className="page">
      <PageHeader title="Anagrafica" subtitle={`${anagrafica.length} contatti`} actions={<Btn variant="primary" onClick={() => ed.open({ kind: 'anagrafica', ruolo: ruolo === 'tutti' ? 'cliente' : ruolo, onSaved: (a) => setSel(a.id) })}><Plus size={16} /> Nuovo contatto</Btn>} />
      <div className="toolbar">
        <div className="search-box"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, codice fiscale, email…" aria-label="Cerca" /></div>
        <Segmented<R> value={ruolo} onChange={setRuolo} options={[{ id: 'tutti', label: 'Tutti' }, ...ruoliAnagrafica(settings.profilo, L).map((r) => ({ id: r.id as R, label: r.id === 'cliente' ? L.clienti : r.id === 'fornitore' ? 'Fornitori' : r.id === 'collaboratore' ? 'Collaboratori' : r.id === 'altro' ? 'Altri' : r.label }))]} />
      </div>
      {!anagrafica.length ? (
        <Empty icon={<Users size={32} />} title="Rubrica vuota" text={`Registra ${L.clienti.toLowerCase()} e ${L.controparte.toLowerCase()} con dati fiscali e contatti: potrai collegarli alle pratiche.`}
          action={<Btn variant="primary" onClick={() => ed.open({ kind: 'anagrafica' })}><Plus size={16} /> Aggiungi il primo contatto</Btn>} />
      ) : (
        <div className="split">
          <div className="list-pane">
            {visible.map((a) => (
              <button key={a.id} className={`contact ${cur?.id === a.id ? 'on' : ''}`} onClick={() => setSel(a.id)}>
                <span className="avatar">{a.tipo === 'azienda' ? <Building2 size={16} /> : <User size={16} />}</span>
                <span className="grow"><b>{nomeConTitolo(a)}</b><small className="muted">{nomeR(a.ruolo)}{a.citta ? ' · ' + a.citta : ''}</small></span>
              </button>
            ))}
            {!rows.length && <p className="muted pad">Nessun risultato.</p>}
          </div>
          {cur && (
            <section className="card detail-pane">
              <header className="card-head">
                <h2>{nomeConTitolo(cur)}</h2>
                <div className="row">
                  <Btn size="sm" onClick={() => ed.open({ kind: 'anagrafica', item: cur })}><Pencil size={14} /> Modifica</Btn>
                  <Btn size="sm" variant="danger" aria-label="Elimina il contatto" title="Elimina il contatto" onClick={async () => { if (await confirm({ title: 'Eliminare il contatto?', text: sue.length ? `È collegato a ${sue.length} pratiche: resteranno, ma senza questo contatto.` : cur.denominazione, ok: 'Elimina', danger: true })) { await run(() => api.remove('anagrafica', cur.id)); setSel(null) } }}><Trash2 size={14} /></Btn>
                </div>
              </header>
              <div className="row wrap" style={{ marginBottom: 10 }}><Pill>{nomeR(cur.ruolo)}</Pill>{cur.tipo && <Pill>{cur.tipo === 'azienda' ? 'Società / Ente' : 'Persona fisica'}</Pill>}</div>
              {conflitto && <div className="conflitto" role="alert"><b>Possibile conflitto di interessi:</b>&nbsp;compare sia come {L.cliente.toLowerCase()} ({comeCliente.map((p) => p.numero || p.titolo).slice(0, 3).join(', ')}) sia come {L.controparte.toLowerCase()} ({comeControparte.map((p) => p.numero || p.titolo).slice(0, 3).join(', ')}).</div>}
              <dl className="defs">
                {cur.codice_fiscale && <><dt>Codice fiscale</dt><dd>{cur.codice_fiscale}</dd></>}
                {cur.partita_iva && <><dt>Partita IVA</dt><dd>{cur.partita_iva}</dd></>}
                {cur.sdi && <><dt>Codice SDI</dt><dd>{cur.sdi}</dd></>}
                {recapiti.email.map((e, i) => <Fragment key={'e' + i}><dt>{recapiti.email.length > 1 || e.etichetta !== 'Personale' ? `Email · ${e.etichetta || 'altra'}` : 'Email'}</dt><dd><button className="link-btn" onClick={() => run(() => api.openExternal('mailto:' + e.valore))}><Mail size={13} /> {e.valore}</button></dd></Fragment>)}
                {cur.pec && <><dt>PEC</dt><dd><button className="link-btn" onClick={() => run(() => api.openExternal('mailto:' + cur.pec))}>{cur.pec}</button></dd></>}
                {recapiti.telefoni.map((t, i) => <Fragment key={'t' + i}><dt>{t.etichetta || 'Telefono'}</dt><dd><button className="link-btn" onClick={() => run(() => api.openExternal('tel:' + t.valore.replace(/\s/g, '')))}><Phone size={13} /> {t.valore}</button></dd></Fragment>)}
                {(cur.indirizzo || cur.citta) && <><dt>Indirizzo</dt><dd>{indirizzoInRiga(cur)}</dd></>}
                {leggiIndirizzi(cur).map((x, i) => <Fragment key={'i' + i}><dt>{x.etichetta || 'Altro indirizzo'}</dt><dd>{indirizzoInRiga(x)}</dd></Fragment>)}
              </dl>
              {cur.note && <><h3 className="sub-title">Note</h3><p className="prewrap">{cur.note}</p></>}
              <h3 className="sub-title">{L.pratiche} collegate ({sue.length})</h3>
              {sue.map((p) => <button key={p.id} className="plain-row" onClick={() => go({ page: 'pratica', id: p.id })}><ColorDot color={p.colore} size={12} /><span className="grow"><b>{p.titolo}</b> <small className="muted">{p.numero}</small></span><span className="muted small">{ruoliIn(p, cur.id).map(nomeR).join(', ')} · {p.stato}</span></button>)}
              {!sue.length && <p className="muted">Nessuna pratica collegata.</p>}
            </section>
          )}
        </div>
      )}
      {controls}
      {ed.element}
    </div>
  )
}
