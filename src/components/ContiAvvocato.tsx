// Voci «Fatture avvocati» del menu Competenza: fattura, scorporo, ritenuta d'acconto e compenso a ore,
// con lo stesso prospetto finale del calcolo dei parametri forensi.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useData } from '../store'
import { Input, Select } from './ui'
import { calcolaParcella } from '../lib/calc'
import { calcolaConti, type ContiStato } from '../lib/conti'
import { decimal, parseNumber } from '../lib/format'
import { righeProspetto } from '../lib/prospetto'
import type { VoceParcella } from '../types'
import type { CalcRisultato, CalcState } from './CompensoCalculator'

function Riga({ etichetta, spenta, children }: { etichetta: string; spenta?: boolean; children: ReactNode }) {
  return <div className={`srow ${spenta ? 'off' : ''}`}><span className="lbl">{etichetta}</span><div className="ctrl">{children}</div></div>
}

const pc = (n: number) => decimal(n).replace(',00', '')

export function ContiAvvocato({ cod, competenza, base, extraVoci, onResult }: { cod: number; competenza: ReactNode; base: CalcState; extraVoci: VoceParcella[]; onResult: (r: CalcRisultato) => void }) {
  const { settings } = useData()
  const al = settings.aliquote
  const iniziale = base.conti
  const [s, setS] = useState<ContiStato>(() => ({
    onorari: '', speseEsenti: '', speseImponibili: '', sgOn: true, sgPct: String(al.sg || 15).replace('.', ','), cpaOn: true, ivaOn: true, ritOn: false, ritPct: String(al.rit || 20).replace('.', ','),
    cpaInRitenuta: false, regime: al.iva === 0 ? 'forfettario' : 'ordinario', bolloOn: true, importo: '', base: 'totale', ore: '', minuti: '', tariffa: String(settings.tariffa_oraria || '').replace('.', ','),
    ...iniziale,
  }))
  const up = <K extends keyof ContiStato>(k: K, v: ContiStato[K]) => setS((x) => ({ ...x, [k]: v }))
  const forf = s.regime === 'forfettario'
  const r = useMemo(() => calcolaConti(cod, s, { cpa: al.cpa, iva: al.iva, rit: al.rit }, parseNumber), [cod, s, al.cpa, al.iva, al.rit])
  const tutte = useMemo(() => [...r.voci, ...extraVoci], [r.voci, extraVoci])
  const tot = useMemo(() => calcolaParcella(tutte, r.aliquote), [tutte, r.aliquote])
  const righe = useMemo(() => righeProspetto({ ...tot, sg_perc: r.aliquote.sg, cpa_perc: r.aliquote.cpa, iva_perc: r.aliquote.iva, rit_perc: r.aliquote.rit }, null, tutte), [tot, r.aliquote, tutte])

  const last = useRef('')
  useEffect(() => {
    const state: CalcState = { ...base, competenza: cod, conti: s, sgOn: s.sgOn, sgPct: s.sgPct, cpaOn: s.cpaOn, ivaOn: !forf && s.ivaOn, ritOn: !forf && (s.ritOn || cod === 820) }
    const out: CalcRisultato = { voci: r.voci, aliquote: { sg_perc: r.aliquote.sg, cpa_perc: r.aliquote.cpa, iva_perc: r.aliquote.iva, rit_perc: r.aliquote.rit }, totale: tot, compenso: r.onorari, state, dettaglio: null }
    const key = JSON.stringify(out)
    if (key !== last.current) { last.current = key; onResult(out) }
  })

  const euro = (k: 'onorari' | 'speseEsenti' | 'speseImponibili' | 'importo', etichetta: string, aiuto?: string) =>
    <Riga etichetta={etichetta}><Input inputMode="decimal" value={s[k]} onChange={(e) => up(k, e.target.value)} placeholder="0,00" style={{ maxWidth: 170 }} aria-label={etichetta.replace(/[:€]/g, '').trim()} />{aiuto && <span className="muted small">{aiuto}</span>}</Riga>

  return (
    <div className="calc-grid">
      <div className="calc-form site-form">
        {competenza}
        {cod === 810 && <>
          {euro('importo', 'Importo €', 'la somma complessiva da scorporare')}
          <Riga etichetta="L’importo è:">
            <Select value={s.base} onChange={(e) => up('base', e.target.value as ContiStato['base'])} aria-label="Tipo di importo" style={{ maxWidth: 300 }}>
              <option value="totale">il totale del documento (lordo)</option>
              <option value="netto">il netto a pagare (dopo la ritenuta)</option>
              <option value="imponibile">l’imponibile IVA</option>
            </Select>
          </Riga>
        </>}
        {(cod === 800 || cod === 820) && euro('onorari', 'Onorari €')}
        {cod === 830 && <>
          <Riga etichetta="Tempo impiegato:">
            <Input inputMode="decimal" value={s.ore} onChange={(e) => up('ore', e.target.value)} placeholder="0" style={{ maxWidth: 80 }} aria-label="Ore" /> <span className="muted small">ore</span>
            <Input inputMode="numeric" value={s.minuti} onChange={(e) => up('minuti', e.target.value)} placeholder="0" style={{ maxWidth: 80 }} aria-label="Minuti" /> <span className="muted small">minuti</span>
          </Riga>
          <Riga etichetta="Tariffa oraria €"><Input inputMode="decimal" value={s.tariffa} onChange={(e) => up('tariffa', e.target.value)} placeholder="0,00" style={{ maxWidth: 140 }} aria-label="Tariffa oraria" /><span className="muted small">compenso: € {decimal(r.onorari)}</span></Riga>
        </>}
        {euro('speseEsenti', cod === 810 ? 'Di cui spese esenti €' : 'Spese esenti €', 'art. 15 DPR 633/72')}
        {euro('speseImponibili', cod === 810 ? 'Di cui spese imponibili €' : 'Spese imponibili €')}
        <Riga etichetta="Spese generali:" spenta={!s.sgOn}>
          <label className="check"><input type="checkbox" checked={s.sgOn} onChange={(e) => up('sgOn', e.target.checked)} aria-label="Includi spese generali" /></label>
          <Input inputMode="decimal" value={s.sgPct} onChange={(e) => up('sgPct', e.target.value)} disabled={!s.sgOn} style={{ maxWidth: 80 }} aria-label="Percentuale spese generali" /> % <span className="muted small">art. 2 DM 55/2014, di regola 15%</span>
        </Riga>
        <Riga etichetta="Tipo regime:">
          <Select value={s.regime} onChange={(e) => up('regime', e.target.value as ContiStato['regime'])} aria-label="Tipo regime" style={{ maxWidth: 300 }}>
            <option value="ordinario">Regime ordinario</option>
            <option value="forfettario">Regime forfettario (L. 190/2014)</option>
          </Select>
          {forf && <span className="muted small">senza IVA né ritenuta</span>}
        </Riga>
        <Riga etichetta="Cassa Avvocati:" spenta={!s.cpaOn}><label className="check"><input type="checkbox" checked={s.cpaOn} onChange={(e) => up('cpaOn', e.target.checked)} /> contributo integrativo {pc(al.cpa)}%</label></Riga>
        {!forf && <Riga etichetta="IVA:" spenta={!s.ivaOn}><label className="check"><input type="checkbox" checked={s.ivaOn} onChange={(e) => up('ivaOn', e.target.checked)} /> {pc(al.iva)}% sull’imponibile</label></Riga>}
        {!forf && (cod === 820
          ? <Riga etichetta="Ritenuta d’acconto:"><Input inputMode="decimal" value={s.ritPct} onChange={(e) => up('ritPct', e.target.value)} style={{ maxWidth: 80 }} aria-label="Percentuale ritenuta" /> % <label className="check"><input type="checkbox" checked={s.cpaInRitenuta} onChange={(e) => up('cpaInRitenuta', e.target.checked)} /> anche sulla CPA</label></Riga>
          : <Riga etichetta="Ritenuta d’acconto:" spenta={!s.ritOn}><label className="check"><input type="checkbox" checked={s.ritOn} onChange={(e) => up('ritOn', e.target.checked)} /> {pc(al.rit)}% (cliente sostituto d’imposta)</label></Riga>)}
        {(forf || !s.ivaOn) && <Riga etichetta="Addebito bollo:" spenta={!s.bolloOn}><label className="check"><input type="checkbox" checked={s.bolloOn} onChange={(e) => up('bolloOn', e.target.checked)} /> € 2,00 al cliente</label><span className="muted small">sui documenti senza IVA oltre € 77,47</span></Riga>}
        {cod === 810 && Math.abs(r.differenza) >= 0.01 && <p className="muted small">Per gli arrotondamenti delle singole voci il risultato differisce di € {decimal(Math.abs(r.differenza))} dall’importo indicato.</p>}
      </div>
      <aside className="calc-result prospetto">
        <h3>PROSPETTO FINALE</h3>
        <table><tbody>
          {righe.map((x, i) => x.stile === 'sep' ? <tr key={i} className="sep"><td colSpan={2} /></tr> : <tr key={i} className={x.stile}><td>{x.label}</td><td>{x.valore}</td></tr>)}
        </tbody></table>
        <p className="muted small" style={{ marginTop: 10 }}>Calcolo indicativo con le aliquote delle Impostazioni (CPA {pc(al.cpa)}%, IVA {pc(al.iva)}%, ritenuta {pc(al.rit)}%). Verifica sempre con il tuo commercialista.</p>
      </aside>
    </div>
  )
}
