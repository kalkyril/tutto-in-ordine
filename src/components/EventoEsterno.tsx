import { ExternalLink, Lock, MapPin } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { Btn, ColorDot, Field, Modal, useAction } from './ui'
import { PraticaSelect } from './forms'
import { PraticaChip } from './items'
import { fmtDateTime, fmtLong, parse, relative } from '../lib/dates'
import type { EventoEsterno } from '../types'

/** Dettaglio di un evento di un calendario collegato: in sola lettura. L'unica modifica possibile è il collegamento locale a una pratica. */
export function EventoEsternoModal({ evento, onClose }: { evento: EventoEsterno; onClose: () => void }) {
  const { calendari, eventi, praticaById } = useData()
  const { go } = useNav()
  const run = useAction()
  const corrente = eventi.find((e) => e.id === evento.id) || evento
  const cal = calendari.find((c) => c.id === corrente.calendario_id)
  const pratica = corrente.pratica_id ? praticaById.get(corrente.pratica_id) : null
  return (
    <Modal title={corrente.titolo} subtitle={cal ? `Dal calendario “${cal.nome}”` : undefined} onClose={onClose} width={560}
      footer={<>{pratica && <Btn variant="ghost" onClick={() => { onClose(); go({ page: 'pratica', id: pratica.id }) }}><ExternalLink size={14} /> Apri la pratica</Btn>}<Btn variant="primary" onClick={onClose}>Chiudi</Btn></>}>
      <div className="nota-lettura"><Lock size={15} /><p>Evento di sola lettura: viene dal calendario collegato e non può essere modificato da qui.</p></div>
      <dl className="defs">
        <dt>Quando</dt><dd>{fmtDateTime(corrente.inizio, !!corrente.tutto_il_giorno)}{corrente.fine && corrente.fine !== corrente.inizio && ` → ${fmtDateTime(corrente.fine, !!corrente.tutto_il_giorno)}`} <span className={`rel rel-${relative(corrente.inizio).tone}`}>{relative(corrente.inizio).text}</span><div className="muted small">{fmtLong(parse(corrente.inizio)!)}</div></dd>
        {corrente.luogo && <><dt>Dove</dt><dd><MapPin size={13} /> {corrente.luogo}</dd></>}
        {cal && <><dt>Calendario</dt><dd><ColorDot color={cal.colore} /> {cal.nome}</dd></>}
      </dl>
      {corrente.descrizione && <><h3 className="sub-title">Note dell'evento</h3><p className="prewrap">{corrente.descrizione}</p></>}
      <Field label="Collega a una pratica (solo in TIO)" hint="Il collegamento resta sul tuo computer e non viene mai inviato al calendario originale.">
        <PraticaSelect value={corrente.pratica_id} onChange={(v) => run(() => api.collegaEvento(corrente.id, v))} />
      </Field>
      {pratica && <div style={{ marginTop: 8 }}><PraticaChip pratica={pratica} onClick={false} /></div>}
    </Modal>
  )
}

/** Riga di un evento esterno (Panoramica, scheda pratica). */
export function EventoEsternoRow({ e, onOpen }: { e: EventoEsterno; onOpen: (e: EventoEsterno) => void }) {
  const { calendari, praticaById } = useData()
  const cal = calendari.find((c) => c.id === e.calendario_id)
  const p = e.pratica_id ? praticaById.get(e.pratica_id) : null
  const r = relative(e.inizio)
  return (
    <div className="row-item ext" style={{ borderLeftColor: cal?.colore || 'var(--border-strong)' }}>
      <div className="row-icon" style={{ background: 'transparent', color: cal?.colore }}><Lock size={15} /></div>
      <div className="row-main" onClick={() => onOpen(e)}>
        <div className="row-title">{e.titolo}</div>
        <div className="row-sub"><span>{fmtDateTime(e.inizio, !!e.tutto_il_giorno)}</span>{e.luogo && <span> · {e.luogo}</span>}<span> · {cal?.nome}</span></div>
        {p && <div style={{ marginTop: 4 }}><PraticaChip pratica={p} /></div>}
      </div>
      <span className={`rel rel-${r.tone}`}>{r.text}</span>
    </div>
  )
}
