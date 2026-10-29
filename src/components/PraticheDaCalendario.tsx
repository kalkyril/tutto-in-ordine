import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmtDateTime } from '../lib/dates'
import { Btn, Modal, useAction, useFeedback } from './ui'

interface Voce {
  chiave: string; intestazione: string; rg: string; autorita: string; giudice: string; numero: string; eventi: number
  prossimo: { titolo: string; inizio: string } | null; stato: 'nuova' | 'esistente' | 'scartata'; pratica: { id: number; titolo: string; numero?: string } | null
}
interface Anteprima { calendario: { id: number; nome: string; crea_pratiche: boolean }; primaVolta: boolean; pratiche: Voce[]; nonRiconosciuti: number; esempiNonRiconosciuti: string[] }

/**
 * Pratiche riconosciute negli eventi di un calendario collegato (udienze e scadenze di Cliens Cube, ad esempio):
 * prima un'anteprima, poi si importano quelle scelte. Con «in automatico» le nuove arrivano a ogni aggiornamento del calendario.
 */
export function PraticheDaCalendarioModal({ calendarioId, onClose }: { calendarioId: number; onClose: () => void }) {
  const run = useAction()
  const { toast } = useFeedback()
  const [dati, setDati] = useState<Anteprima | null>(null)
  const [scelte, setScelte] = useState<Record<string, boolean>>({})
  const [automatico, setAutomatico] = useState(true)
  const [inCorso, setInCorso] = useState(false)
  useEffect(() => {
    run(() => api.anteprimaPraticheCalendario(calendarioId)).then((r: Anteprima | undefined) => {
      if (!r) return onClose()
      setDati(r)
      setScelte(Object.fromEntries(r.pratiche.map((p) => [p.chiave, p.stato !== 'scartata'])))
      setAutomatico(r.calendario.crea_pratiche || r.primaVolta) // la prima volta proposto acceso, poi resta la scelta fatta
    })
  }, [calendarioId])

  const scelteN = dati ? dati.pratiche.filter((p) => scelte[p.chiave]).length : 0
  const nuove = dati ? dati.pratiche.filter((p) => scelte[p.chiave] && !p.pratica).length : 0
  const importa = async () => {
    setInCorso(true)
    const r = await run(() => api.importaPraticheCalendario(calendarioId, scelte, automatico))
    setInCorso(false)
    if (!r) return
    const parti = [r.create.length && `${r.create.length} ${r.create.length === 1 ? 'pratica creata' : 'pratiche create'}`, r.collegate.length && `${r.collegate.length} già in TIO collegate`, r.eventi && `${r.eventi} eventi collegati`].filter(Boolean)
    toast(parti.length ? parti.join(', ') : 'Nessuna modifica: le pratiche erano già importate')
    onClose()
  }

  return (
    <Modal title={dati ? `Pratiche dal calendario «${dati.calendario.nome}»` : 'Pratiche dal calendario'} subtitle="TIO riconosce le pratiche dalle udienze e dalle scadenze: scegli quali importare" width={960} onClose={onClose} protectChanges={false}
      footer={<>
        <label className="check pratiche-auto"><input type="checkbox" checked={automatico} onChange={(e) => setAutomatico(e.target.checked)} /> Crea in automatico le nuove pratiche a ogni aggiornamento del calendario</label>
        <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
        <Btn variant="primary" onClick={importa} disabled={!dati || inCorso}>{inCorso ? 'Importazione…' : scelteN ? `Importa ${scelteN} ${scelteN === 1 ? 'pratica' : 'pratiche'}` : 'Salva le scelte'}</Btn>
      </>}>
      {!dati ? <p className="muted">Lettura degli eventi…</p> : !dati.pratiche.length ? (
        <div className="pratiche-vuoto">
          <p><b>Nessuna pratica riconosciuta negli eventi di questo calendario.</b></p>
          <p className="muted small">TIO cerca l'intestazione delle parti («Rossi c/ Bianchi»), il numero di ruolo (R.G.) e l'ufficio giudiziario nel titolo, nella descrizione e nel luogo degli eventi. Se le pratiche ci sono ma non vengono riconosciute, scrivilo con <i>Aiuto › Segnala un problema</i> indicando come appaiono gli eventi.</p>
          {dati.esempiNonRiconosciuti.length > 0 && <ul className="muted small">{dati.esempiNonRiconosciuti.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </div>
      ) : <>
        <p className="small pratiche-sintesi">
          Trovate <b>{dati.pratiche.length}</b> pratiche: <b>{dati.pratiche.filter((p) => p.stato === 'nuova').length}</b> nuove, <b>{dati.pratiche.filter((p) => p.stato === 'esistente').length}</b> già in TIO
          {dati.pratiche.some((p) => p.stato === 'scartata') && <>, {dati.pratiche.filter((p) => p.stato === 'scartata').length} escluse in passato</>}.
          {dati.nonRiconosciuti > 0 && <> {dati.nonRiconosciuti} eventi senza una pratica riconoscibile restano solo in agenda.</>}
          {nuove > 0 && <> Le nuove ricevono il prossimo numero di TIO; delle esistenti si completano solo i campi vuoti.</>}
        </p>
        <div className="table-wrap pratiche-elenco"><table className="table compact">
          <thead><tr>
            <th><input type="checkbox" aria-label="Seleziona tutte" checked={scelteN === dati.pratiche.length} onChange={(e) => setScelte(Object.fromEntries(dati.pratiche.map((p) => [p.chiave, e.target.checked])))} /></th>
            <th>Pratica</th><th>N. R.G.</th><th>Ufficio</th><th className="num">Eventi</th><th>Prossimo</th><th>In TIO</th>
          </tr></thead>
          <tbody>{dati.pratiche.map((p) => (
            <tr key={p.chiave} className={scelte[p.chiave] ? '' : 'spenta'}>
              <td><input type="checkbox" aria-label={`Importa ${p.intestazione}`} checked={!!scelte[p.chiave]} onChange={(e) => setScelte((s) => ({ ...s, [p.chiave]: e.target.checked }))} /></td>
              <td><b>{p.intestazione}</b>{p.giudice && <div className="muted small">{p.giudice}</div>}</td>
              <td className="mono-s">{p.rg || '—'}</td>
              <td>{p.autorita || '—'}</td>
              <td className="num">{p.eventi}</td>
              <td className="small">{p.prossimo ? <>{fmtDateTime(p.prossimo.inizio)}<div className="muted">{p.prossimo.titolo}</div></> : <span className="muted">—</span>}</td>
              <td>{p.pratica ? <span className="pill ok" title={p.pratica.titolo}>Collega a {p.pratica.numero || p.pratica.titolo}</span> : p.stato === 'scartata' ? <span className="pill">Esclusa</span> : <span className="pill st-aggiornato">Nuova</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="muted small">Le pratiche che togli dall'elenco non verranno riproposte, nemmeno in automatico. Gli eventi già collegati a mano a un'altra pratica restano dove sono.</p>
      </>}
    </Modal>
  )
}
