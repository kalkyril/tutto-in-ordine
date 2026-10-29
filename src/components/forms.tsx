import { useMemo, useState } from 'react'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { conflittiPer, type Conflitto } from '../lib/conflitti'
import { Btn, ColorPicker, Field, FormGrid, Input, Modal, Segmented, Select, Textarea, useAction, useFieldId } from './ui'
import { PROMEMORIA_OPZIONI, nuovo as nuovoNome, tipiScadenza } from '../lib/defaults'
import { todayStr } from '../lib/dates'
import { normalizeUrl, parseNumber } from '../lib/format'
import type { Anagrafica, Link, Pratica, Scadenza, Todo } from '../types'

/* ---------- Select pratica ---------- */
export function PraticaSelect({ value, onChange, allowNone = true, noneLabel = '— Nessuna pratica —', id, ariaLabel }: { value: number | null | undefined; onChange: (v: number | null) => void; allowNone?: boolean; noneLabel?: string; id?: string; ariaLabel?: string }) {
  const { pratiche, settings } = useData()
  const chiuse = new Set(settings.stati_pratica.filter((s) => s.chiusa).map((s) => s.nome))
  const sorted = useMemo(() => [...pratiche].sort((a, b) => Number(chiuse.has(a.stato || '')) - Number(chiuse.has(b.stato || '')) || (b.numero || '').localeCompare(a.numero || '')), [pratiche, settings.stati_pratica])
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} id={id} aria-label={ariaLabel}>
      {allowNone && <option value="">{noneLabel}</option>}
      {sorted.map((p) => <option key={p.id} value={p.id}>{p.numero ? p.numero + ' · ' : ''}{p.titolo}{chiuse.has(p.stato || '') ? ' (chiusa)' : ''}</option>)}
    </Select>
  )
}

