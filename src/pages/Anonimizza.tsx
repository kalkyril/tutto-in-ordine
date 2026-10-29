import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, FolderLock, ClipboardCopy, Eye, EyeOff, FileUp, KeyRound, RotateCcw, ScanText, Sparkles, Trash2, Undo2, Upload, X } from 'lucide-react'
import { api, type DocumentoAperto } from '../api'
import { useNav } from '../nav'
import { AnonimizzaPratica } from '../components/AnonimizzaPratica'
import { useData } from '../store'
import { Btn, PageHeader, Segmented, useAction, useFeedback } from '../components/ui'
import { useZonaFile } from '../lib/trascina'
import { anonimizza, ripristina, vociArchivio, ISTRUZIONI_IA, NOME_TAG, TAGS, type Segmento, type Tag, type Voce } from '../lib/anonimizza'
import { blocchiDaTesto, htmlDaBlocchi } from '../lib/documento'
import { esc } from '../lib/format'

const RIZZO_PII = 'https://rizzo-ai-academy.github.io/rizzo-pii/'
const ANTEPRIMA_MAX = 150_000

// famiglie di colori della legenda: persone, organizzazioni, codici, recapiti, luoghi, tempi e importi
const FAMIGLIA: Record<Tag, string> = {
  FULLNAME: 'persona', AGE: 'persona', ORG: 'org', CF: 'codice', PIVA: 'codice', IBAN: 'codice', CREDITCARDNUMBER: 'codice', ID_DOC: 'codice', DOCID: 'codice', TARGA: 'codice', CATASTO: 'codice',
  EMAIL: 'recapito', TELEPHONENUM: 'recapito', URL: 'recapito', IPADDR: 'recapito', STREET: 'luogo', ZIPCODE: 'luogo', CITY: 'luogo', PROVINCE: 'luogo', DATE: 'tempo', TIME: 'tempo', AMOUNT: 'tempo',
}
const FONTE: Record<string, string> = { regex: 'forma e codice di controllo', contesto: 'formula ricorrente', archivio: 'archivio di TIO', nomi: 'nome proprio', manuale: 'aggiunto da te', propagazione: 'stessa persona o società' }

interface Sessione {
  nome: string; testo: string; sorgente?: number; tipo?: string; stato?: string
  /** testo così come letto dal file: il PDF oscurato richiede che le posizioni non siano cambiate */
  originale?: string
  esclusi: Tag[]; ignorati: string[]; manuali: Voce[]
  usaArchivio: boolean; includiStudio: boolean; reversibile: boolean
}
// la sessione resta in memoria finché TIO è aperto (si può passare ad altre sezioni e tornare); mai su disco
let memoria: Sessione | null = null
let chiaveCaricata: { nome: string; mappa: Record<string, string> } | null = null
window.mngmnt?.on?.('blocca', () => { memoria = null; chiaveCaricata = null })
const iniziale = (): Sessione => ({ nome: '', testo: '', esclusi: [], ignorati: [], manuali: [], usaArchivio: true, includiStudio: true, reversibile: true })

