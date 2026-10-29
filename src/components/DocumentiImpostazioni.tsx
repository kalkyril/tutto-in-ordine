import { useEffect, useState } from 'react'
import { FolderPlus, FolderSearch, RefreshCw, X } from 'lucide-react'
import { api } from '../api'
import { Btn, Field, Input, useAction } from './ui'
import { SincronizzaDocumentiModal } from './SincronizzaDocumenti'
import type { Settings } from '../types'

/** Impostazioni → Documenti: dove l'app salva i documenti che crea, dove cerca i file spostati, sincronizzazione di tutti i collegamenti. */
export function DocumentiImpostazioni({ d, up }: { d: Settings; up: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const run = useAction()
  const [sync, setSync] = useState(false)
  const [predefinita, setPredefinita] = useState('') // Documenti › TIO, su Windows la cartella utente
  useEffect(() => { api.appInfo().then((i: { cartelle?: { documenti?: string } }) => setPredefinita(i?.cartelle?.documenti || '')).catch(() => {}) }, [])
  const [conteggi, setConteggi] = useState<{ totali: number; mancanti: number; copie: number } | null>(null)
  const aggiorna = () => api.statoDocumenti().then((s) => { const v = Object.values(s); setConteggi({ totali: v.length, mancanti: v.filter((x) => x === 'mancante').length, copie: v.filter((x) => x === 'copia').length }) }).catch(() => {})
  useEffect(() => { aggiorna() }, [])
  const aggiungi = async () => { const f = await run(() => api.chooseFolder()); if (f && !d.cartelle_ricerca.includes(f)) up('cartelle_ricerca', [...d.cartelle_ricerca, f]) }
  return (
    <div className="stack">
      <section className="card pad-lg">
        <h2><RefreshCw size={16} /> Documenti collegati</h2>
        <p className="muted small">I documenti delle pratiche <b>restano nelle tue cartelle</b>: TIO non ne fa una copia, ricorda dove sono. Se sposti o rinomini un file o una cartella, «Sincronizza» ritrova i file e aggiorna i collegamenti.</p>
        {conteggi && <p className="small">{conteggi.totali} documenti{conteggi.mancanti > 0 && <> · <b className="late-text">{conteggi.mancanti} non trovati</b></>}{conteggi.copie > 0 && <> · {conteggi.copie} copie interne (versioni precedenti)</>}</p>}
        <div className="row wrap"><Btn variant="primary" onClick={() => setSync(true)}><RefreshCw size={15} /> Sincronizza tutti i collegamenti</Btn></div>
        {sync && <SincronizzaDocumentiModal onClose={() => { setSync(false); aggiorna() }} />}
      </section>
      <section className="card pad-lg">
        <h2><FolderSearch size={16} /> Dove cercare i file spostati</h2>
        <p className="muted small">Oltre alla cartella della pratica e a quella in cui il file si trovava, la sincronizzazione cerca anche in queste cartelle (con le sottocartelle). Meglio indicare le cartelle dove tieni i documenti di lavoro, non l'intero disco.</p>
        {d.cartelle_ricerca.length > 0 && (
          <ul className="chips-lista">{d.cartelle_ricerca.map((c) => <li key={c} className="chip on static" title={c}>{c}<button aria-label={`Rimuovi ${c}`} onClick={() => up('cartelle_ricerca', d.cartelle_ricerca.filter((x) => x !== c))}><X size={12} /></button></li>)}</ul>
        )}
        <Btn onClick={aggiungi}><FolderPlus size={15} /> Aggiungi una cartella…</Btn>
      </section>
      <section className="card pad-lg">
        <h2>Documenti creati da TIO</h2>
        <p className="muted small">{d.profilo === 'ditta' ? 'Documenti, PDF e altri file creati dall’app' : 'Atti, PDF delle parcelle e altri file generati dall’app'} vengono salvati in una cartella del tuo computer (una sottocartella per {d.etichette.pratica.toLowerCase()}) e collegati {d.etichette.pratica.toLowerCase() === 'pratica' || d.etichette.pratica.toLowerCase() === 'commessa' ? 'alla' : 'al'} {d.etichette.pratica.toLowerCase()}.</p>
        <Field label="Cartella dei documenti creati dall'app" hint={`Se vuota: ${predefinita || 'cartella predefinita'}`}>
          <div className="row"><Input readOnly value={d.cartella_documenti} placeholder={predefinita ? `Predefinita: ${predefinita}` : 'Cartella predefinita'} /><Btn onClick={async () => { const f = await api.chooseFolder(); if (f) up('cartella_documenti', f) }}>Scegli…</Btn>{d.cartella_documenti && <Btn variant="ghost" onClick={() => up('cartella_documenti', '')}>Predefinita</Btn>}</div>
        </Field>
        <p className="muted small" style={{ marginTop: 10 }}><b>Backup:</b> i documenti collegati non sono inclusi nel backup di TIO (restano nelle loro cartelle). Includi quelle cartelle nel backup del computer.</p>
      </section>
    </div>
  )
}