/* ---------- Anagrafica ---------- */
export function AnagraficaForm({ item, ruolo, onClose, onSaved }: { item?: Partial<Anagrafica>; ruolo?: Anagrafica['ruolo']; onClose: () => void; onSaved?: (a: Anagrafica) => void }) {
  const run = useAction()
  const [f, setF] = useState<Partial<Anagrafica>>({ tipo: 'persona', ruolo: ruolo || 'cliente', ...item })
  const set = (k: keyof Anagrafica, v: any) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.denominazione?.trim()) return
    const r = await run(() => api.save<Anagrafica>('anagrafica', { ...f, denominazione: f.denominazione!.trim() }), 'Salvato')
    if (r) { onSaved?.(r); onClose() }
  }
  return (
    <Modal title={f.id ? 'Modifica anagrafica' : 'Nuova anagrafica'} onClose={onClose} width={640}
      footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={save} disabled={!f.denominazione?.trim()}>Salva</Btn></>}>
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <FormGrid>
          <Field label="Ruolo"><Segmented value={f.ruolo as string} onChange={(v) => set('ruolo', v)} options={[{ id: 'cliente', label: 'Cliente' }, { id: 'controparte', label: 'Controparte' }, { id: 'altro', label: 'Altro' }]} /></Field>
          <Field label="Tipo"><Segmented value={f.tipo as string} onChange={(v) => set('tipo', v)} options={[{ id: 'persona', label: 'Persona fisica' }, { id: 'azienda', label: 'Società / Ente' }]} /></Field>
          <Field label={f.tipo === 'azienda' ? 'Ragione sociale *' : 'Nome e cognome *'} span={2}><Input value={f.denominazione || ''} onChange={(e) => set('denominazione', e.target.value)} required /></Field>
          <Field label="Codice fiscale"><Input value={f.codice_fiscale || ''} onChange={(e) => set('codice_fiscale', e.target.value.toUpperCase())} /></Field>
          <Field label="Partita IVA"><Input value={f.partita_iva || ''} onChange={(e) => set('partita_iva', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="PEC"><Input type="email" value={f.pec || ''} onChange={(e) => set('pec', e.target.value)} /></Field>
          <Field label="Telefono"><Input value={f.telefono || ''} onChange={(e) => set('telefono', e.target.value)} /></Field>
          <Field label="Indirizzo"><Input value={f.indirizzo || ''} onChange={(e) => set('indirizzo', e.target.value)} /></Field>
          <Field label="CAP"><Input value={f.cap || ''} onChange={(e) => set('cap', e.target.value)} maxLength={5} /></Field>
          <Field label="Città / Provincia"><div className="row"><Input value={f.citta || ''} onChange={(e) => set('citta', e.target.value)} /><Input style={{ width: 70 }} maxLength={2} placeholder="PR" value={f.provincia || ''} onChange={(e) => set('provincia', e.target.value.toUpperCase())} /></div></Field>
          <Field label="Note" span={2}><Textarea value={f.note || ''} onChange={(e) => set('note', e.target.value)} /></Field>
        </FormGrid>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/* ---------- Pratica ---------- */
function AvvisoConflitto({ conflitti }: { conflitti: Conflitto[] }) {
  if (!conflitti.length) return null
  const { go } = useNav()
  return (
    <div className="conflitto" role="alert">
      <AlertTriangle size={14} aria-hidden /> <span><b>Possibile conflitto di interessi:</b> {conflitti[0].contatto.denominazione} risulta {conflitti[0].ruoloAltrove === 'controparte' ? 'controparte' : 'cliente'} in {conflitti.slice(0, 3).map((c, i) => <span key={c.pratica.id}>{i > 0 && ', '}<button type="button" className="link-btn" onClick={() => go({ page: 'pratica', id: c.pratica.id })}>{c.pratica.numero || c.pratica.titolo}</button></span>)}{conflitti.length > 3 ? ` e altre ${conflitti.length - 3}` : ''}. Verifica prima di accettare l'incarico.</span>
    </div>
  )
}

export function PraticaForm({ item, onClose, onSaved }: { item?: Partial<Pratica>; onClose: () => void; onSaved?: (p: Pratica) => void }) {
  const run = useAction()
  const { anagrafica, settings, pratiche, anagraficaById } = useData()
  const [f, setF] = useState<Partial<Pratica>>({
    colore: settings.palette[Math.floor(Math.random() * settings.palette.length)] || '#3b82f6',
    stato: settings.stati_pratica[0]?.nome, tipo: settings.tipi_pratica[0], data_apertura: todayStr(), ...item,
  })
  const [nuovo, setNuovo] = useState<null | 'cliente' | 'controparte'>(null)
  const set = (k: keyof Pratica, v: any) => setF((x) => ({ ...x, [k]: v }))
  const L = settings.etichette
  const forense = settings.profilo === 'avvocato'
  const confCliente = useMemo(() => conflittiPer(f.cliente_id ? anagraficaById.get(f.cliente_id) : null, 'cliente', pratiche, anagraficaById, f.id), [f.cliente_id, f.id, pratiche, anagraficaById])
  const confControparte = useMemo(() => conflittiPer(f.controparte_id ? anagraficaById.get(f.controparte_id) : null, 'controparte', pratiche, anagraficaById, f.id), [f.controparte_id, f.id, pratiche, anagraficaById])
  // tutte le anagrafiche in entrambi gli elenchi: una persona può essere cliente qui e controparte altrove (e allora scatta l'avviso di conflitto)
  const clienti = anagrafica, controparti = anagrafica
  const save = async () => {
    if (!f.titolo?.trim()) return
    const obj: any = { ...f, titolo: f.titolo.trim(), valore: f.valore === undefined || f.valore === null || (f.valore as any) === '' ? null : parseNumber(f.valore as any) }
    if (!obj.id && !obj.numero) obj.numero = await api.nextPraticaNumero()
    const closed = settings.stati_pratica.find((s) => s.nome === obj.stato)?.chiusa
    if (closed && !obj.data_chiusura) obj.data_chiusura = todayStr()
    if (!closed) obj.data_chiusura = null
    const r = await run(() => api.save<Pratica>('pratiche', obj), 'Pratica salvata')
    if (r) { onSaved?.(r); onClose() }
  }
  return (
    <>
      <Modal title={f.id ? `Modifica ${L.pratica.toLowerCase()}` : nuovoNome(L.pratica)} onClose={onClose} width={700}
        footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={save} disabled={!f.titolo?.trim()}>Salva</Btn></>}>
        <form onSubmit={(e) => { e.preventDefault(); save() }}>
          <FormGrid>
            <Field label="Titolo *" span={2}><Input value={f.titolo || ''} onChange={(e) => set('titolo', e.target.value)} placeholder={forense ? 'Es. Rossi c. Bianchi — risarcimento danni' : 'Es. Ristrutturazione uffici'} required /></Field>
            <Field label="Numero" hint="Generato automaticamente se vuoto"><Input value={f.numero || ''} onChange={(e) => set('numero', e.target.value)} placeholder="2026/001" /></Field>
            <Field label="Stato"><Select value={f.stato || ''} onChange={(e) => set('stato', e.target.value)}>{settings.stati_pratica.map((s) => <option key={s.nome}>{s.nome}</option>)}</Select></Field>
            <Field label={L.cliente}>
              <div className="row">
                <Select value={f.cliente_id ?? ''} onChange={(e) => set('cliente_id', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">—</option>{clienti.map((a) => <option key={a.id} value={a.id}>{a.denominazione}</option>)}
                </Select>
                <Btn type="button" size="sm" title="Nuova anagrafica" onClick={() => setNuovo('cliente')}><Plus size={14} /></Btn>
              </div>
            </Field>
            <Field label={L.controparte}>
              <div className="row">
                <Select value={f.controparte_id ?? ''} onChange={(e) => set('controparte_id', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">—</option>{controparti.map((a) => <option key={a.id} value={a.id}>{a.denominazione}</option>)}
                </Select>
                <Btn type="button" size="sm" title="Nuova anagrafica" onClick={() => setNuovo('controparte')}><Plus size={14} /></Btn>
              </div>
            </Field>
            {settings.profilo !== 'ditta' && (confCliente.length > 0 || confControparte.length > 0) && <div style={{ gridColumn: 'span 2' }}><AvvisoConflitto conflitti={confCliente} /><AvvisoConflitto conflitti={confControparte} /></div>}
            <Field label="Tipologia">
              <Select value={f.tipo || ''} onChange={(e) => set('tipo', e.target.value)}>
                <option value="">—</option>{[...new Set([...settings.tipi_pratica, ...(f.tipo ? [f.tipo] : [])])].map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Valore (€)"><Input inputMode="decimal" value={f.valore ?? ''} onChange={(e) => set('valore', e.target.value as any)} placeholder="0,00" /></Field>
            <Field label={L.autorita}><Input value={f.autorita || ''} onChange={(e) => set('autorita', e.target.value)} placeholder={forense ? 'Es. Tribunale di Milano' : ''} /></Field>
            {forense
              ? <Field label={L.rg}><Input value={f.rg || ''} onChange={(e) => set('rg', e.target.value)} placeholder="1234/2026" /></Field>
              : <Field label={L.rg}><Input value={f.rg || ''} onChange={(e) => set('rg', e.target.value)} /></Field>}
            <Field label={L.giudice}><Input value={f.giudice || ''} onChange={(e) => set('giudice', e.target.value)} /></Field>
            <Field label="Data apertura"><Input type="date" value={f.data_apertura || ''} onChange={(e) => set('data_apertura', e.target.value)} /></Field>
            <Field label="Colore della pratica" span={2} hint="Usato in elenchi, agenda e scadenze per riconoscerla a colpo d'occhio"><ColorPicker value={f.colore || '#3b82f6'} onChange={(c) => set('colore', c)} /></Field>
            <Field label="Descrizione / note" span={2}><Textarea rows={4} value={f.descrizione || ''} onChange={(e) => set('descrizione', e.target.value)} /></Field>
          </FormGrid>
          <button type="submit" hidden />
        </form>
      </Modal>
      {nuovo && <AnagraficaForm ruolo={nuovo} onClose={() => setNuovo(null)} onSaved={(a) => set(nuovo === 'cliente' ? 'cliente_id' : 'controparte_id', a.id)} />}
    </>
  )
}

/* ---------- Scadenza / udienza / appuntamento ---------- */
/** Promemoria come elenco di menù a tendina: uno per avviso, con + per aggiungerne altri. */
export function PromemoriaElenco({ value, onChange, vuoto = 'Nessun avviso.' }: { value: number[]; onChange: (v: number[]) => void; vuoto?: string }) {
  const id = useFieldId()
  const libera = PROMEMORIA_OPZIONI.find((o) => !value.includes(o.v))
  return (
    <div className="promemoria-righe">
      {value.map((v, i) => (
        <div key={i} className="row">
          <select id={i === 0 ? id : undefined} aria-label={`Avviso ${i + 1}`} value={v} onChange={(e) => onChange(value.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
            {PROMEMORIA_OPZIONI.filter((o) => o.v === v || !value.includes(o.v)).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <button type="button" className="icon-btn" aria-label={`Rimuovi avviso «${PROMEMORIA_OPZIONI.find((o) => o.v === v)?.l ?? v}»`} title="Rimuovi avviso" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      {!value.length && <p className="muted small">{vuoto}</p>}
      {libera && <div><Btn type="button" size="sm" id={value.length ? undefined : id} onClick={() => onChange([...value, libera.v])}><Plus size={14} /> Aggiungi avviso</Btn></div>}
    </div>
  )
}

export function ScadenzaForm({ item, praticaId, onClose, onSaved }: { item?: Partial<Scadenza>; praticaId?: number | null; onClose: () => void; onSaved?: (s: Scadenza) => void }) {
  const run = useAction()
  const { settings, praticaById } = useData()
  const initDate = item?.data_ora?.slice(0, 10) || todayStr()
  const [f, setF] = useState<Partial<Scadenza>>({ tipo: 'scadenza', pratica_id: praticaId ?? null, tutto_il_giorno: 0, ...item })
  const [date, setDate] = useState(initDate)
  const [time, setTime] = useState(item?.data_ora && item.data_ora.length > 10 ? item.data_ora.slice(11, 16) : '09:00')
  const [prom, setProm] = useState<number[]>(() => {
    if (item?.promemoria) { try { return JSON.parse(item.promemoria) } catch { return [] } }
    return item?.id ? [] : settings.promemoria_default
  })
  const set = (k: keyof Scadenza, v: any) => setF((x) => ({ ...x, [k]: v }))
  const allDay = !!f.tutto_il_giorno
  const save = async () => {
    if (!f.titolo?.trim() || !date) return
    const r = await run(() => api.save<Scadenza>('scadenze', { ...f, titolo: f.titolo!.trim(), data_ora: allDay ? date : `${date}T${time || '09:00'}`, promemoria: prom }), 'Salvato')
    if (r) { onSaved?.(r); onClose() }
  }
  const col = f.pratica_id ? praticaById.get(f.pratica_id)?.colore : undefined
  return (
    <Modal title={f.id ? 'Modifica scadenza' : 'Nuova scadenza'} onClose={onClose} width={620}
      footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={save} disabled={!f.titolo?.trim() || !date}>Salva</Btn></>}>
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <FormGrid>
          <Field label="Tipo" span={2}>
            <Segmented value={f.tipo as string} onChange={(v) => set('tipo', v)} options={Object.entries({ ...tipiScadenza(settings.profilo), ...(f.tipo && !tipiScadenza(settings.profilo)[f.tipo] ? { [f.tipo]: { label: f.tipo === 'udienza' ? 'Udienza' : f.tipo, icon: '' } } : {}) }).map(([id, t]) => ({ id, label: t.label }))} />
          </Field>
          <Field label="Titolo *" span={2}><Input value={f.titolo || ''} onChange={(e) => set('titolo', e.target.value)} placeholder="Es. Deposito memoria ex art. 183 c.p.c." required /></Field>
          <Field label="Pratica" span={2}>
            <div className="row">{col && <span className="dot" style={{ background: col, width: 12, height: 12 }} />}<PraticaSelect value={f.pratica_id} onChange={(v) => set('pratica_id', v)} /></div>
          </Field>
          <Field label="Data *"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Ora">
            <div className="row">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={allDay} />
              <label className="check"><input type="checkbox" checked={allDay} onChange={(e) => set('tutto_il_giorno', e.target.checked ? 1 : 0)} /> Tutto il giorno</label>
            </div>
          </Field>
          <Field label="Luogo" span={2}><Input value={f.luogo || ''} onChange={(e) => set('luogo', e.target.value)} placeholder="Es. Aula 12, Tribunale di Milano" /></Field>
          <Field label="Avvisami" span={2} hint={allDay ? `Per eventi “tutto il giorno” gli avvisi si basano sulle ore ${String(settings.ora_default_giornata).padStart(2, '0')}:00` : undefined}>
            <PromemoriaElenco value={prom} onChange={setProm} />
          </Field>
          <Field label="Note" span={2}><Textarea value={f.note || ''} onChange={(e) => set('note', e.target.value)} /></Field>
          {f.id && <Field label="Stato" span={2}><label className="check"><input type="checkbox" checked={!!f.completata} onChange={(e) => set('completata', e.target.checked ? 1 : 0)} /> Completata</label></Field>}
        </FormGrid>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/* ---------- To-do ---------- */
const TODO_PROM = [
  { v: '', l: 'Nessun avviso' }, { v: '0', l: 'Alla scadenza' }, { v: '60', l: '1 ora prima' }, { v: '1440', l: '1 giorno prima' },
  { v: '2880', l: '2 giorni prima' }, { v: '10080', l: '1 settimana prima' },
]
export function TodoForm({ item, praticaId, onClose, onSaved }: { item?: Partial<Todo>; praticaId?: number | null; onClose: () => void; onSaved?: (t: Todo) => void }) {
  const run = useAction()
  const [f, setF] = useState<Partial<Todo>>({ priorita: 1, pratica_id: praticaId ?? null, promemoria_min: null, ...item })
  const [date, setDate] = useState(item?.scadenza?.slice(0, 10) || '')
  const [time, setTime] = useState(item?.scadenza && item.scadenza.length > 10 ? item.scadenza.slice(11, 16) : '')
  const set = (k: keyof Todo, v: any) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.titolo?.trim()) return
    const scadenza = date ? (time ? `${date}T${time}` : date) : null
    const r = await run(() => api.save<Todo>('todos', { ...f, titolo: f.titolo!.trim(), scadenza, promemoria_min: scadenza ? f.promemoria_min : null }), 'Salvato')
    if (r) { onSaved?.(r); onClose() }
  }
  return (
    <Modal title={f.id ? 'Modifica compito' : 'Nuovo compito'} onClose={onClose} width={560}
      footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={save} disabled={!f.titolo?.trim()}>Salva</Btn></>}>
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <FormGrid>
          <Field label="Compito *" span={2}><Input value={f.titolo || ''} onChange={(e) => set('titolo', e.target.value)} required /></Field>
          {!praticaId && <Field label="Pratica" span={2}><PraticaSelect value={f.pratica_id} onChange={(v) => set('pratica_id', v)} /></Field>}
          <Field label="Scadenza"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Ora (facoltativa)"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} /></Field>
          <Field label="Avviso"><Select value={f.promemoria_min ?? ''} disabled={!date} onChange={(e) => set('promemoria_min', e.target.value === '' ? null : Number(e.target.value))}>{TODO_PROM.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</Select></Field>
          <Field label="Priorità"><Segmented value={String(f.priorita)} onChange={(v) => set('priorita', Number(v))} options={[{ id: '0', label: 'Bassa' }, { id: '1', label: 'Normale' }, { id: '2', label: 'Alta' }]} /></Field>
          <Field label="Note" span={2}><Textarea value={f.note || ''} onChange={(e) => set('note', e.target.value)} /></Field>
        </FormGrid>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/* ---------- Collegamento a sito ---------- */
export function LinkForm({ item, praticaId, onClose }: { item?: Partial<Link>; praticaId?: number | null; onClose: () => void }) {
  const run = useAction()
  const [f, setF] = useState<Partial<Link>>({ pratica_id: praticaId ?? null, ...item })
  const set = (k: keyof Link, v: any) => setF((x) => ({ ...x, [k]: v }))
  const valid = !!f.titolo?.trim() && !!f.url?.trim() && /\./.test(f.url || '')
  const save = async () => {
    if (!valid) return
    const url = normalizeUrl(f.url!)
    try { const u = new URL(url); if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) throw new Error() } catch { await run(async () => { throw new Error('Indirizzo non valido') }); return }
    const r = await run(() => api.save('link', { ...f, titolo: f.titolo!.trim(), url }), 'Collegamento salvato')
    if (r) onClose()
  }
  return (
    <Modal title={f.id ? 'Modifica collegamento' : 'Nuovo collegamento'} onClose={onClose} width={520}
      footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" onClick={save} disabled={!valid}>Salva</Btn></>}>
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <FormGrid cols={1}>
          <Field label="Nome *"><Input value={f.titolo || ''} onChange={(e) => set('titolo', e.target.value)} required /></Field>
          <Field label="Indirizzo del sito *"><Input value={f.url || ''} onChange={(e) => set('url', e.target.value)} placeholder="https://…" required /></Field>
          <Field label="Descrizione"><Input value={f.descrizione || ''} onChange={(e) => set('descrizione', e.target.value)} /></Field>
          {!praticaId && <Field label="Collega a una pratica (facoltativo)"><PraticaSelect value={f.pratica_id} onChange={(v) => set('pratica_id', v)} /></Field>}
        </FormGrid>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
