import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Combine, Copy, FileDown, FilePlus2, FileText, FolderOpen, Hash, Highlighter, ImagePlus, MousePointer2, PencilLine, Redo2, RotateCcw, RotateCw, Save, Scissors, Square, Trash2, Type, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { api, type EsitoCompressione, type EsitoDivisione, type EsitoPdf, type PdfAperto } from '../api'
import { Btn, Field, Input, Modal, PageHeader, Select, Tabs, useAction, useFeedback } from '../components/ui'
import { fmtBytes } from '../lib/format'
import { loadPref, savePref } from '../lib/stats'

type Strumento = 'comprimi' | 'unisci' | 'dividi' | 'modifica'
interface FilePdf { percorso: string; nome: string; byte: number }
const pulisci = (e: unknown) => String((e as any)?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * Editor PDF: comprimi, unisci, dividi e modifica, tutto sul computer. Gli originali non si toccano mai: ogni strumento
 * scrive un file nuovo. I PDF protetti si aprono lo stesso (chiedendo la password se serve).
 */
export default function EditorPdf() {
  const [strumento, setStrumentoS] = useState<Strumento>(() => loadPref<Strumento>('pdf.strumento', 'comprimi'))
  const setStrumento = (s: Strumento) => { setStrumentoS(s); savePref('pdf.strumento', s) }
  const password = usePasswordPdf()
  return (
    <div className="page pdf-pagina">
      <PageHeader title="Editor PDF" subtitle="Tutto avviene sul tuo computer: nessun file viene inviato e gli originali restano come sono." />
      <Tabs<Strumento> value={strumento} onChange={setStrumento} tabs={[{ id: 'comprimi', label: 'Comprimi' }, { id: 'unisci', label: 'Unisci' }, { id: 'dividi', label: 'Dividi' }, { id: 'modifica', label: 'Modifica' }]} />
      {/* ogni strumento resta montato: cambiando scheda non si perde il lavoro in corso */}
      <div hidden={strumento !== 'comprimi'}><Comprimi chiedi={password.chiedi} /></div>
      <div hidden={strumento !== 'unisci'}><Unisci chiedi={password.chiedi} /></div>
      <div hidden={strumento !== 'dividi'}><Dividi chiedi={password.chiedi} /></div>
      <div hidden={strumento !== 'modifica'}><Modifica chiedi={password.chiedi} visibile={strumento === 'modifica'} /></div>
      {password.elemento}
    </div>
  )
}

// ------------------------------------------------------------------ password dei PDF protetti
type ConPassword = <T>(fn: (password: Record<string, string>) => Promise<T>, predefinito: string) => Promise<T | null>
/** Esegue `fn`; se un PDF chiede la password la domanda e riprova. Con «Annulla» restituisce null. */
function usePasswordPdf(): { chiedi: ConPassword; elemento: ReactNode } {
  const [domanda, setDomanda] = useState<null | { percorso: string; errata: boolean; rispondi: (p: string | null) => void }>(null)
  const [valore, setValore] = useState('')
  const note = useRef<Record<string, string>>({})
  const chiedi: ConPassword = useCallback(async (fn, predefinito) => {
    for (;;) {
      try { return await fn(note.current) }
      catch (e) {
        const m = /PDF_PASSWORD(_ERRATA)?: (.*)$/.exec(pulisci(e)); if (!m) throw e
        const percorso = /^(\/|[A-Za-z]:\\|\\\\)/.test(m[2]) ? m[2] : predefinito
        const p = await new Promise<string | null>((rispondi) => { setValore(''); setDomanda({ percorso, errata: !!m[1], rispondi }) })
        setDomanda(null)
        if (p === null) return null
        note.current = { ...note.current, [percorso]: p }
      }
    }
  }, [])
  const elemento = domanda && <Modal title="PDF protetto da password" subtitle={domanda.percorso.split(/[\\/]/).pop()} width={440} onClose={() => domanda.rispondi(null)} protectChanges={false}
    footer={<><Btn variant="ghost" onClick={() => domanda.rispondi(null)}>Annulla</Btn><Btn variant="primary" disabled={!valore} onClick={() => domanda.rispondi(valore)}>Apri</Btn></>}>
    <Field label="Password" hint={domanda.errata ? 'Password non corretta: riprova.' : undefined}><Input type="password" autoFocus value={valore} onChange={(e) => setValore(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && valore) domanda.rispondi(valore) }} /></Field>
  </Modal>
  return { chiedi, elemento }
}

// ------------------------------------------------------------------ scelta dei file
function ZonaPdf({ onFile, multi = true, compatta = false, testo }: { onFile: (f: FilePdf[]) => void; multi?: boolean; compatta?: boolean; testo?: string }) {
  const run = useAction()
  const { toast } = useFeedback()
  const [over, setOver] = useState(false)
  const scegli = async () => { const r = await run(() => api.scegliPdfDaComprimere()); if (r?.length) onFile(multi ? r : r.slice(0, 1)) }
  const rilascia = async (files: File[]) => {
    const percorsi = files.map((f) => window.mngmnt.pathForFile(f)).filter((p) => /\.pdf$/i.test(p))
    if (!percorsi.length) { toast('Trascina file PDF', 'err'); return }
    const info = await run(() => Promise.all((multi ? percorsi : percorsi.slice(0, 1)).map((p) => api.infoPdf(p))))
    if (info) onFile(info)
  }
  return <div className={`pdf-zona${over ? ' over' : ''}${compatta ? ' compatta' : ''}`} data-zona-file onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); rilascia([...e.dataTransfer.files]) }}>
    <FileDown size={compatta ? 20 : 30} aria-hidden />
    <b>{testo || (multi ? 'Trascina qui i PDF' : 'Trascina qui il PDF')}</b>
    <Btn onClick={scegli}><FolderOpen size={15} /> {multi ? 'Scegli i PDF…' : 'Scegli il PDF…'}</Btn>
  </div>
}
const Creato = ({ nome, dettaglio, uscita }: { nome: string; dettaglio: string; uscita: string }) => {
  const run = useAction()
  return <div className="pdf-creato" role="status">
    <span><FileText size={15} aria-hidden /> <b>{nome}</b><br /><small className="muted">{dettaglio}</small></span>
    <span className="row"><Btn size="sm" onClick={() => run(() => api.mostraPdfCompresso(uscita, true))}>Apri</Btn><Btn size="sm" variant="ghost" onClick={() => run(() => api.mostraPdfCompresso(uscita))}>Mostra nella cartella</Btn></span>
  </div>
}

