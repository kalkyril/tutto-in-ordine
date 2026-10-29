import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, ChevronLeft, ChevronRight, ImagePlus, Italic, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Btn, Field, useFeedback } from './ui'
import { esempioNotaHtml } from '../lib/print'
import { modelloEffettivo, modelloPredefinito, riga } from '../lib/modello'
import { leggiImmagine } from '../lib/immagine'
import { FONT_DOCUMENTO, fontValidi, leggiFont } from '../lib/font-documento'
import { api } from '../api'
import type { ModelloPdf, RigaModello, Settings } from '../types'

type Blocco = 'intestazione' | 'pagamento' | 'footer'

const TITOLI: Record<Blocco, { titolo: string; aiuto: string }> = {
  intestazione: { titolo: 'Intestazione', aiuto: 'In alto nella nota: nome dello studio, titolo professionale, recapiti…' },
  pagamento: { titolo: 'Coordinate di pagamento', aiuto: 'Sotto i totali: IBAN, banca, condizioni di pagamento…' },
  footer: { titolo: 'Piè di pagina', aiuto: 'In fondo alla pagina: sede, domicilio fiscale, codice fiscale e partita IVA…' },
}

export function ImmagineBlocco({ titolo, src, altezza, allineamento, max, onChange }: {
  titolo: string; src: string | null; altezza: number; allineamento: RigaModello['allineamento']; max: number
  onChange: (src: string | null, altezza: number, allineamento: RigaModello['allineamento']) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const { toast } = useFeedback()
  const scegli = async (file?: File) => {
    if (!file) return
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Scegli un’immagine di dimensioni inferiori a 10 MB.')
      const data = await leggiImmagine(file)
      if (data.length >= 4 * 1024 * 1024) throw new Error('L’immagine è troppo grande: riducine le dimensioni e riprova.')
      onChange(data, altezza, allineamento)
    } catch (error: any) { toast(error.message, 'err') }
  }
  return <div className="modello-immagine" aria-label={`Immagine ${titolo.toLowerCase()}`}>
    <div className="row wrap">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden aria-label={`Carica immagine ${titolo.toLowerCase()}`} onChange={e => { scegli(e.target.files?.[0]); e.target.value = '' }} />
      <Btn size="sm" onClick={() => input.current?.click()}><ImagePlus size={14} /> {src ? 'Cambia immagine…' : 'Aggiungi immagine…'}</Btn>
      {src && <><img src={src} alt={`Immagine ${titolo.toLowerCase()}`} className="logo-mini" /><Btn size="sm" variant="ghost" onClick={() => onChange(null, altezza, allineamento)}><Trash2 size={14} /> Rimuovi immagine</Btn></>}
    </div>
    {src && <div className="row wrap modello-immagine-opzioni">
      <label className="small">Altezza: {altezza} px <input aria-label={`Altezza immagine ${titolo.toLowerCase()}`} type="range" min={16} max={max} value={altezza} onChange={e => onChange(src, Number(e.target.value), allineamento)} /></label>
      <div className="tool-group">{([['sinistra', AlignLeft], ['centro', AlignCenter], ['destra', AlignRight]] as const).map(([a, Icon]) => (
        <button key={a} type="button" className={`tool ${allineamento === a ? 'on' : ''}`} onClick={() => onChange(src, altezza, a)} aria-pressed={allineamento === a} title={`Immagine ${titolo.toLowerCase()} a ${a}`}><Icon size={14} /></button>
      ))}</div>
    </div>}
  </div>
}

