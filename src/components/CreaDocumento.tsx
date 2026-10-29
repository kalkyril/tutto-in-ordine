import { useEffect, useMemo, useState } from 'react'
import { FilePlus2, FileText, Settings2 } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { Btn, Field, FormGrid, Input, Modal, Select, useAction, useFeedback } from './ui'
import { PraticaSelect } from './forms'
import { campiDisponibili, campiUsati, documentoEsportabile, documentoHtml, FORMATI_DOCUMENTO, modelliDisponibili, TIPI_DOCUMENTO, valoriCampi } from '../lib/documento'
import type { ModelloDocumento } from '../types'

/** Documento da un modello: campi compilati da pratica, destinatario e attività; quelli mancanti si scrivono qui. */
export function CreaDocumentoModal({ m, praticaId: praticaIniziale = null, onClose }: { m: ModelloDocumento; praticaId?: number | null; onClose: () => void }) {
  const { settings, anagrafica, praticaById, anagraficaById } = useData()
  const run = useAction()
  const { toast } = useFeedback()
  const L = settings.etichette
  const [praticaId, setPraticaId] = useState<number | null>(praticaIniziale)
  const pratica = praticaId ? praticaById.get(praticaId) || null : null
  const [destId, setDestId] = useState<number | null>(null)
  useEffect(() => { if (pratica?.cliente_id) setDestId(pratica.cliente_id) }, [pratica?.cliente_id])
  const [formato, setFormato] = useState<string>('docx')
  const [collega, setCollega] = useState(true)
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [lavoro, setLavoro] = useState(false)
  const destinatario = destId ? anagraficaById.get(destId) || null : null
  const base = valoriCampi(settings, { destinatario, pratica, controparte: pratica?.controparte_id ? anagraficaById.get(pratica.controparte_id) : null, luogo: m.luogo })
  const usati = m.word ? m.campiWord || [] : campiUsati(m)
  const nomi = new Map(campiDisponibili(settings).map((c) => [c.id, `${c.gruppo}: ${c.etichetta.toLowerCase()}`]))
  const daChiedere = usati.filter((id) => !base[id])
  const valori = { ...base, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v.trim())) }
  const [nome, setNome] = useState('')
  const nomeFile = nome || [m.nome, destinatario?.denominazione].filter(Boolean).join(' - ')
  const ordinati = useMemo(() => [...anagrafica].sort((a, b) => a.denominazione.localeCompare(b.denominazione, 'it')), [anagrafica])
  const vai = async () => {
    setLavoro(true)
    try {
      const c = { valori, luogo: m.luogo }
      if (m.word) {
        const r = await run(() => api.creaDaModelloWord({ id: m.id, valori, nome: nomeFile, praticaId: collega ? praticaId : null }))
        if (r) { toast(collega && praticaId ? `Documento Word creato e collegato a ${pratica?.numero || L.pratica.toLowerCase()}` : 'Documento Word creato'); onClose() }
        return
      }
      const p = formato === 'pdf'
        ? await run(() => api.printPdf(documentoHtml(m, c), nomeFile, collega && praticaId ? praticaId : null, 'Documenti'))
        : await run(async () => api.esportaDocumento({ nome: nomeFile, formato, documento: await documentoEsportabile(m, c), praticaId: collega ? praticaId : null }))
      if (p) { toast(collega && praticaId ? `Documento creato e collegato a ${pratica?.numero || L.pratica.toLowerCase()}` : 'Documento creato'); onClose() }
    } finally { setLavoro(false) }
  }
  return <Modal title={`Crea documento: ${m.nome}`} subtitle="I campi si compilano con i dati dell’archivio; quelli mancanti puoi scriverli qui" width={720} onClose={onClose} protectChanges={false}
    footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" disabled={lavoro} onClick={vai}>{lavoro ? 'Creazione…' : 'Crea e salva…'}</Btn></>}>
    <div className="crea-documento">
      <FormGrid>
        <Field label={praticaIniziale ? L.pratica : `${L.pratica} (facoltativa)`}><PraticaSelect value={praticaId} onChange={setPraticaId} /></Field>
        <Field label="Destinatario"><Select value={destId ?? ''} onChange={(e) => setDestId(e.target.value ? Number(e.target.value) : null)}><option value="">— Nessuno —</option>{ordinati.map((a) => <option key={a.id} value={a.id}>{a.denominazione}</option>)}</Select></Field>
      </FormGrid>
      {daChiedere.length > 0 && <fieldset className="crea-campi"><legend>Campi da completare</legend>
        <FormGrid>{daChiedere.map((id) => <Field key={id} label={nomi.get(id) || id}><Input value={extra[id] || ''} onChange={(e) => setExtra((x) => ({ ...x, [id]: e.target.value }))} placeholder="Lascia vuoto per completarlo dopo" /></Field>)}</FormGrid>
      </fieldset>}
      {m.word ? <p className="muted small crea-word">Modello Word: il documento si crea in formato Word (.docx) con la stessa impaginazione del tuo file.</p> : <fieldset className="crea-formati"><legend>Formato</legend>
        {FORMATI_DOCUMENTO.map((f) => <label key={f.id} className={`formato${formato === f.id ? ' on' : ''}`}><input type="radio" name="formato" value={f.id} checked={formato === f.id} onChange={() => setFormato(f.id)} /><b>{f.nome}</b><span className="muted small">{f.nota}</span></label>)}
      </fieldset>}
      <Field label="Nome del file"><Input value={nomeFile} onChange={(e) => setNome(e.target.value)} /></Field>
      {praticaId && <label className="check"><input type="checkbox" checked={collega} onChange={(e) => setCollega(e.target.checked)} /> Salva nella cartella della {L.pratica.toLowerCase()} e collega il file ai suoi documenti</label>}
      {daChiedere.some((id) => !extra[id]?.trim()) && <p className="muted small">I campi lasciati vuoti restano nel documento tra doppie graffe, così li ritrovi facilmente.</p>}
    </div>
  </Modal>
}

