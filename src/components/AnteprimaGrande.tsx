import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { api } from '../api'
import { Btn, Modal } from './ui'

/**
 * Anteprima a tutta finestra di un documento PDF, pagina per pagina, con lo zoom: per chi vede poco o vuole controllare
 * i dettagli prima di creare il file. L'immagine è più definita di quella accanto all'editor.
 */
export function AnteprimaGrande({ html, titolo, onClose }: { html: string; titolo: string; onClose: () => void }) {
  const [pagina, setPagina] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [p, setP] = useState<Awaited<ReturnType<typeof api.previewPdf>>>(null)
  const [errore, setErrore] = useState('')
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    let annullato = false
    setBusy(true); setErrore('')
    api.previewPdf(html, pagina, true).then((r) => { if (annullato) return; if (r) { setP(r); if (r.pagina !== pagina) setPagina(r.pagina) } }).catch((e) => { if (!annullato) setErrore(e?.message || 'Anteprima non disponibile') }).finally(() => { if (!annullato) setBusy(false) })
    return () => { annullato = true }
  }, [html, pagina])
  useEffect(() => {
    const tasti = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPagina((n) => Math.min(p?.pagine || n, n + 1))
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPagina((n) => Math.max(1, n - 1))
      else if ((e.metaKey || e.ctrlKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); setZoom((z) => Math.min(300, z + 25)) }
      else if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); setZoom((z) => Math.max(50, z - 25)) }
    }
    window.addEventListener('keydown', tasti)
    return () => window.removeEventListener('keydown', tasti)
  }, [p?.pagine])
  return <Modal title={`Anteprima: ${titolo}`} subtitle="Frecce ← → per cambiare pagina, ⌘+ e ⌘− (Ctrl su Windows) per ingrandire" width={1100} onClose={onClose} protectChanges={false}
    footer={<>
      <div className="anteprima-zoom" role="group" aria-label="Ingrandimento">
        <Btn size="sm" aria-label="Riduci" onClick={() => setZoom((z) => Math.max(50, z - 25))} disabled={zoom <= 50}><Minus size={15} /></Btn>
        <span className="small" role="status" style={{ minWidth: 48, textAlign: 'center' }}>{zoom}%</span>
        <Btn size="sm" aria-label="Ingrandisci" onClick={() => setZoom((z) => Math.min(300, z + 25))} disabled={zoom >= 300}><Plus size={15} /></Btn>
        <Btn size="sm" variant="ghost" onClick={() => setZoom(100)}>Adatta</Btn>
      </div>
      <span className="grow" />
      <Btn variant="primary" onClick={onClose}>Chiudi</Btn>
    </>}>
    <div className="anteprima-grande">
      {p && p.pagine > 1 && <nav aria-label="Pagine dell’anteprima">
        <Btn size="sm" aria-label="Pagina precedente" disabled={busy || pagina <= 1} onClick={() => setPagina((n) => n - 1)}><ChevronLeft size={16} /></Btn>
        <span>Pagina {p.pagina} di {p.pagine}</span>
        <Btn size="sm" aria-label="Pagina successiva" disabled={busy || pagina >= p.pagine} onClick={() => setPagina((n) => n + 1)}><ChevronRight size={16} /></Btn>
      </nav>}
      {errore && <p role="alert" className="stato-err">{errore}</p>}
      {busy && !p && <p role="status" className="muted">Preparazione dell’anteprima…</p>}
      {p && <div className="anteprima-pagina" style={{ width: `min(${zoom}%, ${Math.round(9 * zoom)}px)`, opacity: busy ? .6 : 1 }}><img src={p.immagine} alt={`Pagina ${p.pagina} di ${p.pagine} del documento ${titolo}`} /></div>}
    </div>
  </Modal>
}
