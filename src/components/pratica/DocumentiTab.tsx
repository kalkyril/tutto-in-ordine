import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, File as FileIcon, FilePlus2, ShieldCheck, FolderInput, FolderOpen, Link2, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react'
import { api } from '../../api'
import { useData } from '../../store'
import { useNav } from '../../nav'
import { Btn, Empty, Field, Input, Modal, Pill, useAction, useFeedback } from '../ui'
import { SincronizzaDocumentiModal } from '../SincronizzaDocumenti'
import { NuovoDaModelloModal } from '../CreaDocumento'
import { fmtBytes } from '../../lib/format'
import { fmtDate } from '../../lib/dates'
import type { Documento } from '../../types'

type Stato = 'ok' | 'mancante' | 'copia'
const cartellaDi = (p?: string | null) => (p ? p.replace(/[\\/][^\\/]*$/, '') : '')
const breve = (p: string) => { const x = p.split(/[\\/]/); return x.length > 4 ? `…/${x.slice(-3).join('/')}` : p }

/** Documenti della pratica: i file restano nelle cartelle dell'utente; TIO ne ricorda la posizione (nessuna copia) e li ritrova se vengono spostati. */
export function DocumentiTab({ praticaId, docs }: { praticaId: number; docs: Documento[] }) {
  const { ore, praticaById } = useData()
  const pratica = praticaById.get(praticaId)
  const oreById = useMemo(() => new Map(ore.map((o) => [o.id, o])), [ore])
  const run = useAction()
  const { confirm, eliminaConAnnulla } = useFeedback()
  const [indice, setIndice] = useState<Record<number, { stato: string | null; errore: string | null }>>({})
  const [processing, setProcessing] = useState<number | null>(null)
  const [rename, setRename] = useState<Documento | null>(null)
  const [sync, setSync] = useState(false)
  const [daModello, setDaModello] = useState(false)
  const { go } = useNav()
  const [name, setName] = useState('')
  const [stato, setStato] = useState<Record<number, Stato>>({})

  // controlla che i file esistano ancora: all'apertura, quando i documenti cambiano e quando si torna sulla finestra (dopo aver spostato file nel Finder/Esplora risorse)
  const chiavi = JSON.stringify(docs)
  const aggiorna = useCallback(() => { api.statoDocumenti(praticaId).then(setStato).catch(() => {}); api.indiceDocumenti(praticaId).then((rows) => setIndice(Object.fromEntries(rows.map((r) => [r.id, r])))).catch(() => {}) }, [praticaId])
  useEffect(() => { aggiorna() }, [aggiorna, chiavi])
  useEffect(() => { window.addEventListener('focus', aggiorna); return () => window.removeEventListener('focus', aggiorna) }, [aggiorna])
  const mancanti = docs.filter((d) => stato[d.id] === 'mancante')

  const elimina = async (d: Documento) => {
    const collegato = !!d.percorso
    if (collegato) { await eliminaConAnnulla('documenti', d.id, 'Collegamento al documento'); return } // il file dell'utente non si tocca: basta «Annulla»
    if (await confirm({ title: collegato ? 'Rimuovere il collegamento?' : 'Eliminare il documento?', text: collegato ? `${d.nome} non sarà più elencato qui. Il file originale non viene toccato: resta dove si trova.` : `${d.nome} è una copia dentro TIO e verrà rimossa anche dal disco.`, ok: collegato ? 'Rimuovi collegamento' : 'Elimina', danger: !collegato })) run(() => api.remove('documenti', d.id))
  }
  const cartella = async () => { const r = await run(() => api.cartellaPratica(praticaId)); if (r) { aggiorna(); if (r.aggiornati) return } }
  return (
    <section className="card">
      <header className="card-head"><h2>Documenti</h2>
        <div className="row wrap">
          <Btn size="sm" onClick={() => setSync(true)} title="Ritrova i file spostati o rinominati e aggiorna i collegamenti"><RefreshCw size={14} /> Sincronizza</Btn>
          <Btn size="sm" onClick={() => go({ page: 'anonimizza', tab: 'pratica', id: praticaId })} title="Copie anonimizzate di tutti i documenti di questa pratica"><ShieldCheck size={14} /> Anonimizza…</Btn>
          <Btn size="sm" onClick={() => setDaModello(true)} title="Lettera, preventivo o altro documento da un modello, già compilato con i dati di questa pratica"><FilePlus2 size={14} /> Da modello…</Btn>
          <Btn size="sm" variant="primary" onClick={() => run(() => api.addDocumenti(praticaId))} title="I file restano dove sono: TIO ne ricorda la posizione"><Link2 size={14} /> Collega file</Btn>
        </div>
      </header>
      <div className="doc-cartella">
        <FolderInput size={15} aria-hidden />
        {pratica?.cartella
          ? <><span className="grow"><b>Cartella della pratica:</b> <span className="muted" title={pratica.cartella}>{breve(pratica.cartella)}</span></span><Btn size="sm" variant="ghost" onClick={() => run(() => api.apriCartellaPratica(praticaId))}>Apri</Btn><Btn size="sm" variant="ghost" onClick={cartella}>Cambia…</Btn></>
          : <><span className="grow muted">Nessuna cartella impostata: indica dove tieni i file di questa pratica, così li ritrovi anche se la sposti.</span><Btn size="sm" onClick={cartella}>Scegli cartella…</Btn><Btn size="sm" variant="ghost" onClick={() => run(() => api.collegaCartella(praticaId))} title="Collega tutti i file di una cartella">Collega una cartella…</Btn></>}
      </div>
      {mancanti.length > 0 && (
        <div className="doc-avviso" role="alert"><AlertTriangle size={16} aria-hidden /><span className="grow"><b>{mancanti.length === 1 ? '1 file non si trova più' : `${mancanti.length} file non si trovano più`}</b> dove erano: sono stati spostati o rinominati?</span><Btn size="sm" variant="primary" onClick={() => setSync(true)}>Sincronizza</Btn></div>
      )}
      {docs.map((d) => {
        const st = stato[d.id]
        const formato = d.percorso || d.file || d.nome
        const ocr = /\.(pdf|png|jpe?g|tiff?|webp|bmp)$/i.test(formato)
        return (
          <div key={d.id} className={`plain-row static ${st === 'mancante' ? 'doc-mancante' : ''}`}>
            <FileIcon size={18} />
            {/\.(pdf|png|jpe?g|webp|bmp)$/i.test(d.percorso || d.file || d.nome) && <Btn size="sm" disabled={st === 'mancante'} onClick={() => run(() => api.anteprimaDocumento(d.id))} aria-label={`Anteprima di ${d.nome}`}>Anteprima</Btn>}
            <span className="grow doc-nome"><button className="link-btn left" onClick={() => run(() => api.openDocumento(d.id))}>{d.nome}</button>
              {d.percorso && <small className="muted" title={d.percorso}>{breve(cartellaDi(d.percorso))}</small>}</span>
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
      })}
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
