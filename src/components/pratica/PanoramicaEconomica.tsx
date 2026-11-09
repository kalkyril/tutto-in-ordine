import { useMemo, useState } from 'react'
import { Paperclip, Plus } from 'lucide-react'
import { api } from '../../api'
import { useData } from '../../store'
import { Btn, Pill, useAction } from '../ui'
import { GestioneForm, useGestione } from '../GestioneAttivita'
import { fmtDate, todayStr } from '../../lib/dates'
import { money } from '../../lib/format'
import { arco, coloriMovimento, movimenti, NOMI_MOVIMENTO, ripartizione, spicchi, STATI_MOVIMENTO } from '../../lib/pagamenti'

/**
 * Valore economico della pratica o commessa: fatture incassate e da incassare, voci pagate e da pagare (fornitori,
 * collaboratori, spese), con il grafico a torta. I colori si scelgono in Impostazioni › Aspetto.
 */
export function PanoramicaEconomica({ praticaId, onApriDocumento }: { praticaId: number; onApriDocumento: (id: number) => void }) {
  const d = useGestione()
  const { parcelle, settings, anagraficaById } = useData()
  const run = useAction()
  const [nuovaVoce, setNuovaVoce] = useState(false)
  const colori = coloriMovimento(settings)
  const mov = useMemo(() => movimenti(parcelle.filter((p) => p.pratica_id === praticaId), d.costi.filter((c) => c.pratica_id === praticaId), d.pagamenti, todayStr()), [parcelle, d.costi, d.pagamenti, praticaId])
  const t = ripartizione(mov)
  const fette = spicchi(t)
  const entrate = t.incassate + t.da_incassare, uscite = t.pagate + t.da_pagare
  const costi = d.costi.filter((c) => c.pratica_id === praticaId).sort((a, b) => (a.scadenza || a.data).localeCompare(b.scadenza || b.data))
  const fatture = parcelle.filter((p) => p.pratica_id === praticaId && p.tipo === 'parcella' && p.stato !== 'bozza' && p.stato !== 'annullata')
  const L = settings.etichette
  const descr = `Incassate ${money(t.incassate)}, da incassare ${money(t.da_incassare)}, pagate ${money(t.pagate)}, da pagare ${money(t.da_pagare)}`
  const nomeContabile = (s?: string | null) => { try { return s ? JSON.parse(s).nome as string : '' } catch { return '' } }
  return <section className="card pad" aria-labelledby="valore-pratica">
    <header className="card-head"><h2 id="valore-pratica">Valore della {L.pratica.toLowerCase()}</h2>
      <Btn size="sm" onClick={() => setNuovaVoce(true)}><Plus size={14} /> Voce da pagare</Btn></header>
    {d.errore && <p role="alert" className="stato-err">{d.errore}</p>}
    {mov.length ? <div className="torta-commessa">
      <svg viewBox="0 0 100 100" role="img" aria-label={`Grafico a torta: ${descr}`}>
        {fette.map((f) => <path key={f.stato} d={arco(f.da, f.a)} fill={colori[f.stato]} stroke="var(--surface)" strokeWidth={fette.length > 1 ? 0.8 : 0}><title>{NOMI_MOVIMENTO[f.stato]}: {money(t[f.stato])} ({Math.round(f.quota * 100)}%)</title></path>)}
        <text x="50" y="47" textAnchor="middle" fontSize="7" fill="var(--muted)">margine</text>
        <text x="50" y="57" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--text)">{money(entrate - uscite).replace(/\s?€/, '')} €</text>
      </svg>
      <div>
        <ul className="torta-legenda">
          {STATI_MOVIMENTO.map((k) => { const tot = entrate + uscite; return <li key={k}><i style={{ background: colori[k] }} aria-hidden /><span>{NOMI_MOVIMENTO[k]}</span><b>{money(t[k])}</b><span className="muted">{tot ? Math.round(t[k] / tot * 100) : 0}%</span></li> })}
        </ul>
        <p className="muted small" style={{ marginTop: 8 }}>Fatturato {money(entrate)} · costi {money(uscite)} · margine previsto <b>{money(entrate - uscite)}</b> (stima: ore non fatturate e spese anticipate escluse)</p>
      </div>
    </div> : <p className="muted">Nessuna fattura emessa e nessuna voce da pagare collegata a questa {L.pratica.toLowerCase()}.</p>}
    {fatture.length > 0 && <><h3 className="sub-title">Fatture incassate e da incassare</h3>
      <div className="table-wrap"><table className="table compact"><thead><tr><th>N.</th><th>Data</th><th>Stato</th><th className="n">Netto</th><th className="n">Incassato</th></tr></thead>
        <tbody>{fatture.map((p) => <tr key={p.id} tabIndex={0} onClick={() => onApriDocumento(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') onApriDocumento(p.id) }}>
          <td className="nowrap"><b>{p.numero}</b></td><td className="nowrap">{fmtDate(p.data)}</td>
          <td><Pill color={p.stato === 'pagata' ? colori.incassate : colori.da_incassare}>{p.stato === 'pagata' ? 'incassata' : 'da incassare'}</Pill></td>
          <td className="n">{money(p.netto)}</td><td className="n">{money(p.stato === 'pagata' ? p.netto : p.incassato || 0)}</td></tr>)}</tbody></table></div></>}
    {costi.length > 0 && <><h3 className="sub-title">Fatture e voci pagate e da pagare</h3>
      <div className="table-wrap"><table className="table compact"><thead><tr><th>Voce</th><th>A chi</th><th>Entro</th><th>Stato</th><th className="n">Importo</th></tr></thead>
        <tbody>{costi.map((c) => <tr key={c.id}>
          <td>{c.descrizione}<br /><small className="muted">{c.categoria}</small>{nomeContabile(c.contabile) && <><br /><button type="button" className="link-btn small" onClick={() => run(() => api.apriContabile(c.id))}><Paperclip size={12} aria-hidden /> {nomeContabile(c.contabile)}</button></>}</td>
          <td>{anagraficaById.get(c.fornitore_id || 0)?.denominazione || '—'}</td><td className="nowrap">{c.scadenza ? fmtDate(c.scadenza) : '—'}</td>
          <td><Pill color={c.pagata ? colori.pagate : colori.da_pagare}>{c.pagata ? 'pagata' : 'da pagare'}</Pill></td><td className="n">{money(c.importo)}</td></tr>)}</tbody></table></div></>}
    {nuovaVoce && <GestioneForm tipo="costi" titolo="Nuova voce da pagare" iniziale={{ categoria: 'Prestazioni e consulenze', pratica_id: praticaId }} onClose={() => setNuovaVoce(false)} />}
  </section>
}
