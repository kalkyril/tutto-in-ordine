import { useMemo, useState } from 'react'
import { CalendarClock, PiggyBank } from 'lucide-react'
import { useData } from '../../store'
import { Btn, Segmented, useAction } from '../ui'
import { ScadenzeFiscaliModal } from '../ScadenzeFiscali'
import { money } from '../../lib/format'
import { CATEGORIA_IMPOSTE, FISCALE_PREDEFINITO, type ImpostazioniFiscali } from '../../lib/budget'
import { regimePredefinito } from '../../lib/scadenzeFiscali'
import { CampoImporto, percento } from './Spese'
import { salvaBudget, type ContestoBudget, type ImpostazioniSezione } from './contesto'

type Metodo = 'percentuale' | 'regime'

/** Scadenze dei versamenti di saldo e acconti per chi presenta il modello Redditi come persona fisica. */
function scadenzeVersamenti(anno: number) {
  return [
    { data: `${anno + 1}-06-30`, voce: `Saldo ${anno} e primo acconto ${anno + 1}`, nota: 'imposta e contributi; si può rinviare al 30 luglio con lo 0,40% in più' },
    { data: `${anno + 1}-11-30`, voce: `Secondo acconto ${anno + 1}`, nota: 'di solito il 60% dell’acconto totale' },
  ]
}

/**
 * Tasse e contributi: quanto mettere da parte dell'anno, con una percentuale indicata dal commercialista o con una stima
 * per regime (forfettario o ordinario). È una stima per non trovarsi senza denaro, non il calcolo della dichiarazione.
 */
