import { useEffect, useState } from 'react'
import { Check, Clock3, DatabaseBackup, ShieldCheck, Upload } from 'lucide-react'
import { SettingsGroup, SettingsRow, SettingsToggle } from './SettingsGroup'
import { api } from '../api'
import { useData } from '../store'
import { fmtDateTime, ymdhm } from '../lib/dates'
import type { Settings } from '../types'
import { Btn, Field, Input, Modal, useAction, useFeedback } from './ui'

export function BackupPanel({ d, up }: { d: Settings; up: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const { settings } = useData()
  const run = useAction(), { toast, confirm } = useFeedback()
  const [mode, setMode] = useState<'encrypted' | 'auto' | 'restore' | 'verify' | null>(null)
  const [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [busy, setBusy] = useState(false)
  const [keyStatus, setKeyStatus] = useState<{ enabled: boolean; available: boolean } | null>(null)
  useEffect(() => { api.backupKeyStatus().then(setKeyStatus).catch(() => setKeyStatus(null)) }, [])
  // cartella predefinita reale: Documenti › TIO Backup, su Windows la cartella utente (la protezione ransomware blocca Documenti)
  const [predefinita, setPredefinita] = useState('')
  useEffect(() => { api.appInfo().then((i: { cartelle?: { backup?: string } }) => setPredefinita(i?.cartelle?.backup || '')).catch(() => {}) }, [])
  const creating = mode === 'encrypted' || mode === 'auto'
  const open = (m: typeof mode) => { setPassword(''); setRepeat(''); setMode(m) }
  const execute = async () => {
    setBusy(true)
    try {
      if (mode === 'auto') {
        const result = await run(() => api.backupKeyConfigure(password))
        if (result) { setKeyStatus(result); setMode(null); setPassword(''); setRepeat(''); toast('Cifratura dei backup automatici attivata. Conserva la password anche fuori dal computer.') }
        return
      }
      const result = await run<string | Awaited<ReturnType<typeof api.restore>>>(() => mode === 'encrypted'
        ? api.backup(d.backup_cartella || undefined, { includeLinked: d.backup_documenti, password })
        : api.restore(password, mode === 'verify'))
      if (result) {
        toast(typeof result === 'string' ? 'Backup cifrato creato in ' + result : result.valido ? `Backup valido: ${result.documenti || 0} documenti inclusi, ${result.mancanti || 0} mancanti. ${result.integritaFile ? 'Impronte dei file verificate.' : 'Backup precedente: integrità dei file non verificabile con impronte.'}` : 'Backup ripristinato. Copia di sicurezza in ' + result.safety)
        setMode(null); setPassword(''); setRepeat('')
      }
    } finally { setBusy(false) }
  }
  const last = settings.backup_ultimo
  const overdue = !last || Date.now() - Date.parse(last) > 48 * 3600000
  return <>
    <section className="backup-summary" aria-labelledby="backup-summary-title">
      <span className="backup-summary-icon" aria-hidden="true"><DatabaseBackup size={26} /></span>
      <div className="settings-row-copy">
        <h2 id="backup-summary-title">Backup</h2>
        <p>Una copia al sicuro del tuo lavoro, pronta quando serve.</p>
        <div role="status" className={`backup-last-status${settings.backup_esito === 'errore' ? ' danger' : ''}`}>
          {settings.backup_esito === 'errore' ? <><span>Backup non riuscito</span><p>{settings.backup_errore}</p></> : last ? <><span>{overdue ? <Clock3 size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />} Ultimo backup: {fmtDateTime(ymdhm(new Date(last)))}</span>{overdue && <p>La copia risale a più di due giorni. Crea un nuovo backup.</p>}</> : <span><Clock3 size={14} aria-hidden="true" /> Nessun backup ancora eseguito.</span>}
        </div>
      </div>
    </section>

    <SettingsGroup title="Copia di sicurezza" footer="Le copie manuali si creano subito. Il backup comprende sempre l’archivio e le copie interne.">
      <SettingsToggle title="Includi i documenti collegati" description="Aggiungi anche PDF, atti e file disponibili nelle tue cartelle." checked={d.backup_documenti} onChange={value => up('backup_documenti', value)} />
      <SettingsRow title="Backup con password" description="Proteggi questa copia con una password separata.">
        <Btn variant="primary" onClick={() => open('encrypted')}><ShieldCheck size={15} /> Backup cifrato…</Btn>
      </SettingsRow>
      <SettingsRow title="Backup senza password" description="Crea una copia leggibile da chi può accedere ai file.">
        <Btn onClick={async () => { const result = await run(() => api.backup(d.backup_cartella || undefined, { includeLinked: d.backup_documenti })); if (result) toast('Backup creato in ' + result) }}>Backup non cifrato…</Btn>
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup title="Backup automatico" footer={<>
      <p>Frequenza, cartella, documenti e numero di copie si applicano con «Salva» in alto.</p>
      <details className="settings-help"><summary>Come funzionano i backup automatici</summary><div>
        <p>Il backup viene eseguito quando l’app è aperta, anche in background. Se la destinazione non è disponibile, compare un errore e l’app riprova dopo cinque minuti.</p>
        <p>La cifratura si attiva subito e la password viene ricordata nel portachiavi di sistema. Se il portachiavi non è accessibile, il backup cifrato si ferma e segnala l’errore.</p>
        <p>Le copie precedenti mantengono la loro password o restano in chiaro. Conserva le password anche fuori dal computer.</p>
      </div></details>
    </>}>
      <SettingsToggle title="Esegui un backup al giorno" description="Conserva una copia aggiornata mentre usi TIO." checked={d.backup_automatico} onChange={value => up('backup_automatico', value)} />
      <SettingsRow title="Cartella di destinazione" description={<span className="settings-path">{d.backup_cartella || predefinita || 'Cartella predefinita'}</span>}>
        <Btn onClick={async () => { const folder = await run(() => api.chooseFolder()); if (folder) up('backup_cartella', folder) }}>Scegli cartella…</Btn>
      </SettingsRow>
      <SettingsRow title="Copie automatiche da conservare" description="Le copie manuali non vengono eliminate.">
        <Input className="settings-count" aria-label="Backup da conservare" type="number" min={1} max={90} value={d.backup_mantieni} onChange={(e) => up('backup_mantieni', Math.min(90, Math.max(1, Number(e.target.value) || 7)))} />
      </SettingsRow>
      <SettingsRow title="Cifratura delle copie automatiche" description={<span role="status">{keyStatus ? keyStatus.enabled ? 'Cifratura automatica attiva. Copie protette da password.' : 'Cifratura automatica non attiva. Copie in chiaro.' : 'Stato non disponibile. Riapri questa sezione per riprovare.'}</span>}>
        <Btn disabled={!keyStatus?.available} onClick={() => open('auto')}><ShieldCheck size={15} /> {keyStatus?.enabled ? 'Cambia password automatica…' : 'Cifra i backup automatici…'}</Btn>
      </SettingsRow>
      {keyStatus?.enabled && <SettingsRow title="Disattiva la cifratura automatica" description="Le prossime copie automatiche saranno in chiaro.">
        <Btn variant="ghost" onClick={async () => {
          if (await confirm({ title: 'Disattivare la cifratura automatica?', text: 'Le prossime copie automatiche saranno in chiaro. Conserva le password delle copie già cifrate: serviranno per ripristinarle.', ok: 'Disattiva cifratura', danger: true })) {
            const result = await run(() => api.backupKeyDisable()); if (result) setKeyStatus(result)
          }
        }}>Disattiva cifratura…</Btn>
      </SettingsRow>}
      {keyStatus && !keyStatus.available && <div className="settings-inline-notice">Portachiavi di sistema non disponibile. Usa il backup cifrato manuale e conserva la password in un luogo sicuro.</div>}
    </SettingsGroup>

    <SettingsGroup title="Verifica e ripristino" footer={<details className="settings-help"><summary>Cosa viene incluso e ripristinato</summary><div><p>I documenti collegati disponibili vengono copiati e ricollegati al ripristino. Gli originali restano al loro posto. La verifica segnala eventuali file mancanti.</p><p>Il blocco dell’app non cifra l’archivio sul computer. Per proteggere anche i dati attivi, usa la cifratura del disco.</p></div></details>}>
      <SettingsRow title="Verifica una copia" description="Controlla il backup senza sostituire i dati attuali.">
        <Btn onClick={() => open('verify')}>Verifica un backup…</Btn>
      </SettingsRow>
      <SettingsRow title="Ripristina i dati" description="Sostituisci l’archivio attuale con una copia salvata.">
        <Btn onClick={() => open('restore')}><Upload size={15} /> Ripristina da backup…</Btn>
      </SettingsRow>
    </SettingsGroup>
    {mode && <Modal protectChanges={false} title={mode === 'auto' ? 'Cifra i backup automatici' : mode === 'encrypted' ? 'Crea un backup cifrato' : mode === 'verify' ? 'Verifica un backup' : 'Ripristina un backup'} onClose={() => { if (!busy) { setMode(null); setPassword(''); setRepeat('') } }} width={500}
      footer={<><Btn disabled={busy} onClick={() => { setMode(null); setPassword(''); setRepeat('') }}>Annulla</Btn><Btn variant="primary" disabled={busy || (creating && (password.length < 12 || password.length > 1024 || password !== repeat))} onClick={execute}>{busy ? 'Operazione in corso…' : mode === 'auto' ? 'Attiva cifratura' : mode === 'encrypted' ? 'Crea e scegli destinazione…' : 'Scegli il backup…'}</Btn></>}>
      <p>{creating ? 'Conserva la password in un luogo sicuro: senza di essa questa copia non può essere recuperata.' : 'Per un backup non cifrato lascia la password vuota. La verifica controlla l’archivio senza sostituire i dati.'}</p>
      {mode === 'auto' && <><p>La password viene ricordata tramite il portachiavi del sistema, separatamente dai dati. Su un altro computer servirà inserirla manualmente. Le copie precedenti non vengono ricifrate.</p><p>Il pulsante attiva subito la cifratura; cartella e frequenza si salvano con «Salva» nelle Impostazioni.</p></>}
      <Field label="Password del backup"><Input type="password" autoComplete={creating ? 'new-password' : 'off'} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {creating && <Field label="Ripeti password (almeno 12 caratteri)"><Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></Field>}
    </Modal>}
  </>
}
