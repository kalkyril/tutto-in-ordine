import { useMemo, useState } from 'react'
import { CheckCircle2, Download, HandCoins, Plus, RotateCcw } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { Btn, Empty, PageHeader, Segmented, useAction, useFeedback } from '../components/ui'
import { GestioneForm, useGestione, type Costo } from '../components/GestioneAttivita'
import { usePagination } from '../components/Pagination'
import { fmtDate, todayStr } from '../lib/dates'
import { money } from '../lib/format'

type Filtro = 'da_pagare' | 'pagate' | 'tutte'
const csvCell = (x: unknown) => { let s = String(x ?? '').replace(/[\r\n]/g, ' ').trim(); if (/^[=+@\-\t]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' }
const traGiorni = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/**
 * Da pagare: prestazioni, consulenze, spese extra e fatture dei fornitori che lo studio o l'attività deve pagare.
 * Usa gli stessi costi di Parcelle › Costi e fornitori (tabella `costi`), con scadenza e stato del pagamento.
 */
export default function DaPagare() {
  const d = useGestione()
  const { anagraficaById, praticaById, settings } = useData()
  const { go } = useNav()
  const run = useAction()
  const { confirm, toast } = useFeedback()
  const L = settings.etichette
  const [filtro, setFiltro] = useState<Filtro>('da_pagare')
  const [form, setForm] = useState<Partial<Costo> | null>(null)
  const oggi = todayStr(), entro30 = traGiorni(30), anno = oggi.slice(0, 4)

  const aperte = d.costi.filter((x) => !x.pagata)
  const scadute = aperte.filter((x) => x.scadenza && x.scadenza < oggi)
  const prossime = aperte.filter((x) => x.scadenza && x.scadenza >= oggi && x.scadenza <= entro30)
  const pagateAnno = d.costi.filter((x) => x.pagata && x.data.startsWith(anno))
  const somma = (r: Costo[]) => r.reduce((s, x) => s + x.importo, 0)
  // prima le scadute, poi per scadenza; senza scadenza in fondo. Le pagate dalla più recente.
  const righe = useMemo(() => {
    const r = d.costi.filter((x) => filtro === 'tutte' || (filtro === 'pagate' ? !!x.pagata : !x.pagata))
    return [...r].sort((a, b) => a.pagata - b.pagata || (a.pagata ? b.data.localeCompare(a.data) : (a.scadenza || '9999').localeCompare(b.scadenza || '9999')) || b.id - a.id)
  }, [d.costi, filtro])
  const { visible, controls } = usePagination(righe, filtro)

  const segna = (x: Costo, pagata: boolean) => run(async () => { await api.gestione('costo', { ...x, pagata: pagata ? 1 : 0 }); toast(pagata ? `«${x.descrizione}» segnata come pagata` : `«${x.descrizione}» di nuovo da pagare`) })
  const elimina = async (x: Costo) => { if (await confirm({ title: 'Eliminare la voce?', text: `«${x.descrizione}» (${money(x.importo)}) verrà eliminata.`, ok: 'Elimina', danger: true })) await run(() => api.gestione('eliminaCosto', { id: x.id })) }
  const esporta = () => {
    const rows = righe.map((x) => [x.descrizione, x.categoria, anagraficaById.get(x.fornitore_id || 0)?.denominazione, x.importo.toFixed(2).replace('.', ','), x.scadenza, x.pagata ? 'Pagata' : 'Da pagare', fmtDate(x.data), praticaById.get(x.pratica_id || 0)?.titolo, x.recuperabile ? 'Sì' : ''])
    const header = ['Descrizione', 'Categoria', 'A chi', 'Importo', 'Da pagare entro', 'Stato', 'Data', L.pratica, 'Da riaddebitare']
    run(() => api.salvaTesto('Da-pagare.csv', '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')), 'CSV salvato')
  }
  const stato = (x: Costo) => x.pagata ? <span className="muted">Pagata</span>
    : x.scadenza && x.scadenza < oggi ? <strong className="late-text">Scaduta</strong>
    : x.scadenza && x.scadenza <= entro30 ? <span>In scadenza</span> : <span>Da pagare</span>

  return (
    <div className="page da-pagare">
      <PageHeader title="Da pagare"
        subtitle={settings.profilo === 'avvocato' ? 'Domiciliatari, consulenti, periti, spese extra e fornitori dello studio: cosa devi pagare e entro quando.' : 'Fornitori, collaboratori, consulenze, spese extra e imposte: cosa devi pagare e entro quando.'}
        actions={<>
          <Btn variant="ghost" onClick={esporta} disabled={!righe.length}><Download size={16} /> Esporta CSV</Btn>
          <Btn variant="primary" onClick={() => setForm({ categoria: 'Prestazioni e consulenze' })}><Plus size={16} /> Nuova voce da pagare</Btn>
        </>} />
      {d.errore && <p role="alert" className="stato-err">{d.errore}</p>}
      <div className="kpis fascia-numeri">
        <div className="kpi static"><span>Da pagare</span><b>{money(somma(aperte))}</b></div>
        <div className="kpi static"><span>Scadute</span><b className={scadute.length ? 'late-text' : undefined}>{money(somma(scadute))}</b></div>
        <div className="kpi static"><span>Entro 30 giorni</span><b>{money(somma(prossime))}</b></div>
        <div className="kpi static"><span>Pagate nel {anno}</span><b>{money(somma(pagateAnno))}</b></div>
      </div>
      <section className="card pad">
        <header className="card-head">
          <Segmented<Filtro> value={filtro} onChange={setFiltro} options={[{ id: 'da_pagare', label: `Da pagare${aperte.length ? ` (${aperte.length})` : ''}` }, { id: 'pagate', label: 'Pagate' }, { id: 'tutte', label: 'Tutte' }]} />
        </header>
        {righe.length > 0 && <div className="table-wrap"><table className="table">
          <thead><tr><th>Voce</th><th className="nowrap">A chi</th><th>{L.pratica}</th><th className="n">Importo</th><th>Entro</th><th>Stato</th><th>Azioni</th></tr></thead>
          <tbody>{visible.map((x) => <tr key={x.id} className={x.pagata ? 'pagata' : undefined}>
            <td>{x.descrizione}<br /><small className="muted">{x.categoria}{x.recuperabile ? ' · da riaddebitare al cliente' : ''}</small></td>
            <td>{anagraficaById.get(x.fornitore_id || 0)?.denominazione || '—'}</td>
            <td>{x.pratica_id ? <button type="button" className="link-btn" onClick={() => go({ page: 'pratica', id: x.pratica_id! })}>{praticaById.get(x.pratica_id)?.titolo}</button> : 'Generale'}</td>
            <td className="n nowrap">{money(x.importo)}</td>
            <td className="nowrap">{x.scadenza ? fmtDate(x.scadenza) : '—'}</td>
            <td>{stato(x)}</td>
            <td><div className="row wrap">
              {x.pagata
                ? <Btn size="sm" variant="ghost" onClick={() => segna(x, false)} title="Rimetti tra le voci da pagare"><RotateCcw size={14} /> Riapri</Btn>
                : <Btn size="sm" onClick={() => segna(x, true)}><CheckCircle2 size={14} /> Pagata</Btn>}
              <Btn size="sm" variant="ghost" onClick={() => setForm(x)}>Modifica</Btn>
              <Btn size="sm" variant="ghost" onClick={() => elimina(x)}>Elimina</Btn>
            </div></td>
          </tr>)}</tbody>
        </table></div>}
        {!righe.length && <Empty icon={<HandCoins size={32} />} title={filtro === 'pagate' ? 'Nessuna voce pagata' : 'Niente da pagare'}
          text={filtro === 'pagate' ? 'Le voci segnate come pagate compaiono qui.' : 'Annota prestazioni, consulenze, spese extra e fatture dei fornitori con l’importo e la data entro cui pagarle.'}
          action={filtro !== 'pagate' ? <Btn variant="primary" onClick={() => setForm({ categoria: 'Prestazioni e consulenze' })}><Plus size={15} /> Nuova voce da pagare</Btn> : undefined} />}
        {controls}
        <p className="muted small">{settings.profilo === 'avvocato' ? 'Le stesse voci servono per la redditività delle pratiche.' : `Le stesse voci compaiono in ${L.parcelle} › Costi e fornitori e nella redditività dei lavori.`} «Da riaddebitare» ricorda un rimborso da chiedere al cliente: aggiungilo come spesa extra nel documento.</p>
      </section>
      {form && <GestioneForm tipo="costi" titolo={form.id ? 'Voce da pagare' : 'Nuova voce da pagare'} iniziale={form} onClose={() => setForm(null)} />}
    </div>
  )
}
