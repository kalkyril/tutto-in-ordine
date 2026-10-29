import { useState } from 'react'
import { api } from '../api'
import { useData } from '../store'
import { Btn, Field, FormGrid, Input, Modal, Textarea, useAction } from './ui'
import { PromemoriaElenco } from './forms'
import { fmtDateTime, todayStr } from '../lib/dates'
import type { Scadenza } from '../types'

/** Alla chiusura di un'udienza: annota l'esito nel diario della pratica e, se serve, fissa subito la prossima udienza e un compito. */
export function EsitoUdienzaModal({ s, onClose }: { s: Scadenza; onClose: () => void }) {
  const run = useAction()
  const { settings } = useData()
  const [esito, setEsito] = useState('')
  const [prossima, setProssima] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState(s.data_ora.length > 10 ? s.data_ora.slice(11, 16) : '09:00')
  const [titolo, setTitolo] = useState(s.titolo.replace(/\s*[—-]\s*rinvio$/i, '') + ' — rinvio')
  const [luogo, setLuogo] = useState(s.luogo || '')
  const [prom, setProm] = useState<number[]>(settings.promemoria_default)
  const [todo, setTodo] = useState('')
  const valido = !prossima || (!!date && !!titolo.trim())

  const salva = async (conEsito: boolean) => {
    const ok = await run(async () => {
      await api.save('scadenze', { id: s.id, completata: 1 })
      if (conEsito && s.pratica_id) {
        if (esito.trim()) await api.save('note', { pratica_id: s.pratica_id, testo: `Esito udienza del ${fmtDateTime(s.data_ora, !!s.tutto_il_giorno)} (${s.titolo}):\n${esito.trim()}` })
        if (prossima && date) await api.save('scadenze', { pratica_id: s.pratica_id, tipo: 'udienza', titolo: titolo.trim(), data_ora: `${date}T${time || '09:00'}`, tutto_il_giorno: 0, luogo: luogo.trim() || null, promemoria: prom })
        if (todo.trim()) await api.save('todos', { pratica_id: s.pratica_id, titolo: todo.trim(), priorita: 1 })
      }
      return true
    }, conEsito && (esito.trim() || prossima || todo.trim()) ? 'Udienza chiusa e dati registrati' : 'Udienza completata')
    if (ok) onClose()
  }
  return (
    <Modal title="Udienza svolta" subtitle={`${s.titolo} · ${fmtDateTime(s.data_ora, !!s.tutto_il_giorno)}`} width={620} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={() => salva(false)}>Segna solo come completata</Btn><Btn variant="primary" onClick={() => salva(true)} disabled={!valido}>Salva esito</Btn></>}>
      <FormGrid>
        <Field label="Esito (resta nel diario della pratica)" span={2}><Textarea rows={4} value={esito} onChange={(e) => setEsito(e.target.value)} placeholder="Es. Rinvio per precisazione delle conclusioni; concessi termini ex art. 183…" autoFocus /></Field>
        <Field label="Prossima udienza" span={2}><label className="check"><input type="checkbox" checked={prossima} onChange={(e) => setProssima(e.target.checked)} /> Fissa subito la prossima udienza</label></Field>
        {prossima && <>
          <Field label="Titolo" span={2}><Input value={titolo} onChange={(e) => setTitolo(e.target.value)} /></Field>
          <Field label="Data *"><Input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Ora"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Luogo" span={2}><Input value={luogo} onChange={(e) => setLuogo(e.target.value)} /></Field>
          <Field label="Avvisami" span={2}><PromemoriaElenco value={prom} onChange={setProm} /></Field>
        </>}
        <Field label="Compito da fare dopo (facoltativo)" span={2}><Input value={todo} onChange={(e) => setTodo(e.target.value)} placeholder="Es. Preparare memoria di replica" /></Field>
      </FormGrid>
    </Modal>
  )
}