export default function Anonimizza() {
  const { route } = useNav()
  // dalla scheda di una pratica si arriva direttamente all'anonimizzazione dei suoi documenti
  const [vista, setVista] = useState<'anonimizza' | 'pratica' | 'ripristina'>(route.tab === 'pratica' ? 'pratica' : 'anonimizza')
  const [s, setS] = useState<Sessione>(() => memoria || iniziale())
  useEffect(() => { memoria = s.testo ? s : null }, [s])
  const set = (p: Partial<Sessione>) => setS((x) => ({ ...x, ...p }))
  const { anagrafica, pratiche, settings } = useData()
  const archivio = useMemo(() => (s.usaArchivio ? vociArchivio({ anagrafica, pratiche, studio: s.includiStudio ? settings.studio : null }) : []), [s.usaArchivio, s.includiStudio, anagrafica, pratiche, settings.studio])
  const testo = useDeferredValue(s.testo)
  const r = useMemo(() => anonimizza(testo, { esclusi: s.esclusi, ignorati: s.ignorati, manuali: s.manuali, archivio, reversibile: s.reversibile }), [testo, s.esclusi, s.ignorati, s.manuali, archivio, s.reversibile])
  // per i conteggi della legenda servono anche le categorie escluse
  const tutti = useMemo(() => (s.esclusi.length ? anonimizza(testo, { ignorati: s.ignorati, manuali: s.manuali, archivio }).conteggi : r.conteggi), [testo, s.esclusi.length, s.ignorati, s.manuali, archivio, r.conteggi])

  return (
    <div className="page anonimizza">
      <PageHeader title="Anonimizza" eyebrow="Strumenti"
        subtitle={<>Anonimizza {settings.profilo === 'ditta' ? 'contratti, lettere' : 'atti, lettere'} e documenti prima di condividerli o di usarli con un’intelligenza artificiale. Tutto avviene su questo computer.</>}
        actions={<Segmented value={vista} onChange={setVista} options={[{ id: 'anonimizza', label: <><FileText size={15} aria-hidden /> Un documento</> }, { id: 'pratica', label: <><FolderLock size={15} aria-hidden /> Una pratica</> }, { id: 'ripristina', label: <><RotateCcw size={15} aria-hidden /> Ripristina</> }]} />} />
      {vista === 'pratica' && <AnonimizzaPratica praticaIniziale={route.tab === 'pratica' ? route.id : undefined} />}
      {vista === 'pratica' ? null : vista === 'anonimizza'
        ? (s.testo ? <Analisi s={s} set={set} r={r} conteggi={tutti} inAttesa={testo !== s.testo} onChiudi={() => setS(iniziale())} /> : <Inizio onApri={(d) => setS({ ...iniziale(), usaArchivio: s.usaArchivio, includiStudio: s.includiStudio, reversibile: s.reversibile, nome: d.nome, testo: d.testo, originale: d.testo, sorgente: d.id, tipo: d.tipo, stato: d.stato })} />)
        : <Ripristino mappaSessione={s.reversibile && s.testo ? r.mappa : null} nomeSessione={s.nome} />}
      <p className="anon-credito muted small">Si ringrazia <button type="button" className="link" onClick={() => api.openExternal(RIZZO_PII)}>Simone Rizzo</button> per l’ispirazione: la rete di controlli su codici fiscali, IBAN, partite IVA e carte deriva da Rizzo PII (licenza MIT).</p>
    </div>
  )
}

