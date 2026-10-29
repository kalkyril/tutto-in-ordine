import { useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Download, FileSpreadsheet, FolderInput, Lock, Pencil, Plus, RefreshCw, Trash2, Users2, Wallet, FolderKanban, FileUp } from 'lucide-react'
import { api } from '../api'
import { PraticheDaCalendarioModal } from './PraticheDaCalendario'
import { useData } from '../store'
import { Btn, ColorPicker, Field, FormGrid, Input, Modal, Select, useAction, useFeedback } from './ui'
import { PromemoriaElenco } from './forms'
import { ImportWizard } from './ImportWizard'
import { ImportCartella } from './ImportCartella'
import { fmtDateTime } from '../lib/dates'
import type { Calendario } from '../types'

/** Mostra solo l'inizio e la fine dell'indirizzo: il link di un calendario funziona come una password. */
const maschera = (url: string) => { if (/^file:/i.test(url)) return `File: ${decodeURIComponent(url.split('/').pop() || '')}`; try { const u = new URL(url.replace(/^webcal/i, 'https')); const t = u.pathname + u.search; return `${u.host}/…${t.slice(-6)}` } catch { return '…' } }
const quando = (ts?: string | null) => (ts ? fmtDateTime(ts.replace(' ', 'T').slice(0, 16)) : 'mai')
const INTERVALLI = [[15, 'ogni 15 minuti'], [30, 'ogni 30 minuti'], [60, 'ogni ora'], [180, 'ogni 3 ore'], [720, 'due volte al giorno'], [1440, 'una volta al giorno']] as const

export function SolaLetturaNota() {
  return (
    <div className="nota-lettura"><Lock size={16} />
      <p><b>Collegamenti di sola lettura.</b> TIO scarica soltanto i dati che indichi (una richiesta di lettura al link del calendario, oppure i file che scegli tu): non scrive, non modifica e non cancella mai nulla in Cliens Più, Google Calendar o altri servizi, e non chiede mai le tue password.</p>
    </div>
  )
}

