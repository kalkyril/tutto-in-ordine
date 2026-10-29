import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { Btn, Modal, Segmented, useAction } from './ui'
import { ETICHETTA_PERIODO, agendaHtml, intervallo, raccogli, type Periodo } from '../lib/stampaAgenda'

/** Stampa (PDF) degli impegni di oggi, domani o della settimana: udienze con luogo, autorità, RG, cliente e controparte. */
export function StampaAgendaModal({ onClose }: { onClose: () => void }) {
  const data = useData()
  const run = useAction()
  const [periodo, setPeriodo] = useState<Periodo>('domani')
  const [attivita, setAttivita] = useState(true)
  const [completate, setCompletate] = useState(false)
  const { da, a } = intervallo(periodo)
  const voci = useMemo(() => raccogli({ scadenze: data.scadenze, todos: data.todos, eventi: data.eventi, calendari: data.calendari, praticaById: data.praticaById, anagraficaById: data.anagraficaById }, da, a, { attivita, completate }), [data, da, a, attivita, completate])
  const titolo = periodo === 'oggi' || periodo === 'domani' ? `Agenda — ${ETICHETTA_PERIODO[periodo].toLowerCase()}` : `Agenda — ${ETICHETTA_PERIODO[periodo].toLowerCase()}`
  const stampa = async () => { const r = await run(() => api.printPdf(agendaHtml(titolo, da, a, voci, data.settings), `Agenda-${da}${da === a ? '' : '_' + a}`), undefined); if (r) onClose() }
  return (
    <Modal title="Stampa agenda" subtitle={data.settings.profilo === 'ditta' ? 'PDF da portare con te' : 'PDF da portare in udienza'} width={520} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={stampa}><Printer size={14} /> Crea PDF ({voci.length} impegni)</Btn></>}>
      <Segmented<Periodo> value={periodo} onChange={setPeriodo} options={(Object.keys(ETICHETTA_PERIODO) as Periodo[]).map((id) => ({ id, label: ETICHETTA_PERIODO[id] }))} />
      <div className="stack" style={{ marginTop: 14 }}>
        <label className="check"><input type="checkbox" checked={attivita} onChange={(e) => setAttivita(e.target.checked)} /> Includi le attività con scadenza</label>
        <label className="check"><input type="checkbox" checked={completate} onChange={(e) => setCompletate(e.target.checked)} /> Includi gli impegni già completati</label>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>Comprende {data.settings.profilo === 'ditta' ? 'scadenze, appuntamenti' : 'scadenze, udienze, appuntamenti'} e gli eventi dei calendari collegati. Il PDF si salva nella cartella che scegli.</p>
    </Modal>
  )
}
