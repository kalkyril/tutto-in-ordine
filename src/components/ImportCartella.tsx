import { useState } from 'react'
import { CheckCircle2, FolderInput } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { Btn, Modal, Select, useAction } from './ui'
import { fmtBytes } from '../lib/format'

interface Cartella { nome: string; file: number; byte: number; pratica: { id: number; numero: string; titolo: string } | null; giaPresenti: number }

/** Importa i documenti da una cartella: ogni sottocartella → pratica esistente (abbinata dal nome) o nuova. I file originali non vengono toccati. */
export function ImportCartella({ onClose }: { onClose: () => void }) {
  const { pratiche } = useData()
  const run = useAction()
  const [dir, setDir] = useState<{ percorso: string; nome: string } | null>(null)
  const [ant, setAnt] = useState<{ cartelle: Cartella[]; fileInRadice: number } | null>(null)
  const [scelte, setScelte] = useState<Record<string, string>>({})
  const [fatto, setFatto] = useState<null | { collegati: number; saltati: number; createPratiche: number; pratiche: number; errori: { file: string; motivo: string }[] }>(null)
  const [lavoro, setLavoro] = useState(false)

  const scegli = async () => {
    const d = await run(() => api.scegliCartellaImport()); if (!d) return
    const a = await run(() => api.anteprimaCartella(d.percorso)); if (!a) return
    setDir(d); setAnt(a); setFatto(null)
    setScelte(Object.fromEntries(a.cartelle.map((c: Cartella) => [c.nome, c.pratica ? String(c.pratica.id) : 'nuova'])))
  }
  const importa = async () => {
    if (!dir) return
    setLavoro(true)
    const s: Record<string, number | string> = {}
    for (const [k, v] of Object.entries(scelte)) s[k] = /^\d+$/.test(v) ? Number(v) : v
    const r = await run(() => api.eseguiCartella(dir.percorso, s, {}))
    setLavoro(false)
    if (r) setFatto(r)
  }
  const totale = ant ? ant.cartelle.filter((c) => scelte[c.nome] !== 'salta').reduce((s, c) => s + c.file, 0) : 0

  return (
    <Modal title="Importa documenti da una cartella" subtitle="I file restano nelle loro cartelle: TIO li collega alle pratiche, senza copie" width={820} onClose={onClose}
      footer={fatto ? <Btn variant="primary" onClick={onClose}>Chiudi</Btn> : <><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={importa} disabled={!ant || !totale || lavoro}>{lavoro ? 'Copio i file…' : `Importa ${totale} file`}</Btn></>}>
      {fatto ? (
        <div className="import-esito" role="status">
          <CheckCircle2 size={28} className="ok" />
          <h3>Documenti importati</h3>
          <ul><li><b>{fatto.collegati}</b> file collegati a <b>{fatto.pratiche}</b> pratiche{fatto.createPratiche > 0 && <> ({fatto.createPratiche} create ora)</>}</li>
            {fatto.saltati > 0 && <li><b>{fatto.saltati}</b> già presenti (non duplicati)</li>}
            {fatto.errori.length > 0 && <li className="danger"><b>{fatto.errori.length}</b> file non collegati</li>}</ul>
          {fatto.errori.slice(0, 6).map((e, i) => <p key={i} className="small danger">{e.file}: {e.motivo}</p>)}
        </div>
      ) : !dir || !ant ? (
        <div className="import-scelta">
          <FolderInput size={34} />
          <p>Scegli la cartella che contiene <b>una sottocartella per ogni pratica</b>.</p>
          <p className="muted small">Il nome della sottocartella viene abbinato al numero o al titolo di una pratica già presente (es. “2026-001 Rossi c. Bianchi”); altrimenti puoi crearne una nuova. I file nelle sottocartelle vengono importati tutti.</p>
          <Btn variant="primary" onClick={scegli}>Scegli la cartella…</Btn>
        </div>
      ) : (
        <>
          <div className="row wrap"><b>{dir.nome}</b><span className="muted small">{ant.cartelle.length} sottocartelle</span><div className="spacer" /><Btn size="sm" variant="ghost" onClick={scegli}>Cambia cartella…</Btn></div>
          {ant.fileInRadice > 0 && <p className="muted small">{ant.fileInRadice} file direttamente nella cartella principale non verranno importati (metti i file dentro una sottocartella).</p>}
          <table className="table compact" style={{ marginTop: 8 }}><thead><tr><th>Sottocartella</th><th>File</th><th>Abbina a</th></tr></thead><tbody>
            {ant.cartelle.map((c) => (
              <tr key={c.nome}>
                <td><b>{c.nome}</b>{c.giaPresenti > 0 && <div className="muted small">{c.giaPresenti} già presenti</div>}</td>
                <td className="nowrap">{c.file} <span className="muted small">({fmtBytes(c.byte)})</span></td>
                <td><Select aria-label={`Pratica per la cartella ${c.nome}`} value={scelte[c.nome] || 'nuova'} onChange={(e) => setScelte((s) => ({ ...s, [c.nome]: e.target.value }))} disabled={!c.file}>
                  {c.pratica && <option value={String(c.pratica.id)}>{c.pratica.numero ? c.pratica.numero + ' · ' : ''}{c.pratica.titolo} (abbinata)</option>}
                  <option value="nuova">Crea una nuova pratica “{c.nome.slice(0, 40)}”</option><option value="salta">Salta questa cartella</option>
                  {pratiche.filter((p) => p.id !== c.pratica?.id).map((p) => <option key={p.id} value={String(p.id)}>{p.numero ? p.numero + ' · ' : ''}{p.titolo}</option>)}</Select></td>
              </tr>))}
          </tbody></table>
          {!ant.cartelle.length && <p className="muted pad">Nessuna sottocartella trovata.</p>}
        </>
      )}
    </Modal>
  )
}
