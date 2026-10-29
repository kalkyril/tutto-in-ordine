import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, ShieldCheck } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { Btn, Field, useAction, useFeedback } from './ui'
import { PraticaSelect } from './forms'
import { anonimizza, Uniformatore, vociArchivio } from '../lib/anonimizza'
import { blocchiDaTesto } from '../lib/documento'

const LEGGIBILI = /\.(pdf|docx|odt|rtf|txt|md|markdown|eml|html?|csv)$/i
type Esito = { stato: 'attesa' | 'lavoro' | 'fatto' | 'vuoto' | 'errore'; dettaglio?: string }

/** Anonimizza in blocco: tutti i documenti di una pratica, con gli stessi segnaposto in ogni file e una sola chiave. */
export function AnonimizzaPratica({ praticaIniziale }: { praticaIniziale?: number }) {
  const { documenti, praticaById, anagrafica, pratiche, settings } = useData()
  const run = useAction()
  const { toast } = useFeedback()
  const L = settings.etichette
  const [praticaId, setPraticaId] = useState<number | null>(praticaIniziale ?? null)
  const pratica = praticaId ? praticaById.get(praticaId) : null
  const docs = useMemo(() => documenti.filter((d) => d.pratica_id === praticaId && LEGGIBILI.test(d.nome || d.percorso || '')), [documenti, praticaId])
  const [esclusi, setEsclusi] = useState<Set<number>>(new Set())
  const [o, setO] = useState({ usaArchivio: true, includiStudio: true, reversibile: true, ocr: false })
  const [esiti, setEsiti] = useState<Record<number, Esito>>({})
  const [cartella, setCartella] = useState<string | null>(null)
  const [lavoro, setLavoro] = useState(false)
  const scelti = docs.filter((d) => !esclusi.has(d.id))

  const avvia = async () => {
    if (!praticaId || !scelti.length) return
    const dir = await run(() => api.anonScegliCartella(praticaId)); if (!dir) return
    setCartella(dir); setLavoro(true); setEsiti(Object.fromEntries(scelti.map((d) => [d.id, { stato: 'attesa' }])))
    const archivio = o.usaArchivio ? vociArchivio({ anagrafica, pratiche, studio: o.includiStudio ? settings.studio : null }) : []
    const uni = new Uniformatore()
    let fatti = 0
    for (const doc of scelti) {
      setEsiti((e) => ({ ...e, [doc.id]: { stato: 'lavoro' } }))
      try {
        const d = await api.anonApriDocumento(doc.id, o.ocr)
        if (!d.testo.trim()) { setEsiti((e) => ({ ...e, [doc.id]: { stato: 'vuoto', dettaglio: d.stato === 'scansione' ? 'scansione: riprova con l’OCR' : 'nessun testo' } })); continue }
        const r = uni.applica(anonimizza(d.testo, { archivio, reversibile: o.reversibile }))
        let pos = 0
        const posizioni = r.segmenti.flatMap((s) => { const a = pos; pos += s.t.length; return s.tag ? [{ start: a, end: pos, da: s.t, a: s.ph! }] : [] })
        const formato = d.tipo === 'pdf' && d.id ? 'pdf-originale' : d.tipo === 'docx' && d.id ? 'docx-originale' : 'txt'
        const out = await api.anonSalvaIn(dir, { nome: d.nome, formato, sorgente: d.id, sostituzioni: posizioni, documento: { titolo: d.nome, font: 'Arial', intestazione: [], footer: [], corpo: blocchiDaTesto(r.testo) } })
        setEsiti((e) => ({ ...e, [doc.id]: { stato: 'fatto', dettaglio: `${r.entita} dati · ${out.percorso.split(/[\\/]/).pop()}` } })); fatti++
      } catch (err: any) {
        setEsiti((e) => ({ ...e, [doc.id]: { stato: 'errore', dettaglio: String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') } }))
      }
    }
    if (o.reversibile && Object.keys(uni.mappa).length) await run(() => api.anonSalvaChiaveIn(dir, `${pratica?.numero || pratica?.titolo || 'pratica'}`.replace(/[\\/]/g, '-'), uni.mappa))
    setLavoro(false)
    toast(`${fatti} ${fatti === 1 ? 'documento anonimizzato' : 'documenti anonimizzati'}${o.reversibile ? ', con una chiave di ripristino comune' : ''}`)
  }

  const icona = (e?: Esito) => !e ? null : e.stato === 'fatto' ? <CheckCircle2 size={15} className="ok" aria-hidden /> : e.stato === 'lavoro' ? <Loader2 size={15} className="gira" aria-hidden /> : e.stato === 'attesa' ? null : <AlertTriangle size={15} className="avviso" aria-hidden />
  return <div className="anon-pratica">
    <section className="card">
      <div className="card-head"><h2>Anonimizza i documenti di una {L.pratica.toLowerCase()}</h2></div>
      <p className="muted small">Ogni documento collegato viene letto, anonimizzato e salvato come copia nella cartella che scegli: PDF e Word con la loro impaginazione, gli altri come testo. La stessa persona ha lo stesso segnaposto in tutti i file e una sola chiave di ripristino vale per tutti. Gli originali non vengono modificati.</p>
      <Field label={L.pratica}><PraticaSelect value={praticaId} onChange={(v) => { setPraticaId(v); setEsiti({}); setEsclusi(new Set()); setCartella(null) }} /></Field>
      <div className="anon-pratica-opzioni">
        <label className="check"><input type="checkbox" checked={o.usaArchivio} onChange={(e) => setO({ ...o, usaArchivio: e.target.checked })} /> Riconosci {settings.profilo === 'ditta' ? `clienti, fornitori e ${L.pratiche.toLowerCase()}` : 'clienti, controparti e pratiche'} dell’archivio</label>
        <label className="check"><input type="checkbox" checked={o.includiStudio} disabled={!o.usaArchivio} onChange={(e) => setO({ ...o, includiStudio: e.target.checked })} /> Anonimizza anche i dati della tua attività</label>
        <label className="check"><input type="checkbox" checked={o.reversibile} onChange={(e) => setO({ ...o, reversibile: e.target.checked })} /> Salva una chiave di ripristino comune</label>
        <label className="check"><input type="checkbox" checked={o.ocr} onChange={(e) => setO({ ...o, ocr: e.target.checked })} /> Leggi anche i PDF scansionati con l’OCR (più lento)</label>
      </div>
    </section>
    {praticaId && <section className="card">
      <div className="card-head"><h2>Documenti</h2><span className="pill">{scelti.length} di {docs.length}</span></div>
      {!docs.length && <p className="muted">Nessun documento leggibile collegato: PDF, Word, OpenDocument, RTF, testo, email e pagine web.</p>}
      <ul className="anon-pratica-elenco">{docs.map((d) => <li key={d.id}>
        <label className="check"><input type="checkbox" checked={!esclusi.has(d.id)} disabled={lavoro} onChange={(e) => setEsclusi((s) => { const n = new Set(s); if (e.target.checked) n.delete(d.id); else n.add(d.id); return n })} /> <span className="grow">{d.nome}</span></label>
        <span className={`esito ${esiti[d.id]?.stato || ''}`} role="status">{icona(esiti[d.id])}{esiti[d.id]?.dettaglio}</span>
      </li>)}</ul>
      <div className="row wrap">
        <Btn variant="primary" disabled={lavoro || !scelti.length} onClick={avvia}><ShieldCheck size={15} /> {lavoro ? 'Anonimizzazione in corso…' : `Anonimizza ${scelti.length} ${scelti.length === 1 ? 'documento' : 'documenti'}…`}</Btn>
        {cartella && !lavoro && <Btn variant="ghost" onClick={() => run(() => api.anonMostraCartella(cartella))}><FolderOpen size={15} /> Apri la cartella</Btn>}
      </div>
    </section>}
  </div>
}
