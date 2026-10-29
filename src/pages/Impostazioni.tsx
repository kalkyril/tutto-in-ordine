import { stableJson } from '../lib/equal'
import { BackupPanel } from '../components/BackupPanel'
import { AggiornamentiImpostazioni } from '../components/Aggiornamenti'
import { SettingsGroup, SettingsRow } from '../components/SettingsGroup'
import { useEffect, useRef, useState } from 'react'
import { SicurezzaBlocco } from '../components/SicurezzaBlocco'
import { DocumentiImpostazioni } from '../components/DocumentiImpostazioni'
import { Bell, Briefcase, Building2, ImagePlus, FolderOpen, Palette, Plus, Receipt, Save, Tag, Trash2, X, BookOpen } from 'lucide-react'
import { api } from '../api'
import { mergeSettings, useData } from '../store'
import { Btn, Field, FormGrid, Input, PageHeader, Segmented, Select, Tabs, useAction, useFeedback } from '../components/ui'
import { PromemoriaElenco } from '../components/forms'
import { ModelloPdfEditor } from '../components/ModelloPdfEditor'
import { SegnalaProblemaModal } from '../components/SegnalaProblema'
import { CalendariPanel, ImportPanel } from '../components/Integrazioni'
import { modelloEffettivo } from '../lib/modello'
import { useNav } from '../nav'
import { leggiImmagine } from '../lib/immagine'
import { ColorPicker } from '../components/ui'
import { PRESET_AVVOCATO, PRESET_PROFESSIONISTA, PRESET_IMPRESA } from '../lib/defaults'
import { parseNumber } from '../lib/format'
import type { Settings } from '../types'

type Tab = 'generale' | 'studio' | 'integrazioni' | 'documenti' | 'modello' | 'avvisi' | 'pratiche' | 'fiscale' | 'backup'