/** Fit the complete A4 sheet within the visible area, including in the document modal. */
export function AnteprimaNota({ html, etichetta = 'nota pro forma' }: { html: string; etichetta?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [scala, setScala] = useState(.4)
  const [pagina, setPagina] = useState(1)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.previewPdf>>>(null)
  const [busy, setBusy] = useState(true)
  const [errore, setErrore] = useState('')
  const [tentativo, setTentativo] = useState(0)
  useEffect(() => setPagina(1), [html])
  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setErrore('')
    const timer = setTimeout(async () => {
      try {
        const result = await api.previewPdf(html, pagina)
        if (cancelled) return
        if (!result) throw new Error('Anteprima da aggiornare. Premi Riprova.')
        setPreview(result)
        if (result.pagina !== pagina) setPagina(result.pagina)
      } catch (error: any) { if (!cancelled) setErrore(error.message || 'Impossibile generare l’anteprima.') }
      finally { if (!cancelled) setBusy(false) }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [html, pagina, tentativo])
  useEffect(() => {
    const el = container.current
    if (!el) return
    let raf = 0
    const misura = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const top = el.getBoundingClientRect().top
        const fondo = Math.min(window.innerHeight, el.closest('.modal-body, .content')?.getBoundingClientRect().bottom ?? window.innerHeight)
        const height = Math.max(100, fondo - Math.max(16, top) - 20 - ((preview?.pagine || 0) > 1 ? 40 : 0))
        setScala(Math.min((el.clientWidth - 2) / 794, height / 1123, .6))
      })
    }
    const observer = new ResizeObserver(misura)
    observer.observe(el)
    window.addEventListener('resize', misura)
    window.addEventListener('scroll', misura, true)
    misura()
    return () => { observer.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('resize', misura); window.removeEventListener('scroll', misura, true) }
  }, [preview?.pagine])
  return <aside className="modello-preview" aria-label="Anteprima del modello">
    <div className="preview-label muted small" role="status">{busy ? 'Aggiornamento anteprima…' : 'Anteprima PDF · foglio A4 intero'}</div>
    <div ref={container} className="a4-fit" aria-busy={busy}>
      <div className="a4-frame" style={{ width: 794 * scala, height: 1123 * scala }}>
        {preview && !errore && <img src={preview.immagine} alt={`Anteprima ${etichetta}, pagina ${preview.pagina} di ${preview.pagine}`} />}
        {errore && <div className="a4-messaggio" role="alert"><p>{errore}</p><Btn size="sm" onClick={() => setTentativo(n => n + 1)}>Riprova</Btn></div>}
      </div>
    </div>
    {preview && preview.pagine > 1 && <nav className="preview-pagine" aria-label="Pagine dell’anteprima">
      <Btn size="sm" aria-label="Pagina precedente" disabled={busy || pagina <= 1} onClick={() => setPagina(n => n - 1)}><ChevronLeft size={16} /></Btn>
      <span className="small">Pagina {preview.pagina} di {preview.pagine}</span>
      <Btn size="sm" aria-label="Pagina successiva" disabled={busy || pagina >= preview.pagine} onClick={() => setPagina(n => n + 1)}><ChevronRight size={16} /></Btn>
    </nav>}
  </aside>
}