/** Dalla scheda di una pratica: si sceglie il modello e si crea il documento già collegato alla pratica. */
export function NuovoDaModelloModal({ praticaId, onClose }: { praticaId: number; onClose: () => void }) {
  const { settings } = useData()
  const { go } = useNav()
  const modelli = useMemo(() => modelliDisponibili(settings), [settings])
  const [scelto, setScelto] = useState<ModelloDocumento | null>(null)
  if (scelto) return <CreaDocumentoModal m={scelto} praticaId={praticaId} onClose={onClose} />
  const ordina = (l: ModelloDocumento[]) => [...l].sort((x, y) => x.nome.localeCompare(y.nome, 'it'))
  const gruppi = ([['Modelli predefiniti', ordina(modelli.filter((m) => m.predefinito))], ['I miei modelli', ordina(modelli.filter((m) => !m.predefinito))]] as const).filter(([, l]) => l.length)
  return <Modal title="Nuovo documento da un modello" subtitle={`Il documento si compila con i dati della ${settings.etichette.pratica.toLowerCase()} e viene salvato nella sua cartella`} width={760} onClose={onClose} protectChanges={false}
    footer={<><Btn variant="ghost" onClick={() => { onClose(); go('documenti') }}><Settings2 size={14} /> Gestisci i modelli</Btn><Btn variant="ghost" onClick={onClose}>Annulla</Btn></>}>
    <div className="scegli-modello">
      {gruppi.map(([g, lista]) => <section key={g}><h3 className="nav-section">{g}</h3>
        <div className="documenti-tipi">{lista.map((m) => <button key={m.id} type="button" className="documenti-tipo" onClick={() => setScelto(m)}><FileText size={20} aria-hidden /><b>{m.nome}</b><span className="muted small">{m.nome.trim().toLowerCase() === m.tipo.toLowerCase() ? TIPI_DOCUMENTO.find((t) => t.tipo === m.tipo)?.descrizione || m.tipo : m.tipo}</span></button>)}</div>
      </section>)}
      {!modelli.length && <p className="muted"><FilePlus2 size={14} aria-hidden /> Nessun modello: creane uno nella sezione Documenti.</p>}
    </div>
  </Modal>
}
