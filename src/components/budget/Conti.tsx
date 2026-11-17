import { useState } from 'react'
import { ArrowLeftRight, Landmark, Plus } from 'lucide-react'
import { api } from '../../api'
import { Btn, Empty, Field, FormGrid, Input, Modal, Select, useAction, useFeedback } from '../ui'
import { fmtDate } from '../../lib/dates'
import { money, parseNumber } from '../../lib/format'
import type { Conto, MovimentoConto } from '../../lib/budget'
import type { ContestoBudget } from './contesto'

const NOMI_TIPO: Record<string, string> = { banca: 'Conto corrente', carta: 'Carta', contanti: 'Contanti', altro: 'Altro' }

function ContoForm({ conto, onClose }: { conto: Partial<Conto>; onClose: () => void }) {
  const run = useAction()
  const [f, setF] = useState<any>({ tipo: 'banca', data_saldo: new Date().toISOString().slice(0, 10), ...conto, saldo_iniziale: conto.saldo_iniziale != null ? String(conto.saldo_iniziale).replace('.', ',') : '' })
  const set = (k: string, v: unknown) => setF((x: any) => ({ ...x, [k]: v }))
  const salva = async () => { if (await run(() => api.budget('conto', { ...f, saldo_iniziale: f.saldo_iniziale === '' ? 0 : parseNumber(f.saldo_iniziale) }), 'Conto salvato') !== undefined) onClose() }
  return <Modal title={conto.id ? 'Modifica conto' : 'Nuovo conto'} width={560} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" disabled={!f.nome?.trim()} onClick={salva}>Salva</Btn></>}>
    <FormGrid>
      <Field label="Nome *"><Input value={f.nome || ''} onChange={(e) => set('nome', e.target.value)} placeholder="Es. Banca del Territorio" autoFocus /></Field>
      <Field label="Tipo"><Select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>{Object.entries(NOMI_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="Saldo (€)" hint="Il saldo che leggi sull’estratto conto a quella data"><Input inputMode="decimal" value={f.saldo_iniziale} onChange={(e) => set('saldo_iniziale', e.target.value)} placeholder="0,00" /></Field>
      <Field label="Alla data *"><Input type="date" value={f.data_saldo} onChange={(e) => set('data_saldo', e.target.value)} /></Field>
      <Field label="IBAN" span={2}><Input value={f.iban || ''} onChange={(e) => set('iban', e.target.value)} /></Field>
    </FormGrid>
    <label className="check"><input type="checkbox" checked={!!f.predefinito} onChange={(e) => set('predefinito', e.target.checked)} /> Conto predefinito: qui finiscono incassi e pagamenti senza un conto indicato</label>
    {conto.id && <label className="check"><input type="checkbox" checked={!!f.archiviato} onChange={(e) => set('archiviato', e.target.checked)} /> Conto chiuso (resta nello storico, non conta nel saldo)</label>}
  </Modal>
}

function MovimentoForm({ conti, movimento, onClose }: { conti: Conto[]; movimento: Partial<MovimentoConto> & { giroconto?: boolean }; onClose: () => void }) {
  const run = useAction()
  const attivi = conti.filter((c) => !c.archiviato)
  const [f, setF] = useState<any>({ data: new Date().toISOString().slice(0, 10), conto_id: attivi[0]?.id, ...movimento, importo: movimento.importo != null ? String(Math.abs(movimento.importo)).replace('.', ',') : '', segno: movimento.importo != null && movimento.importo > 0 ? '+' : '-' })
  const set = (k: string, v: unknown) => setF((x: any) => ({ ...x, [k]: v }))
  const giro = !!f.giroconto || !!f.verso_conto_id
  const salva = async () => {
    const importo = parseNumber(f.importo)
    const r = await run(() => api.budget('movimento', { id: f.id, conto_id: f.conto_id, data: f.data, descrizione: f.descrizione, categoria: f.categoria, verso_conto_id: giro ? f.verso_conto_id : null, importo: giro ? importo : f.segno === '+' ? importo : -importo }), 'Movimento salvato')
    if (r !== undefined) onClose()
  }
  return <Modal title={giro ? 'Giroconto' : f.id ? 'Modifica movimento' : 'Nuovo movimento'} subtitle={giro ? 'Denaro spostato da un conto all’altro: prelievo, versamento, ricarica' : 'Entrate e uscite che non sono documenti o voci da pagare: spese bancarie, interessi, prelievi personali'} width={560} onClose={onClose}
    footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" disabled={!f.descrizione?.trim() || !f.importo || (giro && !f.verso_conto_id)} onClick={salva}>Salva</Btn></>}>
    <FormGrid>
      <Field label={giro ? 'Dal conto' : 'Conto'}><Select value={f.conto_id ?? ''} onChange={(e) => set('conto_id', Number(e.target.value))}>{attivi.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</Select></Field>
      {giro ? <Field label="Al conto"><Select value={f.verso_conto_id ?? ''} onChange={(e) => set('verso_conto_id', Number(e.target.value))}><option value="">Scegli…</option>{attivi.filter((c) => c.id !== f.conto_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</Select></Field>
        : <Field label="Tipo"><Select value={f.segno} onChange={(e) => set('segno', e.target.value)}><option value="-">Uscita</option><option value="+">Entrata</option></Select></Field>}
      <Field label="Data"><Input type="date" value={f.data} onChange={(e) => set('data', e.target.value)} /></Field>
      <Field label="Importo (€) *"><Input inputMode="decimal" value={f.importo} onChange={(e) => set('importo', e.target.value)} placeholder="0,00" /></Field>
      <Field label="Descrizione *" span={2}><Input value={f.descrizione || ''} onChange={(e) => set('descrizione', e.target.value)} placeholder={giro ? 'Es. Prelievo bancomat' : 'Es. Spese di tenuta conto'} /></Field>
      {!giro && <Field label="Categoria" span={2}><Input value={f.categoria || ''} onChange={(e) => set('categoria', e.target.value)} placeholder="Es. Spese bancarie" list="categorie-movimento" /></Field>}
    </FormGrid>
    <datalist id="categorie-movimento">{['Spese bancarie', 'Interessi', 'Prelievo personale', 'Versamento personale', 'Imposte e contributi', 'Altro'].map((x) => <option key={x} value={x} />)}</datalist>
  </Modal>
}

export function Conti({ c }: { c: ContestoBudget }) {
  const run = useAction()
  const { confirm } = useFeedback()
  const [conto, setConto] = useState<Partial<Conto> | null>(null)
  const [movimento, setMovimento] = useState<(Partial<MovimentoConto> & { giroconto?: boolean }) | null>(null)
  const [aperto, setAperto] = useState<number | null>(null)
  const attivi = c.saldi.filter((s) => !s.conto.archiviato), chiusi = c.saldi.filter((s) => s.conto.archiviato)
  const scelto = c.saldi.find((s) => s.conto.id === aperto) || attivi[0] || null
  const elimina = async (x: Conto) => { if (await confirm({ title: `Eliminare il conto «${x.nome}»?`, text: 'Se ne vanno anche i movimenti scritti a mano su questo conto. Incassi e pagamenti restano, sul conto predefinito.', ok: 'Elimina', danger: true })) run(() => api.budget('eliminaConto', { id: x.id })) }
  const manuale = (chiave: string) => { const m = /^(?:mc|gc)-(\d+)/.exec(chiave); return m ? c.b.movimenti.find((x) => x.id === Number(m[1])) : undefined }
  if (!c.b.conti.length) return <>
    <Empty icon={<Landmark size={30} />} title="Nessun conto" text="Aggiungi il conto corrente (e, se vuoi, carta e contanti) con il saldo che leggi oggi sull’estratto conto: da lì TIO calcola il saldo reale con gli incassi e i pagamenti che registri." action={<Btn variant="primary" onClick={() => setConto({})}><Plus size={15} /> Nuovo conto</Btn>} />
    {conto && <ContoForm conto={conto} onClose={() => setConto(null)} />}
  </>
  return <div className="budget">
    <div className="toolbar"><Btn variant="primary" onClick={() => setConto({})}><Plus size={15} /> Nuovo conto</Btn><Btn onClick={() => setMovimento({})}><Plus size={15} /> Movimento</Btn>{attivi.length > 1 && <Btn onClick={() => setMovimento({ giroconto: true })}><ArrowLeftRight size={15} /> Giroconto</Btn>}</div>
    <ul className="conti-elenco" aria-label="Conti">
      {attivi.map((s) => <li key={s.conto.id}><button type="button" className={`conto-scheda${scelto?.conto.id === s.conto.id ? ' on' : ''}`} onClick={() => setAperto(s.conto.id)} aria-pressed={scelto?.conto.id === s.conto.id}>
        <span className="muted small">{NOMI_TIPO[s.conto.tipo] || s.conto.tipo}{s.conto.predefinito ? ' · predefinito' : ''}</span>
        <b>{s.conto.nome}</b>
        <span className={`conto-saldo ${s.saldo < 0 ? 'late-text' : ''}`}>{money(s.saldo)}</span>
      </button></li>)}
      {attivi.length > 1 && <li className="conto-scheda totale"><span className="muted small">Tutti i conti</span><b>Totale</b><span className="conto-saldo">{money(c.saldoOggi)}</span></li>}
    </ul>
    {scelto && <section className="card pad budget-scheda" aria-labelledby="titolo-conto">
      <header className="card-head"><h2 id="titolo-conto">{scelto.conto.nome}</h2><div className="row"><Btn size="sm" variant="ghost" onClick={() => setConto(scelto.conto)}>Modifica</Btn><Btn size="sm" variant="ghost" onClick={() => elimina(scelto.conto)}>Elimina</Btn></div></header>
      <p className="muted small budget-nota">Saldo di {money(scelto.conto.saldo_iniziale)} al {fmtDate(scelto.conto.data_saldo)}{scelto.conto.iban ? ` · IBAN ${scelto.conto.iban}` : ''}. Da lì: incassi, pagamenti e movimenti qui sotto.</p>
      {scelto.voci.length ? <div className="table-wrap"><table className="table">
        <thead><tr><th>Data</th><th>Voce</th><th className="n">Importo</th><th><span className="sr-only">Azioni</span></th></tr></thead>
        <tbody>{scelto.voci.slice(0, 200).map((v) => { const m = manuale(v.chiave); return <tr key={v.chiave}>
          <td className="nowrap">{fmtDate(v.data)}</td><td>{v.descrizione}{v.dettaglio && <><br /><small className="muted">{v.dettaglio}</small></>}</td>
          <td className={`n nowrap ${v.importo >= 0 ? 'entrata' : 'uscita'}`}>{v.importo >= 0 ? '+' : '−'} {money(Math.abs(v.importo))}</td>
          <td>{m && <div className="row"><Btn size="sm" variant="ghost" onClick={() => setMovimento(m)}>Modifica</Btn><Btn size="sm" variant="ghost" onClick={() => run(() => api.budget('eliminaMovimento', { id: m.id }))}>Elimina</Btn></div>}</td>
        </tr> })}</tbody>
      </table></div> : <p className="muted">Nessun movimento dopo la data del saldo.</p>}
    </section>}
    {chiusi.length > 0 && <p className="muted small">Conti chiusi: {chiusi.map((s) => <button key={s.conto.id} type="button" className="link-btn" onClick={() => setConto(s.conto)}>{s.conto.nome}</button>)}</p>}
    {conto && <ContoForm conto={conto} onClose={() => setConto(null)} />}
    {movimento && <MovimentoForm conti={c.b.conti} movimento={movimento} onClose={() => setMovimento(null)} />}
  </div>
}