export function Tasse({ c }: { c: ContestoBudget }) {
  const { settings } = useData()
  const run = useAction()
  const imp = c.imp
  const salva = (patch: Partial<ImpostazioniSezione>) => run(() => salvaBudget(() => patch))
  const salvaFiscale = (patch: Partial<ImpostazioniFiscali>) => run(() => salvaBudget((a) => ({ fiscale: { ...a.fiscale, ...patch } })))
  const anni = useMemo(() => [...new Set([c.anno, c.anno - 1, ...c.tutti.filter((x) => x.stato === 'incassate').map((x) => Number(x.data.slice(0, 4)))])].filter((a) => a <= c.anno).sort((a, b) => b - a), [c.tutti, c.anno])
  const [anno, setAnno] = useState(c.anno)
  const [fiscali, setFiscali] = useState(false)
  const metodo: Metodo = imp.metodoTasse === 'regime' ? 'regime' : 'percentuale'
  const regimeTio = regimePredefinito(settings) === 'forfettario' ? 'forfettario' : 'ordinario'
  const regime = imp.fiscale?.regime || regimeTio
  const t = c.tasseDi(anno)
  const f = { ...FISCALE_PREDEFINITO, ...imp.fiscale }
  return <div className="budget">
    <div className="toolbar">
      <select value={anno} onChange={(e) => setAnno(Number(e.target.value))} aria-label="Anno">{anni.map((a) => <option key={a}>{a}</option>)}</select>
      <Segmented<Metodo> value={metodo} onChange={(m) => salva({ metodoTasse: m })} options={[{ id: 'percentuale', label: 'Percentuale degli incassi' }, { id: 'regime', label: 'Stima per regime' }]} />
    </div>

    <div className="budget-griglia">
      <section className="card pad budget-scheda" aria-labelledby="tasse-parte">
        <h2 id="tasse-parte"><PiggyBank size={16} aria-hidden /> Da mettere da parte · {anno}</h2>
        {t.metodo === 'nessuno' ? <p className="muted">Scrivi la percentuale che ti ha indicato il commercialista, oppure passa alla stima per regime.</p> : <>
          <p className="budget-cifra">{money(t.daAccantonare)}<small className="muted"> ancora da mettere da parte</small></p>
          <ul className="budget-voci">
            <li><span>{t.metodo === 'regime' ? 'Imposte e contributi stimati' : `${percento((Number(imp.accantonamento) || 0) / 100)} degli incassi`}</span><b>{money(t.totale)}</b></li>
            <li><span>Già pagati in «{CATEGORIA_IMPOSTE}»</span><b>− {money(t.giaPagato)}</b></li>
          </ul>
        </>}
        {metodo === 'percentuale' && <label className="budget-riga">Percentuale degli incassi per tasse e contributi <CampoImporto etichetta="Percentuale da mettere da parte" suffisso="%" massimo={100} valore={imp.accantonamento} onSalva={(accantonamento) => salva({ accantonamento })} /></label>}
        <p className="muted small">I pagamenti di F24, contributi e imposte si annotano in Pagamenti con la categoria «{CATEGORIA_IMPOSTE}»: così si scalano da qui.</p>
      </section>

      <section className="card pad budget-scheda" aria-labelledby="tasse-scadenze">
        <h2 id="tasse-scadenze"><CalendarClock size={16} aria-hidden /> Quando si paga</h2>
        <ul className="budget-voci">{scadenzeVersamenti(anno).map((s) => <li key={s.data}><span>{s.voce}<br /><small className="muted">{s.nota}</small></span><b className="nowrap">{new Date(s.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</b></li>)}</ul>
        <p className="muted small">Date ordinarie per le persone fisiche: il commercialista conferma importi e rate. </p>
        <Btn size="sm" className="budget-azione" onClick={() => setFiscali(true)}>Metti le scadenze fiscali in agenda…</Btn>
      </section>
    </div>

    {metodo === 'regime' && <section className="card pad" aria-labelledby="tasse-stima">
      <header className="card-head"><h2 id="tasse-stima">Stima {regime === 'forfettario' ? 'nel forfettario' : 'nel regime ordinario'} · {anno}</h2>
        <Segmented value={regime} onChange={(r) => salvaFiscale({ regime: r })} options={[{ id: 'forfettario', label: 'Forfettario' }, { id: 'ordinario', label: 'Ordinario' }]} /></header>
      <div className="tasse-parametri">
        {regime === 'forfettario' ? <>
          <label className="budget-riga">Coefficiente di redditività <CampoImporto etichetta="Coefficiente di redditività" suffisso="%" massimo={100} valore={f.coefficiente} onSalva={(v) => salvaFiscale({ coefficiente: v ?? undefined })} /></label>
          <label className="budget-riga">Imposta sostitutiva <CampoImporto etichetta="Aliquota dell’imposta sostitutiva" suffisso="%" massimo={100} valore={f.aliquota} onSalva={(v) => salvaFiscale({ aliquota: v ?? undefined })} /></label>
        </> : <label className="budget-riga">IRPEF e addizionali, aliquota media <CampoImporto etichetta="Aliquota media IRPEF" suffisso="%" massimo={100} valore={f.irpef} onSalva={(v) => salvaFiscale({ irpef: v ?? undefined })} /></label>}
        <label className="budget-riga">Contributi previdenziali <CampoImporto etichetta="Aliquota dei contributi" suffisso="%" massimo={100} valore={f.contributi} onSalva={(v) => salvaFiscale({ contributi: v ?? undefined })} /></label>
      </div>
      {t.stima && <div className="table-wrap"><table className="table">
        <tbody>{t.stima.righe.map((r) => <tr key={r.voce}><td>{r.voce}{r.nota && <><br /><small className="muted">{r.nota}</small></>}</td><td className="n nowrap">{r.importo < 0 ? `− ${money(-r.importo)}` : money(r.importo)}</td></tr>)}</tbody>
        <tfoot><tr><th>Totale stimato</th><th className="n nowrap">{money(t.stima.totale)}</th></tr></tfoot>
      </table></div>}
      <p className="muted small">Stima di cassa sugli incassi dell’anno: non tiene conto di acconti già versati fuori da TIO, deduzioni, detrazioni, minimi contributivi, rivalsa o regole della tua cassa. Coefficiente e aliquote li trovi nella dichiarazione dell’anno scorso o li chiedi al commercialista.</p>
    </section>}
    {fiscali && <ScadenzeFiscaliModal esistenti={c.g.ricorrenze.map((r) => r.titolo)} onClose={() => setFiscali(false)} />}
  </div>
}
