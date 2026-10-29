import { useMemo, useState } from 'react'
import { Clock, FileText, Paperclip, Pencil, Plus, Receipt, Trash2, X } from 'lucide-react'
import { api } from '../../api'
import { BudgetLavoro } from '../GestioneAttivita'
import { useData } from '../../store'
import { Btn, Empty, Field, FormGrid, Input, Modal, Pill, Select, Textarea, useAction, useFeedback } from '../ui'
import { fmtDate, todayStr } from '../../lib/dates'
import { fmtBytes, money, parseNumber } from '../../lib/format'
import { parseDurata, riepilogoAttivita, testoDurata } from '../../lib/attivita'
import type { Documento, Ora, Spesa } from '../../types'

const DURATE_RAPIDE = [['15 min', '15m'], ['30 min', '30m'], ['1 h', '1h'], ['2 h', '2h'], ['Mezza giornata', '4h']] as const
const nomeFile = (p: string) => p.split(/[\\/]/).pop() || p

/* ------------------------------ Attività svolte ------------------------------ */
function AttivitaModal({ praticaId, ora, titoliNoti, onClose }: { praticaId: number; ora: Partial<Ora>; titoliNoti: string[]; onClose: () => void }) {
  const { settings, documenti } = useData()
  const run = useAction()
  const { confirm } = useFeedback()
  const [f, setF] = useState<Partial<Ora>>({ data: todayStr(), tariffa_oraria: settings.tariffa_oraria, ...ora })
  const [durata, setDurata] = useState(ora.minuti ? `${Math.floor(ora.minuti / 60)}:${String(ora.minuti % 60).padStart(2, '0')}` : '')
  const [nuovi, setNuovi] = useState<string[]>([]) // file scelti, collegati al salvataggio
  const [over, setOver] = useState(false)
  const esistenti = ora.id ? documenti.filter((d) => d.ora_id === ora.id) : []
  const minuti = parseDurata(durata)
  const valido = !!f.descrizione?.trim() && minuti > 0
  const aggiungi = (paths: string[]) => setNuovi((x) => [...new Set([...x, ...paths.filter(Boolean)])])
  const scegli = async () => { const p = await run(() => api.scegliAllegati()); if (p?.length) aggiungi(p) }
  const salva = async () => {
    if (!valido) return
    const r = await run(async () => {
      const saved = await api.save<Ora>('ore', { ...f, pratica_id: praticaId, minuti, descrizione: f.descrizione!.trim(), dettagli: f.dettagli?.trim() || null })
      if (nuovi.length) await api.addDocumentiPaths(praticaId, nuovi, 'Allegato attività', saved.id)
      return saved
    }, 'Attività salvata')
    if (r) onClose()
  }
  return (
    <Modal title={f.id ? 'Modifica attività' : 'Nuova attività svolta'} subtitle="Cosa hai fatto, quanto tempo ci hai dedicato e i documenti collegati" width={620} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={salva} disabled={!valido}>Salva</Btn></>}>
      <form onSubmit={(e) => { e.preventDefault(); salva() }}>
        <FormGrid>
          <Field label="Attività *" span={2} hint={titoliNoti.length ? 'Suggerimenti dalle attività già registrate in questa pratica' : undefined}>
            <Input list="attivita-note" autoFocus value={f.descrizione || ''} onChange={(e) => setF({ ...f, descrizione: e.target.value })} placeholder={settings.profilo === 'avvocato' ? "Es. Invio PEC, studio del fascicolo" : "Es. Consulenza, progettazione o manutenzione"} />
          </Field>
          <datalist id="attivita-note">{titoliNoti.map((t) => <option key={t} value={t} />)}</datalist>
          <Field label="Data"><Input type="date" value={f.data || ''} onChange={(e) => setF({ ...f, data: e.target.value })} /></Field>
          <Field label="Tempo dedicato in totale *" hint={minuti ? `= ${testoDurata(minuti)}` : 'Es. 1:30, 45m, 1,5'}>
            <Input value={durata} onChange={(e) => setDurata(e.target.value)} placeholder="1:30" inputMode="text" />
          </Field>
          <div style={{ gridColumn: 'span 2', marginTop: -6 }} className="chips" role="group" aria-label="Durate rapide">
            {DURATE_RAPIDE.map(([l, v]) => <button type="button" key={v} className={`chip ${parseDurata(durata) === parseDurata(v) ? 'on' : ''}`} onClick={() => setDurata(v)}>{l}</button>)}
          </div>
          <Field label="Note sull'attività" span={2}><Textarea rows={3} value={f.dettagli || ''} onChange={(e) => setF({ ...f, dettagli: e.target.value })} placeholder="Facoltative: destinatari, esito, riferimenti…" /></Field>
          <Field label="Tariffa oraria (€)"><Input inputMode="decimal" value={f.tariffa_oraria ?? ''} onChange={(e) => setF({ ...f, tariffa_oraria: parseNumber(e.target.value) })} /></Field>
          <Field label="Valore" hint="Tempo × tariffa"><Input readOnly value={money((minuti / 60) * (Number(f.tariffa_oraria) || 0))} /></Field>
        </FormGrid>
        <div className={`allegati-zona ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); aggiungi([...e.dataTransfer.files].map((x) => window.mngmnt.pathForFile(x))) }}>
          <div className="row"><b><Paperclip size={14} aria-hidden /> Allegati</b><span className="muted small grow">Trascina qui i file (ad es. le PEC in PDF) oppure</span><Btn type="button" size="sm" onClick={scegli}><Plus size={14} /> Aggiungi file…</Btn></div>
          {(esistenti.length > 0 || nuovi.length > 0) && (
            <ul className="allegati-lista">
              {esistenti.map((d) => (
                <li key={d.id}><FileText size={14} aria-hidden /><button type="button" className="link-btn left grow" onClick={() => run(() => api.openDocumento(d.id))}>{d.nome}</button><span className="muted small">{fmtBytes(d.dimensione)}</span>
                  <button type="button" className="icon-btn" aria-label={`Elimina l'allegato ${d.nome}`} onClick={async () => { if (await confirm({ title: 'Eliminare l\'allegato?', text: `${d.nome} verrà rimosso anche dai documenti della pratica.`, ok: 'Elimina', danger: true })) run(() => api.remove('documenti', d.id)) }}><Trash2 size={14} /></button></li>
              ))}
              {nuovi.map((p) => (
                <li key={p}><FileText size={14} aria-hidden /><span className="grow">{nomeFile(p)}</span><Pill>da aggiungere</Pill>
                  <button type="button" className="icon-btn" aria-label={`Non aggiungere ${nomeFile(p)}`} onClick={() => setNuovi((x) => x.filter((y) => y !== p))}><X size={14} /></button></li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function RiepilogoOre({ ore, documenti }: { ore: Ora[]; documenti: Documento[] }) {
  const r = useMemo(() => riepilogoAttivita(ore, documenti), [ore, documenti])
  if (!r.attivita) return null
  return (
    <section className="card riepilogo-ore" aria-labelledby="ore-impiegate">
      <header className="card-head"><h2 id="ore-impiegate"><Clock size={16} aria-hidden /> Ore impiegate</h2><span className="muted small">{r.primaData && r.ultimaData ? (r.primaData === r.ultimaData ? `il ${fmtDate(r.primaData)}` : `dal ${fmtDate(r.primaData)} al ${fmtDate(r.ultimaData)}`) : ''}</span></header>
      <div className="riepilogo-testa">
        <div className="riepilogo-totale"><b>{testoDurata(r.minuti)}</b><span>tempo totale</span></div>
        <div><b>{money(r.valore)}</b><span>valore</span></div>
        <div><b>{r.attivita}</b><span>{r.attivita === 1 ? 'attività' : 'attività'}</span></div>
        <div><b>{r.allegati}</b><span>allegati</span></div>
        <div><b>{money(r.daFatturare)}</b><span>da fatturare</span></div>
      </div>
      <ul className="riepilogo-gruppi">
        {r.gruppi.map((g) => (
          <li key={g.titolo}>
            <div className="riga"><b className="grow">{g.titolo}</b><span className="muted small">{g.volte > 1 ? `${g.volte} volte · ` : ''}{g.allegati ? `${g.allegati} allegat${g.allegati === 1 ? 'o' : 'i'} · ` : ''}</span><b>{testoDurata(g.minuti)}</b></div>
            <div className="barra" role="img" aria-label={`${Math.round(g.quota * 100)}% del tempo`}><span style={{ width: `${Math.max(2, Math.round(g.quota * 100))}%` }} /></div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ------------------------------ Scheda «Attività e spese» ------------------------------ */
export function EconomiaTab({ praticaId, ore, spese, onParcella }: { praticaId: number; ore: Ora[]; spese: Spesa[]; onParcella: (preset: any) => void }) {
  const { settings, documenti } = useData()
  const run = useAction()
  const { eliminaConAnnulla } = useFeedback()
  const [oraEd, setOraEd] = useState<Partial<Ora> | null>(null)
  const [spesaEd, setSpesaEd] = useState<Partial<Spesa> | null>(null)
  const [importo, setImporto] = useState('')
  const docsPratica = useMemo(() => documenti.filter((d) => d.pratica_id === praticaId), [documenti, praticaId])
  const allegatiDi = (id: number) => docsPratica.filter((d) => d.ora_id === id)
  const titoliNoti = useMemo(() => [...new Set(ore.map((o) => o.descrizione.trim()))].sort((a, b) => a.localeCompare(b)), [ore])
  const ordinate = useMemo(() => [...ore].sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.id - a.id), [ore])
  const nonFattOre = ore.filter((o) => !o.parcella_id)
  const nonFattSpese = spese.filter((s) => !s.parcella_id)
  const crea = () => {
    const voci: any[] = []
    const byRate = new Map<number, Ora[]>()
    nonFattOre.forEach((o) => byRate.set(o.tariffa_oraria, [...(byRate.get(o.tariffa_oraria) || []), o]))
    byRate.forEach((list, rate) => voci.push({ tipo: 'compenso', descrizione: `Attività professionale (${list.map((o) => o.descrizione).slice(0, 3).join('; ')}${list.length > 3 ? '…' : ''})`, quantita: Math.round(list.reduce((s, o) => s + o.minuti, 0) / 60 * 100) / 100, importo: rate }))
    nonFattSpese.forEach((s) => voci.push({ tipo: s.esente ? 'spesa_esente' : 'spesa_imponibile', descrizione: s.descrizione, quantita: 1, importo: s.importo }))
    onParcella({ voci, importa_ore: nonFattOre.map((o) => o.id), importa_spese: nonFattSpese.map((s) => s.id) })
  }
  const saveSpesa = async () => {
    if (!spesaEd) return
    const imp = parseNumber(importo)
    if (!spesaEd.descrizione?.trim() || !imp) return
    if (await run(() => api.save('spese', { ...spesaEd, pratica_id: praticaId, importo: imp, descrizione: spesaEd.descrizione!.trim() }))) setSpesaEd(null)
  }
  const totSpese = spese.reduce((s, x) => s + x.importo, 0)
  return (
    <div className="stack">
      {settings.profilo !== 'avvocato' && <BudgetLavoro praticaId={praticaId} ore={ore} spese={spese} />}
      <RiepilogoOre ore={ore} documenti={docsPratica} />
      <section className="card">
        <header className="card-head"><h2>Attività svolte</h2>
          <div className="row">
            {(nonFattOre.length + nonFattSpese.length) > 0 && <Btn size="sm" onClick={crea}><Receipt size={14} /> Crea {settings.etichette.parcella.toLowerCase()} dalle voci</Btn>}
            <Btn size="sm" variant="primary" onClick={() => setOraEd({})}><Plus size={14} /> Nuova attività</Btn>
          </div>
        </header>
        <ul className="attivita-lista">
          {ordinate.map((o) => {
            const allegati = allegatiDi(o.id)
            return (
              <li key={o.id} className="attivita">
                <time className="attivita-data" dateTime={o.data}>{fmtDate(o.data)}</time>
                <div className="attivita-corpo">
                  <b>{o.descrizione}</b>
                  {o.dettagli && <p className="muted small prewrap">{o.dettagli}</p>}
                  {allegati.length > 0 && <div className="allegati-chips">{allegati.map((d) => <button key={d.id} className="allegato-chip" onClick={() => run(() => api.openDocumento(d.id))} title={`Apri ${d.nome}`}><Paperclip size={12} aria-hidden /> {d.nome}</button>)}</div>}
                </div>
                <div className="attivita-tempo"><b>{testoDurata(o.minuti)}</b><span className="muted small">{money((o.minuti / 60) * o.tariffa_oraria)}</span>{o.parcella_id ? <Pill>fatturata</Pill> : null}</div>
                <div className="attivita-azioni">
                  <button className="icon-btn" aria-label={`Modifica ${o.descrizione}`} onClick={() => setOraEd(o)}><Pencil size={14} /></button>
                  <button className="icon-btn" aria-label={`Elimina ${o.descrizione}`} onClick={() => eliminaConAnnulla('ore', o.id, 'Attività')}><Trash2 size={14} /></button>
                </div>
              </li>
            )
          })}
        </ul>
        {!ore.length && <Empty icon={<Clock size={28} />} title="Nessuna attività registrata" text="Registra le attività svolte, il tempo dedicato e i documenti collegati: qui sopra comparirà il riepilogo delle ore impiegate." action={<Btn variant="primary" onClick={() => setOraEd({})}><Plus size={14} /> Nuova attività</Btn>} />}
      </section>
      <section className="card">
        <header className="card-head"><h2>Spese anticipate {spese.length > 0 && <span className="muted small">· {money(totSpese)}</span>}</h2><Btn size="sm" variant="primary" onClick={() => { setImporto(''); setSpesaEd({ data: todayStr(), esente: 1 }) }}><Plus size={14} /> Aggiungi spesa</Btn></header>
        <table className="table compact"><tbody>
          {spese.map((s) => (
            <tr key={s.id}><td className="nowrap">{fmtDate(s.data)}</td><td>{s.descrizione}</td><td><Pill>{s.esente ? 'esente IVA' : 'imponibile'}</Pill></td><td className="nowrap"><b>{money(s.importo)}</b></td><td>{s.parcella_id ? <Pill>fatturata</Pill> : null}</td>
              <td className="nowrap"><button className="icon-btn" aria-label="Modifica" onClick={() => { setImporto(String(s.importo).replace('.', ',')); setSpesaEd(s) }}><Pencil size={14} /></button>
                <button className="icon-btn" aria-label="Elimina" onClick={() => eliminaConAnnulla('spese', s.id, 'Spesa')}><Trash2 size={14} /></button></td></tr>
          ))}
        </tbody></table>
        {!spese.length && <p className="muted pad">Nessuna spesa.</p>}
      </section>

      {oraEd && <AttivitaModal praticaId={praticaId} ora={oraEd} titoliNoti={titoliNoti} onClose={() => setOraEd(null)} />}
      {spesaEd && (
        <Modal title="Spesa anticipata" onClose={() => setSpesaEd(null)} width={480} footer={<><Btn variant="ghost" onClick={() => setSpesaEd(null)}>Annulla</Btn><Btn variant="primary" onClick={saveSpesa} disabled={!parseNumber(importo) || !spesaEd.descrizione?.trim()}>Salva</Btn></>}>
          <FormGrid>
            <Field label="Data"><Input type="date" value={spesaEd.data || ''} onChange={(e) => setSpesaEd({ ...spesaEd, data: e.target.value })} /></Field>
            <Field label="Importo (€)"><Input inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)} placeholder="0,00" /></Field>
            <Field label="Descrizione" span={2}><Input value={spesaEd.descrizione || ''} onChange={(e) => setSpesaEd({ ...spesaEd, descrizione: e.target.value })} placeholder="Es. Contributo unificato" /></Field>
            <Field label="Trattamento IVA" span={2}><Select value={spesaEd.esente ? '1' : '0'} onChange={(e) => setSpesaEd({ ...spesaEd, esente: Number(e.target.value) })}><option value="1">Anticipazione esente IVA (art. 15 DPR 633/72)</option><option value="0">Spesa imponibile</option></Select></Field>
          </FormGrid>
        </Modal>
      )}
    </div>
  )
}