export default function Impostazioni() {
  const { settings } = useData()
  const run = useAction()
  const { confirm, toast } = useFeedback()
  const { route, guard } = useNav()
  const [tab, setTab] = useState<Tab>((route.tab as Tab) || 'generale')
  useEffect(() => { if (route.tab) setTab(route.tab as Tab) }, [route]) // un comando del menu o una notifica può chiedere una scheda precisa
  const [d, setD] = useState<Settings>(settings)
  const [info, setInfo] = useState<any>(null)
  const [segnala, setSegnala] = useState(false)
  const dirty = stableJson(d) !== stableJson(settings)
  useEffect(() => { api.appInfo().then(setInfo) }, [])
  const baseline = useRef(settings)
  useEffect(() => {
    const old = baseline.current
    setD((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(settings)) if (stableJson(prev[key]) === stableJson(old[key])) next[key] = settings[key]
      return next
    })
    baseline.current = settings
  }, [settings])
  useEffect(() => { if (dirty) return guard(() => confirm({ title: 'Impostazioni non salvate', text: 'Vuoi uscire e perdere le modifiche?', ok: 'Scarta modifiche', danger: true })) }, [dirty, guard, confirm])
  useEffect(() => {
    if (!dirty) return
    const stop = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', stop); return () => window.removeEventListener('beforeunload', stop)
  }, [dirty])
  const up = <K extends keyof Settings>(k: K, v: Settings[K]) => setD((x) => ({ ...x, [k]: v }))
  const upIn = (k: 'studio' | 'aliquote' | 'etichette', sub: string, v: any) => setD((x) => ({ ...x, [k]: { ...(x[k] as any), [sub]: v } }))
  const save = async () => { const saved = await run(() => api.setSettings(d), 'Impostazioni salvate'); if (saved) { const merged = mergeSettings(saved); baseline.current = merged; setD(merged) } }

  const applyPreset = async (p: 'avvocato' | 'ditta' | 'professionista') => {
    if (await confirm({ title: p === 'ditta' ? 'Passare a “Ditta individuale”?' : p === 'professionista' ? 'Passare a “Libero professionista”?' : 'Passare a “Studio legale”?', text: 'Cambia etichette, tipologie di pratica e aliquote fiscali predefinite. I dati esistenti non vengono modificati.', ok: 'Applica' })) {
      setD((x) => mergeSettings({ ...x, ...(p === 'ditta' ? PRESET_IMPRESA : p === 'professionista' ? PRESET_PROFESSIONISTA : PRESET_AVVOCATO) }))
    }
  }

  return (
    <div className="page impostazioni">
      {/* Salva e Annulla restano sempre al loro posto (attenuati finché non c'è nulla da salvare): comparendo spostavano la pagina */}
      <PageHeader title="Impostazioni" actions={<div className={`azioni-salvataggio ${dirty ? '' : 'inattive'}`}>
        <Btn variant="ghost" disabled={!dirty} onClick={() => setD(settings)} title={dirty ? undefined : 'Nessuna modifica da annullare'}>Annulla modifiche</Btn>
        <Btn variant="primary" disabled={!dirty} onClick={save} title={dirty ? undefined : 'Nessuna modifica da salvare'}><Save size={16} /> Salva</Btn>
      </div>} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'generale', label: 'Generale' }, { id: 'studio', label: d.profilo === 'ditta' ? 'La tua attività' : 'Studio' }, { id: 'integrazioni', label: 'Integrazioni' }, { id: 'documenti', label: 'Documenti' }, { id: 'modello', label: 'Modello PDF' }, { id: 'avvisi', label: 'Avvisi' }, { id: 'pratiche', label: 'Pratiche e colori' }, { id: 'fiscale', label: 'Fiscale' }, { id: 'backup', label: 'Backup e sicurezza' }]} />

      {tab === 'generale' && (
        <div className="stack">
          <section className="card pad-lg">
            <h2><Building2 size={16} /> Identità</h2>
            <p className="muted small">Personalizza l'interfaccia con i dati della tua attività: nome, colore e logo compaiono nel menu laterale, nel titolo della finestra e nei documenti.</p>
            <FormGrid>
              <Field label="Nome dello studio o della ditta"><Input value={d.studio.nome} onChange={(e) => upIn('studio', 'nome', e.target.value)} placeholder={d.profilo === 'ditta' ? 'Es. Impianti Galli' : 'Es. Studio Legale Rossi'} /></Field>
              <Field label="Il tuo nome (per il saluto)"><Input value={d.studio.titolare || ''} onChange={(e) => upIn('studio', 'titolare', e.target.value)} placeholder={d.profilo === 'ditta' ? 'Es. Marco Galli' : 'Es. Avv. Mario Rossi'} /></Field>
              <Field label="Colore principale" span={2}><ColorPicker value={d.brand_colore} onChange={(c) => up('brand_colore', c)} /></Field>
              <Field label="Logo nel menu laterale" span={2}>
                <div className="row wrap">
                  <input id="brand-logo-file" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { up('brand_logo', await leggiImmagine(f)) } catch (err: any) { toast(err.message, 'err') } } }} />
                  <Btn size="sm" onClick={() => document.getElementById('brand-logo-file')?.click()}><ImagePlus size={14} /> {d.brand_logo ? 'Cambia logo…' : 'Scegli logo…'}</Btn>
                  {d.brand_logo && <><img src={d.brand_logo} alt="Logo" className="logo-mini" /><Btn size="sm" variant="ghost" onClick={() => up('brand_logo', null)}><Trash2 size={14} /> Rimuovi</Btn></>}
                </div>
              </Field>
            </FormGrid>
          </section>
          <section className="card pad-lg">
            <h2><Briefcase size={16} /> Tipo di attività</h2>
            <p className="muted small">Adatta termini e campi: lo studio legale usa autorità giudiziaria, N. RG, CPA; la ditta individuale usa un linguaggio più generico.</p>
            <Segmented value={d.profilo === 'avvocato' ? 'avvocato' : d.attivita === 'professionista' ? 'professionista' : 'ditta'} onChange={(v) => applyPreset(v)} options={[{ id: 'avvocato', label: 'Studio legale' }, { id: 'professionista', label: 'Libero professionista' }, { id: 'ditta', label: 'Ditta individuale' }]} />
            <h3 className="sub-title" style={{ marginTop: 16 }}>Termini usati nell'app</h3>
            <FormGrid cols={3}>
              {(['pratica', 'pratiche', 'cliente', 'clienti', 'controparte', 'autorita', 'rg', 'giudice', 'parcella', 'parcelle'] as const).map((k) => (
                <Field key={k} label={k === 'autorita' ? 'Autorità' : k === 'rg' ? 'N. RG / riferimento' : k === 'giudice' ? 'Giudice / referente' : k[0].toUpperCase() + k.slice(1)}>
                  <Input value={d.etichette[k]} onChange={(e) => upIn('etichette', k, e.target.value)} />
                </Field>
              ))}
            </FormGrid>
          </section>
          <section className="card pad-lg">
            <h2><Palette size={16} /> Aspetto e comportamento</h2>
            <FormGrid>
              <Field label="Tema"><Segmented value={d.tema} onChange={(v) => up('tema', v)} options={[{ id: 'auto', label: 'Automatico' }, { id: 'chiaro', label: 'Chiaro' }, { id: 'scuro', label: 'Scuro' }]} /></Field>
            </FormGrid>
            <label className="check big"><input type="checkbox" checked={d.vista_compatta} onChange={(e) => up('vista_compatta', e.target.checked)} /> <span><b>Vista compatta</b><small>Riduce gli spazi delle liste per mostrare più informazioni.</small></span></label>
            <label className="check big"><input type="checkbox" checked={d.resta_in_background} onChange={(e) => up('resta_in_background', e.target.checked)} /> <span><b>Resta attiva in background alla chiusura della finestra</b><small>Necessario per ricevere gli avvisi anche quando la finestra è chiusa. Per uscire usa il menu dell'icona nella barra di sistema.</small></span></label>
            <label className="check big"><input type="checkbox" checked={d.avvia_al_login} onChange={(e) => up('avvia_al_login', e.target.checked)} /> <span><b>Avvia TIO all'accesso al computer</b><small>Così gli avvisi funzionano fin dall'accensione (Mac e Windows).</small></span></label>
          </section>
        </div>
      )}

      {tab === 'studio' && (
        <section className="card pad-lg">
          <h2>Dati della tua attività</h2><p className="muted small">Compaiono nell'intestazione di {d.etichette.parcelle.toLowerCase()}, preventivi, note pro forma e documenti creati dai modelli.</p>
          <FormGrid>
            <Field label="Nome dello studio o della ditta"><Input value={d.studio.nome} onChange={(e) => upIn('studio', 'nome', e.target.value)} placeholder={d.profilo === 'ditta' ? 'Impianti Galli' : 'Studio Legale Rossi'} /></Field>
            <Field label="Intestazione dei documenti" hint="Se vuota si usa il nome dello studio o della ditta"><Input value={d.studio.intestazione} onChange={(e) => upIn('studio', 'intestazione', e.target.value)} placeholder="Avv. Mario Rossi" /></Field>
            <Field label="Indirizzo"><Input value={d.studio.indirizzo} onChange={(e) => upIn('studio', 'indirizzo', e.target.value)} /></Field>
            <Field label="CAP e città"><Input value={d.studio.cap_citta} onChange={(e) => upIn('studio', 'cap_citta', e.target.value)} /></Field>
            <Field label="Codice fiscale"><Input value={d.studio.cf} onChange={(e) => upIn('studio', 'cf', e.target.value.toUpperCase())} /></Field>
            <Field label="Partita IVA"><Input value={d.studio.piva} onChange={(e) => upIn('studio', 'piva', e.target.value)} /></Field>
            <Field label="Telefono"><Input value={d.studio.telefono} onChange={(e) => upIn('studio', 'telefono', e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={d.studio.email} onChange={(e) => upIn('studio', 'email', e.target.value)} /></Field>
            <Field label="PEC"><Input type="email" value={d.studio.pec} onChange={(e) => upIn('studio', 'pec', e.target.value)} /></Field>
            <Field label="Domicilio fiscale"><Input value={d.studio.domicilio_fiscale} onChange={(e) => upIn('studio', 'domicilio_fiscale', e.target.value)} placeholder="Via … n. … - CAP Città" /></Field>
            <Field label="IBAN"><Input value={d.studio.iban} onChange={(e) => upIn('studio', 'iban', e.target.value.toUpperCase())} /></Field>
            <Field label="Banca (riga sotto l'IBAN)"><Input value={d.studio.banca} onChange={(e) => upIn('studio', 'banca', e.target.value)} placeholder="PRESSO BANCA … FILIALE DI …" /></Field>
          </FormGrid>
        </section>
      )}

      {tab === 'integrazioni' && <div className="stack"><CalendariPanel /><ImportPanel /></div>}

      {tab === 'modello' && (
        <section className="card pad-lg largo">
          <h2>Modello dei documenti PDF</h2>
          <p className="muted small">Personalizza testi, immagini e font della nota pro forma. L’anteprima mostra il foglio A4 intero e si aggiorna mentre lavori. Ricordati di salvare.</p>
          <div style={{ marginTop: 14 }}><ModelloPdfEditor settings={d} value={modelloEffettivo(d)} onChange={(m) => up('modello_pdf', m)} /></div>
        </section>
      )}

      {tab === 'avvisi' && (
        <div className="stack">
          <section className="card pad-lg">
            <h2><Bell size={16} /> Avvisi per scadenze e compiti</h2>
            <p className="muted small">TIO controlla ogni 30 secondi, anche con la finestra chiusa (se “resta attiva in background” è abilitato). Gli avvisi non ricevuti perché il computer era spento ti vengono mostrati all'avvio, se l'evento non è passato da più di 24 ore.</p>
            <FormGrid cols={3}>
              <Field label="Promemoria predefiniti per le nuove scadenze"><PromemoriaElenco value={d.promemoria_default} onChange={(v) => up('promemoria_default', v)} vuoto="Nessun avviso: le nuove scadenze non avranno promemoria." /></Field>
            </FormGrid>
            <FormGrid cols={3}>
              <Field label="Ora per eventi “tutto il giorno”" hint="Gli avvisi di scadenze senza orario si basano su quest'ora">
                <Select value={d.ora_default_giornata} onChange={(e) => up('ora_default_giornata', Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</Select>
              </Field>
            </FormGrid>
            <label className="check big"><input type="checkbox" checked={d.notifiche_riservate} onChange={(e) => up('notifiche_riservate', e.target.checked)} /> <span><b>Nascondi i dettagli nelle notifiche del sistema</b><small>Mostra un avviso generico; con l’app bloccata i dettagli sono sempre nascosti.</small></span></label>
            <label className="check big"><input type="checkbox" checked={d.notifiche_desktop} onChange={(e) => up('notifiche_desktop', e.target.checked)} /> <span><b>Notifiche del sistema operativo</b><small>Se disattivate, gli avvisi restano visibili nel centro notifiche dell'app (campanella).</small></span></label>
            <label className="check big"><input type="checkbox" checked={d.riepilogo_giornaliero} onChange={(e) => up('riepilogo_giornaliero', e.target.checked)} /> <span><b>Riepilogo giornaliero</b><small>Una notifica al primo avvio di ogni giorno con scadenze di oggi, in ritardo e attività.</small></span></label>
            <label className="check big"><input type="checkbox" checked={d.avvisa_ritardi} onChange={(e) => up('avvisa_ritardi', e.target.checked)} /> <span><b>Avvisa quando una scadenza è superata</b><small>Una sola notifica per ogni scadenza non completata.</small></span></label>
            <div style={{ marginTop: 12 }}><Btn onClick={() => run(() => api.testNotification())}><Bell size={15} /> Invia notifica di prova</Btn></div>
          </section>
        </div>
      )}

      {tab === 'pratiche' && (
        <div className="stack">
          <section className="card pad-lg">
            <h2><Tag size={16} /> Stati della pratica</h2>
            <p className="muted small">“Chiusa” = lo stato esce dalle pratiche attive. Il colore dello stato compare nelle etichette e nella vista per stato.</p>
            {d.stati_pratica.map((s, i) => (
              <div key={i} className="row stato-row">
                <Input value={s.nome} aria-label="Nome stato" onChange={(e) => up('stati_pratica', d.stati_pratica.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
                <label className="check"><input type="checkbox" checked={s.chiusa} onChange={(e) => up('stati_pratica', d.stati_pratica.map((x, j) => (j === i ? { ...x, chiusa: e.target.checked } : x)))} /> Chiusa</label>
                <input type="color" value={s.colore} aria-label="Colore stato" onChange={(e) => up('stati_pratica', d.stati_pratica.map((x, j) => (j === i ? { ...x, colore: e.target.value } : x)))} />
                <button className="icon-btn" aria-label="Rimuovi" disabled={d.stati_pratica.length <= 1} onClick={() => up('stati_pratica', d.stati_pratica.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </div>
            ))}
            <Btn size="sm" onClick={() => up('stati_pratica', [...d.stati_pratica, { nome: 'Nuovo stato', chiusa: false, colore: '#64748b' }])}><Plus size={14} /> Aggiungi stato</Btn>
            <p className="muted small" style={{ marginTop: 8 }}>Se rinomini uno stato, le pratiche che lo usano vengono aggiornate quando salvi.</p>
          </section>
          <section className="card pad-lg">
            <h2>Tipologie di pratica</h2>
            <TagEditor value={d.tipi_pratica} onChange={(v) => up('tipi_pratica', v)} placeholder="Nuova tipologia…" />
          </section>
          <section className="card pad-lg">
            <h2><Palette size={16} /> Palette colori delle pratiche</h2>
            <p className="muted small">Colori proposti quando crei o modifichi una pratica (è sempre possibile scegliere un colore libero).</p>
            <div className="palette-edit">
              {d.palette.map((c, i) => (
                <span key={i} className="pal-item"><input type="color" value={c} aria-label={`Colore ${i + 1}`} onChange={(e) => up('palette', d.palette.map((x, j) => (j === i ? e.target.value : x)))} />
                  <button className="icon-btn tiny" aria-label="Rimuovi colore" disabled={d.palette.length <= 4} onClick={() => up('palette', d.palette.filter((_, j) => j !== i))}><X size={11} /></button></span>
              ))}
              <Btn size="sm" onClick={() => up('palette', [...d.palette, '#3b82f6'])} aria-label="Aggiungi un colore alla palette" title="Aggiungi un colore"><Plus size={14} /></Btn>
            </div>
          </section>
        </div>
      )}

      {tab === 'fiscale' && (
        <section className="card pad-lg">
          <h2><Receipt size={16} /> Aliquote predefinite dei documenti</h2>
          <p className="muted small">Valori proposti nei nuovi documenti; restano modificabili documento per documento. Verifica sempre con il tuo commercialista.</p>
          <FormGrid cols={3}>
            {d.profilo === 'avvocato' && <Field label="Spese generali (%)"><Input inputMode="decimal" value={d.aliquote.sg} onChange={(e) => upIn('aliquote', 'sg', parseNumber(e.target.value))} /></Field>}
            <Field label={d.profilo === 'avvocato' ? 'CPA (%)' : 'Contributo / rivalsa (%)'}><Input inputMode="decimal" value={d.aliquote.cpa} onChange={(e) => upIn('aliquote', 'cpa', parseNumber(e.target.value))} /></Field>
            {d.profilo !== 'avvocato' && <><Field label="Denominazione contributo"><Input value={d.contributo_nome || 'Contributo previdenziale'} onChange={e=>up('contributo_nome',e.target.value)} /></Field><Field label="Base della ritenuta"><label className="check"><input type="checkbox" checked={!!d.contributo_ritenuta} onChange={e=>up('contributo_ritenuta',e.target.checked)} /> Includi il contributo nella base della ritenuta</label></Field><p className="muted small" style={{gridColumn:'1 / -1'}}>Il contributo si calcola su compensi e spese imponibili e concorre alla base IVA. Configura aliquote e trattamento con il commercialista; il profilo non determina automaticamente il regime fiscale.</p></>}
            <Field label="IVA (%)"><Input inputMode="decimal" value={d.aliquote.iva} onChange={(e) => upIn('aliquote', 'iva', parseNumber(e.target.value))} /></Field>
            <Field label="Ritenuta d'acconto (%)"><Input inputMode="decimal" value={d.aliquote.rit} onChange={(e) => upIn('aliquote', 'rit', parseNumber(e.target.value))} /></Field>
            <Field label="Bollo (€)" hint="Applicato se IVA 0% e importo > 77,47 €"><Input inputMode="decimal" value={d.aliquote.bollo} onChange={(e) => upIn('aliquote', 'bollo', parseNumber(e.target.value))} /></Field>
            <Field label="Tariffa oraria predefinita (€)"><Input inputMode="decimal" value={d.tariffa_oraria} onChange={(e) => up('tariffa_oraria', parseNumber(e.target.value))} /></Field>
          </FormGrid>
          <p className="muted small">{d.profilo === 'ditta' ? `Le aliquote valgono per i nuovi documenti; quelli già emessi non cambiano. PDF e Word esportati da altri programmi si importano dalla pagina ${d.etichette.parcelle}.` : 'I parametri forensi sono calcolati localmente dalle tabelle normative incluse. PDF e Word esportati da altri strumenti si importano dalla pagina Parcelle.'}</p>
        </section>
      )}

      {tab === 'documenti' && <DocumentiImpostazioni d={d} up={up} />}

      {tab === 'backup' && (
        <div className="backup-settings">
          <BackupPanel d={d} up={up} />
          <SicurezzaBlocco />
          <AggiornamentiImpostazioni d={d} up={up} versione={info?.version} disponibile={!!info?.aggiornamenti} />
          <SettingsGroup title="Informazioni">
            <SettingsRow title="Versione di TIO" description={info ? `Electron ${info.electron}` : undefined}>
              <span className="settings-value">{info?.version || 'Caricamento…'}</span>
            </SettingsRow>
            <SettingsRow title="Archivio sul computer" description={info && <span className="settings-path">{info.dataDir}</span>}>
              <Btn onClick={() => run(() => api.openDataDir())}><FolderOpen size={15} /> Apri cartella dati</Btn>
            </SettingsRow>
            <SettingsRow title="Segnala un problema" description="Prepara le informazioni e il registro degli errori da inviare a chi ti ha dato TIO.">
              <Btn onClick={() => setSegnala(true)}>Segnala un problema…</Btn>
            </SettingsRow>
            <SettingsRow title="Guida di TIO" description="Il manuale completo, sezione per sezione: si apre nel browser e funziona anche senza internet.">
              <Btn onClick={() => run(() => api.apriGuida())}><BookOpen size={15} /> Apri la guida</Btn>
            </SettingsRow>
            <SettingsRow title="Licenze e componenti" description="Consulta le condizioni dei software inclusi.">
              <Btn onClick={() => run(() => api.openLicenses())}>Licenze e componenti</Btn>
            </SettingsRow>
            <SettingsRow title="Sorgenti e attribuzioni" description="Accedi ai materiali disponibili anche offline.">
              <Btn onClick={() => run(() => api.openLicenseFolder())}>Cartella licenze e sorgenti</Btn>
            </SettingsRow>
          </SettingsGroup>
        </div>
      )}
      {segnala && <SegnalaProblemaModal onClose={() => setSegnala(false)} />}
    </div>
  )
}

function TagEditor({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [t, setT] = useState('')
  const add = () => { const v = t.trim(); if (v && !value.includes(v)) onChange([...value, v]); setT('') }
  return (
    <div>
      <div className="chips">{value.map((v) => <span key={v} className="chip on static">{v}<button aria-label={`Rimuovi ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}><X size={12} /></button></span>)}</div>
      <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); add() }}><Input value={t} onChange={(e) => setT(e.target.value)} placeholder={placeholder} style={{ maxWidth: 260 }} /><Btn size="sm" type="submit" disabled={!t.trim()}><Plus size={14} /> Aggiungi</Btn></form>
    </div>
  )
}
