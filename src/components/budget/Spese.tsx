import { useEffect, useMemo, useState } from 'react'
import { Target, TriangleAlert, Wallet } from 'lucide-react'
import { useData } from '../../store'
import { useAction } from '../ui'
import { categorieCosto } from '../GestioneAttivita'
import { fmtNum, money, parseNumber } from '../../lib/format'
import { calcolaBudget, type StatoBudget } from '../../lib/budget'
import { regimePredefinito } from '../../lib/scadenzeFiscali'
import { salvaBudget, type ContestoBudget, type ImpostazioniSezione } from './contesto'

const NOME_STATO: Record<StatoBudget, string> = { nessuno: '', ok: 'Nei limiti', attenzione: 'Oltre l’80%', superato: 'Superato' }
export const percento = (q: number) => `${fmtNum(q * 100, 0)}%`

/** Campo in euro (o in percentuale) che salva quando si esce dal campo; vuoto = nessun valore. */
export function CampoImporto({ valore, onSalva, etichetta, suffisso = '€', massimo }: { valore: number | null | undefined; onSalva: (v: number | null) => void; etichetta: string; suffisso?: string; massimo?: number }) {
  const scritto = valore != null && valore > 0 ? (suffisso === '%' ? valore.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : fmtNum(valore, 2)) : ''
  const [testo, setTesto] = useState(scritto)
  useEffect(() => setTesto(scritto), [scritto])
  const salva = () => {
    if (testo.trim() === scritto) return
    if (!testo.trim()) { onSalva(null); return }
    const n = parseNumber(testo)
    if (!Number.isFinite(n) || n < 0 || (massimo != null && n > massimo)) { setTesto(scritto); return }
    onSalva(n)
  }
  return <span className="budget-campo"><input inputMode="decimal" aria-label={etichetta} value={testo} placeholder="—" onChange={(e) => setTesto(e.target.value)} onBlur={salva} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /><span aria-hidden>{suffisso}</span></span>
}
export function Barra({ quota, stato }: { quota: number; stato?: string }) {
  return <span className={`budget-barra ${stato || ''}`} aria-hidden><i style={{ width: `${Math.min(100, Math.max(quota > 0 ? 2 : 0, quota * 100))}%` }} /></span>
}

/**
 * Spese e budget dell'anno: obiettivo di incasso, soglia del forfettario e, per ogni categoria di spesa, il budget
 * annuo confrontato con quanto è pagato, da pagare e previsto.
 */
