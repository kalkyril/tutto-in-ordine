import { useEffect, useMemo, useRef, useState } from 'react'
import { Landmark, TriangleAlert } from 'lucide-react'
import { Btn } from '../ui'
import { money } from '../../lib/format'
import { calcolaBudget, previsione } from '../../lib/budget'
import { regimePredefinito } from '../../lib/scadenzeFiscali'
import { avvisiPratiche, consumoPratiche } from '../../lib/budgetPratica'
import { useData } from '../../store'
import type { ContestoBudget } from './contesto'

const nomeMese = (m: string, breve = false) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('it-IT', breve ? { month: 'short' } : { month: 'long', year: 'numeric' })
const piuGiorni = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }

const euroBreve = (v: number) => { const a = Math.abs(v), t = a >= 1000 ? `${(a / 1000).toLocaleString('it-IT', { maximumFractionDigits: a >= 10000 ? 0 : 1 })}k` : String(Math.round(a)); return v < 0 ? `−${t}` : t }
/** Tacche «tonde» dell'asse verticale, zero compreso. */
function tacche(min: number, max: number) {
  const span = max - min || 1, grezzo = span / 4, p = 10 ** Math.floor(Math.log10(grezzo)), passo = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= grezzo) || 10 * p
  const da = Math.floor(min / passo) * passo, a = Math.ceil(max / passo) * passo
  return Array.from({ length: Math.round((a - da) / passo) + 1 }, (_, i) => Math.round((da + i * passo) * 100) / 100)
}

/**
 * Saldo previsto a fine mese: linea piena per lo scenario atteso, tratteggiata per quello prudente (solo se diverso).
 * Si adatta alla larghezza del riquadro; al passaggio del mouse o con le frecce mostra i numeri del mese.
 */
