import { useEffect, useMemo, useRef, useState } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Braces, Columns2, Copy, Download, FilePlus2, FileUp, Italic, List, ListOrdered, Plus, Trash2, Underline, Wand2 } from 'lucide-react'
import { api, type InfoWord } from '../api'
import { useData } from '../store'
import { Btn, Field, Input, Modal, PageHeader, Segmented, Select, Tabs, useAction, useFeedback } from '../components/ui'
import { CreaDocumentoModal } from '../components/CreaDocumento'
import { AnteprimaNota, ImmagineBlocco, RigheEditor } from '../components/ModelloPdfEditor'
import { GestioneFont, OpzioniFont } from '../components/SceltaFont'
import { modelloEffettivo } from '../lib/modello'
import { CSS_ALLINEA, MARGINI_PREDEFINITI, campiDisponibili, duplicaModello, documentoHtml, modelliPredefiniti, modelloPersonalizzato, nuovoModello, predefinitiMancanti, pulisciHtml, rigaVuota, tipiDocumento, valoriCampi, type Campo } from '../lib/documento'
import type { Allineamento, ModelloDocumento, Settings } from '../types'

const tipiPer = tipiDocumento

export default function Documenti() {
  const { settings } = useData()
  const run = useAction()
  const { toast, confirm } = useFeedback()
  // copia locale: si scrive subito sullo schermo e si salva poco dopo, senza perdere battute mentre arriva l'aggiornamento
  // alla prima apertura la sezione parte con i modelli predefiniti del profilo, già salvati e modificabili
  const [modelli, setModelli] = useState<ModelloDocumento[]>(() => settings.modelli_documento ?? modelliPredefiniti(settings))
  const [scelto, setScelto] = useState<string | null>(() => (settings.modelli_documento ?? modelli)[0]?.id ?? null)
  useEffect(() => { if (settings.modelli_documento === undefined) api.setSettings({ modelli_documento: modelli }).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [stato, setStato] = useState<'salvato' | 'in-salvataggio' | ''>('')
  const [nuovo, setNuovo] = useState(false)
  const [crea, setCrea] = useState<ModelloDocumento | null>(null)
  const schedaIniziale = useRef<Record<string, Scheda>>({})
  const timer = useRef<number | undefined>(undefined)
  const daSalvare = useRef<ModelloDocumento[] | null>(null)
  const salva = (lista: ModelloDocumento[], subito = false) => {
    setModelli(lista); daSalvare.current = lista; setStato('in-salvataggio')
    window.clearTimeout(timer.current)
    const esegui = async () => { const l = daSalvare.current; if (!l) return; daSalvare.current = null; await run(() => api.setSettings({ modelli_documento: l })); setStato('salvato') }
    if (subito) esegui(); else timer.current = window.setTimeout(esegui, 500)
  }
  // uscendo dalla sezione si salva ciò che è rimasto in sospeso
  useEffect(() => () => { window.clearTimeout(timer.current); if (daSalvare.current) api.setSettings({ modelli_documento: daSalvare.current }).catch(() => {}) }, [])
  const m = modelli.find((x) => x.id === scelto) || null
  const aggiorna = (patch: Partial<ModelloDocumento>) => m && salva(modelli.map((x) => (x.id === m.id ? { ...x, ...patch, aggiornato: new Date().toISOString() } : x)))
  const aggiungi = (x: ModelloDocumento) => { salva([...modelli, x], true); setScelto(x.id); setNuovo(false) }
  const elimina = async () => {
    if (!m || !await confirm({ title: `Eliminare il modello «${m.nome}»?`, text: 'I documenti già creati restano dove li hai salvati.', ok: 'Elimina', danger: true })) return
    if (m.word) await run(() => api.eliminaModelloWord(m.id))
    const resto = modelli.filter((x) => x.id !== m.id); salva(resto, true); setScelto(resto[0]?.id ?? null); toast('Modello eliminato')
  }
  // modelli Word: il file entra nell'archivio, qui resta la scheda con nome, tipo e campi
  const importaWord = async () => {
    const info = await run(() => api.importaModelloWord()); if (!info) return
    aggiungi({ ...nuovoModello(settings, 'Documento libero', info.nome), id: info.id, tipo: 'Modello Word', word: true, campiWord: info.campi, corpo: '', predefinito: false })
    toast(info.campi.length ? `Modello importato: ${info.campi.length} campi trovati` : 'Modello importato: aggiungi i campi tra doppie graffe nel file Word')
  }
  const duplicaWord = async () => {
    if (!m) return
    const nuovo = 'word-' + crypto.randomUUID()
    if (await run(() => api.duplicaModelloWord(m.id, nuovo))) aggiungi({ ...structuredClone(m), id: nuovo, nome: `${m.nome} (copia)`, predefinito: false, aggiornato: new Date().toISOString() })
  }
  const daZero = (nome: string, conIntestazione: boolean) => { const x = modelloPersonalizzato(settings, nome, conIntestazione); schedaIniziale.current[x.id] = 'impaginazione'; aggiungi(x) }
  const mancanti = predefinitiMancanti(settings, modelli)
  // i modelli pronti e quelli creati dall'utente, ciascuno in ordine alfabetico
  const gruppi = useMemo(() => {
    const ordina = (l: ModelloDocumento[]) => [...l].sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
    return ([['Modelli predefiniti', ordina(modelli.filter((x) => x.predefinito))], ['I miei modelli', ordina(modelli.filter((x) => !x.predefinito))]] as const).filter(([, l]) => l.length)
  }, [modelli])

  return (
    <div className="page documenti-pagina">
      <PageHeader title="Documenti" eyebrow="Strumenti" subtitle="Modelli per lettere, preventivi e qualsiasi altro documento, con la tua intestazione e il tuo piè di pagina. Crea il file in Word, PDF e altri formati, già compilato con i dati dell’archivio."
        actions={<>{stato && <span className="muted small" role="status">{stato === 'salvato' ? 'Modifiche salvate' : 'Salvataggio…'}</span>}{mancanti.length > 0 && <Btn variant="ghost" onClick={() => { salva([...modelli, ...mancanti], true); setScelto(mancanti[0].id); toast(mancanti.length === 1 ? 'Aggiunto un modello predefinito' : `Aggiunti ${mancanti.length} modelli predefiniti`) }} title="Rimette i modelli pronti che hai eliminato">Aggiungi i predefiniti</Btn>}<Btn variant="ghost" onClick={importaWord} title="Usa come modello un tuo documento Word, per esempio la carta intestata dello studio"><FileUp size={15} /> Importa da Word…</Btn><Btn variant="primary" onClick={() => setNuovo(true)}><Plus size={15} /> Nuovo modello</Btn></>} />
      {!modelli.length
        ? <ScegliTipo settings={settings} onScegli={(t) => aggiungi(nuovoModello(settings, t))} intro onDaZero={daZero} />
        : <div className="documenti-lavoro">
          <div className="documenti-scelta">
            <Field label="Modello predefinito" hint={`${modelli.length} ${modelli.length === 1 ? 'modello' : 'modelli'}: scegli quello da modificare o da usare`}>
              <Select value={scelto ?? ''} onChange={(e) => setScelto(e.target.value)} aria-label="Modello da modificare">
                {!m && <option value="">Scegli un modello…</option>}
                {gruppi.map(([g, lista]) => <optgroup key={g} label={g}>{lista.map((x) => <option key={x.id} value={x.id}>{x.nome}{x.nome.trim().toLowerCase() !== x.tipo.toLowerCase() ? ` · ${x.tipo}` : ''}</option>)}</optgroup>)}
              </Select>
            </Field>
          </div>
          {m ? m.word
            ? <EditorWord key={m.id} m={m} settings={settings} onChange={aggiorna} onCrea={() => setCrea(m)} onDuplica={duplicaWord} onElimina={elimina} />
            : <Editor key={m.id} m={m} settings={settings} schedaIniziale={schedaIniziale.current[m.id]} onChange={aggiorna} onCrea={() => setCrea(m)} onDuplica={() => aggiungi(duplicaModello(m))} onElimina={elimina} /> : <p className="muted">Scegli un modello dal menu.</p>}
        </div>}
      {nuovo && <Modal title="Nuovo modello" subtitle="Crea un modello tutto tuo partendo da zero, oppure parti da un testo pronto con l’intestazione e il piè di pagina dei tuoi documenti di vendita" width={760} onClose={() => setNuovo(false)} protectChanges={false}>
        <ModelloDaZero onCrea={daZero} />
        <ScegliTipo settings={settings} onScegli={(t) => aggiungi(nuovoModello(settings, t))} />
      </Modal>}
      {crea && <CreaDocumentoModal m={crea} onClose={() => setCrea(null)} />}
    </div>
  )
}

/** Modello personalizzato: un nome, una pagina bianca e l'impaginazione da decidere (margini, testo, intestazione e piè di pagina). */
function ModelloDaZero({ onCrea }: { onCrea: (nome: string, conIntestazione: boolean) => void }) {
  const [nome, setNome] = useState('')
  const [conIntestazione, setConIntestazione] = useState(false)
  const crea = () => nome.trim() && onCrea(nome.trim(), conIntestazione)
  return <section className="documenti-da-zero">
    <h3>Modello personalizzato</h3>
    <p className="muted small">Una pagina bianca con il nome che scegli: decidi tu margini, dimensione del testo, intestazione in cima alla pagina e piè di pagina.</p>
    <div className="row wrap documenti-da-zero-riga">
      <Field label="Nome del modello"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Delega al collega" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') crea() }} /></Field>
      <Btn variant="primary" disabled={!nome.trim()} onClick={crea}><Plus size={15} /> Crea modello</Btn>
    </div>
    <label className="check"><input type="checkbox" checked={conIntestazione} onChange={(e) => setConIntestazione(e.target.checked)} /> Parti con intestazione, piè di pagina e font dei documenti di vendita</label>
    <p className="nav-section documenti-oppure">Oppure parti da un testo pronto</p>
  </section>
}

function ScegliTipo({ settings, onScegli, intro, onDaZero }: { settings: Settings; onScegli: (tipo: string) => void; intro?: boolean; onDaZero?: (nome: string, conIntestazione: boolean) => void }) {
  return <section className={intro ? 'card documenti-intro' : ''}>
    {intro && <><h2>Crea il primo modello</h2>{onDaZero && <ModelloDaZero onCrea={onDaZero} />}<p className="muted">Scegli il tipo di documento: troverai un testo di partenza da adattare, l’intestazione e il piè di pagina dei tuoi documenti di vendita e i campi che TIO compila da solo.</p></>}
    <div className="documenti-tipi">
      {tipiPer(settings).map((t) => <button key={t.tipo} type="button" className="documenti-tipo" onClick={() => onScegli(t.tipo)}><FilePlus2 size={20} aria-hidden /><b>{t.tipo}</b><span className="muted small">{t.descrizione}</span></button>)}
    </div>
  </section>
}

type Scheda = 'contenuto' | 'intestazione' | 'piede' | 'impaginazione'

function Editor({ m, settings, schedaIniziale, onChange, onCrea, onDuplica, onElimina }: { m: ModelloDocumento; settings: Settings; schedaIniziale?: Scheda; onChange: (p: Partial<ModelloDocumento>) => void; onCrea: () => void; onDuplica: () => void; onElimina: () => void }) {
  const [scheda, setScheda] = useState<Scheda>(schedaIniziale || 'contenuto')
  const opzioniFont = <OpzioniFont m={m} />
  const margini = { ...MARGINI_PREDEFINITI, ...m.margini }
  const setMargine = (k: keyof typeof margini, v: number) => onChange({ margini: { ...margini, [k]: Math.min(60, Math.max(5, Math.round(v) || MARGINI_PREDEFINITI[k])) } })
  // anteprima: i dati dell'attività sono veri, quelli di destinatario e pratica restano campi evidenziati
  const valori = useMemo(() => Object.fromEntries(Object.entries(valoriCampi(settings, {})).filter(([k]) => k.startsWith('studio.') || k === 'oggi' || k === 'luogo')), [settings])
  const [html, setHtml] = useState(() => documentoHtml(m, { valori }))
  useEffect(() => { const t = window.setTimeout(() => setHtml(documentoHtml(m, { valori })), 350); return () => window.clearTimeout(t) }, [m, valori])
  const daParcelle = () => { const p = modelloEffettivo(settings); onChange({ intestazione: p.intestazione, footer: p.footer, logo: p.logo, logoAltezza: p.logoAltezza, logoAllineamento: p.logoAllineamento, immagineFooter: p.immagineFooter, immagineFooterAltezza: p.immagineFooterAltezza, immagineFooterAllineamento: p.immagineFooterAllineamento, fontDocumento: p.fontDocumento, fontPersonali: p.fontPersonali, fontSistema: p.fontSistema }) }
  return (
    <div className="documenti-editor">
      <div className="documenti-form">
        <TestaModello m={m} settings={settings} onChange={onChange} onCrea={onCrea} onDuplica={onDuplica} onElimina={onElimina} />
        <Tabs value={scheda} onChange={setScheda} tabs={[{ id: 'contenuto', label: 'Contenuto' }, { id: 'intestazione', label: 'Intestazione' }, { id: 'piede', label: 'Piè di pagina' }, { id: 'impaginazione', label: 'Impaginazione' }]} />
        {scheda === 'contenuto' && <>
          <div className="documenti-disposizione" role="group" aria-label="Disposizione del testo">
            <span className="small">Disposizione del testo</span>
            <Segmented value={m.allineamento || 'sinistra'} onChange={(allineamento: Allineamento) => onChange({ allineamento })} options={[
              { id: 'sinistra', label: <AlignLeft size={15} aria-hidden />, title: 'Testo a sinistra' }, { id: 'centro', label: <AlignCenter size={15} aria-hidden />, title: 'Testo al centro' },
              { id: 'destra', label: <AlignRight size={15} aria-hidden />, title: 'Testo a destra' }, { id: 'giustificato', label: <AlignJustify size={15} aria-hidden />, title: 'Testo giustificato' }]} />
            <button type="button" className={`btn btn-soft btn-sm${m.colonne === 2 ? ' on' : ''}`} aria-pressed={m.colonne === 2} onClick={() => onChange({ colonne: m.colonne === 2 ? 1 : 2 })}><Columns2 size={15} aria-hidden /> Tutto su due colonne</button>
            <span className="muted small">Dalla barra qui sotto puoi allineare i singoli paragrafi e mettere su due colonne solo una parte del testo.</span>
          </div>
          <EditorTesto valore={m.corpo} campi={campiDisponibili(settings)} allineamento={m.allineamento || 'sinistra'} colonne={m.colonne === 2 ? 2 : 1} onChange={(corpo) => onChange({ corpo })} />
        </>}
        {scheda === 'intestazione' && <section className="modello-blocco">
          <header><div><h3>Intestazione</h3><p className="muted small">Si ripete in cima a ogni pagina. Puoi usare i campi, per esempio {'{{studio.nome}}'}.</p></div></header>
          <ImmagineBlocco titolo="Intestazione" src={m.logo} altezza={m.logoAltezza} allineamento={m.logoAllineamento} max={140} onChange={(logo, logoAltezza, logoAllineamento) => onChange({ logo, logoAltezza, logoAllineamento })} />
          <RigheEditor righe={m.intestazione} titolo="Intestazione" opzioniFont={opzioniFont} nuova={() => rigaVuota()} onChange={(intestazione) => onChange({ intestazione })} />
          <Btn size="sm" variant="ghost" className="btn-a-capo" onClick={daParcelle} title="Copia in questo modello intestazione, piè di pagina, immagini e font del modello dei documenti di vendita (Impostazioni › Modello PDF)">Usa intestazione, piè di pagina e font dei documenti di vendita</Btn>
        </section>}
        {scheda === 'piede' && <section className="modello-blocco">
          <header><div><h3>Piè di pagina</h3><p className="muted small">In fondo a ogni pagina: sede, recapiti, codice fiscale e partita IVA…</p></div></header>
          <ImmagineBlocco titolo="Piè di pagina" src={m.immagineFooter || null} altezza={m.immagineFooterAltezza ?? 36} allineamento={m.immagineFooterAllineamento || 'centro'} max={64} onChange={(immagineFooter, immagineFooterAltezza, immagineFooterAllineamento) => onChange({ immagineFooter, immagineFooterAltezza, immagineFooterAllineamento })} />
          <RigheEditor righe={m.footer} titolo="Piè di pagina" opzioniFont={opzioniFont} nuova={() => rigaVuota({ dimensione: 'piccola' })} onChange={(footer) => onChange({ footer })} />
        </section>}
        {scheda === 'impaginazione' && <>
          <section className="modello-blocco">
            <header><div><h3>Carattere</h3><p className="muted small">Font e dimensione del testo del documento. Su ogni riga di intestazione e piè di pagina puoi sceglierne un altro.</p></div></header>
            <div className="row wrap modello-font-controlli">
              <Field label="Carattere del documento"><Select value={m.fontDocumento || 'arial'} onChange={(e) => onChange({ fontDocumento: e.target.value })}>{opzioniFont}</Select></Field>
              <Field label="Dimensione del testo"><Select value={String(m.corpoPt ?? 11)} onChange={(e) => onChange({ corpoPt: Number(e.target.value) })}>{[9, 10, 10.5, 11, 12, 13, 14].map((n) => <option key={n} value={n}>{String(n).replace('.', ',')} pt</option>)}</Select></Field>
            </div>
            <GestioneFont value={m} righe={['intestazione', 'footer']} onChange={onChange} />
          </section>
          <section className="modello-blocco">
            <header><div><h3>Margini della pagina</h3><p className="muted small">Spazio tra il bordo del foglio A4 e il testo, in millimetri: in cima alla pagina (sopra l’intestazione), in fondo (sotto il piè di pagina) e ai lati.</p></div></header>
            <div className="documenti-margini">
              {([['sopra', 'In alto'], ['sotto', 'In basso'], ['lati', 'Ai lati']] as const).map(([k, l]) =>
                <Field key={k} label={`${l} (mm)`}><Input type="number" min={5} max={60} step={1} value={margini[k]} onChange={(e) => setMargine(k, Number(e.target.value))} /></Field>)}
              <Btn size="sm" variant="ghost" disabled={!m.margini && m.corpoPt === undefined} onClick={() => onChange({ margini: undefined, corpoPt: undefined })}>Ripristina</Btn>
            </div>
          </section>
          <section className="modello-blocco">
            <header><h3>Pagina</h3></header>
            <label className="check"><input type="checkbox" checked={m.mostraLuogoData} onChange={(e) => onChange({ mostraLuogoData: e.target.checked })} /> Luogo e data in alto a destra</label>
            <input value={m.luogo} onChange={(e) => onChange({ luogo: e.target.value })} disabled={!m.mostraLuogoData} placeholder="Città, es. Modena" aria-label="Città per la data" style={{ maxWidth: 240 }} />
            <label className="check"><input type="checkbox" checked={m.numeriPagina} onChange={(e) => onChange({ numeriPagina: e.target.checked })} /> Numeri di pagina («Pagina 1 di 3»)</label>
            <p className="muted small">Intestazione e piè di pagina si modificano nelle loro schede. In Word, LibreOffice e RTF i font «del computer» devono essere installati sul computer che apre il file.</p>
          </section>
        </>}
      </div>
      <AnteprimaNota html={html} etichetta={m.nome} />
    </div>
  )
}

type AzioniModello = { m: ModelloDocumento; settings: Settings; onChange: (p: Partial<ModelloDocumento>) => void; onCrea: () => void; onDuplica: () => void; onElimina: () => void }
/** Nome (modificabile a piacere), tipo e azioni del modello: uguali per i modelli di TIO e per quelli Word. */
function TestaModello({ m, settings, onChange, onCrea, onDuplica, onElimina }: AzioniModello) {
  return <div className="documenti-testa">
    <Field label="Nome del modello" hint="Scegli il nome che preferisci: compare nell’elenco e quando crei un documento"><Input className="documenti-titolo" value={m.nome} onChange={(e) => onChange({ nome: e.target.value })} placeholder="Es. Lettera al cliente" /></Field>
    <Field label="Tipo"><Select value={m.tipo} onChange={(e) => onChange({ tipo: e.target.value })}>{[...new Set([...tipiPer(settings).map((t) => t.tipo), m.tipo])].map((t) => <option key={t}>{t}</option>)}</Select></Field>
    <span className="grow" />
    <Btn size="sm" variant="ghost" onClick={onDuplica} title="Duplica il modello"><Copy size={14} /> Duplica</Btn>
    <Btn size="sm" variant="ghost" onClick={onElimina} title="Elimina il modello" aria-label="Elimina il modello"><Trash2 size={14} /></Btn>
    <Btn variant="primary" onClick={onCrea}><Wand2 size={15} /> Crea documento…</Btn>
  </div>
}

/** Modello Word dell'utente: il file resta com'è; qui si vedono i campi trovati, si sostituisce o si scarica il file. */
function EditorWord(p: AzioniModello) {
  const { m, settings, onChange } = p
  const run = useAction()
  const { toast } = useFeedback()
  const [info, setInfo] = useState<InfoWord | null>(null)
  const [errore, setErrore] = useState('')
  useEffect(() => { api.infoModelloWord(m.id).then(setInfo).catch((e) => setErrore(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))) }, [m.id])
  const campi = campiDisponibili(settings)
  const nomi = new Map(campi.map((c) => [c.id, `${c.gruppo}: ${c.etichetta.toLowerCase()}`]))
  const sostituisci = async () => { const r = await run(() => api.sostituisciModelloWord(m.id)); if (r) { setInfo(r); onChange({ campiWord: r.campi }); toast('Modello Word aggiornato') } }
  const copia = async (t: string) => { try { await navigator.clipboard.writeText(t); toast(`${t} copiato: incollalo nel documento Word`) } catch { toast('Copia non riuscita', 'err') } }
  return <div className="documenti-editor word">
    <div className="documenti-form">
      <TestaModello {...p} />
      <section className="modello-blocco">
        <header><div><h3>Modello Word</h3><p className="muted small">Il documento creato è una copia del tuo file con i campi compilati: carta intestata, stili, immagini, intestazione e piè di pagina restano identici. Per aggiungere un campo scrivilo in Word tra doppie graffe, poi sostituisci qui il file.</p></div></header>
        <div className="row wrap">
          <Btn size="sm" onClick={sostituisci}><FileUp size={14} /> Sostituisci il file Word…</Btn>
          <Btn size="sm" variant="ghost" onClick={() => run(() => api.scaricaModelloWord(m.id), 'Modello salvato')}><Download size={14} /> Salva una copia del modello…</Btn>
        </div>
        {errore && <p className="src-badge err" role="alert">{errore}</p>}
      </section>
      <section className="modello-blocco">
        <header><h3>Campi nel documento</h3></header>
        {info && (info.campi.length
          ? <ul className="campi-word">{info.campi.map((c) => <li key={c}><code>{`{{${c}}}`}</code><span className="muted small">{nomi.get(c) || 'campo libero: lo scrivi quando crei il documento'}</span></li>)}</ul>
          : <p className="muted small">Nessun campo trovato. Scrivi nel file Word, per esempio, {'{{destinatario.nome}}'} dove vuoi il nome del destinatario.</p>)}
      </section>
      <section className="modello-blocco">
        <header><h3>Campi che puoi usare</h3><p className="muted small">Fai clic per copiare il campo e incollalo nel documento Word.</p></header>
        <div className="campi-disponibili">{[...new Set(campi.map((c) => c.gruppo))].map((g) => <div key={g}><p className="nav-section">{g}</p>{campi.filter((c) => c.gruppo === g).map((c) => <button key={c.id} type="button" className="chip-campo" onClick={() => copia(`{{${c.id}}}`)} title={`Copia {{${c.id}}}`}>{c.etichetta}</button>)}</div>)}</div>
      </section>
    </div>
    <aside className="anteprima-word" aria-label="Testo del modello Word">
      <p className="preview-label muted small">Testo del modello{info ? ` · ${Math.round(info.dimensione / 1024)} KB` : ''}</p>
      <pre>{info?.anteprima || (errore ? '' : 'Lettura del modello…')}</pre>
    </aside>
  </div>
}

/** Editor del corpo: paragrafi, titoli, elenchi, grassetto/corsivo/sottolineato, allineamento e campi da compilare. */
function EditorTesto({ valore, campi, allineamento, colonne, onChange }: { valore: string; campi: Campo[]; allineamento: Allineamento; colonne: 1 | 2; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [, aggiornaStato] = useState(0)
  // il contenuto si imposta una sola volta: rimpiazzarlo a ogni battuta sposterebbe il cursore
  useEffect(() => { if (ref.current) ref.current.innerHTML = valore }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const timer = useRef<number | undefined>(undefined)
  const cambia = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => ref.current && onChange(pulisciHtml(ref.current.innerHTML)), 250); aggiornaStato((n) => n + 1) }
  useEffect(() => () => { window.clearTimeout(timer.current); if (ref.current) onChange(pulisciHtml(ref.current.innerHTML)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = (c: string, v?: string) => { ref.current?.focus(); document.execCommand(c, false, v); cambia() }
  const attivo = (c: string) => { try { return document.queryCommandState(c) } catch { return false } }
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
  const blocco = (() => { try { return String(document.queryCommandValue('formatBlock') || 'p').toLowerCase() } catch { return 'p' } })()
  const gruppi = [...new Set(campi.map((c) => c.gruppo))]
  return <div className="editor-testo">
    <div className="editor-barra" role="toolbar" aria-label="Formattazione">
      <select value={['h1', 'h2', 'h3'].includes(blocco) ? blocco : 'p'} onChange={(e) => cmd('formatBlock', e.target.value)} aria-label="Stile del paragrafo">
        <option value="p">Testo</option><option value="h1">Titolo</option><option value="h2">Sottotitolo</option><option value="h3">Titoletto</option>
      </select>
      <div className="tool-group">
        <button type="button" className={`tool ${attivo('bold') ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')} title="Grassetto (⌘B)" aria-pressed={attivo('bold')}><Bold size={14} /></button>
        <button type="button" className={`tool ${attivo('italic') ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')} title="Corsivo (⌘I)" aria-pressed={attivo('italic')}><Italic size={14} /></button>
        <button type="button" className={`tool ${attivo('underline') ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('underline')} title="Sottolineato (⌘U)" aria-pressed={attivo('underline')}><Underline size={14} /></button>
      </div>
      <div className="tool-group">
        <button type="button" className="tool" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertUnorderedList')} title="Elenco puntato"><List size={14} /></button>
        <button type="button" className="tool" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertOrderedList')} title="Elenco numerato"><ListOrdered size={14} /></button>
      </div>
      <button type="button" className={`btn btn-soft btn-sm editor-colonne${inSezione ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={dueColonne} aria-pressed={inSezione}
        title={inSezione ? 'Riporta questa parte a una colonna' : 'Metti su due colonne i paragrafi selezionati'}><Columns2 size={14} aria-hidden /> {inSezione ? 'Una colonna' : 'Due colonne'}</button>
      <div className="tool-group">
        {([['justifyLeft', AlignLeft, 'a sinistra'], ['justifyCenter', AlignCenter, 'al centro'], ['justifyRight', AlignRight, 'a destra'], ['justifyFull', AlignJustify, 'giustificato']] as const).map(([c, Icon, t]) =>
          <button key={c} type="button" className={`tool ${attivo(c) ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(c)} title={`Allinea ${t}`} aria-pressed={attivo(c)}><Icon size={14} /></button>)}
      </div>
      <select className="editor-campi" value="" onChange={(e) => { if (e.target.value) cmd('insertText', `{{${e.target.value}}}`) }} aria-label="Inserisci un campo">
        <option value="">Inserisci campo…</option>
        {gruppi.map((g) => <optgroup key={g} label={g}>{campi.filter((c) => c.gruppo === g).map((c) => <option key={c.id} value={c.id}>{c.etichetta}</option>)}</optgroup>)}
      </select>
    </div>
    <div ref={ref} className={`editor-foglio${colonne === 2 ? ' due-colonne' : ''}`} style={{ textAlign: CSS_ALLINEA[allineamento] as 'left' }} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Testo del documento" spellCheck lang="it"
      onInput={cambia} onKeyUp={() => aggiornaStato((n) => n + 1)} onMouseUp={() => aggiornaStato((n) => n + 1)}
      onPaste={(e) => { e.preventDefault(); const h = e.clipboardData.getData('text/html'); const t = e.clipboardData.getData('text/plain'); document.execCommand('insertHTML', false, h ? pulisciHtml(h) : t.split(/\n/).map((r) => r.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))).join('<br>')); cambia() }} />
    <p className="muted small"><Braces size={12} aria-hidden /> I campi tra doppie graffe, come {'{{destinatario.nome}}'}, si compilano quando crei il documento. Puoi inventarne di nuovi, per esempio {'{{importo}}'}: TIO te li chiederà.</p>
  </div>
}
