// Font dei modelli (documenti di vendita e sezione Documenti): quelli di serie, quelli importati da file
// (incorporati nel PDF) e quelli installati sul computer, scelti per nome.
import { useEffect, useMemo, useRef, useState } from 'react'
import { HardDrive, Plus, Search, Trash2 } from 'lucide-react'
import { Btn, Modal, useFeedback } from './ui'
import { FONT_DOCUMENTO, MAX_FONT_SISTEMA, NOME_FONT, fontSistemaValidi, fontValidi, idSistema, leggiFont } from '../lib/font-documento'
import type { FontDocumento, RigaModello } from '../types'

interface ConFont { fontDocumento?: string; fontPersonali?: FontDocumento[]; fontSistema?: string[] }

/** Voci del menu dei font: di serie, importati da file e installati sul computer. */
export function OpzioniFont({ m }: { m: ConFont }) {
  const personali = fontValidi(m.fontPersonali), sistema = fontSistemaValidi(m.fontSistema)
  return <>
    {FONT_DOCUMENTO.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
    {personali.map((f) => <option key={f.id} value={f.id}>{f.nome} · da file</option>)}
    {sistema.map((n) => <option key={n} value={idSistema(n)}>{n} · del computer</option>)}
  </>
}

/** Il font è installato? Confronta la larghezza di un testo con quella dei caratteri generici di riserva. */
export function fontInstallato(nome: string): boolean {
  try {
    const c = document.createElement('canvas').getContext('2d'); if (!c) return true
    const t = 'mmmmmmmmmmlli1WQ@#àè'
    return ['monospace', 'serif', 'sans-serif'].some((b) => { c.font = `72px ${b}`; const w = c.measureText(t).width; c.font = `72px "${nome}",${b}`; return c.measureText(t).width !== w })
  } catch { return true }
}

/**
 * Aggiunta e rimozione dei font del modello. `righe` sono i blocchi di testo del modello: togliendo un font,
 * le righe che lo usavano tornano al carattere del documento.
 */
export function GestioneFont<T extends ConFont>({ value, righe, onChange }: { value: T; righe: (keyof T)[]; onChange: (patch: Partial<T>) => void }) {
  const { toast } = useFeedback()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importando, setImportando] = useState(false)
  const [computer, setComputer] = useState(false)
  const personali = fontValidi(value.fontPersonali), sistema = fontSistemaValidi(value.fontSistema)
  const daFile = async (file?: File) => {
    if (!file || importando) return
    setImportando(true)
    try {
      const font = await leggiFont(file, personali)
      onChange({ fontPersonali: [...personali, font], fontDocumento: font.id } as Partial<T>)
      toast('Font importato e applicato al documento')
    } catch (error: any) { toast(error.message, 'err') } finally { setImportando(false) }
  }
  const aggiungiSistema = (nome: string) => {
    const n = nome.trim()
    if (!NOME_FONT.test(n)) { toast('Il nome del font può contenere solo lettere, cifre, spazi e trattini.', 'err'); return }
    if (!sistema.includes(n) && sistema.length >= MAX_FONT_SISTEMA) { toast(`Puoi aggiungere fino a ${MAX_FONT_SISTEMA} font del computer. Rimuovine uno per continuare.`, 'err'); return }
    onChange({ fontSistema: sistema.includes(n) ? sistema : [...sistema, n], fontDocumento: idSistema(n) } as Partial<T>)
    setComputer(false)
    toast(`«${n}» applicato al documento`)
  }
  const rimuovi = (id: string, patch: Partial<T>) => onChange({
    ...patch, fontDocumento: value.fontDocumento === id ? 'arial' : value.fontDocumento,
    ...Object.fromEntries(righe.map((b) => [b, ((value[b] as RigaModello[] | undefined) || []).map((r) => (r.font === id ? { ...r, font: undefined } : r))])),
  } as Partial<T>)
  const palace = value.fontDocumento === 'palace-script' || righe.some((b) => ((value[b] as RigaModello[] | undefined) || []).some((r) => r.font === 'palace-script'))
  const palaceMancante = useMemo(() => palace && !fontInstallato('Palace Script MT'), [palace])
  return <>
    <div className="row wrap">
      <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" hidden aria-label="Importa font personale" onChange={(e) => { daFile(e.target.files?.[0]); e.target.value = '' }} />
      <Btn size="sm" disabled={importando} onClick={() => fileRef.current?.click()} title="Il font viene incorporato nel PDF: si vede uguale su ogni computer"><Plus size={14} /> {importando ? 'Importazione…' : 'Importa font da file…'}</Btn>
      <Btn size="sm" onClick={() => setComputer(true)} title="Scegli un font già installato su questo computer, per esempio Palace Script MT"><HardDrive size={14} /> Font del computer…</Btn>
    </div>
    <p className="muted small modello-aiuto">Da file: TTF, OTF, WOFF o WOFF2 fino a 2 MB, incorporati nel PDF (usa font la cui licenza lo consente). Del computer: usati per nome, come in Word; chi apre il file Word deve averli installati.</p>
    {palaceMancante && <p className="settings-inline-notice small">Palace Script MT non risulta installato su questo computer (su Windows arriva con Microsoft Office): l’anteprima e il PDF usano un corsivo simile. Per averlo identico ovunque importalo con «Importa font da file…».</p>}
    {(personali.length > 0 || sistema.length > 0) && <ul className="modello-font-list">
      {personali.map((f) => <li key={f.id}><span>{f.nome} <small className="muted">· da file</small></span><Btn size="sm" variant="ghost" aria-label={`Rimuovi font ${f.nome}`} onClick={() => rimuovi(f.id, { fontPersonali: personali.filter((x) => x.id !== f.id) } as Partial<T>)}><Trash2 size={14} /> Rimuovi</Btn></li>)}
      {sistema.map((n) => <li key={n}><span><span style={{ fontFamily: `"${n}"` }}>{n}</span> <small className="muted">· del computer{fontInstallato(n) ? '' : ' · non installato qui'}</small></span><Btn size="sm" variant="ghost" aria-label={`Rimuovi font ${n}`} onClick={() => rimuovi(idSistema(n), { fontSistema: sistema.filter((x) => x !== n) } as Partial<T>)}><Trash2 size={14} /> Rimuovi</Btn></li>)}
    </ul>}
    {computer && <FontComputer presenti={sistema} onScegli={aggiungiSistema} onClose={() => setComputer(false)} />}
  </>
}