function Inizio({ onApri }: { onApri: (d: DocumentoAperto) => void }) {
  const run = useAction()
  const { toast } = useFeedback()
  const [incolla, setIncolla] = useState('')
  const [lettura, setLettura] = useState(false)
  const apri = async (fn: () => Promise<DocumentoAperto | null>) => {
    setLettura(true)
    try {
      const d = await run(fn)
      if (!d) return
      if (!d.testo.trim()) { toast(d.stato === 'scansione' ? 'Il PDF sembra una scansione: riaprilo con «Leggi una scansione (OCR)».' : 'Il documento non contiene testo da anonimizzare.', 'err'); return }
      onApri(d)
    } finally { setLettura(false) }
  }
  const { props, over } = useZonaFile((p) => apri(() => api.anonApriPercorso(p[0])))
  return (
    <div className="anon-inizio">
      <section className={`card anon-drop${over ? ' over' : ''}`} data-zona-file {...props} aria-busy={lettura}>
        <div className="anon-drop-icona" aria-hidden><FileUp size={30} strokeWidth={1.6} /></div>
        <h2>{lettura ? 'Lettura del documento…' : 'Trascina qui un documento'}</h2>
        <p className="muted">PDF, Word, OpenDocument, RTF, testo, email salvate e immagini. Il file originale non viene modificato.</p>
        <div className="row wrap anon-drop-azioni">
          <Btn variant="primary" disabled={lettura} onClick={() => apri(() => api.anonApri())}><Upload size={15} /> Apri documento…</Btn>
          <Btn disabled={lettura} onClick={() => apri(() => api.anonApri(true))} title="Riconoscimento del testo per PDF scansionati e fotografie (fino a 20 pagine)"><ScanText size={15} /> Leggi una scansione (OCR)…</Btn>
        </div>
      </section>
      <section className="card anon-incolla">
        <div className="card-head"><h2>Oppure incolla il testo</h2></div>
        <textarea value={incolla} onChange={(e) => setIncolla(e.target.value)} rows={7} placeholder="Incolla qui una email, un paragrafo di un atto, una chat…" aria-label="Testo da anonimizzare" />
        <div className="row"><span className="grow" /><Btn variant="primary" disabled={!incolla.trim()} onClick={() => onApri({ nome: 'Testo incollato', testo: incolla, tipo: 'txt', stato: 'testo' })}><Sparkles size={15} /> Anonimizza</Btn></div>
      </section>
      <ul className="anon-punti">
        <li><b>Sul tuo computer.</b> Nessun dato viene inviato: il riconoscimento usa regole, codici di controllo e il tuo archivio.</li>
        <li><b>Reversibile.</b> I dati diventano segnaposto come [FULLNAME_1]: dopo aver usato l’IA rimetti i valori veri con «Ripristina».</li>
        <li><b>Conosce i tuoi clienti.</b> Nomi, codici e recapiti dell’Anagrafica e dei tuoi lavori vengono riconosciuti in qualsiasi forma.</li>
      </ul>
    </div>
  )
}

