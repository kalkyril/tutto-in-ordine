import { useEffect, useMemo, useRef, useState } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Braces, Columns2, Eraser, Highlighter, ImagePlus, Italic, List, ListOrdered, ListTree, Redo2, Scissors, Strikethrough, Table, Trash2, Underline, Undo2, Wand2 } from 'lucide-react'
import { Btn, Field, Input, Modal, useFeedback } from './ui'
import { blocchiDaHtml, blocchiDaTestoStrutturato, capitoli, CSS_ALLINEA, htmlDaBlocchi, nomeCampoValido, pulisciHtml, riconosciTitoli, type Campo } from '../lib/documento'
import type { Allineamento } from '../types'

const DIMENSIONI = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72]

/** Immagine per il corpo del documento: lato lungo fino a 1400 px, JPEG per le foto (PNG se ha trasparenze), al massimo 3 MB. */
export async function immagineCorpo(file: Blob): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('L’immagine supera i 20 MB')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Immagine non leggibile')); i.src = url })
    const k = Math.min(1, 1400 / Math.max(img.width, img.height))
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0, c.width, c.height)
    // trasparenze: si guarda un campione di pixel; con l'alfa si resta in PNG
    const px = ctx.getImageData(0, 0, c.width, c.height).data
    let alfa = false
    for (let i = 3; i < px.length; i += 4 * 97) if (px[i] < 250) { alfa = true; break }
    let dati = alfa || file.type === 'image/png' && c.width * c.height < 250000 ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85)
    if (dati.length > 3 * 1024 * 1024) dati = c.toDataURL('image/jpeg', 0.7)
    if (dati.length > 4 * 1024 * 1024) throw new Error('L’immagine è troppo grande anche dopo la riduzione')
    return dati
  } finally { URL.revokeObjectURL(url) }
}

export interface OpzioniEditor {
  /** campi inventati dall'utente per questo modello, proposti nel menu dei campi */
  campiPersonali?: string[]
  onNuovoCampo?: (nome: string) => void
  /** niente menu dei campi (testo lungo incollato alla creazione del documento) */
  senzaCampi?: boolean
  etichetta?: string
  classe?: string
}

/**
 * Editor del testo, quasi un programma di videoscrittura: stili di paragrafo (titolo, sottotitolo, titoletto, paragrafo,
 * citazione), dimensione, grassetto, corsivo, sottolineato, barrato, colore ed evidenziatore, elenchi, allineamento,
 * due colonne, tabelle, immagini, interruzioni di pagina, campi da compilare. Riconosce capitoli e titoli nel testo
 * incollato e ne mostra l'indice. Il contenuto si salva come HTML pulito (solo ciò che i formati di uscita sanno rendere).
 */
