import { useState } from 'react'
import { FileDown, FolderOpen, FileText, X } from 'lucide-react'
import { api, type EsitoCompressione } from '../api'
import { Btn, Empty, PageHeader, useAction, useFeedback } from '../components/ui'
import { fmtBytes } from '../lib/format'

type Livello = 'minima' | 'media' | 'massima'
const LIVELLI: { id: Livello; nome: string; testo: string }[] = [
  { id: 'minima', nome: 'Minima', testo: 'Qualità quasi identica all’originale: per documenti da stampare o archiviare.' },
  { id: 'media', nome: 'Media', testo: 'Il giusto equilibrio: ideale per PEC, email e depositi telematici.' },
  { id: 'massima', nome: 'Massima', testo: 'Il file più leggero possibile: foto e scansioni meno definite, testo sempre nitido.' },
]
interface Voce { percorso: string; nome: string; byte: number; stato: 'attesa' | 'lavoro' | 'fatto' | 'errore'; esito?: EsitoCompressione; errore?: string }

/**
 * Comprimi PDF: rende più leggeri PDF pesanti (scansioni, foto, allegati) senza mandarli a nessun servizio esterno.
 * Il testo resta testo; si ricomprimono le immagini. L'originale non si tocca: il file nuovo si chiama «… (compresso).pdf».
 */
