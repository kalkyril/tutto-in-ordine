import { usePagination } from '../components/Pagination'
import { useMemo, useState } from 'react'
import { Download, Upload, Mail, Plus, Receipt } from 'lucide-react'
import { api } from '../api'
import { GestioneAttivita, type AreaGestione } from '../components/GestioneAttivita'
import { useData } from '../store'
import { useNav } from '../nav'
import { Btn, ColorDot, Empty, PageHeader, Pill, Segmented, Modal, useAction } from '../components/ui'
import { ParcellaEditor, nomeDoc } from '../components/ParcellaEditor'
import { fmtDate } from '../lib/dates'
import { money } from '../lib/format'
import { calcolaParcella } from '../lib/calc'
import { datiFatturazioneCsv, incassatoNetto, residuo, csvPratiche, primaNotaCsv, redditivita, solleciti, testoSollecito } from '../lib/report'
import type { Parcella } from '../types'

type S = 'tutte' | 'bozza' | 'emessa' | 'pagata'
type Vista = 'documenti' | 'solleciti' | 'pratiche' | AreaGestione

export default function ParcellePage() {
  const { parcelle, anagraficaById, praticaById, settings, pratiche, ore, spese } = useData()
  const run = useAction()
  const [vista, setVista] = useState<Vista>('documenti')
  const { go } = useNav()
  const L = settings.etichette
  const anni = [...new Set(parcelle.map((p) => p.anno))].sort((a, b) => b - a)
  const [anno, setAnno] = useState<number>(() => anni[0] || new Date().getFullYear())
  const [stato, setStato] = useState<S>('tutte')
  const [imported, setImported] = useState<any>(null)
  const [importing, setImporting] = useState(false)
  const [ed, setEd] = useState<null | { parcella?: Parcella; preset?: any }>(null)
  const importTotals = imported ? calcolaParcella(imported.voci, { sg: imported.aliquote.sg_perc, cpa: imported.aliquote.cpa_perc, iva: imported.aliquote.iva_perc, rit: imported.aliquote.rit_perc, bollo: imported.bollo }) : null
  const importMatches = imported && imported.nettoOriginale !== null && Math.abs(imported.nettoOriginale - importTotals!.netto) <= 0.02
  const doc = parcelle.filter((p) => p.anno === anno)
  const rows = doc.filter((p) => stato === 'tutte' || p.stato === stato)
  const { visible, controls } = usePagination(rows, JSON.stringify([anno, stato, vista]))
  const fatt = doc.filter((p) => p.tipo === 'parcella' && p.stato !== 'bozza' && p.stato !== 'annullata')
  // le note di credito compensano le fatture stornate
  const emesso = fatt.reduce((s, p) => s + p.totale, 0) - doc.filter((p) => p.tipo === 'nota_credito' && p.stato !== 'bozza' && p.stato !== 'annullata').reduce((s, p) => s + p.totale, 0)
  const incassato = fatt.reduce((s, p) => s + incassatoNetto(p), 0)
  const daIncassare = fatt.filter((p) => p.stato === 'emessa').reduce((s, p) => s + residuo(p), 0)
  const preventivi = doc.filter((p) => p.tipo === 'preventivo' && p.stato !== 'annullata').reduce((s, p) => s + p.totale, 0)

  const sol = useMemo(() => solleciti(parcelle, anagraficaById), [parcelle, anagraficaById])
  const red = useMemo(() => redditivita(pratiche, ore, spese, parcelle), [pratiche, ore, spese, parcelle])
  const esporta = () => run(() => api.salvaTesto(`Prima-nota-${anno}.csv`, primaNotaCsv(parcelle, anagraficaById, praticaById, anno, L.parcella)), 'Prima nota salvata')
  const invia = (i: number) => { const t = testoSollecito(sol[i], settings.studio); const em = sol[i].cliente?.email || ''; run(() => api.openExternal(`mailto:${em}?subject=${encodeURIComponent(t.oggetto)}&body=${encodeURIComponent(t.corpo)}`)) }
  const copia = async (i: number) => { const t = testoSollecito(sol[i], settings.studio); try { await navigator.clipboard.writeText(`${t.oggetto}\n\n${t.corpo}`) } catch { /* appunti non disponibili */ } }
  return (
    <div className="page">
      <PageHeader title={`${L.parcelle} e preventivi`} subtitle="Documenti PDF e XML FatturaPA, spese e incassi — l’invio allo SdI resta al tuo canale (Fatture e Corrispettivi, intermediario o commercialista)"
        actions={<><select value={anno} onChange={(e) => setAnno(Number(e.target.value))} aria-label="Anno">{[...new Set([...anni, new Date().getFullYear()])].sort((a, b) => b - a).map((a) => <option key={a}>{a}</option>)}</select>
          <Btn variant="ghost" onClick={esporta} title="Registro dei documenti dell'anno in CSV, per Excel o per il commercialista"><Download size={16} /> Prima nota (CSV)</Btn>
          {settings.profilo !== 'avvocato' && <Btn variant="ghost" title="Dati e voci dei documenti, da verificare e adattare al proprio servizio di fatturazione; nessun invio allo SdI" onClick={()=>run(async()=>{const completi=await Promise.all(doc.filter(p=>p.stato!=='annullata').map(p=>api.getParcella(p.id)));return api.salvaTesto(`Dati-fatturazione-${anno}.csv`,datiFatturazioneCsv(completi,anagraficaById))},'CSV salvato')}>Dati per servizio fiscale (CSV)</Btn>}
          <Btn variant="ghost" disabled={importing} onClick={async () => { setImporting(true); try { const data = await run(() => api.importaProforma()); if (data) setImported(data) } finally { setImporting(false) } }}><Upload size={16} /> {importing ? 'Lettura…' : 'Importa PDF / Word'}</Btn>
          <Btn variant="primary" onClick={() => setEd({})}><Plus size={16} /> Nuovo documento</Btn></>} />
      <div className="kpis fascia-numeri">
        <div className="kpi static"><span>Emesso {anno}</span><b>{money(emesso)}</b></div>
        <div className="kpi static"><span>Incassato (netto)</span><b>{money(incassato)}</b></div>
        <div className="kpi static"><span>Da incassare</span><b>{money(daIncassare)}</b></div>
        <div className="kpi static"><span>Preventivi</span><b>{money(preventivi)}</b></div>
      </div>
      <div className="toolbar gestione-nav"><Segmented<Vista> value={vista} onChange={setVista} options={[{ id: 'documenti', label: 'Documenti' }, { id: 'solleciti', label: `Da incassare${sol.length ? ` (${sol.length})` : ''}` }, { id: 'pratiche', label: `Redditività per ${L.pratica.toLowerCase()}` }, ...(settings.profilo === 'avvocato' ? [{id:'ricorrenze' as const,label:'Attività ricorrenti'}] : [{id:'preventivi' as const,label:'Preventivi e lavori'},{id:'pagamenti' as const,label:'Pagamenti'},{id:'costi' as const,label:'Costi e fornitori'},{id:'ricorrenze' as const,label:'Attività ricorrenti'}])]} /></div>
      {['preventivi','pagamenti','costi','ricorrenze'].includes(vista) && <GestioneAttivita area={vista as AreaGestione} apri={p=>setEd({parcella:p})}/>}
      {vista === 'solleciti' && (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>N.</th><th>{L.cliente}</th><th>Emessa il</th><th>Scadenza pagamento</th><th>Stato</th><th className="n">Da incassare</th><th><span className="sr-only">Azioni</span></th></tr></thead>
          <tbody>{sol.map((x, i) => (
            <tr key={x.parcella.id}><td className="nowrap"><b>{x.parcella.numero}</b></td><td>{x.cliente?.denominazione}</td><td className="nowrap">{fmtDate(x.parcella.data)}</td><td className="nowrap">{fmtDate(x.scadenza)}</td>
              <td>{x.giorni > 0 ? <Pill color="#ef4444">scaduta da {x.giorni} gg</Pill> : <Pill>{x.giorni === 0 ? 'scade oggi' : `tra ${-x.giorni} gg`}</Pill>}</td><td className="n">{money(residuo(x.parcella))}</td>
              <td className="nowrap"><Btn size="sm" onClick={() => invia(i)} title="Apre il tuo programma di posta con il messaggio già scritto: l'invio lo confermi tu"><Mail size={13} /> Prepara email</Btn> <Btn size="sm" variant="ghost" onClick={() => run(async () => { await copia(i); return true }, 'Testo copiato')}>Copia testo</Btn></td></tr>))}</tbody>
        </table>{!sol.length && <p className="muted pad">Nessun documento emesso in attesa di pagamento.</p>}</div>)}
      {vista === 'pratiche' && (
        <div className="table-wrap"><div className="row" style={{ justifyContent: 'flex-end', padding: '6px 10px' }}><Btn size="sm" variant="ghost" onClick={() => run(() => api.salvaTesto('Redditivita-pratiche.csv', csvPratiche(red)), 'File salvato')}><Download size={13} /> Esporta CSV</Btn></div>
          <table className="table"><thead><tr><th>{L.pratica}</th><th className="n">Ore</th><th className="n">Valore ore</th><th className="n">Spese</th><th className="n">Fatturato</th><th className="n">Incassato</th><th className="n">Ore da fatturare</th></tr></thead>
            <tbody>{red.map((r) => <tr key={r.pratica.id} onClick={() => go({ page: 'pratica', id: r.pratica.id })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') go({ page: 'pratica', id: r.pratica.id }) }}>
              <td><ColorDot color={r.pratica.colore} size={9} /> <b>{r.pratica.numero}</b> {r.pratica.titolo}</td><td className="n">{(r.minuti / 60).toLocaleString('it-IT', { maximumFractionDigits: 1 })}</td><td className="n">{money(r.valoreOre)}</td><td className="n">{money(r.spese)}</td><td className="n">{money(r.fatturato)}</td><td className="n">{money(r.incassato)}</td><td className="n">{money(r.oreNonFatturate)}</td></tr>)}</tbody></table>
          {!red.length && <p className="muted pad">Registra ore e spese o emetti {L.parcelle.toLowerCase()} per vedere la redditività di ogni {L.pratica.toLowerCase()}.</p>}</div>)}
      {vista === 'documenti' && <div className="toolbar"><Segmented<S> value={stato} onChange={setStato} options={[{ id: 'tutte', label: 'Tutte' }, { id: 'bozza', label: 'Bozze' }, { id: 'emessa', label: 'Emesse' }, { id: 'pagata', label: 'Pagate' }]} /></div>}
      {vista === 'documenti' && (!parcelle.length ? (
        <Empty icon={<Receipt size={32} />} title={`Nessuna ${L.parcella.toLowerCase()}`} text={settings.profilo === 'avvocato' ? 'Registra ore e spese in una pratica, poi trasformale in parcella o preventivo con calcolo automatico di CPA, IVA e ritenuta.' : 'Registra ore e spese del lavoro, poi prepara un preventivo o un documento PDF con le aliquote configurate.'}
          action={<Btn variant="primary" onClick={() => setEd({})}><Plus size={16} /> Crea documento</Btn>} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>N.</th><th>Data</th><th>Tipo</th><th>{L.cliente}</th><th>{L.pratica}</th><th>Stato</th><th className="n">Totale</th><th className="n">Netto</th></tr></thead>
            <tbody>
              {visible.map((p) => {
                const pr = p.pratica_id ? praticaById.get(p.pratica_id) : null
                return (
                  <tr key={p.id} onClick={() => setEd({ parcella: p })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setEd({ parcella: p }) }}>
                    <td className="nowrap"><b>{p.numero}</b></td><td className="nowrap">{fmtDate(p.data)}</td><td>{nomeDoc(p.tipo, L.parcella)}</td>
                    <td>{p.cliente_id ? anagraficaById.get(p.cliente_id)?.denominazione : ''}</td>
                    <td>{pr ? <button className="link-btn" onClick={(e) => { e.stopPropagation(); go({ page: 'pratica', id: pr.id }) }}><ColorDot color={pr.colore} size={9} /> {pr.titolo}</button> : ''}</td>
                    <td><Pill color={p.stato === 'pagata' ? '#22c55e' : p.stato === 'emessa' ? '#f59e0b' : p.stato === 'annullata' ? '#ef4444' : undefined}>{p.stato}</Pill></td>
                    <td className="n">{money(p.totale)}</td><td className="n">{money(p.netto)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!rows.length && <p className="muted pad">Nessun documento con questi filtri.</p>}
        </div>
      ))}
      {vista === 'documenti' && controls}
      {imported && <Modal title="Verifica l'importazione" subtitle={imported.nomeFile} onClose={() => setImported(null)} width={660}
        footer={<><Btn variant="ghost" onClick={() => setImported(null)}>Annulla</Btn><Btn variant="primary" onClick={() => { setEd({ preset: { ...imported, note: '', importazione: JSON.stringify({ version: 1, nettoOriginale: imported.nettoOriginale, verificato: false }) } }); setImported(null) }}>Apri bozza da verificare</Btn></>}>
        <table className="table"><thead><tr><th>Voce riconosciuta</th><th className="n">Importo</th></tr></thead><tbody>{imported.voci.map((v: any, i: number) => <tr key={i}><td>{v.descrizione}</td><td className="n">{money(v.importo)}</td></tr>)}</tbody></table>
        <p>Spese generali {imported.aliquote.sg_perc}% · CPA {imported.aliquote.cpa_perc}% · IVA {imported.aliquote.iva_perc}% · Ritenuta {imported.aliquote.rit_perc}%</p>
        <p><b>Netto ricalcolato: {money(importTotals!.netto)}</b>{imported.nettoOriginale !== null && <> · Originale: {money(imported.nettoOriginale)}</>}</p>
        <p role="status" className={importMatches ? 'muted' : 'doc-avviso'}>{importMatches ? 'I totali coincidono. Verifica comunque le voci e i dati del destinatario.' : 'Totali non verificati o diversi: controlla voci, aliquote, bollo e acconti nella bozza prima di salvare.'}</p>
        {imported.avvisi.map((message: string) => <p key={message} className="muted small">{message}</p>)}
      </Modal>}
      {ed && <ParcellaEditor parcella={ed.parcella} preset={ed.preset} onClose={() => setEd(null)} />}
    </div>
  )
}
