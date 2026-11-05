import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react'
import { api } from '../api'
import { Btn, Input, Modal, Select, useAction } from './ui'

type Tipo = 'anagrafica' | 'pratiche' | 'scadenze' | 'parcelle'
const NOMI: Record<Tipo, string> = { anagrafica: 'clienti e controparti', pratiche: 'pratiche', scadenze: 'udienze e scadenze', parcelle: 'parcelle e fatture' }
interface Proposta { intestazioni: string[]; righe: number; esempio: string[][]; mappatura: Record<string, number>; campi: { k: string; et: string; obbl: boolean }[]; foglio?: string; delimitatore?: string }
interface Parti { riga: number; titolo: string; prima: string; seconda: string; invertita: boolean }
interface Esito { parti?: Parti[]; totale: number; creati: number; aggiornati: number; esistenti: number; errori: { riga: number; motivo: string }[]; avvisi: { riga: number; motivo: string }[]; campione: { riga: number; stato: string; dati: Record<string, any>; messaggio: string }[]; creatiClienti: number }

const breve = (d: Record<string, any>) => Object.values(d).filter((v) => v !== null && v !== '' && v !== undefined).slice(0, 3).map(String).join(' · ')

/** Procedura guidata: scelta del file → controllo delle colonne → anteprima con doppioni ed errori → importazione. */
export function ImportWizard({ tipo, onClose }: { tipo: Tipo; onClose: () => void }) {
  const run = useAction()
  const [file, setFile] = useState<{ percorso: string; nome: string } | null>(null)
  const [prop, setProp] = useState<Proposta | null>(null)
  const [map, setMap] = useState<Record<string, number>>({})
  const [opz, setOpz] = useState<{ aggiorna: boolean; creaClienti: boolean; ruoloPredefinito: string; cliente: 'prima' | 'seconda'; invertite: number[] }>({ aggiorna: false, creaClienti: true, ruoloPredefinito: 'cliente', cliente: 'prima', invertite: [] })
  const [rigaPerRiga, setRigaPerRiga] = useState(false)
  const [ant, setAnt] = useState<Esito | null>(null)
  const [erroreAnt, setErroreAnt] = useState<string | null>(null)
  const [fatto, setFatto] = useState<Esito | null>(null)
  const [lavoro, setLavoro] = useState(false)

  const scegli = async () => {
    const f = await run(() => api.scegliFileImport()); if (!f) return
    const p = await run(() => api.proponiImport(tipo, f.percorso)); if (!p) return
    setFile(f); setProp(p); setMap(p.mappatura); setAnt(null); setErroreAnt(null); setFatto(null)
  }
  // anteprima ricalcolata quando cambiano colonne o opzioni
  useEffect(() => {
    if (!file || !prop) return
    let off = false
    const t = setTimeout(async () => {
      try { const r = await api.anteprimaImport(tipo, file.percorso, map, opz); if (!off) { setAnt(r); setErroreAnt(null) } }
      catch (e: any) { if (!off) { setAnt(null); setErroreAnt(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) } }
    }, 250)
    return () => { off = true; clearTimeout(t) }
  }, [file, prop, map, opz, tipo])

  const importa = async () => {
    if (!file) return
    setLavoro(true)
    const r = await run(() => api.eseguiImport(tipo, file.percorso, map, opz))
    setLavoro(false)
    if (r) setFatto(r)
  }
  const daImportare = (ant?.creati ?? 0) + (ant?.aggiornati ?? 0)
  const attesa = useMemo(() => (prop ? prop.intestazioni.length : 0), [prop])

  return (
    <Modal title={`Importa ${NOMI[tipo]}`} subtitle="Il file viene solo letto: l'originale non viene modificato" width={880} onClose={onClose}
      footer={fatto ? <Btn variant="primary" onClick={onClose}>Chiudi</Btn> : <>
        <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
        <Btn variant="primary" onClick={importa} disabled={!file || !ant || daImportare === 0 || lavoro}>{lavoro ? 'Importo…' : daImportare ? `Importa ${daImportare} element${daImportare === 1 ? 'o' : 'i'}` : 'Nulla da importare'}</Btn></>}>
      {fatto ? (
        <div className="import-esito" role="status">
          <CheckCircle2 size={28} className="ok" />
          <h3>Importazione completata</h3>
          <ul>
            <li><b>{fatto.creati}</b> nuovi element{fatto.creati === 1 ? 'o' : 'i'} importat{fatto.creati === 1 ? 'o' : 'i'}</li>
            {fatto.aggiornati > 0 && <li><b>{fatto.aggiornati}</b> aggiornati</li>}
            {fatto.esistenti > 0 && <li><b>{fatto.esistenti}</b> già presenti (non duplicati)</li>}
            {fatto.creatiClienti > 0 && tipo !== 'anagrafica' && <li><b>{fatto.creatiClienti}</b> clienti/controparti aggiunti alla rubrica</li>}
            {fatto.errori.length > 0 && <li className="danger"><b>{fatto.errori.length}</b> righe non importate (correggile nel file e ripeti: le altre non verranno duplicate)</li>}
          </ul>
          {fatto.errori.slice(0, 8).map((e, i) => <p key={i} className="small danger">Riga {e.riga}: {e.motivo}</p>)}
        </div>
      ) : !file || !prop ? (
        <div className="import-scelta">
          <FileSpreadsheet size={34} />
          <p>Scegli un file <b>CSV</b> o <b>Excel (.xlsx)</b> con l'elenco da importare.</p>
          <p className="muted small">In Cliens Più: apri l'elenco e usa <i>Esporta lista</i> (XLS o CSV). Se il file è .xls, aprilo in Excel e salvalo come .xlsx o CSV. In Cliens Cube l'esportazione dei fascicoli (<i>EXPORT_FASCICOLI.csv</i>) si importa così com'è: le parti dell'intestazione diventano cliente e controparte, il ruolo diventa il numero di RG.</p>
          <Btn variant="primary" onClick={scegli}>Scegli il file…</Btn>
        </div>
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: 8 }}>
            <b>{file.nome}</b><span className="muted small">{prop.righe} righe{prop.foglio ? ` · foglio “${prop.foglio}”` : ''}</span><div className="spacer" /><Btn size="sm" variant="ghost" onClick={scegli}>Cambia file…</Btn>
          </div>
          <h3 className="sub-title">1. Controlla le colonne</h3>
          <p className="muted small">Le colonne sono state riconosciute dal loro nome: correggile se serve. I campi con * sono obbligatori.</p>
          <table className="table compact mappa"><thead><tr><th>Dato in TIO</th><th>Colonna del file</th><th>Esempio</th></tr></thead><tbody>
            {prop.campi.map((c) => (
              <tr key={c.k}>
                <td>{c.et}{c.obbl && ' *'}</td>
                <td><Select aria-label={`Colonna per ${c.et}`} value={map[c.k] ?? -1} onChange={(e) => { const v = Number(e.target.value); setMap((m) => { const n = { ...m }; if (v < 0) delete n[c.k]; else n[c.k] = v; return n }) }}>
                  <option value={-1}>— non importare —</option>{prop.intestazioni.map((h, i) => <option key={i} value={i}>{h}</option>)}</Select></td>
                <td className="muted small">{map[c.k] !== undefined ? prop.esempio.map((r) => r[map[c.k]]).filter(Boolean).slice(0, 2).join(' · ') : ''}</td>
              </tr>))}
          </tbody></table>
          {(tipo === 'pratiche' || tipo === 'parcelle') && <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={opz.creaClienti} onChange={(e) => setOpz({ ...opz, creaClienti: e.target.checked })} /> Aggiungi alla rubrica i clienti che non ci sono ancora</label>}
          {tipo === 'anagrafica' && map.ruolo === undefined && <label className="check" style={{ marginTop: 8 }}>Ruolo dei contatti importati: <select value={opz.ruoloPredefinito} onChange={(e) => setOpz({ ...opz, ruoloPredefinito: e.target.value })} style={{ width: 'auto' }} aria-label="Ruolo predefinito"><option value="cliente">Cliente</option><option value="controparte">Controparte</option><option value="altro">Altro</option></select></label>}
          <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={opz.aggiorna} onChange={(e) => setOpz({ ...opz, aggiorna: e.target.checked })} /> Aggiorna anche i dati già presenti (solo i campi compilati nel file; non cancella nulla)</label>

          {tipo === 'pratiche' && !!ant?.parti?.length && <ScegliCliente parti={ant.parti} cliente={opz.cliente} rigaPerRiga={rigaPerRiga} invertite={opz.invertite}
            onCliente={(c) => setOpz({ ...opz, cliente: c, invertite: [] })} onRigaPerRiga={setRigaPerRiga} onInverti={(riga, si) => setOpz({ ...opz, invertite: si ? [...opz.invertite, riga] : opz.invertite.filter((x) => x !== riga) })} />}

          <h3 className="sub-title">2. Anteprima</h3>
          {erroreAnt && <div className="prova err"><AlertTriangle size={15} /><div><b>{erroreAnt}</b></div></div>}
          {ant && (
            <>
              <div className="row wrap chips-esito">
                <span className="pill ok"><b>{ant.creati}</b> nuovi</span>
                {ant.aggiornati > 0 && <span className="pill"><b>{ant.aggiornati}</b> da aggiornare</span>}
                <span className="pill"><b>{ant.esistenti}</b> già presenti</span>
                {ant.errori.length > 0 && <span className="pill err"><b>{ant.errori.length}</b> da correggere</span>}
                <span className="muted small">su {ant.totale} righe</span>
              </div>
              <table className="table compact"><tbody>{ant.campione.map((r, i) => (
                <tr key={i}><td className="nowrap muted small">riga {r.riga}</td><td><span className={`pill st-${r.stato}`}>{r.stato}</span></td><td>{r.stato === 'errore' ? <span className="danger small">{r.messaggio}</span> : breve(r.dati)}</td></tr>))}
              </tbody></table>
              {ant.errori.length > 5 && <p className="muted small">…e altri {ant.errori.length - 5} errori.</p>}
              {ant.avvisi.slice(0, 4).map((a, i) => <p key={i} className="small warn-text"><AlertTriangle size={12} /> Riga {a.riga}: {a.motivo}</p>)}
              {ant.avvisi.length > 4 && <p className="muted small">…e altri {ant.avvisi.length - 4} avvisi.</p>}
            </>
          )}
          {attesa === 0 && null}
        </>
      )}
    </Modal>
  )
}