// ------------------------------------------------------------------ Comprimi
type Livello = 'minima' | 'media' | 'massima'
const LIVELLI: { id: Livello; nome: string; testo: string }[] = [
  { id: 'minima', nome: 'Minima', testo: 'Qualità quasi identica: per stampare o archiviare.' },
  { id: 'media', nome: 'Media', testo: 'L’equilibrio giusto per PEC, email e depositi.' },
  { id: 'massima', nome: 'Massima', testo: 'Il file più leggero: immagini meno definite, testo nitido.' },
]
interface Voce extends FilePdf { stato: 'attesa' | 'lavoro' | 'fatto' | 'errore'; esito?: EsitoCompressione; errore?: string }

function Comprimi({ chiedi }: { chiedi: ConPassword }) {
  const run = useAction()
  const [livello, setLivello] = useState<Livello>(() => { try { return (localStorage.getItem('tio-comprimi-livello') as Livello) || 'media' } catch { return 'media' } })
  const [dove, setDove] = useState(false)
  const [voci, setVoci] = useState<Voce[]>([])
  const [lavoro, setLavoro] = useState(false)
  const scegliLivello = (l: Livello) => { setLivello(l); try { localStorage.setItem('tio-comprimi-livello', l) } catch { /* preferenza facoltativa */ } }
  const aggiungi = (nuove: FilePdf[]) => setVoci((v) => [...v.filter((x) => !nuove.some((n) => n.percorso === x.percorso)), ...nuove.map((n) => ({ ...n, stato: 'attesa' as const }))])
  const comprimi = async () => {
    setLavoro(true)
    try {
      for (const v of voci.filter((x) => x.stato !== 'fatto')) {
        setVoci((l) => l.map((x) => (x.percorso === v.percorso ? { ...x, stato: 'lavoro', errore: undefined } : x)))
        try {
          const esito = await chiedi((pw) => api.comprimiPdf(v.percorso, livello, dove, pw[v.percorso] || ''), v.percorso)
          setVoci((l) => l.map((x) => (x.percorso === v.percorso ? (esito ? { ...x, stato: 'fatto', esito } : { ...x, stato: 'attesa' }) : x)))
        } catch (e) { setVoci((l) => l.map((x) => (x.percorso === v.percorso ? { ...x, stato: 'errore', errore: pulisci(e) } : x))) }
      }
    } finally { setLavoro(false) }
  }
  const daFare = voci.some((x) => x.stato !== 'fatto')
  const risparmio = voci.reduce((s, x) => s + (x.esito ? x.esito.prima - x.esito.dopo : 0), 0)
  return (
    <div className="pdf-due">
      <aside className="pdf-opzioni">
        <fieldset className="comprimi-livelli" aria-label="Livello di compressione">
          <legend>Compressione</legend>
          {LIVELLI.map((l) => <label key={l.id} className={livello === l.id ? 'on' : ''}><input type="radio" name="livello" value={l.id} checked={livello === l.id} onChange={() => { scegliLivello(l.id); setVoci((v) => v.map((x) => (x.stato === 'fatto' ? { ...x, stato: 'attesa', esito: undefined } : x))) }} /><b>{l.nome}</b><span className="muted small">{l.testo}</span></label>)}
        </fieldset>
        <label className="check"><input type="checkbox" checked={dove} onChange={(e) => setDove(e.target.checked)} /> Chiedi dove salvare ogni file</label>
        <Btn variant="primary" disabled={!daFare || lavoro} aria-busy={lavoro} onClick={comprimi}><FileDown size={15} /> {lavoro ? 'Compressione…' : voci.length > 1 ? `Comprimi ${voci.length} PDF` : 'Comprimi'}</Btn>
        <p className="muted small">Il testo resta selezionabile. Comprimi prima di firmare: un PDF firmato, se compresso, perde la firma.</p>
      </aside>
      <section className="pdf-lavoro">
        <ZonaPdf onFile={aggiungi} compatta={voci.length > 0} />
        {voci.length > 0 && <ul className="comprimi-esiti" aria-live="polite">
          {voci.map((v) => <li key={v.percorso}>
            <span><FileText size={14} aria-hidden /> <b>{v.nome}</b><br /><small className="muted">
              {v.stato === 'fatto' && v.esito ? (v.esito.invariato ? `Già ottimizzato: copia salvata come «${v.esito.nome}»` : `${fmtBytes(v.esito.prima)} → ${fmtBytes(v.esito.dopo)} · −${Math.round((1 - v.esito.dopo / v.esito.prima) * 100)}% · «${v.esito.nome}»${v.esito.rasterizzato ? ' · PDF protetto: pagine salvate come immagini' : ''}`)
                : v.stato === 'lavoro' ? 'Compressione in corso…' : v.stato === 'errore' ? <span className="late-text">{v.errore}</span> : fmtBytes(v.byte)}
            </small></span>
            {v.stato === 'fatto' && v.esito ? <span className="row"><Btn size="sm" onClick={() => run(() => api.mostraPdfCompresso(v.esito!.uscita, true))}>Apri</Btn><Btn size="sm" variant="ghost" onClick={() => run(() => api.mostraPdfCompresso(v.esito!.uscita))}>Mostra nella cartella</Btn></span> : <span />}
            <button type="button" className="icon-btn" aria-label={`Togli ${v.nome} dall'elenco`} disabled={v.stato === 'lavoro'} onClick={() => setVoci((l) => l.filter((x) => x.percorso !== v.percorso))}><X size={14} /></button>
            {v.stato === 'fatto' && v.esito && !v.esito.invariato && <span className="comprimi-barra" aria-hidden><span style={{ width: `${Math.max(2, Math.round(v.esito.dopo / v.esito.prima * 100))}%` }} /></span>}
          </li>)}
        </ul>}
        {risparmio > 0 && <p className="muted small" role="status">Risparmiati {fmtBytes(risparmio)} in tutto.</p>}
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ Unisci
function Unisci({ chiedi }: { chiedi: ConPassword }) {
  const { toast } = useFeedback()
  const [file, setFile] = useState<FilePdf[]>([])
  const [lavoro, setLavoro] = useState(false)
  const [esito, setEsito] = useState<EsitoPdf | null>(null)
  const trascinato = useRef<number | null>(null)
  const aggiungi = (nuovi: FilePdf[]) => { setEsito(null); setFile((l) => [...l, ...nuovi.filter((n) => !l.some((x) => x.percorso === n.percorso))]) }
  const sposta = (da: number, a: number) => { setEsito(null); setFile((l) => { if (a < 0 || a >= l.length || da === a) return l; const n = [...l]; const [x] = n.splice(da, 1); n.splice(a, 0, x); return n }) }
  const unisci = async () => {
    setLavoro(true)
    try { const r = await chiedi((pw) => api.unisciPdf(file.map((f) => ({ percorso: f.percorso, password: pw[f.percorso] || '' }))), file[0].percorso); if (r) setEsito(r) }
    catch (e) { toast(pulisci(e), 'err') } finally { setLavoro(false) }
  }
  return (
    <div className="pdf-due">
      <aside className="pdf-opzioni">
        <ZonaPdf onFile={aggiungi} testo="Aggiungi i PDF da unire" />
        <Btn variant="primary" disabled={file.length < 2 || lavoro} aria-busy={lavoro} onClick={unisci}><Combine size={15} /> {lavoro ? 'Unione…' : file.length >= 2 ? `Unisci ${file.length} PDF…` : 'Unisci…'}</Btn>
        <p className="muted small">Le pagine seguono l’ordine dell’elenco: trascina le righe per cambiarlo.</p>
      </aside>
      <section className="pdf-lavoro">
        {esito && <Creato nome={esito.nome} uscita={esito.uscita} dettaglio={`${esito.pagine} pagine · ${fmtBytes(esito.byte)}${esito.rasterizzati ? ` · ${esito.rasterizzati === 1 ? '1 PDF protetto unito' : `${esito.rasterizzati} PDF protetti uniti`} come immagini` : ''}`} />}
        {file.length ? <ol className="pdf-elenco">
          {file.map((f, i) => <li key={f.percorso} draggable onDragStart={(e) => { trascinato.current = i; e.dataTransfer.effectAllowed = 'move' }} onDragOver={(e) => { if (trascinato.current !== null) e.preventDefault() }} onDrop={(e) => { e.preventDefault(); if (trascinato.current !== null) sposta(trascinato.current, i); trascinato.current = null }}>
            <span className="pdf-numero" aria-hidden>{i + 1}</span>
            <span className="grow"><b>{f.nome}</b><br /><small className="muted">{fmtBytes(f.byte)}</small></span>
            <button type="button" className="icon-btn" aria-label={`Sposta su ${f.nome}`} disabled={i === 0} onClick={() => sposta(i, i - 1)}><ArrowUp size={15} /></button>
            <button type="button" className="icon-btn" aria-label={`Sposta giù ${f.nome}`} disabled={i === file.length - 1} onClick={() => sposta(i, i + 1)}><ArrowDown size={15} /></button>
            <button type="button" className="icon-btn" aria-label={`Togli ${f.nome}`} onClick={() => { setEsito(null); setFile((l) => l.filter((x) => x.percorso !== f.percorso)) }}><X size={15} /></button>
          </li>)}
        </ol> : <p className="pdf-vuoto muted">Nessun PDF nell’elenco.</p>}
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ Dividi
function Dividi({ chiedi }: { chiedi: ConPassword }) {
  const run = useAction()
  const { toast } = useFeedback()
  const [doc, setDoc] = useState<(PdfAperto & { password: string }) | null>(null)
  const [modo, setModo] = useState<'pagine' | 'ogni' | 'intervalli'>('intervalli')
  const [ogni, setOgni] = useState(2)
  const [intervalli, setIntervalli] = useState('')
  const [unico, setUnico] = useState(false)
  const [lavoro, setLavoro] = useState(false)
  const [esito, setEsito] = useState<EsitoDivisione | null>(null)
  const idAperto = useRef<number | null>(null)
  useEffect(() => () => { if (idAperto.current !== null) api.editorPdfChiudi(idAperto.current).catch(() => {}) }, [])
  const apri = async (f: FilePdf[]) => {
    try {
      let usata = ''
      const d = await chiedi((pw) => { usata = pw[f[0].percorso] || ''; return api.editorPdfApri(f[0].percorso, usata) }, f[0].percorso); if (!d) return
      if (idAperto.current !== null) api.editorPdfChiudi(idAperto.current).catch(() => {})
      idAperto.current = d.id; setDoc({ ...d, password: usata }); setEsito(null); setIntervalli(d.pagine.length > 1 ? `1-${Math.ceil(d.pagine.length / 2)}, ${Math.ceil(d.pagine.length / 2) + 1}-${d.pagine.length}` : '1')
    } catch (e) { toast(pulisci(e), 'err') }
  }
  const dividi = async () => {
    if (!doc) return
    setLavoro(true)
    try { const r = await api.dividiPdf(doc.percorso, { modo, ogni, intervalli, unico, password: doc.password }); if (r) setEsito(r) }
    catch (e) { toast(pulisci(e), 'err') } finally { setLavoro(false) }
  }
  const n = doc?.pagine.length || 0
  const quanti = !doc ? 0 : modo === 'pagine' ? n : modo === 'ogni' ? Math.ceil(n / Math.max(1, ogni)) : unico ? 1 : intervalli.split(/[,;\s]+/).filter(Boolean).length
  return (
    <div className="pdf-due">
      <aside className="pdf-opzioni">
        <ZonaPdf onFile={apri} multi={false} compatta={!!doc} testo={doc ? 'Scegli un altro PDF' : undefined} />
        {doc && <>
          <fieldset className="pdf-scelte" aria-label="Come dividere">
            <legend>Come dividere</legend>
            <label className="check"><input type="radio" name="modo-dividi" checked={modo === 'intervalli'} onChange={() => setModo('intervalli')} /> Per intervalli di pagine</label>
            {modo === 'intervalli' && <div className="pdf-rientro">
              <Input value={intervalli} onChange={(e) => setIntervalli(e.target.value)} placeholder="1-3, 5, 8-10" aria-label="Intervalli di pagine" />
              <label className="check"><input type="checkbox" checked={unico} onChange={(e) => setUnico(e.target.checked)} /> Un file solo con queste pagine</label>
            </div>}
            <label className="check"><input type="radio" name="modo-dividi" checked={modo === 'ogni'} onChange={() => setModo('ogni')} /> Ogni
              <input type="number" className="pdf-ogni" min={1} max={Math.max(1, n)} value={ogni} disabled={modo !== 'ogni'} aria-label="Numero di pagine per file" onChange={(e) => setOgni(Math.max(1, Math.floor(Number(e.target.value)) || 1))} /> pagine</label>
            <label className="check"><input type="radio" name="modo-dividi" checked={modo === 'pagine'} onChange={() => setModo('pagine')} /> Ogni pagina in un file</label>
          </fieldset>
          <Btn variant="primary" disabled={lavoro || !quanti} aria-busy={lavoro} onClick={dividi}><Scissors size={15} /> {lavoro ? 'Divisione…' : `Crea ${quanti} ${quanti === 1 ? 'file' : 'file'}…`}</Btn>
        </>}
      </aside>
      <section className="pdf-lavoro">
        {!doc && <p className="pdf-vuoto muted">Scegli il PDF da dividere.</p>}
        {doc && <div className="pdf-creato"><span><FileText size={15} aria-hidden /> <b>{doc.nome}</b><br /><small className="muted">{n} {n === 1 ? 'pagina' : 'pagine'} · {fmtBytes(doc.byte)}</small></span></div>}
        {esito && <>
          <div className="row wrap"><b role="status">{esito.creati.length} {esito.creati.length === 1 ? 'file creato' : 'file creati'}</b>{esito.rasterizzato && <span className="muted small">PDF protetto: pagine salvate come immagini</span>}<span className="grow" /><Btn size="sm" onClick={() => run(() => api.mostraPdfCompresso(esito.cartella, true))}><FolderOpen size={14} /> Apri la cartella</Btn></div>
          <ul className="pdf-elenco">{esito.creati.slice(0, 200).map((c) => <li key={c.percorso}><FileText size={15} aria-hidden /><span className="grow"><b>{c.nome}</b><br /><small className="muted">{c.pagine} {c.pagine === 1 ? 'pagina' : 'pagine'} · {fmtBytes(c.byte)}</small></span><Btn size="sm" variant="ghost" onClick={() => run(() => api.mostraPdfCompresso(c.percorso, true))}>Apri</Btn></li>)}</ul>
          {esito.creati.length > 200 && <p className="muted small">…e altri {esito.creati.length - 200} file nella cartella.</p>}
        </>}
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ Modifica
type Elemento =
  | { id: string; tipo: 'testo'; x: number; y: number; testo: string; pt: number; colore: string; grassetto: boolean; font: 'helvetica' | 'times' | 'courier' }
  | { id: string; tipo: 'rett'; x: number; y: number; w: number; h: number; colore: string; opacita: number }
  | { id: string; tipo: 'immagine'; x: number; y: number; w: number; h: number; dati: string }
/** Pagina del documento in lavorazione: da un PDF aperto (`fonte` = indice in `fonti`, `n` da 0) oppure bianca. `w`,`h` in punti, come si vede senza la rotazione in più. */
interface Pagina { k: string; fonte: number | null; n: number; rot: number; w: number; h: number; elementi: Elemento[] }
interface Fonte extends PdfAperto { password: string }
type Attrezzo = 'sposta' | 'testo' | 'copri' | 'evidenzia'
const FONT_CSS = { helvetica: 'Helvetica, Arial, sans-serif', times: '"Times New Roman", Times, serif', courier: '"Courier New", Courier, monospace' }
let seq = 0
const nuovoK = () => `p${Date.now().toString(36)}${(++seq).toString(36)}`
const girato = (p: Pagina) => (p.rot % 180 === 0 ? { W: p.w, H: p.h } : { W: p.h, H: p.w })
/** Dopo una rotazione della pagina gli elementi restano sullo stesso punto del foglio. */
function ruotaElemento(e: Elemento, orario: boolean): Elemento {
  const w = 'w' in e ? e.w : 0, h = 'h' in e ? e.h : 0
  const [x, y] = orario ? [1 - e.y - h, e.x] : [e.y, 1 - e.x - w]
  return 'w' in e ? { ...e, x, y, w: e.h, h: e.w } : { ...e, x: Math.min(0.95, Math.max(0, x)), y: Math.min(0.97, Math.max(0, y)) }
}

// immagini delle pagine già disegnate (le più recenti), per non richiederle a ogni scorrimento
const immagini = new Map<string, string>()
const ricorda = (k: string, v: string) => { immagini.delete(k); immagini.set(k, v); if (immagini.size > 400) immagini.delete(immagini.keys().next().value!) }
function ImmaginePagina({ fonte, p, larghezza, pigra = false }: { fonte: Fonte | null; p: Pagina; larghezza: number; pigra?: boolean }) {
  const chiave = fonte ? `${fonte.id}:${p.n}:${p.rot}:${larghezza}` : ''
  const [src, setSrc] = useState(() => immagini.get(chiave) || '')
  const [vista, setVista] = useState(!pigra)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (vista || !ref.current) return
    const o = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setVista(true); o.disconnect() } }, { rootMargin: '300px' })
    o.observe(ref.current); return () => o.disconnect()
  }, [vista])
  useEffect(() => {
    if (!fonte || !vista) return
    const pronta = immagini.get(chiave); if (pronta) { setSrc(pronta); return }
    let vivo = true
    const t = window.setTimeout(() => { api.editorPdfPagina(fonte.id, p.n + 1, larghezza, p.rot).then((img) => { ricorda(chiave, img); if (vivo) setSrc(img) }).catch(() => {}) }, pigra ? 0 : 120)
    return () => { vivo = false; window.clearTimeout(t) }
  }, [chiave, vista]) // eslint-disable-line react-hooks/exhaustive-deps -- la chiave riassume fonte, pagina, rotazione e larghezza
  const { W, H } = girato(p)
  return <div ref={ref} className="pdf-foglio-img" style={{ aspectRatio: `${W} / ${H}` }}>{src && <img src={src} alt="" draggable={false} />}</div>
}

function Modifica({ chiedi, visibile }: { chiedi: ConPassword; visibile: boolean }) {
  const run = useAction()
  const { toast, confirm } = useFeedback()
  const [fonti, setFonti] = useState<Fonte[]>([])
  const [pagine, setPagineS] = useState<Pagina[]>([])
  const [scelta, setScelta] = useState<string | null>(null)
  const [attivo, setAttivo] = useState<string | null>(null) // elemento selezionato
  const [attrezzo, setAttrezzo] = useState<Attrezzo>('sposta')
  const [zoom, setZoom] = useState(1)
  const [numeri, setNumeri] = useState<{ attivi: boolean; posizione: string; formato: string }>({ attivi: false, posizione: 'basso-centro', formato: 'n/t' })
  const [lavoro, setLavoro] = useState(false)
  const [esito, setEsito] = useState<EsitoPdf | null>(null)
  const [modificato, setModificato] = useState(false)
  // annulla e ripeti: le versioni precedenti dell'elenco delle pagine
  const storia = useRef<{ prima: Pagina[][]; dopo: Pagina[][] }>({ prima: [], dopo: [] })
  const ultimo = useRef<{ chiave: string; t: number }>({ chiave: '', t: 0 })
  const fontiRef = useRef<Fonte[]>([]); fontiRef.current = fonti
  useEffect(() => () => { for (const f of fontiRef.current) api.editorPdfChiudi(f.id).catch(() => {}) }, [])
  /** `chiave`: modifiche ravvicinate dello stesso tipo (trascinare, scrivere) contano come un passo solo per «Annulla». */
  const pagineRef = useRef<Pagina[]>([])
  const metti = (l: Pagina[]) => { pagineRef.current = l; setPagineS(l) }
  const setPagine = useCallback((fn: (l: Pagina[]) => Pagina[], chiave = '') => {
    const l = pagineRef.current, n = fn(l); if (n === l) return
    const ora = Date.now()
    if (!(chiave && ultimo.current.chiave === chiave && ora - ultimo.current.t < 1200)) { storia.current.prima.push(l); if (storia.current.prima.length > 80) storia.current.prima.shift() }
    ultimo.current = { chiave, t: ora }; storia.current.dopo = []
    metti(n); setModificato(true); setEsito(null)
  }, [])
  const annulla = useCallback(() => { const p = storia.current.prima.pop(); if (!p) return; storia.current.dopo.push(pagineRef.current); ultimo.current = { chiave: '', t: 0 }; metti(p); setModificato(true); setEsito(null) }, [])
  const ripeti = useCallback(() => { const p = storia.current.dopo.pop(); if (!p) return; storia.current.prima.push(pagineRef.current); metti(p); setModificato(true); setEsito(null) }, [])

  const pagina = pagine.find((p) => p.k === scelta) || pagine[0] || null
  const indice = pagina ? pagine.indexOf(pagina) : -1
  const elemento = pagina?.elementi.find((e) => e.id === attivo) || null
  const cambiaPagina = (k: string, fn: (p: Pagina) => Pagina, chiave = '') => setPagine((l) => l.map((p) => (p.k === k ? fn(p) : p)), chiave)
  const cambiaElemento = (patch: Partial<Elemento>, chiave = '') => { if (pagina && attivo) cambiaPagina(pagina.k, (p) => ({ ...p, elementi: p.elementi.map((e) => (e.id === attivo ? { ...e, ...patch } as Elemento : e)) }), chiave || `el:${attivo}:${Object.keys(patch).join()}`) }

  const apriFonte = async (f: FilePdf): Promise<{ fonte: Fonte; indice: number } | null> => {
    const gia = fontiRef.current.findIndex((x) => x.percorso === f.percorso); if (gia >= 0) return { fonte: fontiRef.current[gia], indice: gia }
    let usata = ''
    const d = await chiedi((pw) => { usata = pw[f.percorso] || ''; return api.editorPdfApri(f.percorso, usata) }, f.percorso); if (!d) return null
    const fonte = { ...d, password: usata }, i = fontiRef.current.length
    fontiRef.current = [...fontiRef.current, fonte]; setFonti(fontiRef.current)
    return { fonte, indice: i }
  }
  const pagineDi = (fonte: Fonte, i: number): Pagina[] => fonte.pagine.map((d, n) => ({ k: nuovoK(), fonte: i, n, rot: 0, w: d.w, h: d.h, elementi: [] }))
  const apri = async (f: FilePdf[]) => {
    if (pagine.length && modificato && !await confirm({ title: 'Aprire un altro PDF?', text: 'Le modifiche non salvate a questo documento andranno perse.', ok: 'Apri' })) return
    try {
      for (const x of fontiRef.current) api.editorPdfChiudi(x.id).catch(() => {})
      fontiRef.current = []; setFonti([])
      const r = await apriFonte(f[0]); if (!r) { metti([]); return }
      const l = pagineDi(r.fonte, r.indice)
      storia.current = { prima: [], dopo: [] }; metti(l); setScelta(l[0]?.k ?? null); setAttivo(null); setModificato(false); setEsito(null); setZoom(1)
    } catch (e) { toast(pulisci(e), 'err') }
  }
  const inserisci = async () => {
    const r = await run(() => api.scegliPdfDaComprimere()); if (!r?.length) return
    try {
      let nuove: Pagina[] = []
      for (const f of r) { const x = await apriFonte(f); if (x) nuove = [...nuove, ...pagineDi(x.fonte, x.indice)] }
      if (!nuove.length) return
      setPagine((l) => { const i = indice < 0 ? l.length : indice + 1; return [...l.slice(0, i), ...nuove, ...l.slice(i)] }); setScelta(nuove[0].k)
    } catch (e) { toast(pulisci(e), 'err') }
  }
  const bianca = () => { const b: Pagina = { k: nuovoK(), fonte: null, n: 0, rot: 0, w: pagina ? girato(pagina).W : 595.28, h: pagina ? girato(pagina).H : 841.89, elementi: [] }; setPagine((l) => { const i = indice < 0 ? l.length : indice + 1; return [...l.slice(0, i), b, ...l.slice(i)] }); setScelta(b.k) }
  const ruota = (orario: boolean) => pagina && cambiaPagina(pagina.k, (p) => ({ ...p, rot: (p.rot + (orario ? 90 : 270)) % 360, elementi: p.elementi.map((e) => ruotaElemento(e, orario)) }))
  const duplica = () => { if (!pagina) return; const c = { ...pagina, k: nuovoK(), elementi: pagina.elementi.map((e) => ({ ...e, id: nuovoK() })) }; setPagine((l) => [...l.slice(0, indice + 1), c, ...l.slice(indice + 1)]); setScelta(c.k) }
  const elimina = () => { if (!pagina) return; const vicino = pagine[indice + 1] || pagine[indice - 1]; setPagine((l) => l.filter((p) => p.k !== pagina.k)); setScelta(vicino?.k ?? null); setAttivo(null) }
  const sposta = (da: number, a: number) => setPagine((l) => { if (a < 0 || a >= l.length || da === a) return l; const n = [...l]; const [x] = n.splice(da, 1); n.splice(a, 0, x); return n })
  const immagine = async () => {
    if (!pagina) return
    const r = await run(() => api.scegliImmaginePdf()); if (!r) return
    const img = new Image(); img.src = r.dati
    await img.decode().catch(() => {})
    const { W, H } = girato(pagina), w = 0.3, h = Math.min(0.6, w * (img.naturalHeight || 1) / (img.naturalWidth || 1) * W / H)
    const e: Elemento = { id: nuovoK(), tipo: 'immagine', x: 0.35, y: 0.4, w, h, dati: r.dati }
    cambiaPagina(pagina.k, (p) => ({ ...p, elementi: [...p.elementi, e] })); setAttivo(e.id); setAttrezzo('sposta')
  }
  const salva = async () => {
    setLavoro(true)
    try {
      // solo i file davvero usati dalle pagine rimaste, con gli indici rifatti
      const usate = [...new Set(pagine.filter((p) => p.fonte !== null).map((p) => p.fonte as number))]
      const r = await api.modificaPdf({
        fonti: usate.map((i) => ({ percorso: fonti[i].percorso, password: fonti[i].password })),
        pagine: pagine.map((p) => (p.fonte === null ? { bianca: true, w: p.w, h: p.h, rot: p.rot, elementi: p.elementi } : { fonte: usate.indexOf(p.fonte), n: p.n, rot: p.rot, elementi: p.elementi })),
        numeri: numeri.attivi ? { posizione: numeri.posizione, formato: numeri.formato, pt: 10, da: 1 } : null,
      })
      if (r) { setEsito(r); setModificato(false) }
    } catch (e) { toast(pulisci(e), 'err') } finally { setLavoro(false) }
  }

  // ---- foglio grande: misura, puntatore, tastiera
  const palco = useRef<HTMLDivElement>(null)
  const foglio = useRef<HTMLDivElement>(null)
  const [spazio, setSpazio] = useState({ w: 800, h: 700 })
  useEffect(() => {
    const el = palco.current; if (!el) return
    const o = new ResizeObserver(() => setSpazio({ w: el.clientWidth, h: el.clientHeight })); o.observe(el); return () => o.disconnect()
  }, [pagine.length > 0, visibile]) // eslint-disable-line react-hooks/exhaustive-deps -- il palco esiste solo con un documento aperto e visibile
  const dim = pagina ? girato(pagina) : { W: 1, H: 1 }
  // a zoom 1 la pagina si vede intera
  const larghezza = Math.max(120, Math.round(Math.min(spazio.w - 48, (spazio.h - 48) * dim.W / dim.H) * zoom))
  const scalaPt = larghezza / dim.W
  const larghezzaImg = Math.min(2400, Math.round(larghezza * Math.min(2, window.devicePixelRatio || 1) / 100) * 100)
  const gesto = useRef<null | { tipo: 'muovi' | 'ridimensiona' | 'disegna'; id: string; x0: number; y0: number; el: Elemento }>(null)
  const punto = (e: { clientX: number; clientY: number }) => { const r = foglio.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } }
  const giuSulFoglio = (e: React.PointerEvent) => {
    if (!pagina || e.button !== 0) return
    const { x, y } = punto(e)
    if (attrezzo === 'testo') {
      const el: Elemento = { id: nuovoK(), tipo: 'testo', x, y: Math.max(0, y - 7 / dim.H), testo: 'Testo', pt: 12, colore: '#111111', grassetto: false, font: 'helvetica' }
      cambiaPagina(pagina.k, (p) => ({ ...p, elementi: [...p.elementi, el] })); setAttivo(el.id); setAttrezzo('sposta')
    } else if (attrezzo === 'copri' || attrezzo === 'evidenzia') {
      const el: Elemento = { id: nuovoK(), tipo: 'rett', x, y, w: 0.001, h: 0.001, colore: attrezzo === 'copri' ? '#ffffff' : '#ffe600', opacita: attrezzo === 'copri' ? 1 : 0.4 }
      cambiaPagina(pagina.k, (p) => ({ ...p, elementi: [...p.elementi, el] })); setAttivo(el.id)
      gesto.current = { tipo: 'disegna', id: el.id, x0: x, y0: y, el }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } else setAttivo(null)
  }
  const giuSuElemento = (e: React.PointerEvent, el: Elemento, tipo: 'muovi' | 'ridimensiona') => {
    if (attrezzo !== 'sposta' || e.button !== 0) return
    e.stopPropagation(); setAttivo(el.id)
    const { x, y } = punto(e); gesto.current = { tipo, id: el.id, x0: x, y0: y, el }; foglio.current!.setPointerCapture(e.pointerId)
  }
  const muovi = (e: React.PointerEvent) => {
    const g = gesto.current; if (!g || !pagina) return
    const { x, y } = punto(e), dx = x - g.x0, dy = y - g.y0
    const patch: Partial<Elemento> = g.tipo === 'muovi' ? { x: Math.min(0.99, Math.max(-0.2, g.el.x + dx)), y: Math.min(0.99, Math.max(-0.2, g.el.y + dy)) }
      : g.tipo === 'ridimensiona' && 'w' in g.el ? { w: Math.max(0.01, g.el.w + dx), h: Math.max(0.006, g.el.h + dy) }
      : { x: Math.min(g.x0, x), y: Math.min(g.y0, y), w: Math.max(0.001, Math.abs(dx)), h: Math.max(0.001, Math.abs(dy)) }
    cambiaPagina(pagina.k, (p) => ({ ...p, elementi: p.elementi.map((el) => (el.id === g.id ? { ...el, ...patch } as Elemento : el)) }), `gesto:${g.id}`)
  }
  const su = () => {
    const g = gesto.current; gesto.current = null
    if (g?.tipo !== 'disegna' || !pagina) return
    // un clic senza trascinare non lascia un riquadro invisibile
    const el = pagina.elementi.find((x) => x.id === g.id)
    if (el && 'w' in el && (el.w < 0.008 || el.h < 0.004)) { cambiaPagina(pagina.k, (p) => ({ ...p, elementi: p.elementi.filter((x) => x.id !== g.id) }), `gesto:${g.id}`); setAttivo(null) }
    setAttrezzo('sposta')
  }
  const togliElemento = useCallback(() => { if (pagina && attivo) { cambiaPagina(pagina.k, (p) => ({ ...p, elementi: p.elementi.filter((e) => e.id !== attivo) })); setAttivo(null) } }, [pagina, attivo]) // eslint-disable-line react-hooks/exhaustive-deps -- cambiaPagina dipende solo da setPagine
  useEffect(() => {
    if (!visibile) return
    const tasto = (e: KeyboardEvent) => {
      const campo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName || '')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !campo) { e.preventDefault(); if (e.shiftKey) ripeti(); else annulla() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !campo && attivo) { e.preventDefault(); togliElemento() }
      else if (e.key === 'Escape' && !campo) { setAttivo(null); setAttrezzo('sposta') }
    }
    window.addEventListener('keydown', tasto); return () => window.removeEventListener('keydown', tasto)
  }, [visibile, attivo, annulla, ripeti, togliElemento])
  const trascinata = useRef<number | null>(null)
  const elementiTotali = useMemo(() => pagine.reduce((s, p) => s + p.elementi.length, 0), [pagine])

  if (!pagine.length) return <div className="pdf-apri">
    <ZonaPdf onFile={apri} multi={false} testo="Trascina qui il PDF da modificare" />
    <p className="muted small">Riordina, ruota, elimina e aggiungi pagine; scrivi sul foglio, copri o evidenzia parti del testo, metti firma, timbro e numeri di pagina.</p>
  </div>

  return (
    <div className="pdf-editor">
      <div className="pdf-barra" role="toolbar" aria-label="Strumenti di modifica">
        <div className="pdf-gruppo">
          <Att icona={<Undo2 size={16} />} titolo="Annulla" fai={annulla} spento={!storia.current.prima.length} />
          <Att icona={<Redo2 size={16} />} titolo="Ripeti" fai={ripeti} spento={!storia.current.dopo.length} />
        </div>
        <div className="pdf-gruppo">
          <Att on={attrezzo === 'sposta'} fai={() => setAttrezzo('sposta')} icona={<MousePointer2 size={16} />} titolo="Seleziona e sposta" />
          <Att on={attrezzo === 'testo'} fai={() => setAttrezzo('testo')} icona={<Type size={16} />} titolo="Testo: fai clic sul foglio dove scrivere" />
          <Att on={attrezzo === 'copri'} fai={() => setAttrezzo('copri')} icona={<Square size={16} />} titolo="Copri: trascina un riquadro bianco sopra una parte" />
          <Att on={attrezzo === 'evidenzia'} fai={() => setAttrezzo('evidenzia')} icona={<Highlighter size={16} />} titolo="Evidenzia: trascina sul testo" />
          <Att icona={<ImagePlus size={16} />} titolo="Immagine: firma, timbro o logo (PNG o JPEG)" fai={immagine} />
        </div>
        <div className="pdf-gruppo">
          <Att icona={<RotateCcw size={16} />} titolo="Ruota la pagina a sinistra" fai={() => ruota(false)} />
          <Att icona={<RotateCw size={16} />} titolo="Ruota la pagina a destra" fai={() => ruota(true)} />
          <Att icona={<Copy size={16} />} titolo="Duplica la pagina" fai={duplica} />
          <Att icona={<Trash2 size={16} />} titolo="Elimina la pagina" fai={elimina} />
        </div>
        <div className="pdf-gruppo">
          <Att icona={<FilePlus2 size={16} />} titolo="Pagina bianca dopo questa" fai={bianca} />
          <Att icona={<Combine size={16} />} titolo="Inserisci le pagine di un altro PDF dopo questa" fai={inserisci} />
        </div>
        <div className="pdf-gruppo pdf-numeri">
          <label className="check" title="Numero in ogni pagina"><input type="checkbox" checked={numeri.attivi} onChange={(e) => { setNumeri({ ...numeri, attivi: e.target.checked }); setModificato(true); setEsito(null) }} /><Hash size={15} aria-hidden /> Numeri</label>
          {numeri.attivi && <>
            <Select value={numeri.formato} aria-label="Formato dei numeri di pagina" onChange={(e) => setNumeri({ ...numeri, formato: e.target.value })}><option value="n">1</option><option value="n/t">1 / {pagine.length}</option><option value="pagina">Pagina 1 di {pagine.length}</option></Select>
            <Select value={numeri.posizione} aria-label="Posizione dei numeri di pagina" onChange={(e) => setNumeri({ ...numeri, posizione: e.target.value })}>{[['basso-centro', 'In basso al centro'], ['basso-destra', 'In basso a destra'], ['basso-sinistra', 'In basso a sinistra'], ['alto-centro', 'In alto al centro'], ['alto-destra', 'In alto a destra'], ['alto-sinistra', 'In alto a sinistra']].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </>}
        </div>
        <span className="grow" />
        <div className="pdf-gruppo">
          <Att icona={<ZoomOut size={16} />} titolo="Riduci" fai={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 4) / 4))} spento={zoom <= 0.5} />
          <button type="button" className="pdf-attrezzo pdf-zoom" title="Pagina intera" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <Att icona={<ZoomIn size={16} />} titolo="Ingrandisci" fai={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 4) / 4))} spento={zoom >= 4} />
        </div>
        <ApriAltro onFile={apri} />
        <Btn variant="primary" disabled={lavoro || (!modificato && !elementiTotali && !numeri.attivi)} aria-busy={lavoro} onClick={salva}><Save size={15} /> {lavoro ? 'Salvataggio…' : 'Salva PDF…'}</Btn>
      </div>
      {elemento && <div className="pdf-proprieta" role="group" aria-label="Elemento selezionato">
        {elemento.tipo === 'testo' && <>
          <textarea className="pdf-testo-campo" rows={Math.min(4, elemento.testo.split('\n').length)} value={elemento.testo} autoFocus onFocus={(e) => { if (e.target.value === 'Testo') e.target.select() }} onChange={(e) => cambiaElemento({ testo: e.target.value })} aria-label="Testo" />
          <Select value={elemento.font} aria-label="Carattere" onChange={(e) => cambiaElemento({ font: e.target.value as any })}><option value="helvetica">Helvetica</option><option value="times">Times</option><option value="courier">Courier</option></Select>
          <Select value={String(elemento.pt)} aria-label="Dimensione" onChange={(e) => cambiaElemento({ pt: Number(e.target.value) })}>{[...new Set([8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72, elemento.pt])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} pt</option>)}</Select>
          <button type="button" className={`pdf-attrezzo${elemento.grassetto ? ' on' : ''}`} aria-pressed={elemento.grassetto} title="Grassetto" aria-label="Grassetto" onClick={() => cambiaElemento({ grassetto: !elemento.grassetto })}><b>G</b></button>
        </>}
        {elemento.tipo !== 'immagine' && <label className="pdf-colore" title="Colore"><input type="color" value={elemento.colore} aria-label="Colore" onChange={(e) => cambiaElemento({ colore: e.target.value })} /></label>}
        {elemento.tipo === 'rett' && <label className="check">Trasparenza <input type="range" min={0.1} max={1} step={0.05} value={elemento.opacita} aria-label="Opacità" onChange={(e) => cambiaElemento({ opacita: Number(e.target.value) })} /></label>}
        <span className="grow" />
        <Btn size="sm" variant="ghost" onClick={togliElemento}><Trash2 size={14} /> Togli</Btn>
      </div>}
      {esito && <Creato nome={esito.nome} uscita={esito.uscita} dettaglio={`${esito.pagine} pagine · ${fmtBytes(esito.byte)}${esito.rasterizzati ? ' · PDF protetto: pagine salvate come immagini' : ''}`} />}
      <div className="pdf-corpo">
        <ol className="pdf-miniature" aria-label="Pagine">
          {pagine.map((p, i) => <li key={p.k} className={p.k === pagina?.k ? 'on' : ''} draggable onDragStart={(e) => { trascinata.current = i; e.dataTransfer.effectAllowed = 'move' }} onDragOver={(e) => { if (trascinata.current !== null) e.preventDefault() }} onDrop={(e) => { e.preventDefault(); if (trascinata.current !== null) sposta(trascinata.current, i); trascinata.current = null }}>
            <button type="button" aria-current={p.k === pagina?.k ? 'page' : undefined} aria-label={`Pagina ${i + 1}`} onClick={() => { setScelta(p.k); setAttivo(null) }}>
              <ImmaginePagina fonte={p.fonte === null ? null : fonti[p.fonte]} p={p} larghezza={200} pigra />
              <span className="pdf-mini-numero">{i + 1}{p.elementi.length > 0 && <PencilLine size={11} aria-label="con modifiche" />}</span>
            </button>
          </li>)}
        </ol>
        <div className="pdf-palco" ref={palco}>
          {pagina && <div className={`pdf-foglio attrezzo-${attrezzo}`} ref={foglio} style={{ width: larghezza }} onPointerDown={giuSulFoglio} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su}>
            <ImmaginePagina key={pagina.k} fonte={pagina.fonte === null ? null : fonti[pagina.fonte]} p={pagina} larghezza={larghezzaImg} />
            {pagina.elementi.map((e) => e.tipo === 'testo'
              ? <div key={e.id} className={`pdf-el pdf-el-testo${e.id === attivo ? ' on' : ''}`} style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%`, fontSize: e.pt * scalaPt, color: e.colore, fontWeight: e.grassetto ? 700 : 400, fontFamily: FONT_CSS[e.font] }} onPointerDown={(ev) => giuSuElemento(ev, e, 'muovi')}>{e.testo || ' '}</div>
              : <div key={e.id} className={`pdf-el${e.id === attivo ? ' on' : ''}`} style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%`, width: `${e.w * 100}%`, height: `${e.h * 100}%`, ...(e.tipo === 'rett' ? { background: e.colore, opacity: e.opacita } : {}) }} onPointerDown={(ev) => giuSuElemento(ev, e, 'muovi')}>
                {e.tipo === 'immagine' && <img src={e.dati} alt="" draggable={false} />}
                {e.id === attivo && <span className="pdf-maniglia" onPointerDown={(ev) => giuSuElemento(ev, e, 'ridimensiona')} />}
              </div>)}
            {numeri.attivi && <span className={`pdf-anteprima-numero ${numeri.posizione}`} style={{ fontSize: 10 * scalaPt }}>{numeri.formato === 'n' ? indice + 1 : numeri.formato === 'n/t' ? `${indice + 1} / ${pagine.length}` : `Pagina ${indice + 1} di ${pagine.length}`}</span>}
          </div>}
        </div>
      </div>
      <p className="muted small pdf-stato">Pagina {indice + 1} di {pagine.length}{fonti.length > 1 ? ` · da ${fonti.length} file` : ''}{fonti[0] ? ` · ${fonti[0].nome}` : ''}</p>
    </div>
  )
}

/** Pulsante della barra degli strumenti: un attrezzo (acceso o spento) o un'azione. */
function Att({ icona, titolo, fai, spento = false, on }: { icona: ReactNode; titolo: string; fai: () => void; spento?: boolean; on?: boolean }) {
  return <button type="button" className={`pdf-attrezzo${on ? ' on' : ''}`} aria-pressed={on} title={titolo} aria-label={titolo} disabled={spento} onClick={fai}>{icona}</button>
}

/** «Apri…» nella barra: scelta di un altro PDF da modificare. */
function ApriAltro({ onFile }: { onFile: (f: FilePdf[]) => void }) {
  const run = useAction()
  return <Btn variant="ghost" onClick={async () => { const r = await run(() => api.scegliPdfDaComprimere()); if (r?.length) onFile(r.slice(0, 1)) }}><FolderOpen size={15} /> Apri…</Btn>
}