export function Spese({ c }: { c: ContestoBudget }) {
  const { settings } = useData()
  const run = useAction()
  const imp = c.imp, tutti = c.tutti
  const salva = (patch: Partial<ImpostazioniSezione>) => run(() => salvaBudget(() => patch))
  const anni = useMemo(() => [...new Set([...tutti.map((x) => Number(x.data.slice(0, 4))), c.anno])].sort((a, b) => b - a), [tutti, c.anno])
  const [anno, setAnno] = useState(c.anno)
  const [tutte, setTutte] = useState(false)
  const forfettario = regimePredefinito(settings) === 'forfettario'
  const b = useMemo(() => calcolaBudget(tutti, anno, imp, { forfettario, categorieNote: tutte ? categorieCosto(settings.profilo === 'avvocato') : [] }), [tutti, anno, imp, forfettario, tutte, settings.profilo])

  return <div className="budget">
    <div className="toolbar"><select value={anno} onChange={(e) => setAnno(Number(e.target.value))} aria-label="Anno">{anni.map((a) => <option key={a}>{a}</option>)}</select></div>

    <div className="budget-griglia">
      <section className="card pad budget-scheda" aria-labelledby="budget-obiettivo">
        <h2 id="budget-obiettivo"><Target size={16} aria-hidden /> Obiettivo {anno}</h2>
        <p className="budget-cifra">{money(b.incassato)}<small className="muted"> incassati{b.daIncassare > 0 ? ` · ${money(b.daIncassare)} da incassare` : ''}</small></p>
        <label className="budget-riga">Obiettivo di incasso <CampoImporto etichetta="Obiettivo di incasso dell’anno" valore={imp.obiettivo} onSalva={(obiettivo) => salva({ obiettivo })} /></label>
        {b.obiettivo && <><Barra quota={b.obiettivo.quota} stato={b.obiettivo.quota >= 1 ? 'ok' : undefined} /><p className="muted small">{percento(b.obiettivo.quota)} dell’obiettivo{b.obiettivo.quota < 1 ? ` · mancano ${money(b.obiettivo.importo - b.obiettivo.raggiunto)}` : ''}</p></>}
        {b.soglia && <div className={`budget-soglia ${b.soglia.stato}`} role={b.soglia.stato === 'ok' ? undefined : 'status'}>
          <p className="budget-riga"><span>Soglia del forfettario</span><b>{money(b.soglia.ricavi)} / {money(b.soglia.limite)}</b></p>
          <Barra quota={b.soglia.quota} stato={b.soglia.stato === 'ok' ? 'ok' : b.soglia.stato === 'attenzione' ? 'attenzione' : 'superato'} />
          <p className="small">{b.soglia.stato === 'uscita' ? <><TriangleAlert size={13} aria-hidden /> Oltre {money(b.soglia.uscita)}: si esce dal regime forfettario già da quest’anno. Parlane subito con il commercialista.</>
            : b.soglia.stato === 'oltre' ? <><TriangleAlert size={13} aria-hidden /> Oltre {money(b.soglia.limite)}: dal prossimo anno il regime forfettario non si può più applicare.</>
            : b.soglia.stato === 'attenzione' ? <>Restano {money(b.soglia.limite - b.soglia.ricavi)} prima della soglia.</>
            : <span className="muted">Incassi dell’anno rispetto alla soglia dei ricavi.</span>}</p>
        </div>}
      </section>

      <section className="card pad budget-scheda" aria-labelledby="budget-riepilogo">
        <h2 id="budget-riepilogo"><Wallet size={16} aria-hidden /> Spese {anno}</h2>
        <p className="budget-cifra">{money(b.totali.pagato)}<small className="muted"> pagati{b.totali.daPagare > 0 ? ` · ${money(b.totali.daPagare)} da pagare o previsti` : ''}</small></p>
        {b.totali.budget ? <>
          <p className="budget-riga"><span>Budget delle categorie</span><b className="nowrap">{money(b.totali.budget)}</b></p>
          <Barra quota={(b.totali.pagato + b.totali.daPagare) / b.totali.budget} stato={b.totali.pagato + b.totali.daPagare > b.totali.budget ? 'superato' : (b.totali.pagato + b.totali.daPagare) / b.totali.budget >= 0.8 ? 'attenzione' : 'ok'} />
          <p className="muted small">{percento((b.totali.pagato + b.totali.daPagare) / b.totali.budget)} del budget tra pagato e da pagare{b.righe.some((r) => r.stato === 'superato') ? ` · ${b.righe.filter((r) => r.stato === 'superato').length} ${b.righe.filter((r) => r.stato === 'superato').length === 1 ? 'categoria oltre il budget' : 'categorie oltre il budget'}` : ''}</p>
        </> : <p className="muted small">Scrivi un budget annuo accanto alle categorie qui sotto: TIO avvisa quando ti avvicini o lo superi.</p>}
      </section>
    </div>

    <section className="card pad" aria-labelledby="budget-spese">
      <header className="card-head"><h2 id="budget-spese">Spese per categoria · {anno}</h2><label className="check"><input type="checkbox" checked={tutte} onChange={(e) => setTutte(e.target.checked)} /> Mostra tutte le categorie</label></header>
      {b.righe.length ? <div className="table-wrap"><table className="table budget-tabella">
        <thead><tr><th>Categoria</th><th className="n">Budget annuo</th><th className="n">Pagato</th><th className="n">Da pagare</th><th>Andamento</th></tr></thead>
        <tbody>{b.righe.map((r) => <tr key={r.categoria}>
          <td>{r.categoria}</td>
          <td className="n"><CampoImporto etichetta={`Budget annuo per ${r.categoria}`} valore={r.budget} onSalva={(v) => run(() => salvaBudget((a) => { const categorie = { ...a.categorie }; if (v) categorie[r.categoria] = v; else delete categorie[r.categoria]; return { categorie } }))} /></td>
          <td className="n nowrap">{money(r.pagato)}</td>
          <td className="n nowrap">{money(r.daPagare)}</td>
          <td className="budget-andamento">{r.budget ? <><Barra quota={r.quota || 0} stato={r.stato} /><span className={`small ${r.stato === 'superato' ? 'late-text' : 'muted'}`}>{percento(r.quota || 0)} · {NOME_STATO[r.stato]}</span></> : <span className="muted small">{money(r.totale)} in tutto</span>}</td>
        </tr>)}</tbody>
        <tfoot><tr><th>Totale</th><th className="n nowrap">{b.totali.budget ? money(b.totali.budget) : '—'}</th><th className="n nowrap">{money(b.totali.pagato)}</th><th className="n nowrap">{money(b.totali.daPagare)}</th><td /></tr></tfoot>
      </table></div> : <p className="muted">Nessuna spesa nel {anno}. Scegli «Mostra tutte le categorie» per impostare un budget prima di spendere.</p>}
      <p className="muted small">«Da pagare» comprende le uscite ricorrenti previste per il resto dell’anno. Le spese si annotano in Pagamenti › Da pagare; le fatture ricevute lette dal servizio contano nella loro categoria.</p>
    </section>
  </div>
}
