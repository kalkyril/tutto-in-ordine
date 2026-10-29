import { useEffect, useState } from 'react'
import { Briefcase, FlaskConical, Gavel } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { Btn, ColorPicker, Field, Input, Modal, useAction } from './ui'
import { COLORE_BRAND_PREDEFINITO, NOME_APP, PRESET_AVVOCATO, PRESET_PROFESSIONISTA, PRESET_IMPRESA } from '../lib/defaults'

function Scelta({ attivo, onSelect, icona, titolo, testo }: { attivo: boolean; onSelect: () => void; icona: React.ReactNode; titolo: string; testo: string }) {
  return (
    <button type="button" className={`scelta ${attivo ? 'on' : ''}`} onClick={onSelect} aria-pressed={attivo}>
      <span className="scelta-ico">{icona}</span><b>{titolo}</b><small>{testo}</small>
    </button>
  )
}

/** Schermata di benvenuto al primo avvio: ogni studio o ditta imposta il proprio nome, il tipo di attività e il colore. */
export function Onboarding() {
  const { settings } = useData()
  const run = useAction()
  const [profilo, setProfilo] = useState<'avvocato' | 'professionista' | 'ditta'>('avvocato')
  const [nome, setNome] = useState('')
  const [titolare, setTitolare] = useState('')
  const [colore, setColore] = useState(COLORE_BRAND_PREDEFINITO)
  // nelle versioni di prova (beta) il benvenuto dice cosa aspettarsi e come proteggere i dati
  const [prova, setProva] = useState(false)
  useEffect(() => { api.appInfo().then((i: { version?: string }) => setProva(/beta|alpha|rc/i.test(i?.version || ''))).catch(() => {}) }, [])
  const cifratura = window.mngmnt.platform === 'darwin' ? 'FileVault' : window.mngmnt.platform === 'win32' ? 'BitLocker' : 'la cifratura del disco'

  const conferma = async () => {
    const nomeP = nome.trim()
    if (!nomeP) return
    const preset = profilo === 'ditta' ? PRESET_IMPRESA : profilo === 'professionista' ? PRESET_PROFESSIONISTA : PRESET_AVVOCATO
    await run(() => api.setSettings({
      ...preset,
      studio: { ...settings.studio, nome: nomeP, titolare: titolare.trim(), intestazione: settings.studio.intestazione || nomeP },
      brand_colore: colore, onboarding_fatto: true,
    }))
  }
  const piuTardi = () => run(() => api.setSettings({ onboarding_fatto: true }))

  return (
    <Modal title={`Benvenuto in ${NOME_APP}`} subtitle="Personalizza l'app con i dati della tua attività: potrai cambiarli quando vuoi dalle Impostazioni." width={620} onClose={piuTardi}
      footer={<><Btn variant="ghost" onClick={piuTardi}>Più tardi</Btn><Btn variant="primary" onClick={conferma} disabled={!nome.trim()}>Inizia</Btn></>}>
      <form onSubmit={(e) => { e.preventDefault(); conferma() }}>
        {prova && <p className="avviso-prova" role="note"><FlaskConical size={16} aria-hidden="true" /><span><b>Versione di prova.</b> I calcoli di compensi e termini sono indicativi: verificali sempre. L'archivio sul computer non è cifrato: proteggi il computer con {cifratura} e attiva il backup cifrato. Se qualcosa non va: Aiuto › Segnala un problema.</span></p>}
        <div className="scelte">
          <Scelta attivo={profilo === 'avvocato'} onSelect={() => setProfilo('avvocato')} icona={<Gavel size={22} />} titolo="Studio legale" testo="Pratiche, udienze, parcelle con CPA e calcolo dei compensi forensi" />
          <Scelta attivo={profilo === 'professionista'} onSelect={() => setProfilo('professionista')} icona={<Briefcase size={22} />} titolo="Libero professionista" testo="Incarichi, ore, clienti, preventivi e incassi" />
          <Scelta attivo={profilo === 'ditta'} onSelect={() => setProfilo('ditta')} icona={<Briefcase size={22} />} titolo="Ditta individuale" testo="Commesse, fornitori, costi, scadenze e preventivi" />
        </div>
        <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
          <Field label={profilo === 'avvocato' ? "Nome dello studio *" : "Nome della ditta o dell'attività *"} hint="Comparirà nel menu laterale, nel titolo della finestra e nei documenti">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={profilo === 'avvocato' ? 'Es. Studio Legale Rossi' : profilo === 'professionista' ? 'Es. Studio di consulenza Rossi' : 'Es. Rossi Impianti di Mario Rossi'} autoFocus />
          </Field>
          <Field label="Il tuo nome (facoltativo)" hint="Per il saluto nella panoramica">
            <Input value={titolare} onChange={(e) => setTitolare(e.target.value)} placeholder={profilo === 'avvocato' ? 'Es. Avv. Mario Rossi' : 'Es. Mario'} />
          </Field>
          <Field label="Colore principale"><ColorPicker value={colore} onChange={setColore} /></Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