function Analisi({ s, set, r, conteggi, inAttesa, onChiudi }: { s: Sessione; set: (p: Partial<Sessione>) => void; r: ReturnType<typeof anonimizza>; conteggi: Partial<Record<Tag, number>>; inAttesa: boolean; onChiudi: () => void }) {
  const { settings } = useData()
  const run = useAction()
  const { toast, confirm } = useFeedback()
  const [mostra, setMostra] = useState<'evidenziato' | 'anonimizzato'>('evidenziato')
  const [scelta, setScelta] = useState<{ seg: Segmento; x: number; y: number } | null>(null)
  const [selezione, setSelezione] = useState<{ testo: string; x: number; y: number } | null>(null)
  const [tagNuovo, setTagNuovo] = useState<Tag>('FULLNAME')
  const [modifica, setModifica] = useState(false)
  const pdfOriginale = s.tipo === 'pdf' && !!s.sorgente && s.testo === s.originale
  const [formato, setFormato] = useState(s.tipo === 'docx' ? 'docx-originale' : s.tipo === 'pdf' && s.sorgente ? 'pdf-originale' : 'docx')
  useEffect(() => { if (formato === 'pdf-originale' && !pdfOriginale) setFormato('pdf') }, [formato, pdfOriginale])
  const area = useRef<HTMLDivElement>(null)
  const nomeBase = s.nome.replace(/\.[a-z0-9]{2,5}$/i, '')

  // il clic su un dato evidenziato apre le sue scelte; una selezione libera propone di anonimizzarla
  const suMouseUp = () => {
    const sel = window.getSelection()
    const t = sel?.toString().trim() || ''
    if (!sel || !t || t.length > 200 || !area.current?.contains(sel.anchorNode)) { setSelezione(null); return }
    const rect = sel.getRangeAt(0).getBoundingClientRect(), box = area.current.getBoundingClientRect()
    setScelta(null); setSelezione({ testo: t.replace(/\s+/g, ' '), x: rect.left - box.left + rect.width / 2, y: rect.bottom - box.top + area.current.scrollTop + 6 })
  }
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setScelta(null); setSelezione(null) } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [])

  const lasciaInChiaro = (seg: Segmento) => { set({ ignorati: [...s.ignorati, seg.t], manuali: s.manuali.filter((m) => m.testo.toLowerCase() !== seg.t.toLowerCase()) }); setScelta(null) }
  const aggiungi = () => { if (!selezione) return; set({ manuali: [...s.manuali.filter((m) => m.testo !== selezione.testo), { testo: selezione.testo, tag: tagNuovo }], ignorati: s.ignorati.filter((i) => i.toLowerCase() !== selezione.testo.toLowerCase()) }); setSelezione(null); window.getSelection()?.removeAllRanges() }
  const tagAttivo = (t: Tag) => !s.esclusi.includes(t)
  const copia = async (testo: string, msg: string) => { try { await navigator.clipboard.writeText(testo); toast(msg) } catch { toast('Copia non riuscita', 'err') } }

  const salva = async () => {
    if (formato === 'docx-originale') {
      const sostituzioni = [...new Map(r.segmenti.filter((x) => x.tag).map((x) => [x.t, { da: x.t, a: x.ph! }])).values()]
      const out = await run(() => api.anonSalva({ nome: s.nome, formato, sorgente: s.sorgente, sostituzioni }))
      if (out) toast(out.residui ? 'Salvato. Attenzione: il documento contiene commenti o revisioni, controllali in Word.' : `Salvato con la stessa impaginazione: ${out.sostituzioni} sostituzioni`)
      return
    }
    if (formato === 'pdf-originale') {
      // posizioni nel testo letto dal PDF: i segmenti, in ordine, ricompongono il testo intero
      let pos = 0
      const sostituzioni = r.segmenti.flatMap((x) => { const a = pos; pos += x.t.length; return x.tag ? [{ start: a, end: pos, da: x.t, a: x.ph! }] : [] })
      const out = await run(() => api.anonSalva({ nome: s.nome, formato, sorgente: s.sorgente, sostituzioni }))
      if (out) toast(`PDF oscurato con l’impaginazione originale: ${out.sostituzioni} riquadri. Il testo non è più selezionabile.`)
      return
    }
    if (formato === 'pdf') {
      const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(nomeBase)} anonimizzato</title><style>@page{size:A4;margin:20mm}body{font:11pt/1.5 Arial,sans-serif;color:#111}p{margin:0 0 .6em;white-space:pre-wrap}</style></head><body>${htmlDaBlocchi(blocchiDaTesto(r.testo))}</body></html>`
      await run(() => api.printPdf(html, `${nomeBase} anonimizzato`))
      return
    }
    const out = await run(() => api.anonSalva({ nome: `${nomeBase} anonimizzato`, formato, documento: { titolo: `${nomeBase} anonimizzato`, font: 'Arial', intestazione: [], footer: [], corpo: blocchiDaTesto(r.testo) } }))
    if (out) toast('Documento anonimizzato salvato')
  }
  const salvaChiave = async () => {
    if (!await confirm({ title: 'Salvare la chiave di ripristino?', text: 'La chiave contiene i dati personali originali. Conservala con la stessa cura del documento non anonimizzato e non inviarla insieme al testo anonimizzato.', ok: 'Salva la chiave' })) return
    const p = await run(() => api.anonSalvaChiave(nomeBase, r.mappa)); if (p) toast('Chiave di ripristino salvata')
  }

  const segmenti = useMemo(() => {
    let n = 0; const out: Segmento[] = []
    for (const x of r.segmenti) { if (n > ANTEPRIMA_MAX) break; out.push(x); n += x.t.length }
    return out
  }, [r.segmenti])
  const totale = Object.values(conteggi).reduce((a, b) => a + (b || 0), 0)

  return (
    <div className="anon-griglia">
      <section className="card anon-documento">
        <div className="anon-barra">
          <div className="grow anon-nome"><b title={s.nome}>{s.nome}</b><span className="muted small" role="status">{inAttesa ? 'Analisi…' : `${r.entita} dati anonimizzati · ${r.uniche} valori diversi`}</span></div>
          <Segmented value={mostra} onChange={setMostra} options={[{ id: 'evidenziato', label: <Eye size={15} aria-hidden />, title: 'Testo originale con i dati evidenziati' }, { id: 'anonimizzato', label: <EyeOff size={15} aria-hidden />, title: 'Testo anonimizzato' }]} />
          <Btn size="sm" variant="ghost" onClick={() => setModifica((m) => !m)}>{modifica ? 'Fine' : 'Modifica testo'}</Btn>
          {s.sorgente && s.tipo === 'pdf' && <Btn size="sm" variant="ghost" title="Rilegge il PDF con il riconoscimento del testo" onClick={async () => { const d = await run(() => api.anonRileggi(s.sorgente!)); if (d?.testo) set({ testo: d.testo, originale: d.testo, stato: d.stato, ...(d.id && { sorgente: d.id }) }) }}><ScanText size={14} /> OCR</Btn>}
          <Btn size="sm" variant="ghost" aria-label="Chiudi il documento" title="Chiudi il documento" onClick={onChiudi}><X size={15} /></Btn>
        </div>
        {modifica
          ? <textarea className="anon-modifica" value={s.testo} onChange={(e) => set({ testo: e.target.value })} aria-label="Testo del documento" />
          : <div className="anon-testo" ref={area} onMouseUp={suMouseUp} aria-label={mostra === 'evidenziato' ? 'Documento con i dati personali evidenziati' : 'Documento anonimizzato'}>
            {mostra === 'anonimizzato'
              ? <pre>{r.testo.slice(0, ANTEPRIMA_MAX)}</pre>
              : <pre>{segmenti.map((x, i) => x.tag
                ? <button key={i} type="button" className={`pii f-${FAMIGLIA[x.tag]}${x.fonte === 'manuale' ? ' manuale' : ''}`} data-ph={x.ph} title={`${NOME_TAG[x.tag]} → ${x.ph}`} aria-label={`${x.t}: ${NOME_TAG[x.tag]}, diventa ${x.ph}`}
                  onClick={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(), box = area.current!.getBoundingClientRect(); setSelezione(null); setScelta({ seg: x, x: b.left - box.left + b.width / 2, y: b.bottom - box.top + area.current!.scrollTop + 6 }) }}>{x.t}</button>
                : <span key={i}>{x.t}</span>)}</pre>}
            {s.testo.length > ANTEPRIMA_MAX && <p className="muted small">Anteprima dei primi 150.000 caratteri: copia e salvataggio comprendono tutto il documento.</p>}
            {scelta && <div className="anon-pop" style={{ left: scelta.x, top: scelta.y }} role="dialog" aria-label="Dato anonimizzato">
              <b>{NOME_TAG[scelta.seg.tag!]}</b><span className="muted small">diventa <code>{scelta.seg.ph}</code> · {FONTE[scelta.seg.fonte!]}</span>
              <div className="row"><Btn size="sm" autoFocus onClick={() => lasciaInChiaro(scelta.seg)}><Eye size={14} /> Lascia in chiaro</Btn><Btn size="sm" variant="ghost" onClick={() => setScelta(null)}>Chiudi</Btn></div>
            </div>}
            {selezione && <div className="anon-pop" style={{ left: selezione.x, top: selezione.y }} role="dialog" aria-label="Anonimizza la selezione">
              <span className="small">Anonimizza «{selezione.testo.length > 40 ? selezione.testo.slice(0, 40) + '…' : selezione.testo}» ovunque come</span>
              <div className="row"><select value={tagNuovo} onChange={(e) => setTagNuovo(e.target.value as Tag)} aria-label="Categoria">{TAGS.map((t) => <option key={t.tag} value={t.tag}>{t.nome}</option>)}</select><Btn size="sm" variant="primary" onClick={aggiungi}>Anonimizza</Btn></div>
            </div>}
          </div>}
        <p className="muted small anon-aiuto">Fai clic su un dato evidenziato per lasciarlo in chiaro; seleziona una parola per anonimizzarla in tutto il documento. Controlla sempre il risultato prima di condividerlo.</p>
      </section>

      <aside className="anon-lato">
        <section className="card">
          <div className="card-head"><h2>Usa il risultato</h2></div>
          <div className="anon-azioni">
            <Btn variant="primary" onClick={() => copia(r.testo, 'Testo anonimizzato copiato')}><ClipboardCopy size={15} /> Copia il testo anonimizzato</Btn>
            <Btn onClick={() => copia(ISTRUZIONI_IA + r.testo, 'Copiato con le istruzioni per l’IA')} title="Aggiunge una frase che chiede all’IA di non modificare i segnaposto"><Sparkles size={15} /> Copia per un’IA</Btn>
            <div className="row anon-salva">
              <select value={formato} onChange={(e) => setFormato(e.target.value)} aria-label="Formato del file">
                {s.tipo === 'docx' && <option value="docx-originale">Word, stessa impaginazione</option>}
                {s.tipo === 'pdf' && s.sorgente && <option value="pdf-originale" disabled={!pdfOriginale}>PDF, stessa impaginazione{pdfOriginale ? '' : ' (testo modificato)'}</option>}
                <option value="docx">Word (.docx)</option><option value="pdf">PDF</option><option value="odt">OpenDocument (.odt)</option><option value="rtf">RTF</option><option value="txt">Testo (.txt)</option><option value="md">Markdown (.md)</option>
              </select>
              <Btn onClick={salva}>Salva…</Btn>
            </div>
            {formato === 'pdf-originale' && <p className="muted small">Ogni pagina diventa un’immagine con i dati coperti e il segnaposto scritto sopra: nel file non resta il testo originale. Timbri e firme in forma di immagine non vengono riconosciuti: per le scansioni usa l’OCR.</p>}
            {s.reversibile && <Btn variant="ghost" onClick={salvaChiave}><KeyRound size={15} /> Salva la chiave di ripristino…</Btn>}
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Cosa anonimizzare</h2><span className="pill">{totale}</span></div>
          <ul className="anon-tag">
            {TAGS.filter((t) => conteggi[t.tag] || !tagAttivo(t.tag)).map((t) => (
              <li key={t.tag}><label className="check"><input type="checkbox" checked={tagAttivo(t.tag)} onChange={() => set({ esclusi: tagAttivo(t.tag) ? [...s.esclusi, t.tag] : s.esclusi.filter((x) => x !== t.tag) })} />
                <i className={`pallino f-${FAMIGLIA[t.tag]}`} aria-hidden /><span className="grow">{t.nome}</span><em>{conteggi[t.tag] || 0}</em></label></li>
            ))}
            {!totale && <li className="muted small">Nessun dato personale trovato. Seleziona nel testo ciò che vuoi anonimizzare.</li>}
          </ul>
        </section>
        <section className="card">
          <div className="card-head"><h2>Opzioni</h2></div>
          <label className="check"><input type="checkbox" checked={s.usaArchivio} onChange={(e) => set({ usaArchivio: e.target.checked })} /> Riconosci {settings.profilo === 'ditta' ? `clienti, fornitori e ${settings.etichette.pratiche.toLowerCase()}` : 'clienti, controparti e pratiche'} dell’archivio</label>
          <label className="check"><input type="checkbox" checked={s.includiStudio} disabled={!s.usaArchivio} onChange={(e) => set({ includiStudio: e.target.checked })} /> Anonimizza anche i dati della tua attività</label>
          <label className="check"><input type="checkbox" checked={s.reversibile} onChange={(e) => set({ reversibile: e.target.checked })} /> Conserva la chiave per ripristinare i dati</label>
          {!s.reversibile && <p className="muted small">Anonimizzazione definitiva: non esiste alcun modo di risalire ai valori originali.</p>}
        </section>
        {(s.ignorati.length > 0 || s.manuali.length > 0) && <section className="card">
          <div className="card-head"><h2>Le tue correzioni</h2><Btn size="sm" variant="ghost" onClick={() => set({ ignorati: [], manuali: [] })}><Undo2 size={14} /> Annulla tutte</Btn></div>
          <ul className="anon-correzioni">
            {s.manuali.map((m) => <li key={'m' + m.testo}><span className="grow">«{m.testo}» <span className="muted small">anonimizzato come {NOME_TAG[m.tag].toLowerCase()}</span></span><button type="button" className="icon-btn" aria-label={`Togli «${m.testo}»`} onClick={() => set({ manuali: s.manuali.filter((x) => x !== m) })}><Trash2 size={14} /></button></li>)}
            {s.ignorati.map((t) => <li key={'i' + t}><span className="grow">«{t}» <span className="muted small">lasciato in chiaro</span></span><button type="button" className="icon-btn" aria-label={`Anonimizza di nuovo «${t}»`} onClick={() => set({ ignorati: s.ignorati.filter((x) => x !== t) })}><Undo2 size={14} /></button></li>)}
          </ul>
        </section>}
      </aside>
    </div>
  )
}

