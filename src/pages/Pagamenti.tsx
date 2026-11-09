import { lazy, Suspense, useMemo, useState } from 'react'
import { CalendarRange, Download } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { Btn, Empty, PageHeader, Segmented, Tabs, useAction } from '../components/ui'
import { useGestione } from '../components/GestioneAttivita'
import { fmtDate, todayStr } from '../lib/dates'
import { money } from '../lib/format'
import { coloriMovimento, movimenti, NOMI_MOVIMENTO, perMese, ripartizione, STATI_MOVIMENTO, type Movimento } from '../lib/pagamenti'
const ParcellePage = lazy(() => import('./Parcelle'))
const DaPagare = lazy(() => import('./DaPagare'))

export type SchedaPagamenti = 'scadenzario' | 'incassi' | 'dapagare'

/**
 * Pagamenti: in un'unica sezione lo scadenzario mese per mese (tutto il denaro in entrata e in uscita), gli incassi dei
 * documenti di vendita e le voci da pagare. Prima della 1.0.2 incassi e «Da pagare» erano due voci separate della barra laterale.
 */
export default function Pagamenti({ scheda: iniziale = 'scadenzario' }: { scheda?: SchedaPagamenti }) {
  const { settings } = useData()
  const [scheda, setScheda] = useState<SchedaPagamenti>(iniziale)
  const nomeIncassi = settings.profilo === 'avvocato' ? settings.etichette.parcelle : 'Incassi'
  return (
    <div className="page pagamenti">
      <PageHeader title="Pagamenti" subtitle={scheda === 'scadenzario' ? 'Il giro del denaro mese per mese: incassi ricevuti e attesi, pagamenti fatti e da fare.' : scheda === 'incassi' ? 'Documenti PDF e XML FatturaPA, preventivi e incassi: l’invio allo SdI resta al tuo canale (Fatture e Corrispettivi, intermediario o commercialista).' : settings.profilo === 'avvocato' ? 'Domiciliatari, consulenti, periti, spese extra e fornitori dello studio: cosa devi pagare e entro quando.' : 'Fornitori, collaboratori, consulenze, spese extra e imposte: cosa devi pagare e entro quando.'} />
      <div className="pagamenti-schede"><Tabs<SchedaPagamenti> value={scheda} onChange={setScheda} tabs={[{ id: 'scadenzario', label: 'Scadenzario' }, { id: 'incassi', label: nomeIncassi }, { id: 'dapagare', label: 'Da pagare' }]} /></div>
      <Suspense fallback={<p role="status">Caricamento…</p>}>
        {scheda === 'scadenzario' && <Scadenzario />}
        {scheda === 'incassi' && <ParcellePage incorporata />}
        {scheda === 'dapagare' && <DaPagare incorporata />}
      </Suspense>
    </div>
  )
}

