import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useData } from './store'
import { useNav } from './nav'
import { Sidebar, SearchPalette, Topbar } from './components/Shell'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Pratiche = lazy(() => import('./pages/Pratiche'))
const PraticaDetail = lazy(() => import('./pages/PraticaDetail'))
const Agenda = lazy(() => import('./pages/Agenda'))
const TodoPage = lazy(() => import('./pages/Todo'))
const AnagraficaPage = lazy(() => import('./pages/Anagrafica'))
const ParcellePage = lazy(() => import('./pages/Parcelle'))
const Collegamenti = lazy(() => import('./pages/Collegamenti'))
const DaPagare = lazy(() => import('./pages/DaPagare'))
const DocumentiPage = lazy(() => import('./pages/Documenti'))
const Anonimizza = lazy(() => import('./pages/Anonimizza'))
const Impostazioni = lazy(() => import('./pages/Impostazioni'))
import { Onboarding } from './components/Onboarding'
import { ErrorBoundary } from './components/ErrorBoundary'
import { CollegaFileModal } from './components/CollegaFile'
import { useZonaFile } from './lib/trascina'
import { useEditors } from './components/editors'
import { CalcoloTerminiModal } from './components/CalcoloTermini'
import { SegnalaProblemaModal } from './components/SegnalaProblema'
import { azioniRapide } from './lib/azioni'
import { applicaBrand, nomeAttivita } from './lib/brand'
import { api } from './api'
import { useAction, useFeedback } from './components/ui'