/* ------------------------------ calendari collegati ------------------------------ */
export function CalendariPanel() {
  const { calendari, eventi } = useData()
  const run = useAction()
  const { confirm } = useFeedback()
  const [edit, setEdit] = useState<Partial<Calendario> | null>(null)
  const [pratiche, setPratiche] = useState<number | null>(null) // calendario di cui riconoscere le pratiche
  const [aggiorna, setAggiorna] = useState<number | 'tutti' | null>(null)
  const sync = async (id?: number) => {
    setAggiorna(id ?? 'tutti')
    const r = await run(() => api.sincronizzaCalendario(id ?? null))
    setAggiorna(null)
    if (r && id) { /* aggiornato */ }
  }
  return (
    <section className="card pad-lg" id="calendari-collegati">
      <div className="card-head">
        <h2><CalendarDays size={16} /> Calendari collegati</h2>
        <div className="row wrap cal-toolbar">
          {calendari.length > 0 && <Btn size="sm" onClick={() => sync()} disabled={aggiorna !== null}><RefreshCw size={14} className={aggiorna !== null ? 'gira' : ''} /> Aggiorna tutti</Btn>}
          <Btn size="sm" variant="primary" className="cal-add" aria-label="Collega un calendario" title="Collega un calendario" onClick={() => setEdit({ colore: '#0ea5e9', intervallo_min: 30, promemoria: '[60]', attivo: 1 })}><Plus size={16} aria-hidden="true" /></Btn>
        </div>
      </div>
      <p className="muted small">Udienze e impegni di Cliens Più, Google Calendar, Outlook o iCloud compaiono nell'agenda e negli avvisi, aggiornati in automatico. Si collegano con il link del calendario.</p>
      <SolaLetturaNota />
      {!calendari.length && <p className="muted pad">Nessun calendario collegato.</p>}
      {calendari.map((c) => (
        <div key={c.id} className={`cal-card ${c.attivo ? '' : 'off'}`}>
          <div className="grow">
            <div className="row wrap cal-heading"><b className="cal-name"><span className="dot" aria-hidden="true" style={{ background: c.colore }} /><span className="cal-label">{c.nome}</span></b>{!c.attivo && <span className="pill">in pausa</span>}{!!c.crea_pratiche && <span className="pill ok" title="Le nuove pratiche riconosciute negli eventi vengono create a ogni aggiornamento">pratiche in automatico</span>}</div>
            <div className="muted small mono-s">{maschera(c.url)}</div>
            {c.ultimo_esito === 'errore'
              ? <div className="stato-err"><AlertTriangle size={13} /> {c.ultimo_errore} <span className="muted">· ultimo tentativo {quando(c.ultimo_tentativo)}</span></div>
              : <div className="stato-ok"><CheckCircle2 size={13} /> {c.ultimo_sync ? <>Aggiornato {quando(c.ultimo_sync)} · {eventi.filter((e) => e.calendario_id === c.id).length} eventi</> : 'In attesa del primo aggiornamento'}</div>}
          </div>
          <div className="row wrap cal-actions">
            <Btn size="sm" variant="ghost" onClick={() => sync(c.id)} disabled={aggiorna !== null} aria-label={`Aggiorna ${c.nome}`} title="Aggiorna ora"><RefreshCw size={14} className={aggiorna === c.id ? 'gira' : ''} /></Btn>
            <Btn size="sm" onClick={() => setPratiche(c.id)} title="Riconosci le pratiche negli eventi di questo calendario"><FolderKanban size={14} /> Pratiche…</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setEdit(c)} aria-label={`Modifica ${c.nome}`} title="Modifica"><Pencil size={14} /></Btn>
            <Btn size="sm" variant="ghost" aria-label={`Scollega ${c.nome}`} title="Scollega" onClick={async () => {
              if (await confirm({ title: 'Scollegare il calendario?', text: `Gli eventi importati da “${c.nome}” verranno rimossi da TIO. Il calendario originale non viene toccato.`, ok: 'Scollega', danger: true })) run(() => api.eliminaCalendario(c.id))
            }}><Trash2 size={14} /></Btn>
          </div>
        </div>
      ))}
      {edit && <CalendarioForm item={edit} onClose={() => setEdit(null)} />}
      {pratiche !== null && <PraticheDaCalendarioModal calendarioId={pratiche} onClose={() => setPratiche(null)} />}
    </section>
  )
}

