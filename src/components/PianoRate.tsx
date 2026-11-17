import { useMemo, useState } from 'react'
import { CalendarRange, Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import { Btn, Field, FormGrid, Input, Modal, Select, useAction } from './ui'
import { useGestione } from './GestioneAttivita'
import { fmtDate, todayStr } from '../lib/dates'
import { money, parseNumber } from '../lib/format'
import { incassatoNetto, residuo } from '../lib/report'
import { rateAperte } from '../lib/pagamenti'
import type { Parcella } from '../types'

const piuMesi = (s: string, n: number, giornoMese: number) => { const [y, m] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1)), ultimo = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(giornoMese, ultimo)); return t.toISOString().slice(0, 10) }
const testoImporto = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Divide un importo in `n` rate uguali; i centesimi che avanzano vanno sull'ultima. */
export function dividiInRate(totale: number, n: number, dal: string, ogniMesi: number) {
  const c = Math.round(totale * 100), base = Math.floor(c / n), giorno = Number(dal.slice(8, 10))
  return Array.from({ length: n }, (_, i) => ({ data: i ? piuMesi(dal, i * ogniMesi, giorno) : dal, importo: testoImporto((i === n - 1 ? c - base * (n - 1) : base) / 100) }))
}

function PianoModal({ p, rate, onClose }: { p: Parcella; rate: { data: string; importo: number }[]; onClose: () => void }) {
  const run = useAction()
  const [righe, setRighe] = useState(() => rate.map((r) => ({ data: r.data, importo: testoImporto(r.importo) })))
  const [n, setN] = useState(rate.length > 1 ? rate.length : 3)
  const [ogni, setOgni] = useState(1)
  const [dal, setDal] = useState(rate[0]?.data || p.scadenza_pagamento || todayStr())
  const somma = righe.reduce((s, r) => s + (parseNumber(r.importo) || 0), 0)
  const differenza = Math.round((p.netto - somma) * 100) / 100
  const set = (i: number, k: 'data' | 'importo', v: string) => setRighe((x) => x.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const salva = async () => { if (await run(() => api.gestione('rate', { parcella_id: p.id, rate: righe.filter((r) => r.data || r.importo).map((r) => ({ data: r.data, importo: parseNumber(r.importo) })) }), righe.length ? 'Piano di pagamento salvato' : 'Piano di pagamento tolto') !== undefined) onClose() }
  return <Modal title={`Piano di pagamento · ${p.numero}`} subtitle={`Netto ${money(p.netto)}: le rate che il cliente pagherà, con la data attesa. Gli incassi si registrano come sempre e coprono le rate in ordine.`} width={640} onClose={onClose}
    footer={<>{rate.length > 0 && <Btn variant="ghost" onClick={() => setRighe([])}>Togli le rate</Btn>}<Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" disabled={differenza < -0.004 || righe.some((r) => !r.data || !(parseNumber(r.importo) > 0))} onClick={salva}>Salva</Btn></>}>
    <div className="rate-genera">
      <FormGrid cols={4}>
        <Field label="Rate"><Input type="number" min={2} max={60} value={n} onChange={(e) => setN(Math.max(2, Math.min(60, Number(e.target.value) || 2)))} /></Field>
        <Field label="Ogni"><Select value={ogni} onChange={(e) => setOgni(Number(e.target.value))}><option value={1}>mese</option><option value={2}>2 mesi</option><option value={3}>3 mesi</option><option value={6}>6 mesi</option><option value={12}>anno</option></Select></Field>
        <Field label="Prima rata il"><Input type="date" value={dal} onChange={(e) => setDal(e.target.value)} /></Field>
        <Field label=" "><Btn onClick={() => setRighe(dividiInRate(p.netto, n, dal, ogni))}><CalendarRange size={15} /> Dividi il netto</Btn></Field>
      </FormGrid>
    </div>
    {righe.length ? <div className="table-wrap"><table className="table rate-tabella">
      <thead><tr><th>Rata</th><th>Data</th><th className="n">Importo (€)</th><th><span className="sr-only">Azioni</span></th></tr></thead>
      <tbody>{righe.map((r, i) => <tr key={i}>
        <td className="nowrap">{i + 1} di {righe.length}</td>
        <td><Input type="date" aria-label={`Data della rata ${i + 1}`} value={r.data} onChange={(e) => set(i, 'data', e.target.value)} /></td>
        <td className="n"><Input inputMode="decimal" aria-label={`Importo della rata ${i + 1}`} value={r.importo} onChange={(e) => set(i, 'importo', e.target.value)} /></td>
        <td><Btn size="sm" variant="ghost" aria-label={`Togli la rata ${i + 1}`} onClick={() => setRighe((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></Btn></td>
      </tr>)}</tbody>
    </table></div> : <p className="muted">Nessuna rata: il documento si incassa in un’unica soluzione alla scadenza.</p>}
    <div className="row rate-piede">
      <Btn size="sm" variant="ghost" onClick={() => setRighe((x) => [...x, { data: x.length ? piuMesi(x[x.length - 1].data || dal, 1, Number((x[x.length - 1].data || dal).slice(8, 10))) : dal, importo: testoImporto(Math.max(0, differenza)) }])}><Plus size={14} /> Aggiungi una rata</Btn>
      {righe.length > 0 && <span className={`small ${differenza < -0.004 ? 'late-text' : 'muted'}`} role="status">{Math.abs(differenza) < 0.005 ? `Le rate coprono tutto il netto (${money(p.netto)}).` : differenza > 0 ? `Restano ${money(differenza)} fuori dalle rate: si attendono alla scadenza del documento.` : `Le rate superano il netto di ${money(-differenza)}.`}</span>}
    </div>
  </Modal>
}

/** Riga del documento di vendita con il piano di pagamento e il tasto per modificarlo. */
export function PianoRate({ p }: { p: Parcella }) {
  const g = useGestione()
  const [aperto, setAperto] = useState(false)
  const rate = useMemo(() => g.rate.filter((r) => r.parcella_id === p.id), [g.rate, p.id])
  const aperte = useMemo(() => rateAperte(rate, residuo(p), incassatoNetto(p), p.scadenza_pagamento || p.data).filter((x) => x.id), [rate, p])
  return <div className="rate-riepilogo">
    <span className="small">{rate.length ? <>{rate.length} rate{aperte.length ? <>: la prossima di {money(aperte[0].importo)} il {fmtDate(aperte[0].data)}{aperte.length > 1 ? `, poi altre ${aperte.length - 1}` : ''}</> : ', tutte incassate'}</> : 'Pagamento in un’unica soluzione'}</span>
    <Btn size="sm" variant="ghost" onClick={() => setAperto(true)}><CalendarRange size={14} /> {rate.length ? 'Rate…' : 'Dividi in rate…'}</Btn>
    {aperto && <PianoModal p={p} rate={rate} onClose={() => setAperto(false)} />}
  </div>
}