export default function ComprimiPdf() {
  const run = useAction()
  const { toast } = useFeedback()
  const [livello, setLivello] = useState<Livello>(() => { try { return (localStorage.getItem('tio-comprimi-livello') as Livello) || 'media' } catch { return 'media' } })
  const [chiedi, setChiedi] = useState(false)
  const [voci, setVoci] = useState<Voce[]>([])
  const [over, setOver] = useState(false)
  const [lavoro, setLavoro] = useState(false)
  const scegliLivello = (l: Livello) => { setLivello(l); try { localStorage.setItem('tio-comprimi-livello', l) } catch { /* preferenza facoltativa */ } }
  const aggiungi = (nuove: { percorso: string; nome: string; byte: number }[]) => setVoci((v) => [...v.filter((x) => !nuove.some((n) => n.percorso === x.percorso)), ...nuove.map((n) => ({ ...n, stato: 'attesa' as const }))])
  const scegli = async () => { const r = await run(() => api.scegliPdfDaComprimere()); if (r?.length) aggiungi(r) }
  const rilascia = async (files: File[]) => {
    const percorsi = files.map((f) => window.mngmnt.pathForFile(f)).filter((p) => /\.pdf$/i.test(p))
    if (!percorsi.length) { toast('Trascina file PDF', 'err'); return }
    const info = await run(() => Promise.all(percorsi.map((p) => api.infoPdf(p))))
    if (info) aggiungi(info)
  }
  const comprimi = async () => {
    setLavoro(true)
    try {
      for (const v of voci.filter((x) => x.stato !== 'fatto')) {
        setVoci((l) => l.map((x) => (x.percorso === v.percorso ? { ...x, stato: 'lavoro', errore: undefined } : x)))
        try {
          const esito = await api.comprimiPdf(v.percorso, livello, chiedi)
          setVoci((l) => l.map((x) => (x.percorso === v.percorso ? (esito ? { ...x, stato: 'fatto', esito } : { ...x, stato: 'attesa' }) : x)))
        } catch (e: any) {
          const msg = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          setVoci((l) => l.map((x) => (x.percorso === v.percorso ? { ...x, stato: 'errore', errore: msg } : x)))
        }
      }
    } finally { setLavoro(false) }
  }
  const daFare = voci.some((x) => x.stato !== 'fatto')
  const risparmio = voci.reduce((s, x) => s + (x.esito ? x.esito.prima - x.esito.dopo : 0), 0)
  return (
    <div className="page comprimi-pagina">
      <PageHeader title="Comprimi PDF" subtitle="Rendi più leggeri i PDF pesanti (scansioni, foto, allegati) per PEC, email e depositi. Tutto avviene sul tuo computer: nessun file viene inviato." />
      <div className="comprimi">
        <fieldset className="comprimi-livelli" aria-label="Livello di compressione" style={{ border: 0, padding: 0, margin: 0 }}>
          {LIVELLI.map((l) => <label key={l.id} className={livello === l.id ? 'on' : ''}><input type="radio" name="livello" value={l.id} checked={livello === l.id} onChange={() => scegliLivello(l.id)} /><b>{l.nome}</b><span className="muted small">{l.testo}</span></label>)}
        </fieldset>
        <div className={`comprimi-zona${over ? ' over' : ''}`} data-zona-file onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); rilascia([...e.dataTransfer.files]) }}>
          <FileDown size={30} aria-hidden />
          <b>Trascina qui i PDF</b>
          <span className="muted small">oppure</span>
          <Btn onClick={scegli}><FolderOpen size={15} /> Scegli i PDF…</Btn>
        </div>
        {voci.length > 0 && <ul className="comprimi-esiti" aria-live="polite">
          {voci.map((v) => <li key={v.percorso}>
            <span><FileText size={14} aria-hidden /> <b>{v.nome}</b><br /><small className="muted">
              {v.stato === 'fatto' && v.esito ? (v.esito.invariato ? `Già ottimizzato: nessun risparmio (copia salvata come «${v.esito.nome}»)` : `${fmtBytes(v.esito.prima)} → ${fmtBytes(v.esito.dopo)} · −${Math.round((1 - v.esito.dopo / v.esito.prima) * 100)}% · ${v.esito.ricompresse} immagini ricompresse su ${v.esito.immagini} · salvato come «${v.esito.nome}»`)
                : v.stato === 'lavoro' ? 'Compressione in corso…' : v.stato === 'errore' ? <span className="late-text">{v.errore}</span> : fmtBytes(v.byte)}
            </small></span>
            {v.stato === 'fatto' && v.esito ? <span className="row"><Btn size="sm" onClick={() => run(() => api.mostraPdfCompresso(v.esito!.uscita, true))}>Apri</Btn><Btn size="sm" variant="ghost" onClick={() => run(() => api.mostraPdfCompresso(v.esito!.uscita))}>Mostra nella cartella</Btn></span> : <span />}
            <button type="button" className="icon-btn" aria-label={`Togli ${v.nome} dall'elenco`} disabled={v.stato === 'lavoro'} onClick={() => setVoci((l) => l.filter((x) => x.percorso !== v.percorso))}><X size={14} /></button>
            {v.stato === 'fatto' && v.esito && !v.esito.invariato && <span className="comprimi-barra" aria-hidden><span style={{ width: `${Math.max(2, Math.round(v.esito.dopo / v.esito.prima * 100))}%` }} /></span>}
          </li>)}
        </ul>}
        {!voci.length && <Empty icon={<FileDown size={28} />} title="Nessun PDF scelto" text="Scegli o trascina uno o più PDF: il file compresso viene salvato accanto all’originale, con «(compresso)» nel nome." />}
        <div className="row wrap">
          <label className="check"><input type="checkbox" checked={chiedi} onChange={(e) => setChiedi(e.target.checked)} /> Chiedi dove salvare ogni file</label>
          <span className="grow" />
          {risparmio > 0 && <span className="muted small" role="status">Risparmiati {fmtBytes(risparmio)}</span>}
          <Btn variant="primary" disabled={!daFare || lavoro} onClick={comprimi}><FileDown size={15} /> {lavoro ? 'Compressione…' : voci.filter((x) => x.stato !== 'fatto').length > 1 ? `Comprimi ${voci.filter((x) => x.stato !== 'fatto').length} PDF` : 'Comprimi'}</Btn>
        </div>
        <p className="muted small">Il testo resta selezionabile e ricercabile: si riducono risoluzione e qualità di foto e scansioni, si comprimono le parti lasciate senza compressione e si tolgono i dati rimasti da vecchi salvataggi. I PDF protetti da password o con firma digitale vanno compressi prima di firmarli: comprimere un PDF firmato ne invalida la firma.</p>
      </div>
    </div>
  )
}
