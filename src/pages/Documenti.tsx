import { useEffect, useMemo, useRef, useState } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Columns2, Copy, Download, Eye, FilePlus2, FileUp, PenLine, Plus, Trash2, Wand2 } from 'lucide-react'
import { api, type InfoWord } from '../api'
import { useData } from '../store'
import { Btn, Field, Input, Modal, PageHeader, Segmented, Select, Tabs, useAction, useFeedback } from '../components/ui'
import { CreaDocumentoModal } from '../components/CreaDocumento'
import { AnteprimaNota, ImmagineBlocco, RigheEditor } from '../components/ModelloPdfEditor'
import { GestioneFont, OpzioniFont } from '../components/SceltaFont'
import { modelloEffettivo } from '../lib/modello'
import { CAMPI_SPECIALI, MARGINI_PREDEFINITI, NOMI_POSIZIONE_LD, campiDisponibili, duplicaModello, documentoHtml, modelliPredefiniti, modelloPersonalizzato, nuovoModello, predefinitiMancanti, rigaVuota, tipiDocumento, valoriCampi } from '../lib/documento'
import { EditorTesto } from '../components/EditorTesto'
import { AnteprimaGrande } from '../components/AnteprimaGrande'
import type { Allineamento, ModelloDocumento, PosizioneLuogoData, Settings } from '../types'

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
      <PageHeader title="Documenti" subtitle="Modelli per lettere, preventivi e qualsiasi altro documento, con la tua intestazione e il tuo piè di pagina. Crea il file in Word, PDF e altri formati, già compilato con i dati dell’archivio."
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
  const [grande, setGrande] = useState(false)
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
        <TestaModello m={m} settings={settings} onChange={onChange} onCrea={onCrea} onDuplica={onDuplica} onElimina={onElimina} onAnteprima={() => { setHtml(documentoHtml(m, { valori })); setGrande(true) }} />
        <Tabs value={scheda} onChange={setScheda} tabs={[{ id: 'contenuto', label: 'Contenuto' }, { id: 'intestazione', label: 'Intestazione' }, { id: 'piede', label: 'Piè di pagina' }, { id: 'impaginazione', label: 'Impaginazione' }]} />
        {scheda === 'contenuto' && <>
          <EditorTesto valore={m.corpo} campi={campiDisponibili(settings)} allineamento={m.allineamento || 'sinistra'} colonne={m.colonne === 2 ? 2 : 1} onChange={(corpo) => onChange({ corpo })}
            opzioni={{ campiPersonali: m.campiPersonali, onNuovoCampo: (n) => onChange({ campiPersonali: [...new Set([...(m.campiPersonali || []), n])] }) }} />
          {m.firma && !/\{\{\s*firma\s*\}\}/.test(m.corpo) && <p className="muted small">Hai caricato la foto della firma: scrivi {'{{firma}}'} nel testo dove deve comparire (menu «Inserisci campo» › Speciali › Firma).</p>}
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
            <header><div><h3>Disposizione del testo</h3><p className="muted small">Vale per tutto il documento. Nella scheda Contenuto, dalla barra dell’editor, puoi allineare i singoli paragrafi e mettere su due colonne solo una parte del testo.</p></div></header>
            <div className="documenti-disposizione" role="group" aria-label="Disposizione del testo">
              <Segmented value={m.allineamento || 'sinistra'} onChange={(allineamento: Allineamento) => onChange({ allineamento })} options={[
              { id: 'sinistra', label: <AlignLeft size={15} aria-hidden />, title: 'Testo a sinistra' }, { id: 'centro', label: <AlignCenter size={15} aria-hidden />, title: 'Testo al centro' },
              { id: 'destra', label: <AlignRight size={15} aria-hidden />, title: 'Testo a destra' }, { id: 'giustificato', label: <AlignJustify size={15} aria-hidden />, title: 'Testo giustificato' }]} />
              <button type="button" className={`btn btn-soft btn-sm${m.colonne === 2 ? ' on' : ''}`} aria-pressed={m.colonne === 2} onClick={() => onChange({ colonne: m.colonne === 2 ? 1 : 2 })}><Columns2 size={15} aria-hidden /> Tutto su due colonne</button>
            </div>
          </section>
          <section className="modello-blocco">
            <header><div><h3>Carattere</h3><p className="muted small">Font e dimensione del testo del documento. Su ogni riga di intestazione e piè di pagina puoi sceglierne un altro.</p></div></header>
            <div className="row wrap modello-font-controlli">
              <Field label="Carattere del documento"><Select value={m.fontDocumento || 'arial'} onChange={(e) => onChange({ fontDocumento: e.target.value })}>{opzioniFont}</Select></Field>
              <Field label="Dimensione del testo"><Select value={String(m.corpoPt ?? 11)} onChange={(e) => onChange({ corpoPt: Number(e.target.value) })}>{[9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24, 28].map((n) => <option key={n} value={n}>{String(n).replace('.', ',')} pt{n >= 18 ? ' · grandissimo' : n >= 14 ? ' · grande' : ''}</option>)}</Select></Field>
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
            <header><div><h3>Firma</h3><p className="muted small">La foto o la scansione della tua firma (meglio su fondo bianco o trasparente). Compare dove scrivi {'{{firma}}'} nel testo.</p></div></header>
            <ImmagineBlocco titolo="Firma" src={m.firma || null} altezza={m.firmaAltezza ?? 60} allineamento={m.firmaAllineamento === 'giustificato' ? 'sinistra' : m.firmaAllineamento || 'sinistra'} max={160} onChange={(firma, firmaAltezza, firmaAllineamento) => onChange({ firma, firmaAltezza, firmaAllineamento })} />
            {m.firma && !/\{\{\s*firma\s*\}\}/.test(m.corpo) && <Btn size="sm" variant="ghost" onClick={() => onChange({ corpo: m.corpo + '<p>{{firma}}</p>' })}><PenLine size={14} /> Aggiungi {'{{firma}}'} in fondo al testo</Btn>}
          </section>
          <section className="modello-blocco">
            <header><h3>Pagina</h3></header>
            <label className="check"><input type="checkbox" checked={m.mostraLuogoData} onChange={(e) => onChange({ mostraLuogoData: e.target.checked })} /> Luogo e data</label>
            <div className="row wrap">
              <input value={m.luogo} onChange={(e) => onChange({ luogo: e.target.value })} disabled={!m.mostraLuogoData} placeholder="Città, es. Modena" aria-label="Città per la data" style={{ maxWidth: 240 }} />
              <Select value={m.posizioneLuogoData || 'alto-destra'} disabled={!m.mostraLuogoData} onChange={(e) => onChange({ posizioneLuogoData: e.target.value as PosizioneLuogoData })} aria-label="Posizione di luogo e data" style={{ maxWidth: 220 }}>
                {Object.entries(NOMI_POSIZIONE_LD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <label className="check"><input type="checkbox" checked={m.numeriPagina} onChange={(e) => onChange({ numeriPagina: e.target.checked })} /> Numeri di pagina («Pagina 1 di 3»)</label>
            <p className="muted small">Intestazione e piè di pagina si modificano nelle loro schede. In Word, LibreOffice e RTF i font «del computer» devono essere installati sul computer che apre il file.</p>
          </section>
        </>}
      </div>
      <AnteprimaNota html={html} etichetta={m.nome} />
      {grande && <AnteprimaGrande html={html} titolo={m.nome} onClose={() => setGrande(false)} />}
    </div>
  )
}

