import { useState } from 'react'
import { useRicercaContatti } from '../lib/useRicercaContatti'
import { useData } from '../store'
import { nomeConTitolo, nomeRuolo } from '../lib/recapiti'
import type { PersonaPratica, RuoloPersona } from '../types'
import { Btn, Field, FormGrid, Input, Modal, Select } from './ui'
import { usePagination } from './Pagination'

import { MAX_ATTORI } from '../lib/persone'

interface Props {
  originali: Set<number>
  presenti: { id?: number | null; ruolo: RuoloPersona }[]
  ruoli: RuoloPersona[]
  onClose: () => void
  onAggiungi: (persone: PersonaPratica[]) => void
}

export function SelezioneContatti({ presenti, ruoli, originali, onClose, onAggiungi }: Props) {
  const { anagrafica, anagraficaById, settings } = useData()
  const [q, setQ] = useState('')
  const [ruolo, setRuolo] = useState<RuoloPersona>('cliente')
  const [scelti, setScelti] = useState<Set<number>>(() => new Set())
  const risultati = useRicercaContatti(anagrafica, q)
  const { visible, controls } = usePagination(risultati, q, 30)
  const collegati = new Set(presenti.filter(p => p.ruolo === ruolo).map(p => p.id))
  const daAggiungere = [...scelti].filter(id => anagraficaById.has(id) && !collegati.has(id))
  const unici = new Set([...presenti.map(p => p.id), ...daAggiungere].filter((id): id is number => !!id))
  const conferma = () => onAggiungi(daAggiungere.map(id => ({ id, ruolo })))

  return <Modal title="Seleziona contatti" onClose={onClose} protectChanges={false}
    footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" disabled={!daAggiungere.length} onClick={conferma}>Aggiungi ({daAggiungere.length})</Btn></>}>
    <FormGrid>
      <Field label="Cerca in Anagrafica"><Input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Nome, indirizzo, email, PEC…" /></Field>
      <Field label={`Ruolo nella ${settings.etichette.pratica.toLowerCase()}`}><Select value={ruolo} onChange={e => setRuolo(e.target.value as RuoloPersona)}>
        {ruoli.map(r => <option key={r} value={r}>{nomeRuolo(r, settings.profilo, settings.etichette)}</option>)}
      </Select></Field>
    </FormGrid>
    <p className="hint" role="status">{unici.size} contatti distinti · massimo {MAX_ATTORI}</p>
    <div className="scelta-contatti">
      {visible.map(a => {
        const presente = collegati.has(a.id)
        const alLimite = unici.size >= MAX_ATTORI && !unici.has(a.id) && !(originali.size > MAX_ATTORI && originali.has(a.id) && [...unici].every(id => originali.has(id)))
        return <label key={a.id} className="check">
          <input type="checkbox" checked={presente || scelti.has(a.id)} disabled={presente || alLimite} onChange={e => {
            const seleziona = e.target.checked
            setScelti(prev => {
              const next = new Set(prev)
              if (seleziona) next.add(a.id)
              else next.delete(a.id)
              return next
            })
          }} />
          <span>{nomeConTitolo(a)} <small className="muted">{[a.codice_fiscale || a.partita_iva, a.email || a.pec, a.citta, presente && 'Già collegato con questo ruolo'].filter(Boolean).join(' · ')}</small></span>
        </label>
      })}
      {!visible.length && <p className="muted">Nessun contatto trovato.</p>}
    </div>
    {controls}
  </Modal>
}
