import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Columns2, Copy, Download, Eye, File as FileIcon, FilePlus2, FileText, FileUp, PenLine, Plus, Trash2, Wand2 } from 'lucide-react'
import { api, type InfoWord } from '../api'
import { useData } from '../store'
import { Btn, Empty, Field, Input, Modal, PageHeader, Segmented, Select, Tabs, useAction, useFeedback } from '../components/ui'
import { CreaDocumentoModal } from '../components/CreaDocumento'
import { AnteprimaNota, ImmagineBlocco, RigheEditor } from '../components/ModelloPdfEditor'
import { GestioneFont, OpzioniFont } from '../components/SceltaFont'
import { modelloEffettivo } from '../lib/modello'
import { CAMPI_SPECIALI, MARGINI_PREDEFINITI, NOMI_FORMATO_DATA, NOMI_POSIZIONE_LD, campiDisponibili, testoLuogoData, duplicaModello, documentoHtml, modelliPredefiniti, modelloPersonalizzato, nuovoModello, rigaVuota, tipiDocumento, valoriCampi } from '../lib/documento'
import { EditorTesto } from '../components/EditorTesto'
import { AnteprimaGrande } from '../components/AnteprimaGrande'
import type { Allineamento, FormatoData, ModelloDocumento, PosizioneLuogoData, Settings } from '../types'

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
  // finestra «Nuovo modello»: `base` è il modello da cui partire quando si arriva da «Duplica»
  const [nuovo, setNuovo] = useState<null | { base?: string }>(null)
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
  const aggiungi = (x: ModelloDocumento) => { salva([...modelli, x], true); setScelto(x.id); setNuovo(null) }
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
  // nuovo modello: da una pagina bianca, da un testo pronto o da un modello che c'è già. Il nome lo sceglie chi lo crea:
  // dell'origine non resta traccia (niente «(copia)», niente tipo accanto al nome)
  const creaModello = async (nome: string, origine: Origine, conIntestazione: boolean) => {
    if (origine.da === 'bianca') { const x = modelloPersonalizzato(settings, nome, conIntestazione); schedaIniziale.current[x.id] = 'impaginazione'; aggiungi(x); return }
    if (origine.da === 'testo') { aggiungi(nuovoModello(settings, origine.tipo, nome)); return }
    const base = modelli.find((x) => x.id === origine.id); if (!base) return
    if (base.word) {
      const id = 'word-' + crypto.randomUUID()
      if (await run(() => api.duplicaModelloWord(base.id, id))) aggiungi({ ...structuredClone(base), id, nome, predefinito: false, aggiornato: new Date().toISOString() })
    } else aggiungi({ ...duplicaModello(base), nome })
  }
  // un elenco solo, in ordine alfabetico
  const elenco = useMemo(() => [...modelli].sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base', numeric: true })), [modelli])
  const scelta = <Field label="Modello">
    <Select value={scelto ?? ''} onChange={(e) => setScelto(e.target.value)} aria-label="Modello da modificare">
      {!m && <option value="">Scegli un modello…</option>}
      {elenco.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
    </Select>
  </Field>

  return (
    <div className="page documenti-pagina">
      <PageHeader title="Documenti" subtitle="Modelli con la tua intestazione, compilati con i dati dell’archivio e salvati in Word, PDF e altri formati."
        actions={stato ? <span className="muted small" role="status">{stato === 'salvato' ? 'Modifiche salvate' : 'Salvataggio…'}</span> : undefined} />
      <div className="documenti-azioni">
        <Btn variant="ghost" onClick={importaWord} title="Usa come modello un tuo documento Word, per esempio la carta intestata dello studio"><FileUp size={15} /> Importa da Word…</Btn>
        <Btn variant="primary" onClick={() => setNuovo({})}><Plus size={15} /> Nuovo modello</Btn>
      </div>
      {!modelli.length
        ? <Empty icon={<FileText size={30} />} title="Nessun modello" text="Crea il primo: da una pagina bianca o da un testo pronto da adattare." action={<Btn variant="primary" onClick={() => setNuovo({})}><Plus size={15} /> Nuovo modello</Btn>} />
        : <div className="documenti-lavoro">
          {m ? m.word
            ? <EditorWord key={m.id} m={m} settings={settings} scelta={scelta} onChange={aggiorna} onCrea={() => setCrea(m)} onDuplica={() => setNuovo({ base: m.id })} onElimina={elimina} />
            : <Editor key={m.id} m={m} settings={settings} scelta={scelta} schedaIniziale={schedaIniziale.current[m.id]} onChange={aggiorna} onCrea={() => setCrea(m)} onDuplica={() => setNuovo({ base: m.id })} onElimina={elimina} />
            : <div className="documenti-testa"><div className="documenti-scelta">{scelta}</div></div>}
        </div>}
      {nuovo && <NuovoModelloModal settings={settings} modelli={elenco} base={nuovo.base} onCrea={creaModello} onClose={() => setNuovo(null)} />}
      {crea && <CreaDocumentoModal m={crea} onClose={() => setCrea(null)} />}
    </div>
  )
}

type Origine = { da: 'bianca' } | { da: 'testo'; tipo: string } | { da: 'modello'; id: string }
const chiaveOrigine = (o: Origine) => (o.da === 'bianca' ? 'bianca' : o.da === 'testo' ? `t:${o.tipo}` : `m:${o.id}`)

/** Nuovo modello: un nome e un punto di partenza (pagina bianca, testo pronto o un modello che c'è già). */
function NuovoModelloModal({ settings, modelli, base, onCrea, onClose }: { settings: Settings; modelli: ModelloDocumento[]; base?: string; onCrea: (nome: string, origine: Origine, conIntestazione: boolean) => void | Promise<void>; onClose: () => void }) {
  const [nome, setNome] = useState('')
  const [origine, setOrigine] = useState<Origine>(base ? { da: 'modello', id: base } : { da: 'bianca' })
  const [conIntestazione, setConIntestazione] = useState(true)
  // i testi pronti già presenti fra i modelli (con lo stesso nome) non si ripetono
  const nomi = new Set(modelli.map((x) => x.nome.trim().toLowerCase()))
  const voci: { origine: Origine; titolo: string; nota: string; icona: 'bianca' | 'testo' | 'modello' }[] = [
    { origine: { da: 'bianca' }, titolo: 'Pagina bianca', nota: 'Parti da zero', icona: 'bianca' },
    ...[
      ...modelli.map((x) => ({ origine: { da: 'modello', id: x.id } as Origine, titolo: x.nome, nota: 'Tuo modello', icona: 'modello' as const })),
      ...tipiPer(settings).filter((t) => t.tipo !== 'Documento libero' && !nomi.has(t.tipo.toLowerCase())).map((t) => ({ origine: { da: 'testo', tipo: t.tipo } as Origine, titolo: t.tipo, nota: t.descrizione, icona: 'testo' as const })),
    ].sort((a, b) => a.titolo.localeCompare(b.titolo, 'it', { sensitivity: 'base', numeric: true })),
  ]
  const attiva = chiaveOrigine(origine)
  const crea = () => { if (nome.trim()) onCrea(nome.trim(), origine, conIntestazione) }
  return <Modal title="Nuovo modello" width={760} onClose={onClose} protectChanges={false}
    footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" disabled={!nome.trim()} onClick={crea}><Plus size={15} /> Crea modello</Btn></>}>
    <div className="nuovo-modello">
      <Field label="Nome del modello"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Lettera al cliente" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') crea() }} /></Field>
      <div>
        <p className="field-label" id="nuovo-modello-origine">Parti da</p>
        <div className="documenti-tipi" role="radiogroup" aria-labelledby="nuovo-modello-origine">
          {voci.map((v) => { const k = chiaveOrigine(v.origine); return <button key={k} type="button" role="radio" aria-checked={attiva === k} data-origine={v.icona} className={`documenti-tipo${attiva === k ? ' on' : ''}`} onClick={() => setOrigine(v.origine)}>
            {v.icona === 'bianca' ? <FileIcon size={20} aria-hidden /> : v.icona === 'modello' ? <Copy size={20} aria-hidden /> : <FilePlus2 size={20} aria-hidden />}<b>{v.titolo}</b><span className="muted small">{v.nota}</span></button> })}
        </div>
      </div>
      {origine.da === 'bianca' && <label className="check"><input type="checkbox" checked={conIntestazione} onChange={(e) => setConIntestazione(e.target.checked)} /> Con intestazione, piè di pagina e font dei documenti di vendita</label>}
    </div>
  </Modal>
}

type Scheda = 'contenuto' | 'intestazione' | 'piede' | 'impaginazione'

function Editor({ m, settings, scelta, schedaIniziale, onChange, onCrea, onDuplica, onElimina }: { m: ModelloDocumento; settings: Settings; scelta: ReactNode; schedaIniziale?: Scheda; onChange: (p: Partial<ModelloDocumento>) => void; onCrea: () => void; onDuplica: () => void; onElimina: () => void }) {
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
        <TestaModello m={m} settings={settings} scelta={scelta} onChange={onChange} onCrea={onCrea} onDuplica={onDuplica} onElimina={onElimina} onAnteprima={() => { setHtml(documentoHtml(m, { valori })); setGrande(true) }} />
        <Tabs value={scheda} onChange={setScheda} tabs={[{ id: 'contenuto', label: 'Contenuto' }, { id: 'intestazione', label: 'Intestazione' }, { id: 'piede', label: 'Piè di pagina' }, { id: 'impaginazione', label: 'Impaginazione' }]} />
        {scheda === 'contenuto' && <>
          <EditorTesto valore={m.corpo} campi={campiDisponibili(settings)} allineamento={m.allineamento || 'sinistra'} colonne={m.colonne === 2 ? 2 : 1} onChange={(corpo) => onChange({ corpo })}
            opzioni={{ campiPersonali: m.campiPersonali, onNuovoCampo: (n) => onChange({ campiPersonali: [...new Set([...(m.campiPersonali || []), n])] }) }} />
          {m.firma && !/\{\{\s*firma\s*\}\}/.test(m.corpo) && <p className="muted small">Hai caricato la foto della firma: scrivi {'{{firma}}'} nel testo dove deve comparire (menu «Inserisci campo» › Speciali › Firma).</p>}
        </>}
        {scheda === 'intestazione' && <section className="modello-blocco">
          <header><div><h2>Intestazione</h2><p className="muted small">Puoi usare i campi, per esempio {'{{studio.nome}}'}.</p></div>
            <Segmented value={m.intestazioneSoloPrima ? 'prima' : 'tutte'} onChange={(v: 'tutte' | 'prima') => onChange({ intestazioneSoloPrima: v === 'prima' })} options={[{ id: 'tutte', label: 'In ogni pagina' }, { id: 'prima', label: 'Solo nella prima' }]} /></header>
          <ImmagineBlocco titolo="Intestazione" src={m.logo} altezza={m.logoAltezza} allineamento={m.logoAllineamento} max={140} onChange={(logo, logoAltezza, logoAllineamento) => onChange({ logo, logoAltezza, logoAllineamento })} />
          <RigheEditor righe={m.intestazione} titolo="Intestazione" opzioniFont={opzioniFont} nuova={() => rigaVuota()} onChange={(intestazione) => onChange({ intestazione })} />
          <label className="check"><input type="checkbox" checked={m.lineaIntestazione !== false} onChange={(e) => onChange({ lineaIntestazione: e.target.checked })} /> Linea tra intestazione e testo</label>
          {m.intestazioneSoloPrima && <p className="muted small">Dalla seconda pagina l’intestazione resta vuota, come in un documento nuovo di Word, con il margine in alto di 2,5 cm.</p>}
          <Btn size="sm" variant="ghost" className="btn-a-capo" onClick={daParcelle} title="Copia in questo modello intestazione, piè di pagina, immagini e font del modello dei documenti di vendita (Impostazioni › Modello PDF)">Usa intestazione, piè di pagina e font dei documenti di vendita</Btn>
        </section>}
        {scheda === 'piede' && <section className="modello-blocco">
          <header><div><h2>Piè di pagina</h2><p className="muted small">In fondo a ogni pagina: sede, recapiti, codice fiscale e partita IVA…</p></div></header>
          <ImmagineBlocco titolo="Piè di pagina" src={m.immagineFooter || null} altezza={m.immagineFooterAltezza ?? 36} allineamento={m.immagineFooterAllineamento || 'centro'} max={64} onChange={(immagineFooter, immagineFooterAltezza, immagineFooterAllineamento) => onChange({ immagineFooter, immagineFooterAltezza, immagineFooterAllineamento })} />
          <RigheEditor righe={m.footer} titolo="Piè di pagina" opzioniFont={opzioniFont} nuova={() => rigaVuota({ dimensione: 'piccola' })} onChange={(footer) => onChange({ footer })} />
        </section>}
        {scheda === 'impaginazione' && <>
          <section className="modello-blocco">
            <header><div><h2>Disposizione del testo</h2><p className="muted small">Vale per tutto il documento. Nella scheda Contenuto, dalla barra dell’editor, puoi allineare i singoli paragrafi e mettere su due colonne solo una parte del testo.</p></div></header>
            <div className="documenti-disposizione" role="group" aria-label="Disposizione del testo">
              <Segmented value={m.allineamento || 'sinistra'} onChange={(allineamento: Allineamento) => onChange({ allineamento })} options={[
              { id: 'sinistra', label: <AlignLeft size={15} aria-hidden />, title: 'Testo a sinistra' }, { id: 'centro', label: <AlignCenter size={15} aria-hidden />, title: 'Testo al centro' },
              { id: 'destra', label: <AlignRight size={15} aria-hidden />, title: 'Testo a destra' }, { id: 'giustificato', label: <AlignJustify size={15} aria-hidden />, title: 'Testo giustificato' }]} />
              <button type="button" className={`btn btn-soft btn-sm${m.colonne === 2 ? ' on' : ''}`} aria-pressed={m.colonne === 2} onClick={() => onChange({ colonne: m.colonne === 2 ? 1 : 2 })}><Columns2 size={15} aria-hidden /> Tutto su due colonne</button>
            </div>
          </section>
          <section className="modello-blocco">
            <header><div><h2>Carattere</h2><p className="muted small">Font e dimensione del testo del documento. Su ogni riga di intestazione e piè di pagina puoi sceglierne un altro.</p></div></header>
            <div className="row wrap modello-font-controlli">
              <Field label="Carattere del documento"><Select value={m.fontDocumento || 'arial'} onChange={(e) => onChange({ fontDocumento: e.target.value })}>{opzioniFont}</Select></Field>
              <Field label="Dimensione del testo"><Select value={String(m.corpoPt ?? 11)} onChange={(e) => onChange({ corpoPt: Number(e.target.value) })}>{[9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24, 28].map((n) => <option key={n} value={n}>{String(n).replace('.', ',')} pt{n >= 18 ? ' · grandissimo' : n >= 14 ? ' · grande' : ''}</option>)}</Select></Field>
            </div>
            <GestioneFont value={m} righe={['intestazione', 'footer']} onChange={onChange} />
          </section>
          <section className="modello-blocco">
            <header><div><h2>Margini della pagina</h2><p className="muted small">Spazio tra il bordo del foglio A4 e il testo, in millimetri: in cima alla pagina (sopra l’intestazione), in fondo (sotto il piè di pagina) e ai lati.</p></div></header>
            <div className="documenti-margini">
              {([['sopra', 'In alto'], ['sotto', 'In basso'], ['lati', 'Ai lati']] as const).map(([k, l]) =>
                <Field key={k} label={`${l} (mm)`}><Input type="number" min={5} max={60} step={1} value={margini[k]} onChange={(e) => setMargine(k, Number(e.target.value))} /></Field>)}
              <Btn size="sm" variant="ghost" disabled={!m.margini && m.corpoPt === undefined} onClick={() => onChange({ margini: undefined, corpoPt: undefined })}>Ripristina</Btn>
            </div>
          </section>
          <section className="modello-blocco">
            <header><div><h2>Firma</h2><p className="muted small">La foto o la scansione della tua firma (meglio su fondo bianco o trasparente). Compare dove scrivi {'{{firma}}'} nel testo.</p></div></header>
            <ImmagineBlocco titolo="Firma" src={m.firma || null} altezza={m.firmaAltezza ?? 60} allineamento={m.firmaAllineamento === 'giustificato' ? 'sinistra' : m.firmaAllineamento || 'sinistra'} max={160} onChange={(firma, firmaAltezza, firmaAllineamento) => onChange({ firma, firmaAltezza, firmaAllineamento })} />
            {m.firma && !/\{\{\s*firma\s*\}\}/.test(m.corpo) && <Btn size="sm" variant="ghost" onClick={() => onChange({ corpo: m.corpo + '<p>{{firma}}</p>' })}><PenLine size={14} /> Aggiungi {'{{firma}}'} in fondo al testo</Btn>}
          </section>
          <section className="modello-blocco luogo-data-blocco">
            <header><div><h2>Luogo e data</h2><p className="muted small">La riga «città, data» delle lettere. La data è quella del giorno in cui crei il documento.</p></div>
              <Segmented value={m.mostraLuogoData ? 'si' : 'no'} onChange={(v: 'si' | 'no') => onChange({ mostraLuogoData: v === 'si' })} options={[{ id: 'si', label: 'Mostra' }, { id: 'no', label: 'Nascondi' }]} /></header>
            {m.mostraLuogoData && <div className="luogo-data-griglia">
              <Field label="Città" hint={settings.studio.cap_citta ? 'Vuota: la città del tuo indirizzo' : undefined}><Input value={m.luogo} onChange={(e) => onChange({ luogo: e.target.value })} placeholder={(settings.studio.cap_citta || '').replace(/^\d{5}\s*/, '').replace(/\s*\(.*\)\s*$/, '') || 'Es. Modena'} /></Field>
              <Field label="Forma della data"><Select value={m.formatoData || 'lunga'} onChange={(e) => onChange({ formatoData: e.target.value as FormatoData })}>{Object.entries(NOMI_FORMATO_DATA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <div className="luogo-data-posizione">
                <p className="field-label" id="posizione-ld">Posizione</p>
                <div className="foglio-posizioni" role="radiogroup" aria-labelledby="posizione-ld">
                  {(Object.keys(NOMI_POSIZIONE_LD) as PosizioneLuogoData[]).map((k) => <button key={k} type="button" role="radio" aria-checked={(m.posizioneLuogoData || 'alto-destra') === k} className={`posizione-${k}`} title={NOMI_POSIZIONE_LD[k]} aria-label={NOMI_POSIZIONE_LD[k]} onClick={() => onChange({ posizioneLuogoData: k })}><span /></button>)}
                  <i className="foglio-righe" aria-hidden />
                </div>
                <span className="muted small">{NOMI_POSIZIONE_LD[m.posizioneLuogoData || 'alto-destra']}</span>
              </div>
              <p className="luogo-data-esempio" aria-live="polite"><span className="muted small">Nel documento</span><b>{testoLuogoData(m, { valori: valori })}</b></p>
            </div>}
          </section>
          <section className="modello-blocco">
            <header><h2>Pagina</h2></header>
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

type AzioniModello = { m: ModelloDocumento; settings: Settings; scelta: ReactNode; onChange: (p: Partial<ModelloDocumento>) => void; onCrea: () => void; onDuplica: () => void; onElimina: () => void; onAnteprima?: () => void }
/** Scelta del modello, nome (modificabile a piacere) e azioni: uguali per i modelli di TIO e per quelli Word. */
function TestaModello({ m, scelta, onChange, onCrea, onDuplica, onElimina, onAnteprima }: AzioniModello) {
  return <div className="documenti-testa">
    <div className="documenti-scelta">
      {scelta}
      <Field label="Nome del modello"><Input className="documenti-titolo" value={m.nome} onChange={(e) => onChange({ nome: e.target.value })} placeholder="Es. Lettera al cliente" /></Field>
      <button type="button" className="icon-btn" onClick={onDuplica} title="Nuovo modello a partire da questo" aria-label="Nuovo modello a partire da questo"><Copy size={16} /></button>
      <button type="button" className="icon-btn" onClick={onElimina} title="Elimina il modello" aria-label="Elimina il modello"><Trash2 size={16} /></button>
    </div>
    <div className="documenti-comandi">
      {onAnteprima && <Btn onClick={onAnteprima} title="Anteprima grande del documento, pagina per pagina, con lo zoom"><Eye size={15} /> Anteprima</Btn>}
      <Btn variant="primary" onClick={onCrea}><Wand2 size={15} /> Crea documento…</Btn>
    </div>
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
        <header><div><h2>Modello Word</h2><p className="muted small">Il documento creato è una copia del tuo file con i campi compilati: carta intestata, stili, immagini, intestazione e piè di pagina restano identici. Per aggiungere un campo scrivilo in Word tra doppie graffe, poi sostituisci qui il file.</p></div></header>
        <div className="row wrap">
          <Btn size="sm" onClick={sostituisci}><FileUp size={14} /> Sostituisci il file Word…</Btn>
          <Btn size="sm" variant="ghost" onClick={() => run(() => api.scaricaModelloWord(m.id), 'Modello salvato')}><Download size={14} /> Salva una copia del modello…</Btn>
        </div>
        {errore && <p className="src-badge err" role="alert">{errore}</p>}
      </section>
      <section className="modello-blocco">
        <header><h2>Campi nel documento</h2></header>
        {info && (info.campi.length
          ? <ul className="campi-word">{info.campi.map((c) => <li key={c}><code>{`{{${c}}}`}</code><span className="muted small">{nomi.get(c) || 'campo libero: lo scrivi quando crei il documento'}</span></li>)}</ul>
          : <p className="muted small">Nessun campo trovato. Scrivi nel file Word, per esempio, {'{{destinatario.nome}}'} dove vuoi il nome del destinatario.</p>)}
      </section>
      <section className="modello-blocco">
        <header><h2>Campi che puoi usare</h2><p className="muted small">Fai clic per copiare il campo e incollalo nel documento Word.</p></header>
        <div className="campi-disponibili">{[...new Set(campi.map((c) => c.gruppo))].map((g) => <div key={g}><p className="nav-section">{g}</p>{campi.filter((c) => c.gruppo === g).map((c) => <button key={c.id} type="button" className="chip-campo" onClick={() => copia(`{{${c.id}}}`)} title={`Copia {{${c.id}}}`}>{c.etichetta}</button>)}</div>)}</div>
      </section>
    </div>
    <aside className="anteprima-word" aria-label="Testo del modello Word">
      <p className="preview-label muted small">Testo del modello{info ? ` · ${Math.round(info.dimensione / 1024)} KB` : ''}</p>
      <pre>{info?.anteprima || (errore ? '' : 'Lettura del modello…')}</pre>
    </aside>
  </div>
}