export default function App() {
  const { route, go } = useNav()
  const { settings, ready, error, loading, reload } = useData()
  const [search, setSearch] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    try { return localStorage.getItem('mngmnt-sidebar') !== 'hidden' } catch { return true }
  })
  const toggleSidebar = () => setSidebarVisible((visible) => {
    try { localStorage.setItem('mngmnt-sidebar', visible ? 'hidden' : 'visible') } catch { /* preferenza facoltativa */ }
    return !visible
  })
  const ed = useEditors()
  const [termini, setTermini] = useState(false)
  const [segnala, setSegnala] = useState(false)
  const run = useAction()
  const { toast, confirm } = useFeedback()
  // «Controlla aggiornamenti…» dal menu: si apre la sezione delle Impostazioni e si chiede subito a GitHub (richiesta voluta dall'utente)
  const controllaAggiornamenti = useCallback(async () => {
    go({ page: 'impostazioni', tab: 'backup' })
    const [r, info] = await Promise.all([run(() => api.controllaAggiornamenti()), api.appInfo().catch(() => null)])
    if (r) toast(r.nuova ? `È disponibile TIO ${r.versione}` : `Nessuna versione più recente: usi già TIO ${info?.version || ''}`.trim())
  }, [go, run, toast])
  // una volta sola, finito il benvenuto (anche dopo un aggiornamento): TIO chiede se avvisare delle nuove versioni.
  // Fino alla risposta il controllo resta spento; si cambia poi da Impostazioni › Backup e sicurezza › Aggiornamenti.
  const chiesto = useRef(false)
  useEffect(() => {
    if (!ready || !settings.onboarding_fatto || settings.aggiornamenti_chiesto || settings.aggiornamenti_controllo === true || chiesto.current) return
    chiesto.current = true
    api.appInfo().then(async (info: { chiediAggiornamenti?: boolean }) => {
      if (!info?.chiediAggiornamenti) return
      const si = await confirm({ title: 'Vuoi sapere quando esce una nuova versione?', text: 'Una volta al giorno TIO chiede a GitHub il numero dell’ultima versione pubblicata e, se ce n’è una nuova, ti avvisa. Non invia dati dell’archivio e non installa nulla da solo. Puoi cambiare idea da Impostazioni › Backup e sicurezza.', ok: 'Avvisami', cancel: 'Non ora' })
      await run(() => api.setSettings({ aggiornamenti_chiesto: true, aggiornamenti_controllo: si }))
    }).catch(() => {})
  }, [ready, settings.onboarding_fatto, settings.aggiornamenti_chiesto, settings.aggiornamenti_controllo, confirm, run])
  const azioni = azioniRapide({ go, apri: ed.open, L: settings.etichette, calcolaTermine: () => setTermini(true), avvocato: settings.profilo !== 'ditta' })
  // file rilasciati in un punto dell'app che non è una pratica: si sceglie a quale pratica collegarli
  const [daCollegare, setDaCollegare] = useState<string[] | null>(null)
  const { props: zonaApp, over: sopraApp } = useZonaFile(setDaCollegare, { disattivata: !settings.onboarding_fatto, ignora: '[data-pratica-id], [data-zona-file]' })

  useEffect(() => {
    const root = document.documentElement
    // cambiando tema nessun elemento deve «sfumare» da un colore all'altro: le transizioni si sospendono per un istante
    root.classList.add('sem-transizioni')
    if (settings.tema === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', settings.tema === 'scuro' ? 'dark' : 'light')
    void root.offsetHeight
    const t = window.setTimeout(() => root.classList.remove('sem-transizioni'), 80)
    return () => window.clearTimeout(t)
  }, [settings.tema])

  // colore principale dell'attività (adattato al tema chiaro/scuro) e titolo della finestra
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const applica = () => applicaBrand(settings.brand_colore, settings.tema === 'scuro' || (settings.tema === 'auto' && mq.matches))
    applica()
    mq.addEventListener('change', applica)
    return () => mq.removeEventListener('change', applica)
  }, [settings.brand_colore, settings.tema])
  useEffect(() => {
    const n = nomeAttivita(settings)
    document.title = n === 'TIO' ? 'TIO' : `${n} · TIO`
  }, [settings.studio?.nome])

  // un file rilasciato dove non c'è una zona di rilascio non deve aprirsi al posto dell'app
  useEffect(() => {
    const evita = (e: DragEvent) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault() }
    window.addEventListener('dragover', evita); window.addEventListener('drop', evita)
    return () => { window.removeEventListener('dragover', evita); window.removeEventListener('drop', evita) }
  }, [])

  const azioniRef = useRef(azioni); azioniRef.current = azioni
  const toggleSidebarRef = useRef(toggleSidebar); toggleSidebarRef.current = toggleSidebar
  // un comando del menu dell'app (clic sulla voce) o la sua scorciatoia: stessa azione
  const esegui = useCallback((id: string) => {
    if (id === 'cerca') setSearch((s) => !s)
    else if (id === 'impostazioni') go('impostazioni')
    else if (id === 'barra-laterale') toggleSidebarRef.current()
    else if (id === 'segnala-problema') setSegnala(true)
    else if (id === 'guida') run(() => api.apriGuida())
    else if (id === 'controlla-aggiornamenti') controllaAggiornamenti()
    else if (id.startsWith('vai-') || settings.onboarding_fatto) azioniRef.current.find((a) => a.id === id)?.esegui()
  }, [go, settings.onboarding_fatto, controllaAggiornamenti])
  useEffect(() => window.mngmnt.on('menu', esegui), [esegui])
  useEffect(() => {
    document.documentElement.dataset.platform = window.mngmnt.platform
    const VAI = ['vai-panoramica', 'vai-pratiche', 'vai-agenda', 'vai-compiti', 'vai-anagrafica', 'vai-parcelle', 'vai-collegamenti', 'vai-documenti', 'vai-anonimizza']
    const mac = window.mngmnt.platform === 'darwin'
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      // la finestra intercetta il tasto per prima e lo ferma: il menu, che mostra le stesse scorciatoie, non lo riceve due volte
      const fai = (id: string) => { e.preventDefault(); esegui(id) }
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') fai('cerca')
      else if (mod && e.key === ',') fai('impostazioni')
      // stessi tasti su tutti i sistemi: ⌘ su Mac, Ctrl su Windows e Linux
      else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n' && settings.onboarding_fatto) fai('nuova-pratica')
      else if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) fai(VAI[Number(e.key) - 1])
      else if (mac ? e.ctrlKey && e.metaKey && e.code === 'KeyS' : e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') fai('barra-laterale')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [esegui, settings.onboarding_fatto])

  let page
  switch (route.page) {
    case 'dashboard': page = <Dashboard />; break
    case 'pratiche': page = <Pratiche />; break
    case 'pratica': page = <PraticaDetail key={route.id} id={route.id!} tab={route.tab} focus={route.focus} />; break
    case 'agenda': page = <Agenda />; break
    case 'todo': page = <TodoPage />; break
    case 'anagrafica': page = <AnagraficaPage />; break
    case 'parcelle': page = <ParcellePage />; break
    case 'dapagare': page = <DaPagare />; break
    case 'collegamenti': page = <Collegamenti />; break
    case 'documenti': page = <DocumentiPage />; break
    case 'anonimizza': page = <Anonimizza />; break
    case 'impostazioni': page = <Impostazioni />; break
  }
  return (
    <div className={`app${settings.vista_compatta ? ' compact' : ''}${sidebarVisible ? '' : ' sidebar-hidden'}`} {...zonaApp}>
      {sidebarVisible && <Sidebar />}
      <div className="main">
        <Topbar onSearch={() => setSearch(true)} sidebarVisible={sidebarVisible} onToggleSidebar={toggleSidebar} />
        <main className="content" id="content">{error && <div className="doc-avviso" role="alert"><span>{error}</span><button className="btn btn-primary" onClick={reload}>Riprova</button></div>}{!ready && loading && <p role="status">Caricamento dell’archivio…</p>}{ready ? <ErrorBoundary key={`${route.page}:${route.id ?? ''}`}><Suspense fallback={<p role="status">Caricamento…</p>}>{page}</Suspense></ErrorBoundary> : null}</main>
      </div>
      {sopraApp && <div className="drop-overlay" aria-hidden="true"><div><b>Rilascia per collegare i file a una pratica</b><span>Poi scegli la pratica</span></div></div>}
      {daCollegare && <CollegaFileModal percorsi={daCollegare} onClose={() => setDaCollegare(null)} />}
      {search && <SearchPalette onClose={() => setSearch(false)} azioni={azioni} />}
      {ed.element}
      {segnala && <SegnalaProblemaModal onClose={() => setSegnala(false)} />}
      {termini && <CalcoloTerminiModal onClose={() => setTermini(false)} onCrea={(t) => { setTermini(false); ed.open({ kind: 'scadenza', item: { titolo: t.titolo, data_ora: t.data, tutto_il_giorno: 1, note: t.note } }) }} />}
      {ready && !settings.onboarding_fatto && <Onboarding />}
    </div>
  )
}