/** Cliente e controparte ricavati dall'intestazione («ROSSI MARIO c/ BIANCHI SRL»): di regola il cliente è la prima parte,
 *  ma nelle pratiche in cui lo studio assiste il convenuto è la seconda. Si sceglie per tutte o riga per riga. */
function ScegliCliente({ parti, cliente, rigaPerRiga, invertite, onCliente, onRigaPerRiga, onInverti }: {
  parti: Parti[]; cliente: 'prima' | 'seconda'; rigaPerRiga: boolean; invertite: number[]
  onCliente: (c: 'prima' | 'seconda') => void; onRigaPerRiga: (v: boolean) => void; onInverti: (riga: number, si: boolean) => void
}) {
  const [filtro, setFiltro] = useState('')
  const visibili = useMemo(() => { const f = filtro.trim().toLowerCase(); return (f ? parti.filter((p) => p.titolo.toLowerCase().includes(f)) : parti).slice(0, 300) }, [parti, filtro])
  return (
    <div className="import-parti">
      <h3 className="sub-title">Chi è il cliente?</h3>
      <p className="muted small">In {parti.length} pratiche cliente e controparte vengono dall'intestazione (per esempio «{parti[0].prima} c/ {parti[0].seconda}»).</p>
      <Select aria-label="Chi è il cliente" value={rigaPerRiga ? 'riga' : cliente} onChange={(e) => { const v = e.target.value; if (v === 'riga') onRigaPerRiga(true); else { onRigaPerRiga(false); onCliente(v as 'prima' | 'seconda') } }} style={{ maxWidth: 420 }}>
        <option value="prima">Il cliente è la prima parte (prima di «c/»)</option>
        <option value="seconda">Il cliente è la seconda parte (dopo «c/»)</option>
        <option value="riga">Decido riga per riga</option>
      </Select>
      {rigaPerRiga && <>
        <Input style={{ marginTop: 8, maxWidth: 420 }} placeholder="Cerca nell'intestazione…" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Cerca fra le pratiche da controllare" />
        <div className="import-parti-elenco">
          <table className="table compact"><thead><tr><th>Riga</th><th>Cliente</th><th>Controparte</th><th>Inverti</th></tr></thead><tbody>
            {visibili.map((p) => { const inv = p.invertita; return (
              <tr key={p.riga}><td className="muted small nowrap">{p.riga}</td><td><b>{inv ? p.seconda : p.prima}</b></td><td>{inv ? p.prima : p.seconda}</td>
                <td><label className="check"><input type="checkbox" checked={invertite.includes(p.riga)} onChange={(e) => onInverti(p.riga, e.target.checked)} aria-label={`Inverti cliente e controparte alla riga ${p.riga}`} /></label></td></tr>) })}
          </tbody></table>
          {visibili.length === 300 && <p className="muted small">Sono mostrate le prime 300: usa la ricerca per trovare le altre.</p>}
        </div>
      </>}
    </div>
  )
}