function GraficoPrevisione({ mesi, conSaldo }: { mesi: ReturnType<typeof previsione>; conSaldo: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [L, setL] = useState(720)
  const [sel, setSel] = useState<number | null>(null)
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(([e]) => setL(Math.max(320, Math.round(e.contentRect.width)))); ro.observe(el); return () => ro.disconnect() }, [])
  const H = 232, sx = 48, dx = 16, alto = 12, basso = 28
  const prudenteDiverso = mesi.some((m) => Math.abs(m.saldoPrudente - m.saldo) > 0.5)
  const t = tacche(Math.min(0, ...mesi.map((m) => Math.min(m.saldo, prudenteDiverso ? m.saldoPrudente : m.saldo))), Math.max(0, ...mesi.map((m) => m.saldo)))
  const min = t[0], max = t[t.length - 1], span = max - min || 1
  const x = (i: number) => sx + (i * (L - sx - dx)) / Math.max(1, mesi.length - 1)
  const y = (v: number) => alto + ((max - v) * (H - alto - basso)) / span
  const linea = (k: 'saldo' | 'saldoPrudente') => mesi.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(m[k]).toFixed(1)}`).join(' ')
  const passo = (L - sx - dx) / Math.max(1, mesi.length - 1)
  const m = sel != null ? mesi[sel] : null
  const tasto = (e: React.KeyboardEvent) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setSel((v) => Math.min(mesi.length - 1, Math.max(0, (v ?? -1) + (e.key === 'ArrowRight' ? 1 : -1)))) } else if (e.key === 'Escape') setSel(null) }
  return <div className="previsione-box" ref={box} onMouseLeave={() => setSel(null)}>
    <svg className="previsione-grafico" width={L} height={H} viewBox={`0 0 ${L} ${H}`} role="img" tabIndex={0} onKeyDown={tasto} onBlur={() => setSel(null)}
      aria-label={`${conSaldo ? 'Saldo' : 'Flusso di cassa'} previsto a fine mese per i prossimi dodici mesi. Usa le frecce per leggere i mesi.`}>
      {min < 0 && <rect x={sx} y={y(0)} width={L - sx - dx} height={Math.max(0, y(min) - y(0))} className="sotto-zero" />}
      {t.map((v) => <g key={v}><line x1={sx} x2={L - dx} y1={y(v)} y2={y(v)} className={v === 0 ? 'zero' : 'griglia'} /><text x={sx - 8} y={y(v) + 4} textAnchor="end" className="asse">{v === 0 ? '0' : euroBreve(v)}</text></g>)}
      {m && <line x1={x(sel!)} x2={x(sel!)} y1={alto} y2={H - basso} className="mirino" />}
      {prudenteDiverso && <path d={linea('saldoPrudente')} className="prudente" />}
      <path d={linea('saldo')} className="atteso" />
      {mesi.map((q, i) => <g key={q.mese}>
        <circle cx={x(i)} cy={y(q.saldo)} r={sel === i ? 5 : 4} className={q.saldo < 0 ? 'punto neg' : 'punto'} />
        <text x={x(i)} y={H - 8} textAnchor="middle" className={`asse${sel === i ? ' su' : ''}`}>{nomeMese(q.mese, true)}</text>
        <rect x={x(i) - passo / 2} y={0} width={passo} height={H} className="zona" onMouseEnter={() => setSel(i)} />
      </g>)}
    </svg>
    {m && <div className={`previsione-tip${x(sel!) > L * 0.66 ? ' sinistra' : ''}`} style={y(m.saldo) < (H - basso) / 2 ? { left: x(sel!), bottom: basso + 4 } : { left: x(sel!), top: 4 }} role="status">
      <b>{nomeMese(m.mese)}</b>
      <span><i>Entrate</i> {money(m.entrate)}</span>
      <span><i>Uscite</i> {money(m.uscite)}</span>
      <span className={m.saldo < 0 ? 'late-text' : ''}><i>{conSaldo ? 'Saldo' : 'Flusso'} a fine mese</i> {money(m.saldo)}</span>
      {prudenteDiverso && <span><i>Se gli incassi tardano</i> {money(m.saldoPrudente)}</span>}
    </div>}
  </div>
}

export function Panoramica({ c, onScheda }: { c: ContestoBudget; onScheda: (s: string) => void }) {
  const { settings, pratiche, ore, spese } = useData()
  const mesi = useMemo(() => previsione(c.tutti, c.saldoOggi, c.oggi, 12), [c.tutti, c.saldoOggi, c.oggi])
  const tasse = c.tasseDi(c.anno)
  const entro30 = piuGiorni(c.oggi, 30)
  const aperti = c.tutti.filter((x) => x.stato === 'da_incassare' || x.stato === 'da_pagare')
  const scaduti = aperti.filter((x) => x.stato === 'da_incassare' && x.scaduto).reduce((s, x) => s + x.importo, 0)
  const uscite30 = aperti.filter((x) => x.stato === 'da_pagare' && x.data <= entro30).reduce((s, x) => s + x.importo, 0)
  const entrate30 = aperti.filter((x) => x.stato === 'da_incassare' && !x.scaduto && x.data <= entro30).reduce((s, x) => s + x.importo, 0)
  const disponibile = Math.round((c.saldoOggi - tasse.daAccantonare - uscite30) * 100) / 100
  const conConti = c.b.conti.some((x) => !x.archiviato)
  const b = useMemo(() => calcolaBudget(c.tutti, c.anno, c.imp, { forfettario: regimePredefinito(settings) === 'forfettario' }), [c.tutti, c.anno, c.imp, settings])
  const avvisiLavori = useMemo(() => avvisiPratiche(pratiche, consumoPratiche(ore, spese, c.g.costi), c.oggi, new Set(settings.stati_pratica.filter((s) => s.chiusa).map((s) => s.nome))).filter((a) => a.tipo !== 'consegna' && a.livello === 'superato'), [pratiche, ore, spese, c.g.costi, c.oggi, settings.stati_pratica])
  const titolo = (id: number) => pratiche.find((p) => p.id === id)?.titolo || ''
  const avvisi: string[] = [
    ...(!conConti ? [] : mesi.filter((m) => m.saldo < 0).slice(0, 1)).map((m) => `A fine ${nomeMese(m.mese)} il saldo previsto va sotto zero (${money(m.saldo)}).`),
    ...(conConti && !mesi.some((m) => m.saldo < 0) ? mesi.filter((m) => m.saldoPrudente < 0).slice(0, 1).map((m) => `Se gli incassi tardano, a fine ${nomeMese(m.mese)} il saldo andrebbe sotto zero (${money(m.saldoPrudente)}).`) : []),
    ...(scaduti > 0 ? [`${money(scaduti)} da incassare sono già scaduti.`] : []),
    ...b.righe.filter((r) => r.stato === 'superato').map((r) => `Budget superato per «${r.categoria}» (${money(r.totale)} su ${money(r.budget || 0)}).`),
    ...avvisiLavori.slice(0, 3).map((a) => `«${titolo(a.pratica_id)}»: ${a.testo}.`),
    ...(avvisiLavori.length > 3 ? [`Altri ${avvisiLavori.length - 3} lavori oltre il budget.`] : []),
    ...(b.soglia && b.soglia.stato !== 'ok' ? [`Incassi a ${money(b.soglia.ricavi)}: ${b.soglia.stato === 'attenzione' ? 'ti avvicini alla soglia' : 'hai superato la soglia'} del forfettario.`] : []),
  ]
  return <div className="budget">
    <div className="kpis budget-numeri">
      <div className="kpi static"><span>Saldo dei conti oggi</span><b>{conConti ? money(c.saldoOggi) : '—'}</b>{!conConti && <Btn size="sm" variant="ghost" onClick={() => onScheda('conti')}><Landmark size={14} /> Aggiungi un conto</Btn>}</div>
      <div className="kpi static"><span>Entrate attese entro 30 giorni</span><b>{money(entrate30)}</b>{scaduti > 0 && <small className="late-text">più {money(scaduti)} scaduti</small>}</div>
      <div className="kpi static"><span>Uscite entro 30 giorni</span><b>{money(uscite30)}</b></div>
      <div className="kpi static"><span>Tasse da mettere da parte</span><b>{tasse.metodo === 'nessuno' ? '—' : money(tasse.daAccantonare)}</b>{tasse.metodo === 'nessuno' && <Btn size="sm" variant="ghost" onClick={() => onScheda('tasse')}>Imposta la stima</Btn>}</div>
      <div className={`kpi static budget-disponibile ${conConti && disponibile < 0 ? 'neg' : ''}`} title="Saldo dei conti, meno le tasse da mettere da parte e le uscite dei prossimi 30 giorni"><span>Disponibile davvero</span><b>{conConti ? money(disponibile) : '—'}</b></div>
    </div>

    {avvisi.length > 0 && <section className="card pad budget-avvisi" role="status" aria-label="Da tenere d’occhio"><ul>{avvisi.map((a) => <li key={a}><TriangleAlert size={14} aria-hidden /> {a}</li>)}</ul></section>}

    <section className="card pad" aria-labelledby="titolo-previsione">
      <header className="card-head"><h2 id="titolo-previsione">{conConti ? 'Saldo previsto' : 'Flusso di cassa previsto'} · 12 mesi</h2><span className="legenda-previsione" aria-hidden><span><i className="atteso" />Atteso</span><span><i className="prudente" />Se gli incassi tardano</span></span></header>
      {!conConti && <p className="muted small">Senza un conto TIO non conosce il saldo di partenza: il grafico mostra solo entrate meno uscite, sommate mese per mese. <button type="button" className="link-btn" onClick={() => onScheda('conti')}>Aggiungi un conto</button></p>}
      <GraficoPrevisione mesi={mesi} conSaldo={conConti} />
      <details className="budget-dettaglio"><summary>Mese per mese</summary>
      <div className="table-wrap"><table className="table budget-previsione">
        <thead><tr><th>Mese</th><th className="n">Entrate attese</th><th className="n">Uscite</th><th className="n">{conConti ? 'Saldo' : 'Flusso'} a fine mese</th><th className="n">Se gli incassi tardano</th></tr></thead>
        <tbody>{mesi.map((m) => <tr key={m.mese}><td>{nomeMese(m.mese)}</td><td className="n nowrap">{money(m.entrate)}</td><td className="n nowrap">{money(m.uscite)}</td><td className={`n nowrap ${m.saldo < 0 ? 'late-text' : ''}`}>{money(m.saldo)}</td><td className={`n nowrap ${m.saldoPrudente < 0 ? 'late-text' : 'muted'}`}>{money(m.saldoPrudente)}</td></tr>)}</tbody>
      </table></div></details>
      <p className="muted small">{conConti ? 'Parte dal saldo dei conti di oggi.' : 'Parte da zero.'} Contano i documenti da incassare, le voci da pagare e le uscite ricorrenti previste; ciò che è già scaduto cade nel mese in corso. «Se gli incassi tardano»: gli incassi arrivano con 30 giorni di ritardo e quelli scaduti da oltre 60 giorni non arrivano.</p>
    </section>
  </div>
}
