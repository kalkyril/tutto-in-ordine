import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FolderSearch, RefreshCw } from 'lucide-react'
import { api, type RapportoSync } from '../api'
import { Btn, Modal, useAction } from './ui'

const nomeCartella = (p: string) => p.split(/[\\/]/).slice(-2, -1)[0] || p
const percorsoBreve = (p: string) => { const x = p.split(/[\\/]/); return x.length > 4 ? `…/${x.slice(-3).join('/')}` : p }

/** Ritrova i file collegati che sono stati spostati o rinominati e aggiorna i percorsi. Non sposta né modifica nessun file dell'utente. */
export function SincronizzaDocumentiModal({ praticaId, onClose }: { praticaId?: number; onClose: () => void }) {
  const run = useAction()
  const [r, setR] = useState<RapportoSync | null>(null)
  const [lavoro, setLavoro] = useState(true)
  const [errore, setErrore] = useState('')
  const avvia = async (altraCartella = false) => {
    setLavoro(true); setErrore('')
    try { const x = await (altraCartella ? api.sincronizzaDocumentiIn(praticaId) : api.sincronizzaDocumenti(praticaId)); if (x) setR(x) } catch (e: any) { setErrore(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }
    setLavoro(false)
  }
  useEffect(() => { avvia() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  const ricollega = async (id: number) => { const x = await run(() => api.ricollegaDocumento(id)); if (x) setR((v) => v && { ...v, mancanti: v.mancanti.filter((m) => m.id !== id), ritrovati: [...v.ritrovati, { id, nome: x.nome, da: '', a: x.percorso, come: 'indicato da te' }] }) }
  const scegli = async (id: number, percorso: string) => { const x = await run(() => api.ricollegaDocumentoA(id, percorso)); if (x) setR((v) => v && { ...v, ambigui: v.ambigui.filter((m) => m.id !== id), ritrovati: [...v.ritrovati, { id, nome: x.nome, da: '', a: percorso, come: 'scelto da te' }] }) }
  const tutto = r && !r.mancanti.length && !r.ambigui.length
  return (
    <Modal title="Sincronizza i documenti" subtitle="Ritrova i file spostati o rinominati e aggiorna i collegamenti" width={720} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={() => avvia(true)} disabled={lavoro}><FolderSearch size={14} /> Cerca in un'altra cartella…</Btn><Btn variant="primary" onClick={onClose}>Chiudi</Btn></>}>
      {lavoro && <p className="row" role="status"><RefreshCw size={16} className="gira" aria-hidden /> Cerco i file spostati…</p>}
      {errore && <p className="src-badge err" role="alert"><AlertTriangle size={14} /> {errore}</p>}
      {r && !lavoro && (
        <div className="sync-esito">
          <p className={tutto ? 'sync-ok' : ''} role="status">
            {tutto ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}{' '}
            <b>{r.controllati}</b> documenti controllati · <b>{r.ok}</b> già a posto · <b>{r.ritrovati.length}</b> ritrovati · <b>{r.mancanti.length + r.ambigui.length}</b> da sistemare
          </p>
          {r.incompleto && <p className="muted small">La ricerca è stata interrotta per la quantità di file: indica una cartella più precisa con «Cerca in un'altra cartella».</p>}
          {r.ritrovati.length > 0 && (<><h3>Ritrovati e aggiornati</h3><ul className="sync-lista">{r.ritrovati.map((x) => <li key={x.id}><b>{x.nome}</b><span className="muted small">{x.da ? `${percorsoBreve(x.da)} → ` : ''}{percorsoBreve(x.a)} · {x.come}</span></li>)}</ul></>)}
          {r.ambigui.length > 0 && (<><h3>Più copie trovate: scegli quella giusta</h3><ul className="sync-lista">{r.ambigui.map((x) => (
            <li key={x.id}><b>{x.nome}</b><span className="muted small">era in {percorsoBreve(x.percorso)}</span>
              <span className="sync-scelte">{x.candidati.map((c) => <Btn key={c} size="sm" onClick={() => scegli(x.id, c)} title={c}>{nomeCartella(c)}</Btn>)}</span></li>))}</ul></>)}
          {r.mancanti.length > 0 && (<><h3>Non trovati</h3><p className="muted small">Il file potrebbe essere su un disco non collegato o essere stato eliminato. Puoi indicarne la nuova posizione.</p>
            <ul className="sync-lista">{r.mancanti.map((x) => <li key={x.id}><b>{x.nome}</b><span className="muted small" title={x.percorso}>era in {percorsoBreve(x.percorso)}</span><Btn size="sm" onClick={() => ricollega(x.id)}>Ricollega…</Btn></li>)}</ul></>)}
        </div>
      )}
    </Modal>
  )
}
