import { useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Btn, Field, FormGrid, Input, Modal, Segmented, Select } from './ui'
import { calcolaTermine, dataLunga, PRESET, type Rito, type Unita, type Verso } from '../lib/termini'
import { todayStr } from '../lib/dates'

export interface TermineDaCreare { titolo: string; data: string; note: string }

/**
 * Calcola un termine processuale in avanti o a ritroso (sospensione feriale, festivi, sabato) e mostra
 * ogni passaggio del conteggio accanto al risultato, così si può controllare prima di fidarsene.
 */
export function CalcoloTerminiModal({ onClose, onCrea }: { onClose: () => void; onCrea: (t: TermineDaCreare) => void }) {
  const [preset, setPreset] = useState('')
  const [data, setData] = useState(todayStr())
  const [verso, setVerso] = useState<Verso>('avanti')
  const [quantita, setQuantita] = useState('30')
  const [unita, setUnita] = useState<Unita>('giorni')
  const [sospensione, setSospensione] = useState(true)
  const [libero, setLibero] = useState(false)
  const [rito, setRito] = useState<Rito>('civile')

  const scegli = (id: string) => {
    setPreset(id)
    const p = PRESET.find((x) => x.id === id)
    if (!p) return
    setVerso(p.verso); setQuantita(String(p.quantita)); setUnita(p.unita); setLibero(!!p.libero); setSospensione(!p.senzaSospensione); setRito('civile')
  }
  const p = PRESET.find((x) => x.id === preset)
  const q = Number(quantita)
  const r = useMemo(() => calcolaTermine({ data, verso, quantita: q, unita, sospensione, libero, rito }), [data, verso, q, unita, sospensione, libero, rito])
  const crea = () => {
    if (!r.scadenza) return
    const titolo = p?.titolo || `Termine di ${q} ${unita} ${verso === 'avanti' ? 'dal' : 'prima del'} ${data.split('-').reverse().join('/')}`
    onCrea({ titolo, data: r.scadenza, note: [`Calcolo del termine${p ? ` (${p.nome}, ${p.rif})` : ''}:`, ...r.passi, 'Calcolo indicativo: verificare sul caso concreto.'].join('\n') })
  }

  return (
    <Modal title="Calcola un termine" subtitle="Funzione sperimentale · in avanti dalla notifica o a ritroso dall'udienza, con sospensione feriale e festivi" width={900} onClose={onClose} protectChanges={false}
      footer={<><Btn variant="ghost" onClick={onClose}>Chiudi</Btn><Btn variant="primary" disabled={!r.scadenza} onClick={crea}><CalendarPlus size={15} /> Crea scadenza</Btn></>}>
      <div className="termini">
        <div className="termini-form">
          <FormGrid cols={2}>
            <Field label="Termine" span={2}>
              <Select value={preset} onChange={(e) => scegli(e.target.value)}>
                <option value="">Personalizzato</option>
                <optgroup label="Dalla notifica o dalla pubblicazione">{PRESET.filter((x) => x.verso === 'avanti').map((x) => <option key={x.id} value={x.id}>{x.nome} — {x.quantita} {x.unita} ({x.rif})</option>)}</optgroup>
                <optgroup label="Prima dell'udienza">{PRESET.filter((x) => x.verso === 'ritroso').map((x) => <option key={x.id} value={x.id}>{x.nome} — {x.quantita} {x.unita} ({x.rif})</option>)}</optgroup>
              </Select>
            </Field>
            <Field label={verso === 'avanti' ? 'Data della notifica o della pubblicazione' : "Data dell'udienza"} span={2}>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </Field>
            <Field label="Durata"><Input inputMode="numeric" value={quantita} onChange={(e) => { setQuantita(e.target.value.replace(/\D/g, '')); setPreset('') }} aria-label="Durata del termine" /></Field>
            <Field label="Unità"><Select value={unita} onChange={(e) => { setUnita(e.target.value as Unita); setPreset('') }}><option value="giorni">giorni</option><option value="mesi">mesi</option><option value="anni">anni</option></Select></Field>
            <Field label="Direzione" span={2}>
              <Segmented<Verso> value={verso} onChange={(v) => { setVerso(v); setPreset('') }} options={[{ id: 'avanti', label: 'Dopo la data (in avanti)' }, { id: 'ritroso', label: 'Prima della data (a ritroso)' }]} />
            </Field>
            <Field label="Procedimento" span={2}>
              <Segmented<Rito> value={rito} onChange={setRito} options={[{ id: 'civile', label: 'Civile, amministrativo, tributario' }, { id: 'penale', label: 'Penale' }]} />
            </Field>
          </FormGrid>
          <label className="check big"><input type="checkbox" checked={sospensione} onChange={(e) => setSospensione(e.target.checked)} /> <span><b>Sospensione feriale (1–31 agosto)</b><small>Non si applica, ad esempio, a cause di lavoro e previdenza, procedimenti cautelari, convalida di sfratto, opposizione all'esecuzione, procedure concorsuali e alle altre materie dell'art. 92 ord. giud.</small></span></label>
          <label className="check big"><input type="checkbox" checked={libero} onChange={(e) => { setLibero(e.target.checked); setPreset('') }} /> <span><b>Termine libero</b><small>Non si contano né il giorno iniziale né quello finale (es. art. 163-bis c.p.c.).</small></span></label>
        </div>

        <aside className="termini-esito" aria-live="polite">
          {r.scadenza ? <>
            <p className="termini-etichetta">Ultimo giorno utile</p>
            <p className="termini-data">{dataLunga(r.scadenza)}</p>
            {p && <p className="muted small">{p.nome} · {p.rif}</p>}
            <ol className="termini-passi">{r.passi.map((x, i) => <li key={i}>{x}</li>)}</ol>
            {r.avvisi.map((a) => <p key={a} className="doc-avviso small">{a}</p>)}
          </> : <p className="muted">Indica la data e la durata del termine.</p>}
          <p className="muted small termini-nota">Funzione sperimentale, calcolo indicativo: verifica sempre la norma e la giurisprudenza per il caso concreto. Non sono considerate le festività del santo patrono né i termini speciali di singole materie.</p>
        </aside>
      </div>
    </Modal>
  )
}
