import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronRight, Cloud, File as FileIcon, Folder, FilePlus2, ShieldCheck, FolderInput, FolderOpen, Link2, Pencil, RefreshCw, Trash2, Unlink, Upload } from 'lucide-react'
import { api, type RapportoCliens, type SezioneDocumento } from '../../api'
import { useData } from '../../store'
import { useNav } from '../../nav'
import { Btn, Empty, Field, Input, Modal, Pill, useAction, useFeedback } from '../ui'
import { SincronizzaDocumentiModal } from '../SincronizzaDocumenti'
import { NuovoDaModelloModal } from '../CreaDocumento'
import { fmtBytes } from '../../lib/format'
import { fmtDate } from '../../lib/dates'
import type { Documento } from '../../types'
import { contenutoCartella, fileSulDisco, posizioneNelleRadici, sottocartella } from '../../lib/cartelle'

type Stato = 'ok' | 'mancante' | 'copia'
const cartellaDi = (p?: string | null) => (p ? p.replace(/[\\/][^\\/]*$/, '') : '')
const breve = (p: string) => { const x = p.split(/[\\/]/); return x.length > 4 ? `…/${x.slice(-3).join('/')}` : p }

/** Documenti della pratica: i file restano nelle cartelle dell'utente; TIO ne ricorda la posizione (nessuna copia) e li ritrova se vengono spostati. */
export function DocumentiTab({ praticaId, docs }: { praticaId: number; docs: Documento[] }) {
  const { ore, praticaById } = useData()
  const pratica = praticaById.get(praticaId)
  const oreById = useMemo(() => new Map(ore.map((o) => [o.id, o])), [ore])
  const run = useAction()
  const { confirm, eliminaConAnnulla, toast } = useFeedback()
  const [indice, setIndice] = useState<Record<number, { stato: string | null; errore: string | null }>>({})
  const [processing, setProcessing] = useState<number | null>(null)
  const [rename, setRename] = useState<Documento | null>(null)
  const [sync, setSync] = useState(false)
  const [daModello, setDaModello] = useState(false)
  const { go } = useNav()
  const [name, setName] = useState('')
  const [stato, setStato] = useState<Record<number, Stato>>({})
  const [sezioni, setSezioni] = useState<Record<number, SezioneDocumento>>({})
  const [sincronizzando, setSincronizzando] = useState(false)
  const [disco, setDisco] = useState<{ cartelle: string[]; file: Record<string, number>; daCollegare: number }>({ cartelle: [], file: {}, daCollegare: 0 })
  const sulDisco = disco.cartelle

  // controlla che i file esistano ancora: all'apertura, quando i documenti cambiano e quando si torna sulla finestra (dopo aver spostato file nel Finder/Esplora risorse)
  const chiavi = JSON.stringify(docs)
  const aggiorna = useCallback(() => { api.statoDocumenti(praticaId).then(setStato).catch(() => {}); api.discoDocumenti(praticaId).then(setDisco).catch(() => {}); api.sezioniDocumenti(praticaId).then(setSezioni).catch(() => {}); api.indiceDocumenti(praticaId).then((rows) => setIndice(Object.fromEntries(rows.map((r) => [r.id, r])))).catch(() => {}) }, [praticaId])
  useEffect(() => { aggiorna() }, [aggiorna, chiavi])
  // Le cartelle collegate si leggono da sole: all'apertura della scheda, quando cambia la cartella e quando si torna sulla finestra
  // (al più ogni 20 secondi). I file nuovi compaiono senza premere nulla, anche nelle sottocartelle; quelli a cui è stato tolto
  // il collegamento restano fuori finché non si preme «Sincronizza».
  const ultimaAuto = useRef(0)
  const haCartelle = !!(pratica?.cartella || pratica?.cartella_cliens)
  const autoSync = useCallback(() => {
    if (!haCartelle || Date.now() - ultimaAuto.current < 20000) return
    ultimaAuto.current = Date.now()
    api.cliensSincronizza(praticaId, true).then(aggiorna).catch(() => {})
  }, [praticaId, haCartelle, aggiorna])
  useEffect(() => { ultimaAuto.current = 0; autoSync() }, [autoSync, pratica?.cartella, pratica?.cartella_cliens])
  useEffect(() => { const f = () => { aggiorna(); autoSync() }; window.addEventListener('focus', f); return () => window.removeEventListener('focus', f) }, [aggiorna, autoSync])
  const mancanti = docs.filter((d) => stato[d.id] === 'mancante')
  // sottocartelle della cartella collegata (della pratica o di Cliens): si sfogliano come sul computer
  const [dove, setDove] = useState('')
  const [tuttiInsieme, setTuttiInsieme] = useState(false)
  // un file che non si trova più non sta in nessuna cartella: resta in vista alla radice, con il suo avviso
  const voci = useMemo(() => docs.map((d) => ({ voce: d, cartella: stato[d.id] === 'mancante' ? '' : sottocartella(d.percorso || d.percorso_cliens, [pratica?.cartella, pratica?.cartella_cliens]) })), [docs, stato, pratica?.cartella, pratica?.cartella_cliens])
  const conSottocartelle = sulDisco.length > 0 || voci.some((v) => v.cartella)
  // la cartella aperta può sparire (file scollegati o spostati): si torna alla radice
  const qui = dove && [...voci.map((v) => v.cartella), ...sulDisco].some((c) => (c + '/').toLowerCase().startsWith(dove.toLowerCase() + '/')) ? dove : ''
  const { cartelle, file } = contenutoCartella(voci, qui, sulDisco)
  // in ordine alfabetico, come nel Finder e in Esplora risorse
  const perNome = (a: Documento, b: Documento) => a.nome.localeCompare(b.nome, 'it', { numeric: true, sensitivity: 'base' })
  const elenco = [...(conSottocartelle && !tuttiInsieme ? file : docs)].sort(perNome)
  const radici = [pratica?.cartella, pratica?.cartella_cliens]

  const elimina = async (d: Documento) => {
    const collegato = !!d.percorso
    if (collegato) { await eliminaConAnnulla('documenti', d.id, 'Collegamento al documento'); return } // il file dell'utente non si tocca: basta «Annulla»
    if (await confirm({ title: collegato ? 'Rimuovere il collegamento?' : 'Eliminare il documento?', text: collegato ? `${d.nome} non sarà più elencato qui. Il file originale non viene toccato: resta dove si trova.` : `${d.nome} è una copia dentro TIO e verrà rimossa anche dal disco.`, ok: collegato ? 'Rimuovi collegamento' : 'Elimina', danger: !collegato })) run(() => api.remove('documenti', d.id))
  }
  const esitoSync = (r: RapportoCliens) => toast([r.nuovi ? `${r.nuovi} ${r.nuovi === 1 ? 'file nuovo collegato' : 'file nuovi collegati'}` : 'Nessun file nuovo', r.spostati ? `${r.spostati} ${r.spostati === 1 ? 'file spostato ritrovato' : 'file spostati ritrovati'}` : '', r.uniti ? `${r.uniti} doppioni uniti` : '', r.cartellaCliens ? `${r.condivisi} in comune con il provider` : '', r.toltiDaCliens ? `${r.toltiDaCliens} non più sul provider` : '', r.incompleto ? 'cartella molto grande: lettura parziale' : ''].filter(Boolean).join(' · '))
  // un solo «Sincronizza»: collega i file nuovi delle cartelle (sottocartelle comprese), poi cerca quelli spostati che mancano ancora
  const sincronizzaTutto = async () => {
    if (!haCartelle) { setSync(true); return }
    setSincronizzando(true)
    try {
      const r = await run(() => api.cliensSincronizza(praticaId)); if (!r) return
      esitoSync(r); aggiorna()
      const st = await api.statoDocumenti(praticaId).catch(() => ({} as Record<number, Stato>))
      if (Object.values(st).includes('mancante')) setSync(true)
    } finally { setSincronizzando(false) }
  }
  const cartellaCliens = async () => { const r = await run(() => api.cliensCartella(praticaId)); if (r) { esitoSync(r); aggiorna() } }
  const scollegaCliens = async () => {
    if (!await confirm({ title: 'Scollegare la cartella del provider?', text: 'I documenti in comune restano collegati alla copia sul computer; quelli presenti solo sul provider restano nell’elenco finché non li rimuovi. Nessun file viene cancellato.', ok: 'Scollega' })) return
    if (await run(() => api.cliensScollega(praticaId))) aggiorna()
  }
  const conCliens = !!pratica?.cartella_cliens || Object.values(sezioni).some((x) => x !== 'locale')
  const cartella = async () => { const r = await run(() => api.cartellaPratica(praticaId)); if (r) { aggiorna(); if (r.aggiornati) return } }
  const riga = (d: Documento) => {
    const st = stato[d.id]
    const formato = d.percorso || d.file || d.nome
    const ocr = /\.(pdf|png|jpe?g|tiff?|webp|bmp)$/i.test(formato)
    return (
      <div key={d.id} className={`plain-row static ${st === 'mancante' ? 'doc-mancante' : ''}`}>
        <FileIcon size={18} />
        {/\.(pdf|png|jpe?g|webp|bmp)$/i.test(d.percorso || d.file || d.nome) && <Btn size="sm" disabled={st === 'mancante'} onClick={() => run(() => api.anteprimaDocumento(d.id))} aria-label={`Anteprima di ${d.nome}`}>Anteprima</Btn>}
        <span className="grow doc-nome"><button className="link-btn left" onClick={() => run(() => api.openDocumento(d.id))}>{d.nome}</button>
          {d.percorso && (() => {
            // dentro la cartella della pratica il percorso è già quello aperto: si scrive solo con «Tutti i file insieme» (la sottocartella)
            // o per i file collegati da altre cartelle (dove stanno davvero)
            const pos = posizioneNelleRadici(d.percorso, radici), testo = pos === null ? breve(cartellaDi(d.percorso)) : tuttiInsieme && pos ? pos : ''
            return (testo || d.percorso_cliens) && <small className="muted" title={d.percorso_cliens ? `${d.percorso}\nSul provider: ${d.percorso_cliens}` : d.percorso}>{testo}{testo && d.percorso_cliens ? ' · ' : ''}{d.percorso_cliens ? 'anche sul provider' : ''}</small>
          })()}</span>
        {st === 'mancante' && <Pill color="#ef4444" title="Il file non si trova più nel percorso memorizzato">non trovato</Pill>}
        {st === 'copia' && <Pill title="Copia dentro TIO (versioni precedenti): non segue le cartelle del computer">copia interna</Pill>}
        {/\.(pdf|png|jpe?g|tiff?|webp|bmp|docx|xlsx|xlsm|odt|ods|txt|csv|tsv|md|html?|xml|eml)$/i.test(formato) && <><Pill title={indice[d.id]?.errore || 'Il testo indicizzato è cercabile dalla ricerca globale'}>{processing === d.id ? 'Elaborazione…' : indice[d.id]?.stato === 'ocr' ? 'OCR' : indice[d.id]?.stato === 'scansione' ? 'Scansione: avvia OCR' : indice[d.id]?.stato === 'errore' ? 'Indice: errore' : indice[d.id]?.stato === 'testo' ? 'Testo indicizzato' : 'Da indicizzare'}</Pill><Btn size="sm" disabled={processing !== null || st === 'mancante'} onClick={async () => { setProcessing(d.id); try { await run(() => api.indicizzaDocumento(d.id, ocr), 'Testo aggiornato nella ricerca'); aggiorna() } finally { setProcessing(null) } }}>{ocr ? 'Leggi con OCR' : 'Aggiorna testo'}</Btn></>}
        <span className="muted small">{d.ora_id && oreById.get(d.ora_id) ? `Attività: ${oreById.get(d.ora_id)!.descrizione} · ` : ''}{fmtBytes(d.dimensione)} · {fmtDate(d.created_at)}</span>
        {st === 'mancante' && <Btn size="sm" onClick={() => run(() => api.ricollegaDocumento(d.id))}>Ricollega…</Btn>}
        <button className="icon-btn" title="Mostra nella cartella" aria-label={`Mostra ${d.nome} nella cartella`} disabled={st === 'mancante'} onClick={() => run(() => api.revealDocumento(d.id))}><FolderOpen size={15} /></button>
        <button className="icon-btn" title={d.percorso ? 'Cambia il nome mostrato (il file non viene rinominato)' : 'Rinomina'} aria-label={`Rinomina ${d.nome}`} onClick={() => { setRename(d); setName(d.nome) }}><Pencil size={15} /></button>
        <button className="icon-btn" title={d.percorso ? 'Rimuovi il collegamento (il file resta dov\'è)' : 'Elimina'} aria-label={`${d.percorso ? 'Rimuovi il collegamento a' : 'Elimina'} ${d.nome}`} onClick={() => elimina(d)}><Trash2 size={15} /></button>
      </div>
    )
  }
  return (
    <section className="card">
      <header className="card-head"><h2>Documenti</h2>
        <div className="row wrap">
          <Btn size="sm" disabled={sincronizzando} aria-busy={sincronizzando} onClick={sincronizzaTutto} title="Collega i file nuovi delle cartelle (sottocartelle comprese) e ritrova quelli spostati o rinominati"><RefreshCw size={14} className={sincronizzando ? 'gira' : undefined} /> {sincronizzando ? 'Sincronizzazione…' : 'Sincronizza'}</Btn>
          <Btn size="sm" onClick={() => go({ page: 'anonimizza', tab: 'pratica', id: praticaId })} title="Copie anonimizzate di tutti i documenti di questa pratica"><ShieldCheck size={14} /> Anonimizza…</Btn>
          <Btn size="sm" onClick={() => setDaModello(true)} title="Lettera, preventivo, delega o altro documento da un modello, già compilato con i dati di questa pratica e delle sue persone"><FilePlus2 size={14} /> Nuovo documento</Btn>
          <Btn size="sm" variant="primary" onClick={() => run(() => api.addDocumenti(praticaId))} title="I file restano dove sono: TIO ne ricorda la posizione"><Link2 size={14} /> Collega file</Btn>
        </div>
      </header>
      <div className="doc-cartella">
        <FolderInput size={15} aria-hidden />
        {pratica?.cartella
          ? <><span className="grow"><b>Cartella della pratica:</b> <span className="muted" title={pratica.cartella}>{breve(pratica.cartella)}</span></span><Btn size="sm" variant="ghost" onClick={() => run(() => api.apriCartellaPratica(praticaId))}>Apri</Btn><Btn size="sm" variant="ghost" onClick={cartella}>Cambia…</Btn></>
          : <><span className="grow muted">Nessuna cartella impostata: indica dove tieni i file di questa pratica, così li ritrovi anche se la sposti.</span><Btn size="sm" onClick={cartella}>Scegli cartella…</Btn><Btn size="sm" variant="ghost" onClick={() => run(() => api.collegaCartella(praticaId))} title="Collega tutti i file di una cartella">Collega una cartella…</Btn></>}
      </div>
      <div className="doc-cartella">
        <Cloud size={15} aria-hidden />
        {pratica?.cartella_cliens
          ? <><span className="grow"><b>Cartella del provider:</b> <span className="muted" title={pratica.cartella_cliens}>{breve(pratica.cartella_cliens)}</span></span><Btn size="sm" variant="ghost" onClick={() => run(() => api.cliensApri(praticaId))}>Apri</Btn><Btn size="sm" variant="ghost" onClick={cartellaCliens}>Cambia…</Btn><Btn size="sm" variant="ghost" onClick={scollegaCliens} aria-label="Scollega la cartella del provider" title="Scollega la cartella del provider"><Unlink size={14} /></Btn></>
          : <><span className="grow muted">Provider documenti (gestionale o cloud): la cartella in cui ne scarichi i file, mostrati insieme a quelli del computer senza doppioni.</span><Btn size="sm" onClick={cartellaCliens}>Collega cartella del provider…</Btn></>}
      </div>
      {mancanti.length > 0 && (
        <div className="doc-avviso" role="alert"><AlertTriangle size={16} aria-hidden /><span className="grow"><b>{mancanti.length === 1 ? '1 file non si trova più' : `${mancanti.length} file non si trovano più`}</b> dove erano: sono stati spostati o rinominati?</span><Btn size="sm" variant="primary" onClick={() => setSync(true)}>Sincronizza</Btn></div>
      )}
      {disco.daCollegare > 0 && !sincronizzando && (
        <div className="doc-avviso doc-avviso-info" role="status"><Folder size={16} aria-hidden /><span className="grow"><b>{disco.daCollegare === 1 ? '1 file della cartella non è ancora in elenco' : `${disco.daCollegare} file delle cartelle non sono ancora in elenco`}</b></span><Btn size="sm" variant="primary" onClick={sincronizzaTutto}>Collega ora</Btn></div>
      )}
      {conSottocartelle && <nav className="doc-percorso" aria-label="Cartella aperta">
        <ol>
          <li><button type="button" className="link-btn" disabled={tuttiInsieme} aria-current={!qui && !tuttiInsieme ? 'location' : undefined} onClick={() => setDove('')}>{tuttiInsieme ? 'Tutte le cartelle' : pratica?.cartella?.split(/[\\/]/).filter(Boolean).pop() || 'Documenti'}</button></li>
          {!tuttiInsieme && qui.split('/').filter(Boolean).map((nome, i, a) => <li key={i}><ChevronRight size={13} aria-hidden /><button type="button" className="link-btn" aria-current={i === a.length - 1 ? 'location' : undefined} onClick={() => setDove(a.slice(0, i + 1).join('/'))}>{nome}</button></li>)}
        </ol>
        <label className="check"><input type="checkbox" checked={tuttiInsieme} onChange={(e) => setTuttiInsieme(e.target.checked)} /> Tutti i file insieme</label>
      </nav>}
      {conSottocartelle && !tuttiInsieme && cartelle.map((c) => <button key={c.percorso} type="button" className="plain-row doc-sottocartella" onClick={() => setDove(c.percorso)}>
        <Folder size={18} aria-hidden /><span className="grow"><b>{c.nome}</b></span>{(() => { const n = Math.max(c.file, fileSulDisco(disco.file, c.percorso)); return <span className="muted small">{n === 0 ? 'Vuota' : n === 1 ? '1 file' : `${n} file`}{n > c.file ? ` · ${n - c.file} da collegare` : ''}</span> })()}<ChevronRight size={15} aria-hidden />
      </button>)}
      {conCliens
        ? ([['condivisa', 'In comune con il provider', 'Lo stesso file è nella cartella del provider e sul computer: un documento solo, si apre dalla copia sul computer'], ['cliens', 'Solo sul provider', 'File presenti soltanto nella cartella del provider'], ['locale', 'Solo sul computer', 'File della cartella della pratica o collegati da altre cartelle, non presenti sul provider']] as const).map(([k, titolo, aiuto]) => {
          const lista = elenco.filter((d) => (sezioni[d.id] || 'locale') === k)
          return <div key={k} className="doc-sezione"><p className="nav-section" title={aiuto}>{titolo} <span className="muted">· {lista.length}</span></p>{lista.map(riga)}{!lista.length && <p className="muted small doc-sezione-vuota">Nessun file.</p>}</div>
        })
        : elenco.map(riga)}
      {conSottocartelle && !tuttiInsieme && !conCliens && !file.length && docs.length > 0 && <p className="muted small doc-sezione-vuota">{cartelle.length ? 'Nessun file in questa cartella: apri una sottocartella.' : 'Cartella vuota.'}</p>}
      {!docs.length && <Empty icon={<Upload size={28} />} title="Trascina qui i file o collegali" text="I file restano nelle tue cartelle: TIO non ne fa una copia, ricorda dove sono e li ritrova se li sposti (pulsante «Sincronizza»)." />}
      {daModello && <NuovoDaModelloModal praticaId={praticaId} onClose={() => { setDaModello(false); aggiorna() }} />}
      {sync && <SincronizzaDocumentiModal praticaId={praticaId} onClose={() => { setSync(false); aggiorna() }} />}
      {rename && (
        <Modal title={rename.percorso ? 'Cambia il nome mostrato' : 'Rinomina documento'} subtitle={rename.percorso ? 'Cambia solo come compare in TIO: il file sul computer non viene rinominato.' : undefined} onClose={() => setRename(null)} width={460}
          footer={<><Btn variant="ghost" onClick={() => setRename(null)}>Annulla</Btn><Btn variant="primary" onClick={async () => { if (await run(() => api.renameDocumento(rename.id, name))) setRename(null) }}>Salva</Btn></>}>
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </Modal>
      )}
    </section>
  )
}