/** Righe di testo di intestazione o piè di pagina: font, dimensione, stile e allineamento per riga; Invio aggiunge la riga sotto. */
export function RigheEditor({ righe, titolo, opzioniFont, nuova, onChange }: { righe: RigaModello[]; titolo: string; opzioniFont: ReactNode; nuova: () => RigaModello; onChange: (righe: RigaModello[]) => void }) {
  const upd = (i: number, patch: Partial<RigaModello>) => onChange(righe.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  // dopo l'inserimento il cursore va sulla riga nuova, così si continua a scrivere senza mouse
  const lista = useRef<HTMLDivElement>(null)
  const daFocalizzare = useRef<number | null>(null)
  useEffect(() => {
    if (daFocalizzare.current === null) return
    const el = lista.current?.querySelector<HTMLInputElement>(`[data-riga="${daFocalizzare.current}"]`)
    if (el) { el.focus(); daFocalizzare.current = null }
  }, [righe])
  const inserisci = (i: number) => { daFocalizzare.current = i; onChange([...righe.slice(0, i), nuova(), ...righe.slice(i)]) }
  const sposta = (i: number, d: number) => { const a = [...righe]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  return <div ref={lista}>
            {righe.map((r, i) => (
              <div key={i} className="riga-ed">
                <input data-riga={i} value={r.testo} onChange={(e) => upd(i, { testo: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); inserisci(i + 1) } }} placeholder="Scrivi qui il testo…" aria-label={`${titolo}, riga ${i + 1}`} />
                <select value={r.font || ''} onChange={e => upd(i, { font: e.target.value || undefined })} aria-label={`Font ${titolo.toLowerCase()}, riga ${i + 1}`} title="Font della riga: «Font» usa quello del documento"><option value="">Font</option>{opzioniFont}</select>
                <select value={r.dimensione} onChange={(e) => upd(i, { dimensione: e.target.value as RigaModello['dimensione'] })} aria-label="Dimensione">
                  <option value="grande">Grande</option><option value="media">Media</option><option value="normale">Normale</option><option value="piccola">Piccola</option>
                </select>
                <div className="tool-group">
                  <button type="button" className={`tool ${r.grassetto ? 'on' : ''}`} onClick={() => upd(i, { grassetto: !r.grassetto })} aria-pressed={r.grassetto} title="Grassetto"><Bold size={14} /></button>
                  <button type="button" className={`tool ${r.corsivo ? 'on' : ''}`} onClick={() => upd(i, { corsivo: !r.corsivo })} aria-pressed={r.corsivo} title="Corsivo"><Italic size={14} /></button>
                </div>
                <div className="tool-group">
                  {([['sinistra', AlignLeft], ['centro', AlignCenter], ['destra', AlignRight]] as const).map(([a, Icon]) => (
                    <button key={a} type="button" className={`tool ${r.allineamento === a ? 'on' : ''}`} onClick={() => upd(i, { allineamento: a })} aria-pressed={r.allineamento === a} title={`Allinea a ${a}`}><Icon size={14} /></button>
                  ))}
                </div>
                <div className="tool-group">
                  <button type="button" className="tool" onClick={() => sposta(i, -1)} disabled={i === 0} title="Sposta su"><ArrowUp size={14} /></button>
                  <button type="button" className="tool" onClick={() => sposta(i, 1)} disabled={i === righe.length - 1} title="Sposta giù"><ArrowDown size={14} /></button>
                  <button type="button" className="tool" onClick={() => onChange(righe.filter((_, j) => j !== i))} title="Elimina riga"><Trash2 size={14} /></button>
                </div>
                <div className="tool-group">
                  <button type="button" className="tool" onClick={() => inserisci(i + 1)} aria-label="Aggiungi riga" title="Aggiungi una riga sotto (Invio)"><Plus size={14} /></button>
                </div>
              </div>
            ))}
            {!righe.length && <Btn size="sm" onClick={() => inserisci(0)}><Plus size={14} /> Aggiungi riga</Btn>}
  </div>
}

/** Editor visuale di intestazione, coordinate di pagamento e piè di pagina, con anteprima dal vivo della nota pro forma. */
export function ModelloPdfEditor({ settings, value, onChange }: { settings: Settings; value: ModelloPdf; onChange: (m: ModelloPdf) => void }) {
  const { toast, confirm } = useFeedback()
  const fontRef = useRef<HTMLInputElement>(null)
  const corrente = useRef(value)
  corrente.current = value
  const [importandoFont, setImportandoFont] = useState(false)
  const fonts = fontValidi(value.fontPersonali)
  const set = (patch: Partial<ModelloPdf>) => onChange({ ...corrente.current, ...patch })
  const setRighe = (b: Blocco, righe: RigaModello[]) => set({ [b]: righe } as Partial<ModelloPdf>)
  const nuovaRiga = (b: Blocco) => riga('', b === 'pagamento' ? { allineamento: 'sinistra' } : b === 'footer' ? { dimensione: 'piccola' } : {})

  const html = useMemo(() => esempioNotaHtml({ ...settings, modello_pdf: value }, false), [settings, value])

  const ripristina = async () => {
    if (await confirm({ title: 'Ripristinare il modello?', text: `Il modello viene ricostruito dai dati ${settings.profilo === 'ditta' ? 'della tua attività (Impostazioni → La tua attività)' : 'dello studio (Impostazioni → Studio)'}. Testi, immagini e font personalizzati verranno rimossi dal modello.`, ok: 'Ripristina' })) onChange(modelloPredefinito(settings))
  }
  const scegliFont = async (file?: File) => {
    if (!file || importandoFont) return
    setImportandoFont(true)
    try {
      const font = await leggiFont(file, fonts)
      set({ fontPersonali: [...fonts, font], fontDocumento: font.id })
      toast('Font importato e applicato al documento')
    } catch (error: any) { toast(error.message, 'err') } finally { setImportandoFont(false) }
  }
  const rimuoviFont = (id: string) => set({
    fontPersonali: fonts.filter(f => f.id !== id), fontDocumento: value.fontDocumento === id ? 'arial' : value.fontDocumento,
    ...Object.fromEntries((['intestazione', 'pagamento', 'footer'] as Blocco[]).map(b => [b, value[b].map(r => r.font === id ? { ...r, font: undefined } : r)])),
  })
  const opzioniFont = <>{FONT_DOCUMENTO.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}{fonts.map(f => <option key={f.id} value={f.id}>{f.nome} · personale</option>)}</>

  return (
    <div className="modello">
      <div className="modello-form">
        <section className="modello-blocco">
          <header><h3>Carattere del documento</h3><p className="muted small">Scegli il font della nota. Puoi cambiarlo anche sulle singole righe di testo.</p></header>
          <div className="row wrap modello-font-controlli">
            <Field label="Font del documento"><select aria-label="Font del documento" value={value.fontDocumento || 'arial'} onChange={e => set({ fontDocumento: e.target.value })}>{opzioniFont}</select></Field>
            <input ref={fontRef} type="file" accept=".ttf,.otf,.woff,.woff2" hidden aria-label="Importa font personale" onChange={e => { scegliFont(e.target.files?.[0]); e.target.value = '' }} />
            <Btn size="sm" disabled={importandoFont} onClick={() => fontRef.current?.click()}><Plus size={14} /> {importandoFont ? 'Importazione…' : 'Importa font…'}</Btn>
          </div>
          <p className="muted small modello-aiuto">TTF, OTF, WOFF o WOFF2, fino a 2 MB per file. Usa font la cui licenza consente l’incorporamento nei PDF. I file restano locali.</p>
          {fonts.length > 0 && <ul className="modello-font-list">{fonts.map(f => <li key={f.id}><span>{f.nome}</span><Btn size="sm" variant="ghost" aria-label={`Rimuovi font ${f.nome}`} onClick={() => rimuoviFont(f.id)}><Trash2 size={14} /> Rimuovi</Btn></li>)}</ul>}
        </section>
        {(['intestazione', 'pagamento', 'footer'] as Blocco[]).map((b) => (
          <section key={b} className="modello-blocco">
            <header><div><h3>{TITOLI[b].titolo}</h3><p className="muted small">{TITOLI[b].aiuto}</p></div></header>
            {b === 'intestazione' && <ImmagineBlocco titolo="Intestazione" src={value.logo} altezza={value.logoAltezza} allineamento={value.logoAllineamento} max={140} onChange={(logo, logoAltezza, logoAllineamento) => set({ logo, logoAltezza, logoAllineamento })} />}
            {b === 'footer' && <ImmagineBlocco titolo="Piè di pagina" src={value.immagineFooter || null} altezza={value.immagineFooterAltezza ?? 36} allineamento={value.immagineFooterAllineamento || 'centro'} max={64} onChange={(immagineFooter, immagineFooterAltezza, immagineFooterAllineamento) => set({ immagineFooter, immagineFooterAltezza, immagineFooterAllineamento })} />}
            <RigheEditor righe={value[b]} titolo={TITOLI[b].titolo} opzioniFont={opzioniFont} nuova={() => nuovaRiga(b)} onChange={(righe) => setRighe(b, righe)} />
          </section>
        ))}

        <section className="modello-blocco">
          <header><h3>Luogo e data</h3></header>
          <div className="row wrap luogo-data">
            <label className="check"><input type="checkbox" checked={value.mostraLuogoData} onChange={(e) => set({ mostraLuogoData: e.target.checked })} /> Mostra luogo e data</label>
            <input value={value.luogo} onChange={(e) => set({ luogo: e.target.value })} disabled={!value.mostraLuogoData} placeholder="Città, es. Modena" aria-label="Città per la data" style={{ maxWidth: 220 }} />
          </div>
        </section>
        <Btn variant="ghost" size="sm" onClick={ripristina}><RotateCcw size={14} /> Ripristina dai dati dello studio</Btn>
      </div>

      <AnteprimaNota html={html} />
    </div>
  )
}

/** Valore da mostrare nell'editor: modello personalizzato o predefinito. */
export const modelloIniziale = (s: Settings) => modelloEffettivo(s)
