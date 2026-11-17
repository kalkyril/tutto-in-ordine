import { useMemo, useState } from 'react'
import { Clock, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { useData } from '../../store'
import { Segmented } from '../ui'
import { money } from '../../lib/format'
import { calcolaIndicatori, type RigaMargine } from '../../lib/indicatori'
import { Barra } from './Spese'
import type { ContestoBudget } from './contesto'

type Ordine = 'peggiori' | 'migliori'
const pct = (q: number | null) => (q == null ? '—' : `${Math.round(q * 100)}%`)
const variazione = (q: number | null) => (q == null ? null : `${q >= 0 ? '+' : '−'}${Math.abs(Math.round(q * 100))}%`)

function TabellaMargini({ righe, nome, quota }: { righe: RigaMargine[]; nome: string; quota?: boolean }) {
  return <div className="table-wrap"><table className="table indicatori-tabella">
    <thead><tr><th>{nome}</th>{quota && <th>Peso sul fatturato</th>}<th className="n">Fatturato</th><th className="n">Costi diretti</th><th className="n">Margine</th><th className="n">Margine %</th></tr></thead>
    <tbody>{righe.map((r) => <tr key={r.chiave}>
      <td>{r.nome}{r.dettaglio && <><br /><small className="muted">{r.dettaglio}</small></>}</td>
      {quota && <td className="indicatori-quota"><Barra quota={r.quota || 0} stato="ok" /><span className="small muted">{pct(r.quota ?? null)}</span></td>}
      <td className="n nowrap">{money(r.fatturato)}</td>
      <td className="n nowrap">{money(r.costi)}</td>
      <td className={`n nowrap ${r.margine < 0 ? 'late-text' : ''}`}>{money(r.margine)}</td>
      <td className={`n nowrap ${r.margine < 0 ? 'late-text' : 'muted'}`}>{pct(r.percentuale)}</td>
    </tr>)}</tbody>
  </table></div>
}

/**
 * Indicatori: tempi di incasso, andamento rispetto all'anno prima, peso dei clienti e margine di clienti e lavori.
 * Il margine è fatturato meno costi diretti (spese anticipate e voci da pagare collegate al lavoro): non conta il tempo.
 */
export function Indicatori({ c }: { c: ContestoBudget }) {
  const { parcelle, pratiche, spese, anagraficaById, settings } = useData()
  const [anno, setAnno] = useState(c.anno)
  const [ordine, setOrdine] = useState<Ordine>('peggiori')
  const anni = useMemo(() => [...new Set([c.anno, ...parcelle.filter((p) => p.tipo === 'parcella').map((p) => Number(String(p.data).slice(0, 4)))])].filter((a) => a > 1990 && a <= c.anno).sort((a, b) => b - a), [parcelle, c.anno])
  const ind = useMemo(() => calcolaIndicatori({ anno, oggi: anno === c.anno ? c.oggi : `${anno}-12-31`, parcelle, movimenti: c.tutti, fatture: c.b.fatture, costi: c.g.costi.map((x) => ({ pratica_id: x.pratica_id, data: x.data, importo: x.importo })), spese, pratiche, nomeCliente: (id) => anagraficaById.get(id)?.denominazione }),
    [anno, c.anno, c.oggi, parcelle, c.tutti, c.b.fatture, c.g.costi, spese, pratiche, anagraficaById])
  const L = settings.etichette
  const a = ind.andamento, v = variazione(a.variazione)
  const lavori = ordine === 'peggiori' ? ind.lavori.slice(0, 10) : [...ind.lavori].reverse().slice(0, 10)
  const periodo = anno === c.anno ? 'da inizio anno' : `nel ${anno}`
  return <div className="budget">
    <div className="toolbar"><select value={anno} onChange={(e) => setAnno(Number(e.target.value))} aria-label="Anno">{anni.map((x) => <option key={x}>{x}</option>)}</select></div>

    <div className="kpis budget-numeri">
      <div className="kpi static"><span>Giorni medi per incassare</span><b>{ind.incasso.giorniMedi ?? '—'}</b><small className="muted">{ind.incasso.documenti ? `${ind.incasso.documenti} documenti pagati negli ultimi 12 mesi` : 'nessun documento pagato negli ultimi 12 mesi'}</small></div>
      <div className="kpi static"><span>Pagati entro la scadenza</span><b>{pct(ind.incasso.puntuali)}</b><small className="muted">dei documenti pagati</small></div>
      <div className="kpi static"><span>Incassato {periodo}</span><b>{money(a.incassato)}</b>{v && <small className={a.variazione! < 0 ? 'late-text' : 'testo-ok'}>{v} sullo stesso periodo del {anno - 1}</small>}</div>
      <div className="kpi static"><span>Media mensile, ultimi 12 mesi</span><b>{money(a.mediaEntrate)}</b><small className="muted">di entrate; uscite {money(a.mediaUscite)}</small></div>
      <div className={`kpi static ${ind.incasso.scaduti > 0 ? 'danger' : ''}`}><span>Crediti scaduti</span><b>{money(ind.incasso.scaduti)}</b>{ind.incasso.etaScaduti != null && <small className="muted">scaduti in media da {ind.incasso.etaScaduti} giorni</small>}</div>
    </div>

    <div className="budget-griglia">
      <section className="card pad budget-scheda" aria-labelledby="ind-andamento">
        <h2 id="ind-andamento">{a.variazione != null && a.variazione < 0 ? <TrendingDown size={16} aria-hidden /> : <TrendingUp size={16} aria-hidden />} Rispetto al {anno - 1}</h2>
        <ul className="budget-voci">
          <li><span>Incassato {periodo}</span><b>{money(a.incassato)}</b></li>
          <li><span>Stesso periodo del {anno - 1}</span><b>{money(a.incassatoPrima)}</b></li>
          <li><span>Pagato {periodo}</span><b>{money(a.pagato)}</b></li>
          <li><span>Stesso periodo del {anno - 1}</span><b>{money(a.pagatoPrima)}</b></li>
        </ul>
        <p className="muted small">Denaro entrato e uscito davvero, alle date di incasso e di pagamento.</p>
      </section>
      <section className="card pad budget-scheda" aria-labelledby="ind-clienti">
        <h2 id="ind-clienti"><Users size={16} aria-hidden /> Quanto pesano i clienti</h2>
        {ind.primoCliente != null ? <>
          <p className="budget-riga"><span>Il primo cliente</span><b>{pct(ind.primoCliente)}</b></p>
          <Barra quota={ind.primoCliente} stato={ind.primoCliente > 0.5 ? 'attenzione' : 'ok'} />
          <p className="budget-riga"><span>I primi tre</span><b>{pct(ind.primiTre)}</b></p>
          <Barra quota={ind.primiTre || 0} stato="ok" />
          <p className="muted small">{ind.primoCliente > 0.5 ? 'Più di metà del fatturato viene da un solo cliente: se si ferma, si ferma quasi tutto.' : `Quota del fatturato ${anno} di ciascuno.`}</p>
        </> : <p className="muted">Nessun documento emesso nel {anno}.</p>}
      </section>
    </div>

    <section className="card pad budget-scheda" aria-labelledby="ind-tabella-clienti">
      <h2 id="ind-tabella-clienti">{L.clienti} · {anno}</h2>
      {ind.clienti.length ? <TabellaMargini righe={ind.clienti.slice(0, 10)} nome={L.cliente} quota /> : <p className="muted">Nessun documento emesso nel {anno}.</p>}
    </section>

    <section className="card pad budget-scheda" aria-labelledby="ind-lavori">
      <header className="card-head"><h2 id="ind-lavori"><Clock size={16} aria-hidden /> {L.pratiche}: margine dall’inizio del lavoro</h2>
        <Segmented<Ordine> value={ordine} onChange={setOrdine} options={[{ id: 'peggiori', label: 'Meno redditizi' }, { id: 'migliori', label: 'Più redditizi' }]} /></header>
      {ind.inPerdita > 0 && <p className="small late-text" role="status">{ind.inPerdita === 1 ? `1 ${L.pratica.toLowerCase()} ha costi superiori al fatturato.` : `${ind.inPerdita} ${L.pratiche.toLowerCase()} hanno costi superiori al fatturato.`}</p>}
      {lavori.length ? <TabellaMargini righe={lavori} nome={L.pratica} /> : <p className="muted">Nessun documento o costo collegato a un lavoro.</p>}
      <p className="muted small">Margine = fatturato (imponibile dei documenti emessi) meno costi diretti (spese anticipate e voci da pagare collegate). Non conta il tempo dedicato: per quello c’è il budget del lavoro, con le ore.</p>
    </section>
  </div>
}