function Ripristino({ mappaSessione, nomeSessione }: { mappaSessione: Record<string, string> | null; nomeSessione: string }) {
  const run = useAction()
  const { toast } = useFeedback()
  const [chiave, setChiave] = useState(chiaveCaricata)
  const [testo, setTesto] = useState('')
  const mappa = chiave?.mappa || mappaSessione
  const out = useMemo(() => (mappa && testo ? ripristina(testo, mappa) : null), [testo, mappa])
  const apriChiave = async () => { const k = await run(() => api.anonApriChiave()); if (k) { chiaveCaricata = k; setChiave(k); toast(`Chiave caricata: ${Object.keys(k.mappa).length} segnaposto`) } }
  return (
    <div className="anon-ripristino">
      <section className="card">
        <div className="card-head"><h2>1. Chiave di ripristino</h2></div>
        <p className="muted">{chiave ? <>Dal file <b>{chiave.nome}</b>: {Object.keys(chiave.mappa).length} segnaposto.</> : mappaSessione && Object.keys(mappaSessione).length ? <>Dal documento aperto <b>{nomeSessione}</b>: {Object.keys(mappaSessione).length} segnaposto.</> : 'Anonimizza un documento in questa sessione oppure apri una chiave salvata.'}</p>
        <div className="row wrap"><Btn onClick={apriChiave}><KeyRound size={15} /> Apri una chiave salvata…</Btn>{chiave && <Btn variant="ghost" onClick={() => { chiaveCaricata = null; setChiave(null) }}>Usa quella del documento aperto</Btn>}</div>
      </section>
      <section className="card">
        <div className="card-head"><h2>2. Risposta da ripristinare</h2></div>
        <textarea rows={8} value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Incolla qui la risposta dell’IA o un testo con segnaposto come [FULLNAME_1]…" aria-label="Testo con segnaposto" disabled={!mappa} />
      </section>
      {out && <section className="card">
        <div className="card-head"><h2>3. Testo con i dati originali</h2><span className="pill">{out.sostituiti} ripristinati</span></div>
        <pre className="anon-esito">{out.testo}</pre>
        <div className="row wrap">
          <Btn variant="primary" onClick={async () => { try { await navigator.clipboard.writeText(out.testo); toast('Testo ripristinato copiato') } catch { toast('Copia non riuscita', 'err') } }}><ClipboardCopy size={15} /> Copia</Btn>
          <Btn onClick={async () => { const p = await run(() => api.anonSalvaTesto('testo ripristinato', 'txt', out.testo)); if (p) toast('Salvato') }}>Salva come testo…</Btn>
        </div>
        {out.sostituiti === 0 && <p className="muted small">Nessun segnaposto riconosciuto: controlla di usare la chiave dello stesso documento.</p>}
      </section>}
    </div>
  )
}