type AzioniModello = { m: ModelloDocumento; settings: Settings; onChange: (p: Partial<ModelloDocumento>) => void; onCrea: () => void; onDuplica: () => void; onElimina: () => void; onAnteprima?: () => void }
/** Nome (modificabile a piacere), tipo e azioni del modello: uguali per i modelli di TIO e per quelli Word. */
function TestaModello({ m, settings, onChange, onCrea, onDuplica, onElimina, onAnteprima }: AzioniModello) {
  return <div className="documenti-testa">
    <Field label="Nome del modello"><Input className="documenti-titolo" value={m.nome} onChange={(e) => onChange({ nome: e.target.value })} placeholder="Es. Lettera al cliente" /></Field>
    <Field label="Tipo"><Select value={m.tipo} onChange={(e) => onChange({ tipo: e.target.value })}>{[...new Set([...tipiPer(settings).map((t) => t.tipo), m.tipo])].map((t) => <option key={t}>{t}</option>)}</Select></Field>
    <span className="grow" />
    <Btn size="sm" variant="ghost" onClick={onDuplica} title="Duplica il modello"><Copy size={14} /> Duplica</Btn>
    <Btn size="sm" variant="ghost" onClick={onElimina} title="Elimina il modello" aria-label="Elimina il modello"><Trash2 size={14} /></Btn>
    {onAnteprima && <Btn onClick={onAnteprima} title="Anteprima grande del documento, pagina per pagina, con lo zoom"><Eye size={15} /> Anteprima</Btn>}
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
  // firma e testo lungo non esistono nei modelli Word: il file resta com'è
  const campi = campiDisponibili(settings).filter((c) => !CAMPI_SPECIALI.has(c.id))
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
