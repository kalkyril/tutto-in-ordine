import { useEffect, useState } from 'react'
import { ClipboardCopy, FolderOpen } from 'lucide-react'
import { api } from '../api'
import { Btn, Modal, useAction, useFeedback } from './ui'

/**
 * Aiuto › Segnala un problema: TIO non invia nulla da solo. Si preparano le informazioni da copiare
 * (versione e sistema, con una traccia per descrivere il problema) e si mostra il registro degli errori da allegare.
 */
export function SegnalaProblemaModal({ onClose }: { onClose: () => void }) {
  const run = useAction()
  const { toast } = useFeedback()
  const [sistema, setSistema] = useState('')
  useEffect(() => { api.appInfo().then((i: { sistema?: string }) => setSistema(i?.sistema || '')).catch(() => {}) }, [])
  const testo = `Segnalazione per TIO\n${sistema}\n\nCosa stavo facendo:\n\nCosa mi aspettavo:\n\nCosa è successo invece:\n`
  const copia = async () => {
    try { await navigator.clipboard.writeText(testo); toast('Informazioni copiate: incollale nel messaggio') } catch { toast('Copia non riuscita: seleziona il testo e copialo a mano', 'err') }
  }
  return (
    <Modal title="Segnala un problema" subtitle="TIO non invia nulla da solo: prepari tu il messaggio" width={560} onClose={onClose} protectChanges={false}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Chiudi</Btn>
        <Btn onClick={() => run(() => api.mostraRegistro())}><FolderOpen size={15} /> Mostra il registro</Btn>
        <Btn variant="primary" onClick={copia}><ClipboardCopy size={15} /> Copia le informazioni</Btn>
      </>}>
      <p>Scrivi a chi ti ha dato TIO, con un'email o un messaggio, e includi:</p>
      <ol className="segnala-passi">
        <li>cosa stavi facendo, cosa ti aspettavi e cosa è successo invece;</li>
        <li>se puoi, una foto dello schermo;</li>
        <li>il file del registro degli errori (<code>registro.log</code>), che trovi con «Mostra il registro».</li>
      </ol>
      <pre className="segnala-info" aria-label="Versione e sistema">{sistema || 'Lettura delle informazioni…'}</pre>
      <p className="muted small">Il registro resta sul tuo computer. I percorsi e gli indirizzi web vengono rimossi, ma un errore può citare altri dati inseriti: controllalo e togli eventuali informazioni riservate prima di inviarlo.</p>
    </Modal>
  )
}