export function EditorTesto({ valore, campi, allineamento, colonne, onChange, opzioni = {} }: { valore: string; campi: Campo[]; allineamento: Allineamento; colonne: 1 | 2; onChange: (html: string) => void; opzioni?: OpzioniEditor }) {
  const ref = useRef<HTMLDivElement>(null)
  const { toast } = useFeedback()
  const [, aggiornaStato] = useState(0)
  const [indice, setIndice] = useState<{ livello: number; testo: string; i: number }[]>([])
  const [mostraIndice, setMostraIndice] = useState(false)
  const [nuovaTabella, setNuovaTabella] = useState<null | { righe: number; colonne: number; intestazione: boolean }>(null)
  const [nuovoCampo, setNuovoCampo] = useState<string | null>(null)
  const [immagineSel, setImmagineSel] = useState<HTMLImageElement | null>(null)
  const salvata = useRef<Range | null>(null)
  const fileImg = useRef<HTMLInputElement>(null)
  // il contenuto si imposta una sola volta: rimpiazzarlo a ogni battuta sposterebbe il cursore
  useEffect(() => { if (ref.current) { ref.current.innerHTML = valore; aggiornaIndice() } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const timer = useRef<number | undefined>(undefined)
  const aggiornaIndice = () => { if (ref.current) setIndice(capitoli(blocchiDaHtml(ref.current.innerHTML))) }
  const cambia = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { if (ref.current) { onChange(pulisciHtml(ref.current.innerHTML)); aggiornaIndice() } }, 300); aggiornaStato((n) => n + 1) }
  useEffect(() => () => { window.clearTimeout(timer.current); if (ref.current) onChange(pulisciHtml(ref.current.innerHTML)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const ricorda = () => { const s = window.getSelection(); if (s?.rangeCount && ref.current?.contains(s.anchorNode)) salvata.current = s.getRangeAt(0).cloneRange() }
  const ripristina = () => { const s = window.getSelection(); ref.current?.focus(); if (salvata.current && s) { s.removeAllRanges(); s.addRange(salvata.current) } }
  const cmd = (c: string, v?: string) => { ref.current?.focus(); document.execCommand(c, false, v); cambia() }
  const attivo = (c: string) => { try { return document.queryCommandState(c) } catch { return false } }
  const inserisciHtml = (h: string) => { ripristina(); document.execCommand('insertHTML', false, h); cambia() }
  const elementoCursore = () => { const s = window.getSelection(); if (!s?.rangeCount || !ref.current?.contains(s.anchorNode)) return null; const n = s.anchorNode; return (n instanceof Element ? n : n?.parentElement) || null }
  // dimensione del testo selezionato: il browser sa solo le sette misure di <font size>; si usa la 7 come segnaposto e la si sostituisce
  const dimensione = (pt: number | null) => {
    const f = ref.current; if (!f) return
    f.focus(); document.execCommand('styleWithCSS', false, 'false'); document.execCommand('fontSize', false, '7')
    for (const el of f.querySelectorAll('font[size="7"]')) { const s = document.createElement('span'); if (pt) s.style.fontSize = `${pt}pt`; s.append(...el.childNodes); el.replaceWith(s) }
    for (const el of f.querySelectorAll<HTMLElement>('span[style*="xxx-large"]')) el.style.fontSize = pt ? `${pt}pt` : ''
    cambia()
  }
  const colore = (comando: 'foreColor' | 'hiliteColor', v: string) => { ref.current?.focus(); document.execCommand('styleWithCSS', false, 'true'); document.execCommand(comando, false, v); document.execCommand('styleWithCSS', false, 'false'); cambia() }
  // sezione a due colonne: si applica ai paragrafi selezionati; dentro una sezione, la toglie
  const sezioneDi = (n: Node | null | undefined) => (n instanceof Element ? n : n?.parentElement)?.closest('[data-colonne]') as HTMLElement | null
  const inSezione = (() => { const s = window.getSelection(); return !!(s?.rangeCount && ref.current?.contains(s.anchorNode) && sezioneDi(s.anchorNode)) })()
  const dueColonne = () => {
    const f = ref.current, sel = window.getSelection()
    if (!f || !sel?.rangeCount || !f.contains(sel.anchorNode)) { f?.focus(); return }
    const r = sel.getRangeAt(0), s = sezioneDi(r.startContainer)
    if (s && s === sezioneDi(r.endContainer)) s.replaceWith(...s.childNodes)
    else {
      const toccati = [...f.childNodes].filter((n) => r.intersectsNode(n))
      if (!toccati.length) return
      const sez = document.createElement('div'); sez.dataset.colonne = '2'
      toccati[0].before(sez)
      for (const n of toccati) {
        if (n instanceof HTMLElement && n.dataset.colonne) { sez.append(...n.childNodes); n.remove() }
        else if (n.nodeType === Node.TEXT_NODE) { const p = document.createElement('p'); p.append(n); sez.append(p) }
        else sez.append(n)
      }
    }
    cambia()
  }
  // ---------- tabelle
  const cella = elementoCursore()?.closest('td, th') as HTMLTableCellElement | null
  const tabella = cella?.closest('table') as HTMLTableElement | null
  const creaTabella = (righe: number, col: number, intestazione: boolean) => {
    const riga = (tag: string) => `<tr>${Array(col).fill(`<${tag}><br></${tag}>`).join('')}</tr>`
    inserisciHtml(`<table>${intestazione ? `<thead>${riga('th')}</thead>` : ''}<tbody>${Array(Math.max(1, righe - (intestazione ? 1 : 0))).fill(riga('td')).join('')}</tbody></table><p><br></p>`)
  }
  const azioneTabella = (azione: 'riga' | 'colonna' | 'togliRiga' | 'togliColonna' | 'intestazione' | 'elimina') => {
    if (!cella || !tabella) return
    const tr = cella.parentElement as HTMLTableRowElement, idx = cella.cellIndex
    if (azione === 'riga') { const n = tr.cloneNode(true) as HTMLTableRowElement; n.querySelectorAll('th, td').forEach((c) => { const td = document.createElement('td'); td.innerHTML = '<br>'; c.replaceWith(td) }); (tr.parentElement?.tagName === 'THEAD' ? tabella.tBodies[0] || tabella.createTBody() : tr.parentElement)!.insertBefore(n, tr.parentElement?.tagName === 'THEAD' ? (tabella.tBodies[0]?.firstChild ?? null) : tr.nextSibling) }
    if (azione === 'colonna') for (const r of tabella.rows) { const ref = r.cells[idx]; const c = document.createElement(ref?.tagName === 'TH' ? 'th' : 'td'); c.innerHTML = '<br>'; ref ? ref.after(c) : r.append(c) }
    if (azione === 'togliRiga') { tr.remove(); if (!tabella.rows.length) tabella.remove() }
    if (azione === 'togliColonna') { for (const r of tabella.rows) r.cells[idx]?.remove(); if (!tabella.rows[0]?.cells.length) tabella.remove() }
    if (azione === 'intestazione') {
      const prima = tabella.rows[0]; if (!prima) return
      if (tabella.tHead) { const tb = tabella.tBodies[0] || tabella.createTBody(); const r = tabella.tHead.rows[0]; [...r.cells].forEach((c) => { const td = document.createElement('td'); td.append(...c.childNodes); c.replaceWith(td) }); tb.insertBefore(r, tb.firstChild); tabella.tHead.remove() }
      else { const th = tabella.createTHead(); [...prima.cells].forEach((c) => { const x = document.createElement('th'); x.append(...c.childNodes); c.replaceWith(x) }); th.append(prima) }
    }
    if (azione === 'elimina') tabella.remove()
    cambia()
  }
  // ---------- immagini
  const aggiungiImmagini = async (files: Blob[]) => {
    for (const f of files.filter((x) => x.type.startsWith('image/'))) {
      try { const src = await immagineCorpo(f); inserisciHtml(`<figure><img src="${src}" style="width:100%" alt=""></figure><p><br></p>`) } catch (e: any) { toast(e.message, 'err') }
    }
  }
  const larghezzaImmagine = (perc: number) => { if (!immagineSel) return; immagineSel.style.width = `${perc}%`; immagineSel.style.height = ''; cambia() }
  const allineaImmagine = (a: Allineamento) => { const fig = immagineSel?.closest('figure, p') as HTMLElement | null; if (fig) { fig.style.textAlign = CSS_ALLINEA[a]; cambia() } }
  // ---------- struttura
  const riconosci = () => {
    const f = ref.current; if (!f) return
    const { blocchi, trovati } = riconosciTitoli(blocchiDaHtml(f.innerHTML))
    if (!trovati) { toast('Nessun titolo da riconoscere: scrivi i capitoli come «CAPITOLO 1», «1. Premessa», «Art. 2» o in MAIUSCOLO'); return }
    f.innerHTML = htmlDaBlocchi(blocchi); cambia(); aggiornaIndice(); setMostraIndice(true)
    toast(trovati === 1 ? 'Riconosciuto 1 titolo' : `Riconosciuti ${trovati} titoli e capitoli`)
  }
  const vaiA = (n: number) => { const t = ref.current?.querySelectorAll('h1, h2, h3, h4')[n] as HTMLElement | undefined; t?.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (t) { const s = window.getSelection(); const r = document.createRange(); r.selectNodeContents(t); r.collapse(true); s?.removeAllRanges(); s?.addRange(r) } }
  const incolla = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const immagini = [...e.clipboardData.items].filter((x) => x.kind === 'file' && x.type.startsWith('image/')).map((x) => x.getAsFile()).filter((x): x is File => !!x)
    const h = e.clipboardData.getData('text/html'), t = e.clipboardData.getData('text/plain')
    if (!h && immagini.length) { aggiungiImmagini(immagini); return }
    if (h) document.execCommand('insertHTML', false, pulisciHtml(h))
    else if (/\n/.test(t.trim())) document.execCommand('insertHTML', false, htmlDaBlocchi(blocchiDaTestoStrutturato(t)))
    else document.execCommand('insertText', false, t)
    cambia(); aggiornaIndice()
  }
  const blocco = (() => { try { return String(document.queryCommandValue('formatBlock') || 'p').toLowerCase() } catch { return 'p' } })()
  const ptAttuale = (() => { const el = elementoCursore(); if (!el) return ''; const v = parseFloat(getComputedStyle(el).fontSize) * 0.75; return el.closest('[style*="font-size"]') ? String(Math.round(v * 2) / 2) : '' })()
  const gruppi = [...new Set(campi.map((c) => c.gruppo))]
  const noti = useMemo(() => new Set(campi.map((c) => c.id)), [campi])
  const personali = [...new Set(opzioni.campiPersonali || [])].filter((c) => !noti.has(c))
  const bottone = (titolo: string, attivoOra: boolean, fn: () => void, icona: React.ReactNode) => <button type="button" className={`tool ${attivoOra ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={fn} title={titolo} aria-label={titolo} aria-pressed={attivoOra}>{icona}</button>
  return <div className={`editor-testo ${opzioni.classe || ''}`}>
    <div className="editor-barra" role="toolbar" aria-label="Formattazione">
      <div className="tool-group">
        {bottone('Annulla (⌘Z)', false, () => cmd('undo'), <Undo2 size={14} />)}
        {bottone('Ripeti', false, () => cmd('redo'), <Redo2 size={14} />)}
      </div>
      <select value={['h1', 'h2', 'h3', 'h4', 'blockquote'].includes(blocco) ? blocco : 'p'} onChange={(e) => cmd('formatBlock', e.target.value)} aria-label="Stile del paragrafo">
        <option value="p">Testo normale</option><option value="h1">Titolo (capitolo)</option><option value="h2">Sottotitolo</option><option value="h3">Titoletto</option><option value="h4">Paragrafo</option><option value="blockquote">Citazione</option>
      </select>
      <select value={ptAttuale} onMouseDown={ricorda} onChange={(e) => { ripristina(); dimensione(e.target.value ? Number(e.target.value) : null) }} aria-label="Dimensione del testo selezionato" title="Dimensione del testo selezionato">
        <option value="">Dimensione</option>{DIMENSIONI.map((n) => <option key={n} value={n}>{n} pt{n >= 40 ? ' · grandissimo' : ''}</option>)}
      </select>
      <div className="tool-group">
        {bottone('Grassetto (⌘B)', attivo('bold'), () => cmd('bold'), <Bold size={14} />)}
        {bottone('Corsivo (⌘I)', attivo('italic'), () => cmd('italic'), <Italic size={14} />)}
        {bottone('Sottolineato (⌘U)', attivo('underline'), () => cmd('underline'), <Underline size={14} />)}
        {bottone('Barrato', attivo('strikeThrough'), () => cmd('strikeThrough'), <Strikethrough size={14} />)}
      </div>
      <div className="tool-group">
        <input type="color" aria-label="Colore del testo" title="Colore del testo" defaultValue="#1f3a5f" onMouseDown={ricorda} onChange={(e) => { ripristina(); colore('foreColor', e.target.value) }} />
        {bottone('Evidenzia in giallo', false, () => colore('hiliteColor', '#fff3b0'), <Highlighter size={14} />)}
        {bottone('Togli la formattazione', false, () => { cmd('removeFormat'); colore('hiliteColor', 'transparent') }, <Eraser size={14} />)}
      </div>
      <div className="tool-group">
        {bottone('Elenco puntato', attivo('insertUnorderedList'), () => cmd('insertUnorderedList'), <List size={14} />)}
        {bottone('Elenco numerato', attivo('insertOrderedList'), () => cmd('insertOrderedList'), <ListOrdered size={14} />)}
      </div>
      <div className="tool-group">
        {([['justifyLeft', AlignLeft, 'a sinistra'], ['justifyCenter', AlignCenter, 'al centro'], ['justifyRight', AlignRight, 'a destra'], ['justifyFull', AlignJustify, 'giustificato']] as const).map(([c, Icon, t]) =>
          <span key={c}>{bottone(`Allinea ${t}`, attivo(c), () => cmd(c), <Icon size={14} />)}</span>)}
      </div>
      <button type="button" className={`btn btn-soft btn-sm editor-colonne${inSezione ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={dueColonne} aria-pressed={inSezione}
        title={inSezione ? 'Riporta questa parte a una colonna' : 'Metti su due colonne i paragrafi selezionati'}><Columns2 size={14} aria-hidden /> {inSezione ? 'Una colonna' : 'Due colonne'}</button>
      <div className="tool-group">
        {bottone('Inserisci una tabella', false, () => { ricorda(); setNuovaTabella({ righe: 3, colonne: 3, intestazione: true }) }, <Table size={14} />)}
        {bottone('Inserisci un’immagine', false, () => { ricorda(); fileImg.current?.click() }, <ImagePlus size={14} />)}
        {bottone('Interruzione di pagina: il testo dopo va sulla pagina seguente', false, () => inserisciHtml('<hr data-interruzione="1"><p><br></p>'), <Scissors size={14} />)}
      </div>
      <div className="tool-group">
        {bottone('Riconosci titoli e capitoli nel testo', false, riconosci, <Wand2 size={14} />)}
        {bottone(mostraIndice ? 'Nascondi l’indice dei capitoli' : 'Mostra l’indice dei capitoli', mostraIndice, () => { aggiornaIndice(); setMostraIndice((x) => !x) }, <ListTree size={14} />)}
      </div>
      <input ref={fileImg} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden multiple onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; aggiungiImmagini(f) }} />
      {!opzioni.senzaCampi && <select className="editor-campi" value="" onMouseDown={ricorda} onChange={(e) => { const v = e.target.value; if (v === '__nuovo') { setNuovoCampo(''); return } if (v) { ripristina(); cmd('insertText', `{{${v}}}`) } }} aria-label="Inserisci un campo">
        <option value="">Inserisci campo…</option>
        <option value="__nuovo">+ Nuovo campo personalizzato…</option>
        {personali.length > 0 && <optgroup label="I tuoi campi">{personali.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>}
        {gruppi.map((g) => <optgroup key={g} label={g}>{campi.filter((c) => c.gruppo === g).map((c) => <option key={c.id} value={c.id}>{c.etichetta}</option>)}</optgroup>)}
      </select>}
    </div>
    {tabella && <div className="editor-barra editor-barra-contesto" role="toolbar" aria-label="Tabella">
      <span className="small muted">Tabella:</span>
      <Btn size="sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => azioneTabella('riga')}>+ Riga sotto</Btn>
      <Btn size="sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => azioneTabella('colonna')}>+ Colonna a destra</Btn>
      <Btn size="sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => azioneTabella('togliRiga')}>− Riga</Btn>
      <Btn size="sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => azioneTabella('togliColonna')}>− Colonna</Btn>
      <Btn size="sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => azioneTabella('intestazione')}>{tabella.tHead ? 'Togli riga d’intestazione' : 'Prima riga come intestazione'}</Btn>
      <Btn size="sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => azioneTabella('elimina')}><Trash2 size={13} /> Elimina tabella</Btn>
    </div>}
    {immagineSel && ref.current?.contains(immagineSel) && <div className="editor-barra editor-barra-contesto" role="toolbar" aria-label="Immagine">
      <span className="small muted">Immagine, larghezza:</span>
      {[25, 50, 75, 100].map((p) => <Btn key={p} size="sm" variant="ghost" onClick={() => larghezzaImmagine(p)}>{p}%</Btn>)}
      <div className="tool-group">{([['sinistra', AlignLeft], ['centro', AlignCenter], ['destra', AlignRight]] as const).map(([a, Icon]) => <span key={a}>{bottone(`Immagine a ${a}`, false, () => allineaImmagine(a), <Icon size={14} />)}</span>)}</div>
      <Btn size="sm" variant="ghost" onClick={() => { (immagineSel.closest('figure') || immagineSel).remove(); setImmagineSel(null); cambia() }}><Trash2 size={13} /> Elimina immagine</Btn>
    </div>}
    <div className={mostraIndice ? 'editor-con-indice' : undefined}>
      {mostraIndice && <nav className="indice-capitoli" aria-label="Indice dei capitoli">
        <b className="small">Indice</b>
        {indice.length ? <ol>{indice.map((c, n) => <li key={n}><button type="button" className={`liv-${c.livello}`} onClick={() => vaiA(n)}>{c.testo}</button></li>)}</ol> : <p className="muted small">Nessun titolo. Usa gli stili «Titolo» e «Sottotitolo», oppure «Riconosci titoli e capitoli».</p>}
      </nav>}
      <div ref={ref} className={`editor-foglio${colonne === 2 ? ' due-colonne' : ''}`} style={{ textAlign: CSS_ALLINEA[allineamento] as 'left' }} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={opzioni.etichetta || 'Testo del documento'} spellCheck lang="it"
        onInput={cambia} onKeyUp={() => aggiornaStato((n) => n + 1)} onMouseUp={() => aggiornaStato((n) => n + 1)} onBlur={ricorda}
        onClick={(e) => setImmagineSel(e.target instanceof HTMLImageElement ? e.target : null)}
        onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault() }}
        onDrop={(e) => { const f = [...e.dataTransfer.files].filter((x) => x.type.startsWith('image/')); if (f.length) { e.preventDefault(); e.stopPropagation(); aggiungiImmagini(f) } }}
        onPaste={incolla} />
    </div>
    {!opzioni.senzaCampi && <p className="muted small"><Braces size={12} aria-hidden /> I campi tra doppie graffe, come {'{{destinatario.nome}}'}, si compilano quando crei il documento. Con «+ Nuovo campo personalizzato…» ne inventi di nuovi, per esempio {'{{n.giorni}}'} o {'{{compenso}}'}: TIO te li chiederà. {'{{corpo.documento}}'} lascia il posto a un testo lungo da incollare al momento.</p>}
    {nuovaTabella && <Modal title="Nuova tabella" width={420} onClose={() => setNuovaTabella(null)} protectChanges={false}
      footer={<><Btn variant="ghost" onClick={() => setNuovaTabella(null)}>Annulla</Btn><Btn variant="primary" onClick={() => { const t = nuovaTabella; setNuovaTabella(null); creaTabella(t.righe, t.colonne, t.intestazione) }}>Inserisci</Btn></>}>
      <div className="row wrap">
        <Field label="Righe"><Input type="number" min={1} max={100} value={nuovaTabella.righe} onChange={(e) => setNuovaTabella({ ...nuovaTabella, righe: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
        <Field label="Colonne"><Input type="number" min={1} max={12} value={nuovaTabella.colonne} onChange={(e) => setNuovaTabella({ ...nuovaTabella, colonne: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={nuovaTabella.intestazione} onChange={(e) => setNuovaTabella({ ...nuovaTabella, intestazione: e.target.checked })} /> Prima riga d’intestazione (si ripete su ogni pagina)</label>
    </Modal>}
    {nuovoCampo !== null && <Modal title="Nuovo campo personalizzato" subtitle="Un’etichetta da compilare quando crei il documento, per esempio «n.giorni» o «compenso»" width={460} onClose={() => setNuovoCampo(null)} protectChanges={false}
      footer={<><Btn variant="ghost" onClick={() => setNuovoCampo(null)}>Annulla</Btn><Btn variant="primary" disabled={!nomeCampoValido(nuovoCampo)} onClick={() => { const n = nuovoCampo.trim(); setNuovoCampo(null); opzioni.onNuovoCampo?.(n); ripristina(); document.execCommand('insertText', false, `{{${n}}}`); cambia() }}>Inserisci {nuovoCampo.trim() ? `{{${nuovoCampo.trim()}}}` : 'il campo'}</Btn></>}>
      <Field label="Nome del campo" hint="Lettere, numeri, spazi, punti e trattini (massimo 60 caratteri)"><Input autoFocus value={nuovoCampo} onChange={(e) => setNuovoCampo(e.target.value)} placeholder="Es. n.giorni" maxLength={60} /></Field>
      <p className="muted small">Nel testo comparirà come {`{{${nuovoCampo.trim() || 'nome'}}}`}, per esempio «entro {'{{n.giorni}}'} giorni» oppure «compenso di € {'{{compenso}}'}».</p>
    </Modal>}
  </div>
}