type Filtro = 'tutti' | 'entrate' | 'uscite' | 'aperti'
const csvCell = (x: unknown) => { let s = String(x ?? '').replace(/[\r\n]/g, ' ').trim(); if (/^[=+@\-\t]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' }
const nomeMese = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

function Scadenzario() {
  const d = useGestione()
  const { parcelle, anagraficaById, praticaById, settings } = useData()
  const { go } = useNav()
  const run = useAction()
  const L = settings.etichette
  const colori = coloriMovimento(settings)
  const oggi = todayStr()
  const tutti = useMemo(() => movimenti(parcelle, d.costi, d.pagamenti, oggi), [parcelle, d.costi, d.pagamenti, oggi])
  const anni = useMemo(() => [...new Set([...tutti.map((m) => Number(m.data.slice(0, 4))), new Date().getFullYear()])].sort((a, b) => b - a), [tutti])
  const [anno, setAnno] = useState(() => new Date().getFullYear())
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const visibili = tutti.filter((m) => m.data.startsWith(String(anno)) && (filtro === 'tutti' || (filtro === 'entrate' ? m.stato === 'incassate' || m.stato === 'da_incassare' : filtro === 'uscite' ? m.stato === 'pagate' || m.stato === 'da_pagare' : m.stato === 'da_incassare' || m.stato === 'da_pagare')))
  const mesi = perMese(visibili)
  const totAnno = ripartizione(visibili)
  // scaduti degli anni precedenti: restano visibili in cima, perché sono ancora da sistemare
  const arretrati = tutti.filter((m) => m.scaduto && m.data < `${anno}-01-01` && anno === new Date().getFullYear())
  const entrata = (m: Movimento) => m.stato === 'incassate' || m.stato === 'da_incassare'
  const chi = (m: Movimento) => m.parcella ? anagraficaById.get(m.parcella.cliente_id || 0)?.denominazione : anagraficaById.get(m.costo?.fornitore_id || 0)?.denominazione
  const esporta = () => {
    const righe = visibili.map((m) => [fmtDate(m.data), NOMI_MOVIMENTO[m.stato], m.descrizione, m.dettaglio, chi(m), praticaById.get(m.pratica_id || 0)?.titolo, (entrata(m) ? m.importo : -m.importo).toFixed(2).replace('.', ','), m.scaduto ? 'Scaduto' : ''])
    run(() => api.salvaTesto(`Scadenzario-${anno}.csv`, '﻿' + [['Data', 'Stato', 'Voce', 'Dettaglio', 'Cliente / fornitore', L.pratica, 'Importo (€)', 'Note'], ...righe].map((r) => r.map(csvCell).join(';')).join('\r\n')), 'CSV salvato')
  }
  const apri = (m: Movimento) => { if (m.pratica_id) go({ page: 'pratica', id: m.pratica_id, tab: 'parcelle' }) }
  const riga = (m: Movimento) => <tr key={m.chiave} className={m.scaduto ? 'scaduta' : undefined}>
    <td className="nowrap">{fmtDate(m.data)}</td>
    <td><span className="movimento-tipo"><i style={{ background: colori[m.stato] }} aria-hidden />{NOMI_MOVIMENTO[m.stato]}{m.scaduto && <strong className="late-text small"> · scaduto</strong>}</span></td>
    <td>{m.descrizione}{m.dettaglio && <><br /><small className="muted">{m.dettaglio}</small></>}</td>
    <td>{chi(m) || '—'}</td>
    <td>{m.pratica_id ? <button type="button" className="link-btn" onClick={() => apri(m)}>{praticaById.get(m.pratica_id)?.titolo}</button> : <span className="muted">Generale</span>}</td>
    <td className={`n nowrap ${entrata(m) ? 'entrata' : 'uscita'}`}>{entrata(m) ? '+' : '−'} {money(m.importo)}</td>
  </tr>
  const tabella = (righe: Movimento[]) => <div className="table-wrap"><table className="table">
    <thead><tr><th>Data</th><th>Stato</th><th>Voce</th><th>Cliente / fornitore</th><th>{L.pratica}</th><th className="n">Importo</th></tr></thead>
    <tbody>{righe.map(riga)}</tbody></table></div>
  return <>
    {d.errore && <p role="alert" className="stato-err">{d.errore}</p>}
    <div className="kpis fascia-numeri">
      {STATI_MOVIMENTO.map((k) => <div key={k} className="kpi static"><span><span className="movimento-tipo"><i style={{ background: colori[k] }} aria-hidden />{NOMI_MOVIMENTO[k]} {anno}</span></span><b>{money(totAnno[k])}</b></div>)}
    </div>
    <div className="toolbar scadenzario-filtri">
      <select value={anno} onChange={(e) => setAnno(Number(e.target.value))} aria-label="Anno">{anni.map((a) => <option key={a}>{a}</option>)}</select>
      <Segmented<Filtro> value={filtro} onChange={setFiltro} options={[{ id: 'tutti', label: 'Tutto' }, { id: 'entrate', label: 'Entrate' }, { id: 'uscite', label: 'Uscite' }, { id: 'aperti', label: 'Ancora aperti' }]} />
      <span className="grow" />
      <Btn variant="ghost" onClick={esporta} disabled={!visibili.length}><Download size={16} /> Esporta CSV</Btn>
    </div>
    {arretrati.length > 0 && filtro !== 'entrate' && filtro !== 'uscite' && <section className="card pad scadenzario-mese">
      <header><h2 className="late-text">Scaduti degli anni precedenti</h2><span className="scadenzario-totali"><span>Da incassare <b>{money(ripartizione(arretrati).da_incassare)}</b></span><span>Da pagare <b>{money(ripartizione(arretrati).da_pagare)}</b></span></span></header>
      {tabella(arretrati)}
    </section>}
    {mesi.map((m) => <section key={m.mese} className="card pad scadenzario-mese" aria-label={nomeMese(m.mese)}>
      <header>
        <h2>{nomeMese(m.mese)}</h2>
        <span className="scadenzario-totali">
          {STATI_MOVIMENTO.filter((k) => m.totali[k]).map((k) => <span key={k}>{NOMI_MOVIMENTO[k]} <b>{money(m.totali[k])}</b></span>)}
          <span className={`scadenzario-saldo ${m.previsto >= 0 ? 'pos' : 'neg'}`} title="Incassato e da incassare, meno pagato e da pagare">Saldo previsto <b>{m.previsto >= 0 ? '+' : '−'} {money(Math.abs(m.previsto))}</b></span>
        </span>
      </header>
      {tabella(m.movimenti)}
    </section>)}
    {!mesi.length && <Empty icon={<CalendarRange size={32} />} title={`Nessun movimento nel ${anno}`} text="Qui compaiono, mese per mese, gli incassi dei documenti emessi (ricevuti e da ricevere) e le voci da pagare con la loro scadenza." />}
    <p className="muted small">Gli incassi attesi cadono alla scadenza di pagamento del documento (o 30 giorni dopo l’emissione); le voci da pagare alla data «da pagare entro». Bozze, preventivi e note pro forma non sono movimenti. Colori: Impostazioni › Aspetto.</p>
  </>
}
