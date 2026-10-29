import { useMemo, useState } from 'react'
import { CalendarClock, Info } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { Btn, Field, Modal, Select, useAction, useFeedback } from './ui'
import { profiloFiscale, regimePredefinito, ricorrenzeDa, scadenzePer, type Regime } from '../lib/scadenzeFiscali'
import { fmtDate } from '../lib/dates'
import { primoLavorativo } from '../lib/termini'

/** Scadenze fiscali e previdenziali del profilo, da spuntare: diventano attività ricorrenti (un compito a ogni scadenza). */
export function ScadenzeFiscaliModal({ esistenti, onClose }: { esistenti: string[]; onClose: () => void }) {
  const { settings } = useData()
  const run = useAction()
  const { toast } = useFeedback()
  const profilo = profiloFiscale(settings)
  const [regime, setRegime] = useState<Regime>(() => regimePredefinito(settings))
  const elenco = useMemo(() => scadenzePer(profilo, regime), [profilo, regime])
  const [scelte, setScelte] = useState<Record<string, boolean>>({})
  const scelta = (id: string, consigliata: boolean) => scelte[id] ?? consigliata
  const giaPresenti = new Set(esistenti.map((t) => t.toLowerCase()))
  const daCreare = ricorrenzeDa(elenco.filter((x) => scelta(x.id, x.consigliata))).filter((r) => !giaPresenti.has(r.titolo.toLowerCase()))
  const aggiungi = async () => {
    const fatti = await run(async () => { let n = 0; for (const r of daCreare) { await api.gestione('ricorrenza', { ...r, attiva: 1 }); n++ } return n })
    if (fatti !== undefined) { toast(fatti ? `Aggiunte ${fatti} scadenze ricorrenti` : 'Le scadenze scelte erano già presenti'); onClose() }
  }
  return <Modal title="Scadenze fiscali ricorrenti" subtitle="IVA, F24, imposte e contributi: TIO crea un compito con il promemoria a ogni scadenza" width={760} onClose={onClose} protectChanges={false}
    footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" disabled={!daCreare.length} onClick={aggiungi}><CalendarClock size={15} /> {daCreare.length ? `Aggiungi ${daCreare.length} ${daCreare.length === 1 ? 'scadenza' : 'scadenze'}` : 'Nessuna scadenza nuova'}</Btn></>}>
    <div className="scadenze-fiscali">
      <p className="fattura-xml-nota"><Info size={15} aria-hidden /> Date ordinarie del calendario fiscale: proroghe, sabati e festivi possono spostarle. Verifica con il commercialista quali ti riguardano; ogni scadenza resta modificabile o eliminabile tra le attività ricorrenti.</p>
      <Field label="Regime IVA"><Select value={regime} onChange={(e) => setRegime(e.target.value as Regime)}>
        <option value="trimestrale">Ordinario, liquidazione IVA trimestrale</option><option value="mensile">Ordinario, liquidazione IVA mensile</option><option value="forfettario">Forfettario (senza IVA)</option>
      </Select></Field>
      <ul className="scadenze-elenco">
        {elenco.map((x) => {
          const righe = ricorrenzeDa([x])
          const tutteGia = righe.every((r) => giaPresenti.has(r.titolo.toLowerCase()))
          return <li key={x.id}><label className="check">
            <input type="checkbox" checked={scelta(x.id, x.consigliata) && !tutteGia} disabled={tutteGia} onChange={(e) => setScelte((s) => ({ ...s, [x.id]: e.target.checked }))} />
            <span><b>{x.titolo}</b><span className="muted small">{x.descrizione}{tutteGia ? ' · già presente' : ` · prossima: ${fmtDate(primoLavorativo(righe.map((r) => r.prossima).sort()[0]))}`}</span></span>
          </label></li>
        })}
      </ul>
    </div>
  </Modal>
}
