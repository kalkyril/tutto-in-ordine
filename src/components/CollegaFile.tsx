import { useState } from 'react'
import { FileText, FolderOpen } from 'lucide-react'
import { api } from '../api'
import { useNav } from '../nav'
import { Btn, Field, Modal, useAction, useFeedback } from './ui'
import { PraticaSelect } from './forms'

const nome = (p: string) => p.split(/[\\/]/).pop() || p

/** File rilasciati sull'app fuori da una pratica: si sceglie a quale pratica collegarli (come allegare un file a una email). */
export function CollegaFileModal({ percorsi, onClose }: { percorsi: string[]; onClose: () => void }) {
  const run = useAction()
  const { toast } = useFeedback()
  const { go } = useNav()
  const [pratica, setPratica] = useState<number | null>(null)
  const collega = async () => {
    if (!pratica) return
    const r = await run(() => api.addDocumentiPaths(pratica, percorsi))
    if (r) { toast(r.length === 1 ? '1 file collegato' : `${r.length} file collegati`); onClose(); go({ page: 'pratica', id: pratica, tab: 'documenti' }) }
  }
  return (
    <Modal title="Collega i file a una pratica" subtitle="I file restano dove sono: TIO ne ricorda la posizione" width={520} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={collega} disabled={!pratica}>Collega</Btn></>}>
      <ul className="coll-lista" aria-label="File da collegare">{percorsi.slice(0, 8).map((p) => <li key={p}>{/\.[a-z0-9]{1,5}$/i.test(p) ? <FileText size={15} aria-hidden /> : <FolderOpen size={15} aria-hidden />}<span>{nome(p)}</span></li>)}{percorsi.length > 8 && <li className="muted">… e altri {percorsi.length - 8}</li>}</ul>
      <Field label="Pratica" hint="Una cartella trascinata viene collegata con tutti i suoi file"><PraticaSelect value={pratica} onChange={setPratica} allowNone={false} /></Field>
    </Modal>
  )
}
