import { useMemo, useState } from 'react'
import { FileInput, FolderOpen, RefreshCw } from 'lucide-react'
import { api, type EsitoFatture } from '../../api'
import { useData } from '../../store'
import { Btn, Empty, Field, FormGrid, Input, Modal, Pill, Segmented, Select, useAction, useFeedback } from '../ui'
import { categorieCosto } from '../GestioneAttivita'
import { fmtDate, todayStr } from '../../lib/dates'
import { money } from '../../lib/format'
import { CATEGORIA_FATTURE_RICEVUTE, fattureDoppie, type FatturaServizio } from '../../lib/pagamenti'
import type { ContestoBudget } from './contesto'

type Filtro = 'tutte' | 'emessa' | 'ricevuta' | 'aperte' | 'nascoste'

/** Segna in TIO quando una fattura del servizio è stata incassata o pagata, e su quale conto. Il servizio non cambia. */
function Regola({ f, c, onClose }: { f: FatturaServizio; c: ContestoBudget; onClose: () => void }) {
  const run = useAction()
  const { settings } = useData()
  const conti = c.b.conti.filter((x) => !x.archiviato)
  const [data, setData] = useState(f.regolata_il || todayStr())
  const [conto, setConto] = useState<number | ''>(f.conto_id ?? conti.find((x) => x.predefinito)?.id ?? conti[0]?.id ?? '')
  const [categoria, setCategoria] = useState(f.categoria || '')
  const emessa = f.verso === 'emessa'
  const salva = async () => { if (await run(() => api.budget('fattura', { id: f.id, regolata_il: data, conto_id: conto || null, ...(emessa ? {} : { categoria }) }), emessa ? 'Segnata come incassata' : 'Segnata come pagata') !== undefined) onClose() }
  return <Modal title={`${emessa ? 'Incasso' : 'Pagamento'} della fattura ${f.numero}`} subtitle={`${f.controparte || ''} · ${money(f.netto || f.totale)} · solo in TIO: il servizio di fatturazione non viene modificato`} width={520} onClose={onClose}
    footer={<>{f.regolata_il && <Btn variant="ghost" onClick={() => run(() => api.budget('fattura', { id: f.id, regolata_il: null })).then(onClose)}>{emessa ? 'Non ancora incassata' : 'Non ancora pagata'}</Btn>}<Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={salva}>Salva</Btn></>}>
    <FormGrid>
      <Field label={emessa ? 'Incassata il' : 'Pagata il'}><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Field>
      <Field label="Conto">{conti.length ? <Select value={conto} onChange={(e) => setConto(Number(e.target.value))}>{conti.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</Select> : <Input disabled value="Nessun conto: aggiungilo in Budget › Conti" />}</Field>
      {!emessa && <Field label="Categoria di spesa" span={2}><Select value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">{CATEGORIA_FATTURE_RICEVUTE}</option>{categorieCosto(settings.profilo === 'avvocato', f.categoria || undefined).map((x) => <option key={x}>{x}</option>)}</Select></Field>}
    </FormGrid>
  </Modal>
}

/**
 * Fatture lette dal servizio di fatturazione dell'utente. TIO legge i file XML, .p7m o ZIP che l'utente esporta in una
 * cartella; non si collega al servizio, non lo modifica e non invia nulla. Qui si annota solo ciò che serve al budget.
 */
export function FattureServizio({ c }: { c: ContestoBudget }) {
  const { settings, parcelle } = useData()
  const run = useAction()
  const { toast } = useFeedback()
  const [filtro, setFiltro] = useState<Filtro>('tutte')
  const [cerca, setCerca] = useState('')
  const [anno, setAnno] = useState<number | 'tutti'>(c.anno)
  const [regola, setRegola] = useState<FatturaServizio | null>(null)
  const [esito, setEsito] = useState<EsitoFatture | null>(null)
  const cartella: string | undefined = settings.cartella_fatture
  const doppie = useMemo(() => fattureDoppie(c.b.fatture, parcelle), [c.b.fatture, parcelle])
  const anni = useMemo(() => [...new Set([c.anno, ...c.b.fatture.map((f) => Number(f.data.slice(0, 4)))])].sort((a, b) => b - a), [c.b.fatture, c.anno])
  const nomeConto = (id: number | null) => c.b.conti.find((x) => x.id === id)?.nome
  const leggi = async (fn: () => Promise<EsitoFatture | null>) => {
    const r = await run(fn); if (!r) return
    setEsito(r)
    toast(r.nuove ? `${r.nuove} ${r.nuove === 1 ? 'fattura nuova' : 'fatture nuove'}` : 'Nessuna fattura nuova')
  }
  const q = cerca.trim().toLowerCase()
  const elenco = c.b.fatture.filter((f) => (anno === 'tutti' || f.data.startsWith(String(anno)))
    && (filtro === 'nascoste' ? f.nascosta : !f.nascosta)
    && (filtro === 'emessa' || filtro === 'ricevuta' ? f.verso === filtro : true)
    && (filtro === 'aperte' ? !f.regolata_il && !doppie.has(f.id) : true)
    && (!q || [f.numero, f.controparte, f.descrizione, f.piva].some((x) => x && x.toLowerCase().includes(q))))
  const somma = (v: 'emessa' | 'ricevuta') => elenco.filter((f) => f.verso === v && !doppie.has(f.id)).reduce((s, f) => s + (f.netto || f.totale), 0)

  const pulsanti = <div className="toolbar">
    <Btn variant={cartella ? 'soft' : 'primary'} onClick={() => leggi(api.budgetCartellaFatture)}><FolderOpen size={15} /> {cartella ? 'Cambia cartella…' : 'Scegli la cartella delle fatture…'}</Btn>
    {cartella && <Btn variant="primary" onClick={() => leggi(api.budgetRileggiFatture)}><RefreshCw size={15} /> Rileggi la cartella</Btn>}
    <Btn onClick={() => leggi(api.budgetFileFatture)}><FileInput size={15} /> Aggiungi file…</Btn>
  </div>

  if (!c.b.fatture.length) return <div className="budget">
    <Empty icon={<FileInput size={30} />} title="Nessuna fattura del servizio" text="Esporta dal tuo servizio di fatturazione le fatture elettroniche (XML, .p7m o ZIP) in una cartella e sceglila qui: TIO le legge senza collegarsi al servizio e senza modificarlo." action={pulsanti} />
    <section className="card pad fatture-come"><h2>Come esportare le fatture</h2>
      <ul>
        <li><b>Fatture e Corrispettivi (Agenzia delle Entrate)</b>: Consultazione › Fatture elettroniche, scegli il periodo, seleziona tutto e scarica i file.</li>
        <li><b>Servizi come Fatture in Cloud, Aruba, TeamSystem, Danea</b>: dall’elenco delle fatture emesse e ricevute cerca «Esporta» o «Scarica XML», di solito in un unico ZIP.</li>
        <li>Salva i file sempre nella stessa cartella: ogni volta che ne aggiungi, premi «Rileggi la cartella». Le fatture già lette non si duplicano.</li>
      </ul>
    </section>
    {esito && <EsitoLettura esito={esito} />}
  </div>

  return <div className="budget">
    {pulsanti}
    {cartella && <p className="muted small">Cartella <b title={cartella}>«{cartella.split(/[\\/]/).filter(Boolean).pop()}»</b>. TIO legge i file e non scrive nulla, né nella cartella né nel servizio di fatturazione.</p>}
    {esito && <EsitoLettura esito={esito} />}
    <div className="toolbar">
      <select value={anno} onChange={(e) => setAnno(e.target.value === 'tutti' ? 'tutti' : Number(e.target.value))} aria-label="Anno"><option value="tutti">Tutti gli anni</option>{anni.map((a) => <option key={a}>{a}</option>)}</select>
      <Segmented<Filtro> value={filtro} onChange={setFiltro} options={[{ id: 'tutte', label: 'Tutte' }, { id: 'emessa', label: 'Emesse' }, { id: 'ricevuta', label: 'Ricevute' }, { id: 'aperte', label: 'Da regolare' }, { id: 'nascoste', label: 'Nascoste' }]} />
      <input type="search" placeholder="Cerca numero, cliente, fornitore…" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca tra le fatture" />
    </div>
    <p className="muted small">Emesse {money(somma('emessa'))} · ricevute {money(somma('ricevuta'))} · {elenco.length} {elenco.length === 1 ? 'fattura' : 'fatture'}</p>
    {elenco.length ? <div className="table-wrap"><table className="table fatture-servizio">
      <thead><tr><th>Data</th><th>Numero</th><th>Cliente o fornitore</th><th className="n">Da incassare o pagare</th><th>Stato</th><th><span className="sr-only">Azioni</span></th></tr></thead>
      <tbody>{elenco.map((f) => { const doppia = doppie.has(f.id); return <tr key={f.id} className={doppia ? 'muted' : ''}>
        <td className="nowrap">{fmtDate(f.data)}</td>
        <td className="nowrap">{f.numero}<br /><small className="muted">{f.tipo === 'TD04' ? 'nota di credito ' : ''}{f.verso === 'emessa' ? 'emessa' : 'ricevuta'}</small></td>
        <td>{f.controparte || '—'}{f.descrizione && <><br /><small className="muted">{f.descrizione.slice(0, 90)}</small></>}</td>
        <td className="n nowrap">{money(f.netto || f.totale)}{f.ritenuta > 0 && <><br /><small className="muted">ritenuta {money(f.ritenuta)}</small></>}</td>
        <td>{doppia ? <Pill title="Lo stesso numero c’è tra i documenti di TIO: si conta quello">già in TIO</Pill>
          : f.regolata_il ? <span className="small">{f.verso === 'emessa' ? 'Incassata' : 'Pagata'} il {fmtDate(f.regolata_il)}{nomeConto(f.conto_id) ? ` · ${nomeConto(f.conto_id)}` : ''}</span>
          : <span className={`small ${f.scadenza && f.scadenza < c.oggi ? 'late-text' : 'muted'}`}>{f.scadenza ? `Scade il ${fmtDate(f.scadenza)}` : 'Da regolare'}</span>}
          {f.verso === 'ricevuta' && f.categoria && <><br /><small className="muted">{f.categoria}</small></>}</td>
        <td><div className="row">
          {!doppia && !f.nascosta && <Btn size="sm" variant="ghost" onClick={() => setRegola(f)}>{f.regolata_il ? 'Modifica' : f.verso === 'emessa' ? 'Incassata' : 'Pagata'}</Btn>}
          <Btn size="sm" variant="ghost" title={f.nascosta ? 'Torna a contare nel budget' : 'Non contarla nel budget (ad esempio una fattura annullata)'} onClick={() => run(() => api.budget('fattura', { id: f.id, nascosta: !f.nascosta }))}>{f.nascosta ? 'Mostra' : 'Nascondi'}</Btn>
        </div></td>
      </tr> })}</tbody>
    </table></div> : <p className="muted">Nessuna fattura con questi filtri.</p>}
    <p className="muted small">Le fatture emesse con lo stesso numero di un documento di TIO non si contano due volte. Le fatture ricevute non pagate entrano tra le uscite previste; quelle emesse tra le entrate attese.</p>
    {regola && <Regola f={regola} c={c} onClose={() => setRegola(null)} />}
  </div>
}

function EsitoLettura({ esito }: { esito: EsitoFatture }) {
  return <section className="budget-esito" role="status">
    <p>{esito.nuove} {esito.nuove === 1 ? 'fattura nuova' : 'fatture nuove'} · {esito.gia} già lette{esito.errori.length ? ` · ${esito.errori.length} file non letti` : ''}</p>
    {esito.errori.length > 0 && <ul className="small">{esito.errori.slice(0, 8).map((e) => <li key={e.file}>{e.file}: {e.motivo}</li>)}{esito.errori.length > 8 && <li>e altri {esito.errori.length - 8}</li>}</ul>}
  </section>
}