function CalendarioForm({ item, onClose }: { item: Partial<Calendario>; onClose: () => void }) {
  const run = useAction()
  const { toast } = useFeedback()
  const [f, setF] = useState({ nome: item.nome || '', url: item.url || '', colore: item.colore || '#0ea5e9', intervallo_min: item.intervallo_min || 30, attivo: item.attivo ?? 1 })
  const [prom, setProm] = useState<number[]>(() => { try { return JSON.parse(item.promemoria || '[60]') } catch { return [60] } })
  const [prova, setProva] = useState<null | { ok: boolean; testo: string; esempi?: { titolo: string; inizio: string; luogo?: string }[] }>(null)
  const [provando, setProvando] = useState(false)
  const set = (k: string, v: any) => { setF((x) => ({ ...x, [k]: v })); if (k === 'url') setProva(null) }
  const valido = f.nome.trim() && f.url.trim()
  const daFile = /^file:/i.test(f.url)
  const usaFile = async () => {
    const r = await run(() => api.scegliFileCalendario())
    if (r) { setF((x) => ({ ...x, url: r.url, nome: x.nome.trim() ? x.nome : r.nome })); setProva(null) }
  }
  const verifica = async () => {
    setProvando(true); setProva(null)
    try { const r = await api.provaCalendario(f.url); setProva({ ok: true, testo: `Calendario letto correttamente: ${r.futuri} eventi in programma (${r.totali} in tutto).`, esempi: r.esempi }) }
    catch (e: any) { setProva({ ok: false, testo: String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }) }
    setProvando(false)
  }
  const salva = async () => {
    if (!valido) return
    const r = await run(() => api.salvaCalendario({ ...(item.id ? { id: item.id } : {}), ...f, promemoria: prom }))
    if (r) { if (r.ultimo_esito === 'errore') toast(`Salvato, ma non riesco a leggere il calendario: ${r.ultimo_errore}`, 'err'); else toast(`Calendario collegato: ${r.n_eventi} eventi importati`); onClose() }
  }
  return (
    <Modal title={item.id ? 'Modifica calendario collegato' : 'Collega un calendario'} subtitle="Sola lettura: nulla viene scritto nel calendario originale" width={680} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={salva} disabled={!valido}>{item.id ? 'Salva' : 'Collega e importa'}</Btn></>}>
      <form onSubmit={(e) => { e.preventDefault(); salva() }}>
        <FormGrid>
          <Field label="Nome *" span={2}><Input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Es. Udienze (Cliens Più)" /></Field>
          <Field label="Link del calendario *" span={2} hint={daFile ? 'File sul computer: TIO lo rilegge a ogni aggiornamento, quindi se riscarichi il calendario nello stesso punto gli eventi si aggiornano. Per aggiornamenti davvero automatici usa il link.' : "Incolla l'indirizzo in formato iCal/ICS (inizia con https:// o webcal://). Trattalo come una password: chi ha il link può leggere il calendario."}>
            <div className="row"><Input value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" autoComplete="off" spellCheck={false} /><Btn type="button" onClick={verifica} disabled={!f.url.trim() || provando}>{provando ? 'Verifico…' : 'Prova il link'}</Btn></div>
            <Btn type="button" size="sm" variant="ghost" onClick={usaFile} style={{ marginTop: 6 }}><FileUp size={14} /> Hai già scaricato il file .ics? Usa il file…</Btn>
          </Field>
          {prova && (
            <div style={{ gridColumn: 'span 2' }} className={`prova ${prova.ok ? 'ok' : 'err'}`} role="status">
              {prova.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}<div><b>{prova.testo}</b>
                {prova.esempi?.map((x, i) => <div key={i} className="small">• {fmtDateTime(x.inizio)} — {x.titolo}{x.luogo ? ` (${x.luogo})` : ''}</div>)}</div>
            </div>
          )}
          <Field label="Colore" span={2}><ColorPicker value={f.colore} onChange={(c) => set('colore', c)} /></Field>
          <Field label="Aggiorna"><Select value={f.intervallo_min} onChange={(e) => set('intervallo_min', Number(e.target.value))}>{INTERVALLI.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</Select></Field>
          <Field label="Stato"><label className="check"><input type="checkbox" checked={!!f.attivo} onChange={(e) => set('attivo', e.target.checked ? 1 : 0)} /> Attivo (aggiornamento e avvisi)</label></Field>
          <Field label="Avvisami prima degli eventi di questo calendario" span={2}><PromemoriaElenco value={prom} onChange={setProm} /></Field>
        </FormGrid>
        <button type="submit" hidden />
      </form>
      <details className="guida" open={!item.id}>
        <summary>Dove trovo il link del calendario?</summary>
        <ul>
          <li><b>Cliens Più</b>: apri <i>Agenda</i> e premi <i>Esporta</i> (in alto a sinistra): compare il link da usare nelle applicazioni di calendario. Copialo e incollalo qui. La guida del servizio indica che il feed contiene gli impegni di cui sei responsabile, da una settimana nel passato a un anno nel futuro: le pratiche senza eventi nel feed non arrivano da questo collegamento.</li>
          <li><b>Cliens Cube</b>: se la tua versione mette a disposizione un link iCal o un file .ics, puoi usarlo qui. Con «Pratiche…» riconosci i fascicoli dai dati presenti negli eventi, con anteprima da controllare; il collegamento non scarica direttamente l'archivio completo delle pratiche o i documenti di Cube.</li>
          <li><b>Google Calendar</b> (dal computer, su calendar.google.com): <i>⚙ Impostazioni</i> → nella colonna a sinistra, sotto <i>Impostazioni per i miei calendari</i>, il tuo calendario → <i>Integra il calendario</i> → <i>Indirizzo segreto in formato iCal</i>: premi l'icona di copia e incolla qui (termina con <i>basic.ics</i>). <b>Non cliccare il link</b>: il browser scaricherebbe un file .ics invece di copiarlo. Se l'hai già scaricato, usa «Usa il file…».</li>
          <li><b>Outlook / Microsoft 365</b>: <i>Impostazioni → Calendario → Calendari condivisi</i> → <i>Pubblica un calendario</i> → copia il link ICS.</li>
          <li><b>Apple iCloud</b>: condividi il calendario come <i>Calendario pubblico</i> e copia il link (webcal://).</li>
          <li><b>Agenda cartacea</b>: usa «Importa da file» con il modello Excel/CSV da compilare.</li>
        </ul>
      </details>
    </Modal>
  )
}

/* ------------------------------ importazione ------------------------------ */
type Tipo = 'anagrafica' | 'pratiche' | 'scadenze' | 'parcelle'
const SCHEDE: { tipo: Tipo; icona: any; titolo: string; testo: string }[] = [
  { tipo: 'anagrafica', icona: Users2, titolo: 'Clienti e controparti', testo: 'Rubrica con codice fiscale, partita IVA, email e telefono.' },
  { tipo: 'pratiche', icona: FolderKanban, titolo: 'Pratiche', testo: 'Fascicoli con cliente, controparte, autorità, N. RG, stato e valore.' },
  { tipo: 'scadenze', icona: CalendarDays, titolo: 'Udienze e scadenze', testo: 'Impegni con data e ora, collegati alla pratica per numero o titolo.' },
  { tipo: 'parcelle', icona: Wallet, titolo: 'Parcelle e fatture', testo: 'Storico dei documenti emessi, con importi e stato di pagamento.' },
]

export function ImportPanel() {
  const run = useAction()
  const { toast } = useFeedback()
  const [wizard, setWizard] = useState<Tipo | null>(null)
  const [cartella, setCartella] = useState(false)
  return (
    <section className="card pad-lg" id="importazione">
      <h2><FileSpreadsheet size={16} /> Importa i dati esistenti</h2>
      <p className="muted small">Porta in TIO i dati che hai già, senza rifarli da zero: da Cliens Più (<i>Esporta lista</i> in XLS o CSV), da Excel o da un'agenda cartacea trascritta. Puoi ripetere l'importazione quando vuoi: i dati già presenti non vengono duplicati.</p>
      <SolaLetturaNota />
      <div className="import-grid">
        {SCHEDE.map(({ tipo, icona: Icona, titolo, testo }) => (
          <div key={tipo} className="import-card">
            <Icona size={22} className="import-ico" />
            <h3>{titolo}</h3><p className="muted small">{testo}</p>
            <div className="row wrap">
              <Btn size="sm" variant="primary" onClick={() => setWizard(tipo)}>Importa da file…</Btn>
              <Btn size="sm" variant="ghost" onClick={async () => { const d = await run(() => api.modelloImport(tipo)); if (d) toast(`Modello salvato: ${d}`) }}><Download size={14} /> Modello da compilare</Btn>
            </div>
          </div>
        ))}
        <div className="import-card">
          <FolderInput size={22} className="import-ico" />
          <h3>Documenti da una cartella</h3><p className="muted small">Ogni sottocartella diventa (o si collega a) una pratica e i suoi file vengono collegati ai documenti (restano nella cartella: nessuna copia). I file originali restano dove sono.</p>
          <Btn size="sm" variant="primary" onClick={() => setCartella(true)}>Scegli la cartella…</Btn>
        </div>
      </div>
      {wizard && <ImportWizard tipo={wizard} onClose={() => setWizard(null)} />}
      {cartella && <ImportCartella onClose={() => setCartella(false)} />}
    </section>
  )
}
