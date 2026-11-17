import { useEffect, useMemo, useState } from 'react'
import { Eye, FilePlus2, FileText, Plus, Settings2 } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { Btn, Field, FormGrid, Input, Modal, Select, useAction, useFeedback } from './ui'
import { AnagraficaForm, PraticaSelect } from './forms'
import { CAMPI_SPECIALI, campiDisponibili, campiUsati, documentoEsportabile, documentoHtml, FORMATI_DOCUMENTO, modelliDisponibili, TIPI_DOCUMENTO, usaAltraPersona, valoriCampi } from '../lib/documento'
import { personeDi } from '../lib/persone'
import { nomeRuolo } from '../lib/recapiti'
import { EditorTesto } from './EditorTesto'
import { AnteprimaGrande } from './AnteprimaGrande'
import type { Anagrafica, ModelloDocumento, Pratica } from '../types'

/** Scelta di una persona: prima quelle della pratica, con il loro ruolo, poi tutta la rubrica; «+» ne crea una nuova. */
function PersonaSelect({ value, onChange, pratica, nuovaRuolo }: { value: number | null; onChange: (id: number | null) => void; pratica: Pratica | null; nuovaRuolo?: Anagrafica['ruolo'] }) {
  const { anagrafica, anagraficaById, settings } = useData()
  const [nuova, setNuova] = useState(false)
  const nella = pratica ? personeDi(pratica, anagraficaById) : []
  const ids = new Set(nella.map((x) => x.contatto.id))
  const resto = useMemo(() => [...anagrafica].filter((a) => !ids.has(a.id)).sort((a, b) => a.denominazione.localeCompare(b.denominazione, 'it')), [anagrafica, nella.length]) // eslint-disable-line react-hooks/exhaustive-deps -- `ids` deriva da `nella`
  return <div className="row">
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">— Nessuno —</option>
      {nella.length > 0 && <optgroup label={`Nella ${settings.etichette.pratica.toLowerCase()}`}>{nella.map((x) => <option key={`${x.contatto.id}-${x.ruolo}`} value={x.contatto.id}>{x.contatto.denominazione} · {nomeRuolo(x.ruolo, settings.profilo, settings.etichette)}</option>)}</optgroup>}
      <optgroup label="Rubrica">{resto.map((a) => <option key={a.id} value={a.id}>{a.denominazione}</option>)}</optgroup>
    </Select>
    <Btn type="button" size="sm" title="Nuova persona in rubrica" aria-label="Nuova persona in rubrica" onClick={() => setNuova(true)}><Plus size={14} /></Btn>
    {nuova && <AnagraficaForm ruolo={nuovaRuolo} onClose={() => setNuova(false)} onSaved={(a) => onChange(a.id)} />}
  </div>
}

