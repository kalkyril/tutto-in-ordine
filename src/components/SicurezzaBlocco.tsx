import { useState } from 'react'
import { SettingsGroup, SettingsRow } from './SettingsGroup'
import { api } from '../api'
import { Btn, Field, FormGrid, Input, Select, useAction } from './ui'
import { useBlocco } from './LockGate'

const OPZIONI_MINUTI = [{ v: 0, l: 'Mai (solo con il pulsante o quando blocchi lo schermo)' }, { v: 5, l: 'Dopo 5 minuti' }, { v: 15, l: 'Dopo 15 minuti' }, { v: 30, l: 'Dopo 30 minuti' }, { v: 60, l: 'Dopo 1 ora' }]

/** Impostazioni del blocco con password. */
export function SicurezzaBlocco() {
  const { attivo, minuti, aggiorna } = useBlocco()
  const run = useAction()
  const [nuova, setNuova] = useState('')
  const [ripeti, setRipeti] = useState('')
  const [attuale, setAttuale] = useState('')
  const [min, setMin] = useState(15)
  const valida = nuova.length >= 6 && nuova === ripeti && (!attivo || !!attuale)
  const salva = async () => {
    if (await run(() => api.impostaBlocco(nuova, attivo ? minuti : min, attuale || undefined), attivo ? 'Password cambiata' : 'Blocco attivato')) { setNuova(''); setRipeti(''); setAttuale(''); await aggiorna() }
  }
  const rimuovi = async () => { if (await run(() => api.rimuoviBlocco(attuale), 'Blocco rimosso')) { setAttuale(''); await aggiorna() } }
  const cambiaMinuti = async (v: number) => { if (!attuale) return; if (await run(() => api.cambiaMinutiBlocco(v, attuale), 'Salvato')) await aggiorna() }
  return (
    <SettingsGroup title="Blocco con password" footer={<><p>Non cifra il file dei dati. Per proteggere l’archivio sul computer, usa FileVault su Mac o BitLocker su Windows.</p><p>Conserva la password: se la dimentichi non c’è recupero.</p></>}>
      <SettingsRow title="Accesso a TIO" description="Proteggi l’apertura dell’app e il ritorno dopo l’inattività.">
        <span className="settings-state">{attivo ? 'Attivo' : 'Non attivo'}</span>
      </SettingsRow>
      <details className="settings-disclosure">
        <summary>{attivo ? 'Gestisci password e blocco' : 'Configura il blocco con password'}<span className="settings-chevron" aria-hidden="true" /></summary>
        <div className="settings-disclosure-body">
          <FormGrid>
            {attivo && <Field label="Password attuale" span={2}><Input type="password" autoComplete="current-password" value={attuale} onChange={(e) => setAttuale(e.target.value)} /></Field>}
            <Field label={attivo ? 'Nuova password (almeno 6 caratteri)' : 'Password (almeno 6 caratteri)'}><Input type="password" autoComplete="new-password" value={nuova} onChange={(e) => setNuova(e.target.value)} /></Field>
            <Field label="Ripeti la password" hint={ripeti && nuova !== ripeti ? 'Le due password non coincidono' : undefined}><Input type="password" autoComplete="new-password" value={ripeti} onChange={(e) => setRipeti(e.target.value)} /></Field>
            {!attivo
              ? <Field label="Blocca automaticamente" span={2}><Select value={min} onChange={(e) => setMin(Number(e.target.value))}>{OPZIONI_MINUTI.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</Select></Field>
              : <Field label="Blocca automaticamente" span={2} hint="Per cambiarlo scrivi prima la password attuale"><Select value={minuti} disabled={!attuale} onChange={(e) => cambiaMinuti(Number(e.target.value))}>{[...new Set([minuti, ...OPZIONI_MINUTI.map((o) => o.v)])].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{OPZIONI_MINUTI.find((o) => o.v === v)?.l || `Dopo ${v} minuti`}</option>)}</Select></Field>}
          </FormGrid>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <Btn variant="primary" onClick={salva} disabled={!valida}>{attivo ? 'Cambia password' : 'Attiva il blocco'}</Btn>
            {attivo && <Btn variant="danger" onClick={rimuovi} disabled={!attuale}>Rimuovi il blocco</Btn>}
          </div>
        </div>
      </details>
    </SettingsGroup>
  )
}