/** Elenco dei font installati (Local Font Access di Chromium), con ricerca; in alternativa si scrive il nome. */
function FontComputer({ presenti, onScegli, onClose }: { presenti: string[]; onScegli: (nome: string) => void; onClose: () => void }) {
  const [famiglie, setFamiglie] = useState<string[] | null>(null)
  const [errore, setErrore] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const leggi = (window as any).queryLocalFonts as undefined | (() => Promise<{ family: string }[]>)
    if (!leggi) { setFamiglie([]); setErrore('Elenco non disponibile: scrivi il nome del font qui sotto.'); return }
    leggi().then((l) => setFamiglie([...new Set(l.map((f) => f.family).filter((n) => NOME_FONT.test(n)))].sort((a, b) => a.localeCompare(b, 'it'))))
      .catch(() => { setFamiglie([]); setErrore('Non è stato possibile leggere i font del computer: scrivi il nome del font qui sotto.') })
  }, [])
  const filtrate = (famiglie || []).filter((n) => n.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 300)
  const esatto = q.trim() && !famiglie?.some((n) => n.toLowerCase() === q.trim().toLowerCase())
  return <Modal title="Font del computer" subtitle="Scegli un font installato: lo trovi poi nei menu dei caratteri del modello" width={560} onClose={onClose} protectChanges={false}>
    <div className="font-computer">
      <label className="font-computer-cerca"><Search size={15} aria-hidden /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca o scrivi il nome, es. Palace Script MT" aria-label="Cerca un font" onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) onScegli(filtrate[0] && !esatto ? filtrate[0] : q) }} /></label>
      {errore && <p className="muted small">{errore}</p>}
      {famiglie === null ? <p className="muted small">Lettura dei font installati…</p>
        : <ul className="font-computer-elenco" aria-label="Font installati">
          {filtrate.map((n) => <li key={n}><button type="button" onClick={() => onScegli(n)} aria-current={presenti.includes(n) ? 'true' : undefined}><span style={{ fontFamily: `"${n}"` }}>{n}</span><small className="muted">{n}</small></button></li>)}
          {!filtrate.length && famiglie.length > 0 && <li className="muted small">Nessun font con questo nome.</li>}
        </ul>}
      {esatto && <Btn size="sm" onClick={() => onScegli(q)}><Plus size={14} /> Usa «{q.trim()}»{fontInstallato(q.trim()) ? '' : ' (non installato qui)'}</Btn>}
    </div>
  </Modal>
}