/** Documento da un modello: campi compilati da pratica, destinatario e attività; quelli mancanti si scrivono qui. */
export function CreaDocumentoModal({ m, praticaId: praticaIniziale = null, onClose }: { m: ModelloDocumento; praticaId?: number | null; onClose: () => void }) {
  const { settings, praticaById, anagraficaById } = useData()
  const run = useAction()
  const { toast } = useFeedback()
  const L = settings.etichette
  const [praticaId, setPraticaId] = useState<number | null>(praticaIniziale)
  const pratica = praticaId ? praticaById.get(praticaId) || null : null
  const [destId, setDestId] = useState<number | null>(null)
  const [personaId, setPersonaId] = useState<number | null>(null)
  useEffect(() => { if (pratica?.cliente_id) setDestId(pratica.cliente_id) }, [pratica?.cliente_id])
  const [formato, setFormato] = useState<string>('docx')
  const [collega, setCollega] = useState(true)
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [lavoro, setLavoro] = useState(false)
  const destinatario = destId ? anagraficaById.get(destId) || null : null
  const persona = personaId ? anagraficaById.get(personaId) || null : null
  const base = valoriCampi(settings, { destinatario, pratica, persona, controparte: pratica?.controparte_id ? anagraficaById.get(pratica.controparte_id) : null, luogo: m.luogo })
  const usati = m.word ? m.campiWord || [] : campiUsati(m)
  const conPersona = usaAltraPersona(usati)
  // l'etichetta dice a chi serve la seconda persona: «Delegato» nella delega, «Collega» nella delega di udienza
  const etichettaPersona = /udienza/i.test(m.tipo + ' ' + m.nome) ? 'Collega' : /deleg/i.test(m.tipo + ' ' + m.nome) ? 'Delegato' : 'Altra persona'
  const nomi = new Map(campiDisponibili(settings).map((c) => [c.id, `${c.gruppo}: ${c.etichetta.toLowerCase()}`]))
  const daChiedere = usati.filter((id) => !base[id] && !CAMPI_SPECIALI.has(id))
  // {{corpo.documento}}: il testo lungo si incolla qui, con titoli, capitoli, tabelle e immagini
  const conCorpo = !m.word && usati.includes('corpo.documento')
  const [corpoDocumento, setCorpoDocumento] = useState('')
  const [anteprima, setAnteprima] = useState<string | null>(null)
  const valori = { ...base, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v.trim())) }
  const [nome, setNome] = useState('')
  const nomeFile = nome || [m.nome, destinatario?.denominazione].filter(Boolean).join(' - ')
  const vai = async () => {
    setLavoro(true)
    try {
      const c = { valori, luogo: m.luogo, corpoDocumento }
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
  return <Modal title={`Crea documento: ${m.nome}`} subtitle="I campi si compilano con i dati dell’archivio; quelli mancanti puoi scriverli qui" width={conCorpo ? 980 : 720} onClose={onClose} protectChanges={false}
    footer={<>{!m.word && <Btn style={{ marginRight: 'auto' }} onClick={() => setAnteprima(documentoHtml(m, { valori, luogo: m.luogo, corpoDocumento }))} title="Il documento compilato, a tutta finestra e con lo zoom"><Eye size={15} /> Anteprima</Btn>}<Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" disabled={lavoro} onClick={vai}>{lavoro ? 'Creazione…' : 'Crea e salva…'}</Btn></>}>
    <div className="crea-documento">
      <FormGrid>
        <Field label={praticaIniziale ? L.pratica : `${L.pratica} (facoltativa)`}><PraticaSelect value={praticaId} onChange={setPraticaId} /></Field>
        <Field label={/deleg/i.test(m.tipo + ' ' + m.nome) && !/udienza/i.test(m.tipo + ' ' + m.nome) ? 'Delegante' : 'Destinatario'}><PersonaSelect value={destId} onChange={setDestId} pratica={pratica} nuovaRuolo="cliente" /></Field>
        {conPersona && <Field label={etichettaPersona}><PersonaSelect value={personaId} onChange={setPersonaId} pratica={pratica} nuovaRuolo="altro" /></Field>}
      </FormGrid>
      {daChiedere.length > 0 && <fieldset className="crea-campi"><legend>Campi da completare</legend>
        <FormGrid>{daChiedere.map((id) => <Field key={id} label={nomi.get(id) || id.charAt(0).toUpperCase() + id.slice(1)}><Input value={extra[id] || ''} onChange={(e) => setExtra((x) => ({ ...x, [id]: e.target.value }))} placeholder="Lascia vuoto per completarlo dopo" /></Field>)}</FormGrid>
      </fieldset>}
      {conCorpo && <fieldset className="crea-campi corpo-lungo"><legend>Testo del documento</legend>
        <p className="muted small">Incolla o scrivi qui il testo lungo che prende il posto di {'{{corpo.documento}}'}: da Word, da una pagina web o da un PDF. Titoli, capitoli, elenchi e tabelle vengono riconosciuti; con «Riconosci titoli e capitoli» sistemi quelli del testo semplice.</p>
        <EditorTesto valore="" campi={campiDisponibili(settings)} allineamento={m.allineamento || 'sinistra'} colonne={1} onChange={setCorpoDocumento} opzioni={{ senzaCampi: true, etichetta: 'Testo lungo del documento' }} />
      </fieldset>}
      {!m.word && usati.includes('firma') && !m.firma && <p className="muted small">Il modello usa {'{{firma}}'} ma non ha la foto della firma: aggiungila in Documenti › Impaginazione › Firma, oppure firma a mano dopo la stampa.</p>}
      {m.word ? <p className="muted small crea-word">Modello Word: il documento si crea in formato Word (.docx) con la stessa impaginazione del tuo file.</p> : <fieldset className="crea-formati"><legend>Formato</legend>
        {FORMATI_DOCUMENTO.map((f) => <label key={f.id} className={`formato${formato === f.id ? ' on' : ''}`}><input type="radio" name="formato" value={f.id} checked={formato === f.id} onChange={() => setFormato(f.id)} />{f.nome}</label>)}
      </fieldset>}
      <Field label="Nome del file"><Input value={nomeFile} onChange={(e) => setNome(e.target.value)} /></Field>
      {praticaId && <label className="check"><input type="checkbox" checked={collega} onChange={(e) => setCollega(e.target.checked)} /> Salva nella cartella della {L.pratica.toLowerCase()} e collega il file ai suoi documenti</label>}
      {daChiedere.some((id) => !extra[id]?.trim()) && <p className="muted small">I campi lasciati vuoti restano nel documento tra doppie graffe, così li ritrovi facilmente.</p>}
    </div>
    {anteprima && <AnteprimaGrande html={anteprima} titolo={nomeFile} onClose={() => setAnteprima(null)} />}
  </Modal>
}

/** Dalla scheda di una pratica: si sceglie il modello e si crea il documento già collegato alla pratica. */
export function NuovoDaModelloModal({ praticaId, onClose }: { praticaId: number; onClose: () => void }) {
  const { settings } = useData()
  const { go } = useNav()
  const modelli = useMemo(() => modelliDisponibili(settings), [settings])
  const [scelto, setScelto] = useState<ModelloDocumento | null>(null)
  if (scelto) return <CreaDocumentoModal m={scelto} praticaId={praticaId} onClose={onClose} />
  const elenco = [...modelli].sort((x, y) => x.nome.localeCompare(y.nome, 'it', { sensitivity: 'base', numeric: true }))
  return <Modal title="Nuovo documento" subtitle={`Il documento si compila con i dati della ${settings.etichette.pratica.toLowerCase()} e viene salvato nella sua cartella`} width={760} onClose={onClose} protectChanges={false}
    footer={<><Btn variant="ghost" onClick={() => { onClose(); go('documenti') }}><Settings2 size={14} /> Gestisci i modelli</Btn><Btn variant="ghost" onClick={onClose}>Annulla</Btn></>}>
    <div className="scegli-modello">
      {elenco.length > 0 && <div className="documenti-tipi">{elenco.map((m) => <button key={m.id} type="button" className="documenti-tipo" onClick={() => setScelto(m)}><FileText size={20} aria-hidden /><b>{m.nome}</b>{m.nome.trim().toLowerCase() === m.tipo.toLowerCase() && <span className="muted small">{TIPI_DOCUMENTO.find((t) => t.tipo === m.tipo)?.descrizione}</span>}</button>)}</div>}
      {!modelli.length && <p className="muted"><FilePlus2 size={14} aria-hidden /> Nessun modello: creane uno nella sezione Documenti.</p>}
    </div>
  </Modal>
}
