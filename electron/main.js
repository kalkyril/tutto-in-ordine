'use strict'
const { app, BrowserWindow, Notification, Tray, Menu, nativeImage, shell, powerMonitor, dialog, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const db = require('./db')
const alerts = require('./alerts')
const backup = require('./backup')
const calendari = require('./calendari')
const doctext = require('./doctext')
const blocco = require('./blocco')
const docfile = require('./docfile')
const ipc = require('./ipc')
const { isAppUrl, denyUnusedPermissions } = require('./web-policy')

const isDev = !!process.env.MNGMNT_DEV
const isTest = !!process.env.MNGMNT_TEST

app.setName('TIO')
app.setAppUserModelId('it.tio.app')
if (process.env.MNGMNT_DATA_DIR) app.setPath('userData', process.env.MNGMNT_DATA_DIR)
else app.setPath('userData', require('./cartella-dati').preparaCartellaDati(app.getPath('appData'), console.error).cartella)

if (!isTest && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win = null
let tray = null
let quitting = false
let timer = null

const iconPath = path.join(__dirname, '..', 'build', 'icon.png')
const appIcon = () => (fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined)

function getWindow() { return win && !win.isDestroyed() ? win : null }

function send(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function notifyChanged(tables) {
  send('data-changed', tables)
  if (tables.includes('settings')) buildMenu() // i nomi nel menu seguono le etichette (pratica/commessa…)
  if (tables.includes('notifiche')) updateBadge()
}

function updateBadge() {
  try {
    const n = db.getDb().prepare('SELECT COUNT(*) c FROM notifiche WHERE letta = 0').get().c
    app.setBadgeCount(n)
    if (tray && process.platform === 'darwin') tray.setTitle(n ? String(n) : '')
    const nome = (db.getSettings().studio?.nome || '').trim() || 'TIO'
    if (tray) tray.setToolTip(n ? `${nome} — ${n} avvisi non letti` : nome)
  } catch { /* db non pronto */ }
}

function showWindow() {
  const w = getWindow()
  if (!w) { createWindow(); return }
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

/* La finestra riapre dove e grande come l'avevi lasciata (linee guida Apple, Windows). Non nei test, che fissano le dimensioni. */
const fileFinestra = () => path.join(app.getPath('userData'), 'finestra.json')
function leggiFinestra() {
  if (isTest) return null
  try {
    const f = JSON.parse(fs.readFileSync(fileFinestra(), 'utf8'))
    if (!['x', 'y', 'width', 'height'].every((k) => Number.isFinite(f[k]))) return null
    // almeno la barra del titolo deve cadere su uno schermo collegato (un monitor esterno può essere stato staccato)
    const visibile = screen.getAllDisplays().some(({ workArea: a }) => f.x < a.x + a.width - 80 && f.x + f.width > a.x + 80 && f.y >= a.y - 20 && f.y < a.y + a.height - 40)
    return visibile ? f : null
  } catch { return null }
}
function ricordaFinestra(w) {
  if (isTest) return
  let timer
  const salva = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try { if (!w.isDestroyed() && !w.isMinimized() && !w.isFullScreen()) fs.writeFileSync(fileFinestra(), JSON.stringify({ ...w.getNormalBounds(), massimizzata: w.isMaximized() })) } catch { /* preferenza facoltativa */ }
    }, 400)
  }
  for (const evento of ['resize', 'move', 'maximize', 'unmaximize']) w.on(evento, salva)
}

function createWindow() {
  const posizione = leggiFinestra()
  win = new BrowserWindow({
    ...(posizione ? { x: posizione.x, y: posizione.y, width: Math.max(980, posizione.width), height: Math.max(640, posizione.height) } : { width: 1360, height: 860 }),
    minWidth: 980, minHeight: 640,
    title: 'TIO', icon: appIcon(),
    backgroundColor: '#f6f7f9', show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true,
    },
  })
  // finestra che non risponde (pagina bloccata): nel registro, con la durata, per le segnalazioni
  let fermaDal = 0
  win.on('unresponsive', () => { fermaDal = Date.now(); require('./registro').scrivi('finestra', 'la finestra non risponde') })
  win.on('responsive', () => { if (fermaDal) require('./registro').scrivi('finestra', `la finestra risponde di nuovo dopo ${((Date.now() - fermaDal) / 1000).toFixed(1).replace('.', ',')} s`); fermaDal = 0 })
  win.once('ready-to-show', () => { require('./registro').segnaTempo('finestra'); if (posizione?.massimizzata) win.maximize(); win.show() })
  ricordaFinestra(win)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url, isDev)) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })
  win.webContents.on('will-prevent-unload', (event) => {
    const result = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Resta nell’app', 'Scarta modifiche'], defaultId: 0, cancelId: 0, message: 'Ci sono modifiche non salvate.', detail: 'Vuoi chiudere o ricaricare la finestra e perderle?' })
    if (result === 1) event.preventDefault()
    else quitting = false
  })
  win.on('close', (e) => {
    if (quitting) return
    const s = db.getDb() ? db.getSettings() : {}
    if (s.resta_in_background !== false) {
      e.preventDefault()
      require('./preview').closeAll()
      win.hide()
      if (!s.avviso_chiusura_visto) avvisaPrimaChiusura(s)
    }
  })
  // se la parte grafica si chiude per un guasto, si registra il motivo e si ricarica la finestra (i dati sono nell'archivio, non vanno persi)
  let ultimoRicarico = 0
  win.webContents.on('render-process-gone', (_e, d) => {
    console.error('Interfaccia terminata:', d.reason, d.exitCode)
    require('./registro').scrivi('interfaccia terminata', `${d.reason} (codice ${d.exitCode})`)
    if (d.reason === 'clean-exit' || Date.now() - ultimoRicarico < 10000) return
    ultimoRicarico = Date.now()
    try { win?.webContents.reload() } catch { /* finestra già chiusa */ }
  })
  win.on('closed', () => { win = null })
  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

/** Controllo facoltativo degli aggiornamenti (electron/aggiornamenti.js): `manuale` per «Controlla ora», altrimenti solo se attivato. */
function controllaAggiornamenti(manuale = false) {
  if (!db.getDb()) return Promise.resolve(null)
  return require('./aggiornamenti').controlla({
    settings: db.getSettings(), versione: app.getVersion(), manuale, // progetto GitHub: campo `repository` di package.json
    salva: (patch) => { db.setSettings(patch); notifyChanged(['settings']) },
    avvisa: (r) => {
      const [n] = alerts.pushNotifiche([{ titolo: `È disponibile TIO ${r.versione}`, corpo: 'Per scaricarla: Impostazioni › Backup e sicurezza › Aggiornamenti.', tipo: 'aggiornamento', rif_tipo: 'aggiornamento' }])
      if (db.getSettings().notifiche_desktop !== false) fireNative(n)
      notifyChanged(['notifiche'])
    },
  })
}

/** La prima volta che la X nasconde la finestra lo si dice: su Windows sembrerebbe un'uscita, invece TIO resta attiva per gli avvisi. */
function avvisaPrimaChiusura(s) {
  try { db.setSettings({ avviso_chiusura_visto: true }) } catch { /* archivio non disponibile: si riproverà */ }
  if (isTest || s.notifiche_desktop === false || !Notification.isSupported()) return
  const dove = process.platform === 'darwin'
    ? 'La trovi nella barra dei menu in alto; per uscire usa TIO › Esci (⌘Q).'
    : 'La trovi nell\'area di notifica vicino all\'orologio; per uscire fai clic destro sull\'icona e scegli Esci.'
  new Notification({ title: 'TIO resta attiva', body: `Continua a controllare scadenze e compiti anche con la finestra chiusa. ${dove}`, icon: appIcon(), silent: true }).show()
}

function createTray() {
  const img = appIcon()
  if (!img) return
  const size = process.platform === 'darwin' ? 18 : 16
  const templateFile = path.join(__dirname, '..', 'build', 'trayTemplate.png')
  const trayImage = process.platform === 'darwin' && fs.existsSync(templateFile) ? nativeImage.createFromPath(templateFile) : img.resize({ width: size, height: size })
  if (process.platform === 'darwin') trayImage.setTemplateImage(true)
  tray = new Tray(trayImage)
  tray.setToolTip('TIO')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Apri TIO', click: showWindow },
    { label: 'Controlla scadenze ora', click: () => runAlertCheck() },
    { type: 'separator' },
    { label: 'Esci', click: () => { quitting = true; app.quit() } },
  ]))
  tray.on('click', showWindow)
}

function fireNative(n) {
  if (!Notification.isSupported()) return
  const privateMode = blocco.èBloccato() || db.getSettings().notifiche_riservate !== false
  const notif = new Notification({ title: privateMode ? 'TIO — nuovo avviso' : n.titolo, body: privateMode ? 'Apri l’app per consultare i dettagli.' : n.corpo || '', icon: appIcon(), silent: false })
  notif.on('click', () => {
    showWindow()
    send('navigate', { rif_tipo: n.rif_tipo, rif_id: n.rif_id, pratica_id: n.pratica_id })
  })
  notif.show()
}

function runAlertCheck(test = false) {
  if (!db.getDb()) return []
  if (test) {
    const [n] = alerts.pushNotifiche([{ titolo: 'Notifica di prova', corpo: 'Gli avvisi di TIO funzionano correttamente.', tipo: 'riepilogo' }])
    fireNative(n)
    notifyChanged(['notifiche'])
    return [n]
  }
  const settings = db.getSettings()
  const items = alerts.collectDue(new Date())
  const digest = alerts.dailyDigest(new Date())
  if (digest) items.unshift(digest)
  if (!items.length) return []
  const saved = alerts.pushNotifiche(items)
  if (settings.notifiche_desktop !== false) saved.forEach(fireNative)
  notifyChanged(['notifiche'])
  return saved
}

function applySettings(s) {
  updateBadge() // aggiorna anche il nome mostrato nell'icona di sistema
  if (s.aggiornamenti_controllo === true) controllaAggiornamenti().catch(() => {}) // appena attivato, senza aspettare il prossimo giro
  try {
    if (!isTest && process.platform !== 'linux' && app.getLoginItemSettings().openAtLogin !== !!s.avvia_al_login) {
      app.setLoginItemSettings({ openAtLogin: !!s.avvia_al_login, openAsHidden: true })
    }
  } catch { /* non supportato */ }
}

/** Comandi dell'app nel menu (linee guida Apple: ogni comando raggiungibile dalla barra dei menu).
 * Le scorciatoie le gestisce la finestra, che le intercetta per prima; il clic su una voce manda il comando con l'evento «menu». */
function buildMenu() {
  const isMac = process.platform === 'darwin'
  let L = {}
  try { L = db.getSettings().etichette || {} } catch { /* archivio non ancora pronto: nomi predefiniti */ }
  const minuscolo = (t, predefinito) => String(t || predefinito).toLowerCase()
  const nuovoLavoro = () => { const n = minuscolo(L.pratica, 'pratica'); return `${/[oe]$/.test(n) && !/ione$/.test(n) ? 'Nuovo' : 'Nuova'} ${n}` }
  let avvocato = true
  try { avvocato = db.getSettings().profilo !== 'ditta' } catch { /* predefinito */ }
  const comando = (id) => () => send('menu', id)
  const voce = (label, id, accelerator) => ({ label, click: comando(id), ...(accelerator ? { accelerator } : {}) })
  const impostazioni = voce(isMac ? 'Impostazioni…' : 'Impostazioni', 'impostazioni', 'CmdOrCtrl+,')
  const sviluppo = isDev || !app.isPackaged
  const tpl = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about', label: 'Informazioni su TIO' }, voce('Controlla aggiornamenti…', 'controlla-aggiornamenti'), { type: 'separator' },
      impostazioni, { type: 'separator' },
      { role: 'services', label: 'Servizi' }, { type: 'separator' },
      { role: 'hide', label: 'Nascondi TIO' }, { role: 'hideOthers', label: 'Nascondi altre' }, { role: 'unhide', label: 'Mostra tutte' }, { type: 'separator' },
      { role: 'quit', label: 'Esci da TIO' },
    ] }] : []),
    { label: 'File', submenu: [
      voce(nuovoLavoro(), 'nuova-pratica', 'CmdOrCtrl+N'),
      voce('Nuova scadenza', 'nuova-scadenza'),
      voce('Nuovo compito', 'nuovo-compito'),
      voce(`Nuovo ${minuscolo(L.cliente, 'cliente')}`, 'nuovo-contatto'),
      ...(avvocato ? [{ type: 'separator' }, voce('Calcola un termine…', 'calcola-termine')] : []),
      { type: 'separator' },
      ...(isMac ? [{ role: 'close', label: 'Chiudi finestra' }] : [impostazioni, { type: 'separator' }, { role: 'quit', label: 'Esci' }]),
    ] },
    { label: 'Modifica', submenu: [
      { role: 'undo', label: 'Annulla' }, { role: 'redo', label: 'Ripeti' }, { type: 'separator' },
      { role: 'cut', label: 'Taglia' }, { role: 'copy', label: 'Copia' }, { role: 'paste', label: 'Incolla' }, { role: 'selectAll', label: 'Seleziona tutto' },
      { type: 'separator' },
      voce('Cerca nell’archivio…', 'cerca', 'CmdOrCtrl+K'),
    ] },
    { label: 'Vista', submenu: [
      voce('Mostra/nascondi barra laterale', 'barra-laterale', isMac ? 'Ctrl+Cmd+S' : 'Ctrl+B'),
      { type: 'separator' },
      { role: 'resetZoom', label: 'Dimensioni reali' }, { role: 'zoomIn', label: 'Ingrandisci' }, { role: 'zoomOut', label: 'Riduci' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Schermo intero' },
      ...(sviluppo ? [{ type: 'separator' }, { role: 'reload', label: 'Ricarica' }, { role: 'toggleDevTools', label: 'Strumenti per sviluppatori' }] : []),
    ] },
    { label: 'Vai', submenu: [
      voce('Panoramica', 'vai-panoramica', 'CmdOrCtrl+1'),
      voce(L.pratiche || 'Pratiche', 'vai-pratiche', 'CmdOrCtrl+2'),
      voce('Agenda', 'vai-agenda', 'CmdOrCtrl+3'),
      voce('Compiti', 'vai-compiti', 'CmdOrCtrl+4'),
      voce('Anagrafica', 'vai-anagrafica', 'CmdOrCtrl+5'),
      voce(L.parcelle || 'Parcelle', 'vai-parcelle', 'CmdOrCtrl+6'),
      voce('Da pagare', 'vai-dapagare'),
      voce('Collegamenti', 'vai-collegamenti', 'CmdOrCtrl+7'),
      { type: 'separator' },
      voce('Documenti', 'vai-documenti', 'CmdOrCtrl+8'),
      voce('Anonimizza', 'vai-anonimizza', 'CmdOrCtrl+9'),
    ] },
    { role: 'windowMenu', label: 'Finestra' },
    { role: 'help', label: 'Aiuto', submenu: [
      ...(isMac ? [] : [voce('Controlla aggiornamenti…', 'controlla-aggiornamenti'), { type: 'separator' }]),
      voce('Guida di TIO', 'guida', 'F1'),
      { type: 'separator' },
      voce('Segnala un problema…', 'segnala-problema'),
      { label: 'Mostra il registro degli errori', click: () => { const f = require('./registro').percorso(); if (f && fs.existsSync(f)) shell.showItemInFolder(f) } },
    ] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl))
  // menu del Dock (clic destro sull'icona): le azioni più frequenti anche con la finestra chiusa
  if (isMac && app.dock) {
    const daFuori = (id) => () => comandoDaFuori(id)
    app.dock.setMenu(Menu.buildFromTemplate([
      { label: nuovoLavoro(), click: daFuori('nuova-pratica') },
      { label: 'Nuova scadenza', click: daFuori('nuova-scadenza') },
      { label: 'Nuovo compito', click: daFuori('nuovo-compito') },
      { type: 'separator' },
      { label: 'Cerca nell’archivio…', click: daFuori('cerca') },
    ]))
  }
}

/** Un comando arrivato quando la finestra può essere nascosta o chiusa (Dock): la mostra e lo esegue appena l'interfaccia è pronta. */
function comandoDaFuori(id) {
  showWindow()
  const w = getWindow()
  if (!w) return
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', () => setTimeout(() => send('menu', id), 600))
  else send('menu', id)
}

app.on('second-instance', showWindow)
app.on('before-quit', () => { quitting = true })
app.on('activate', showWindow)
app.on('window-all-closed', () => { /* resta attiva in background (tray) */ })

/** Apre l'archivio; se è danneggiato lo conserva da parte e chiede come proseguire (nuovo archivio o ripristino da backup). */
function apriArchivio() {
  const dir = app.getPath('userData')
  try {
    db.open(dir)
    if (!db.verificaIntegrita()) throw new Error('Controllo di integrità non superato')
    if (!isTest && db.getRecoveryResult()?.recovered) dialog.showMessageBoxSync({ type: 'info', message: 'Ripristino interrotto recuperato', detail: 'È stato recuperato l’archivio precedente al tentativo di ripristino, insieme ai suoi documenti. Puoi verificare la copia da importare e ripetere il ripristino dalle Impostazioni.' })
    return true
  } catch (e) {
    db.close()
    if (isTest) throw e
    if (['RESTORE_RECOVERY_REQUIRED', 'ARCHIVE_NEWER_VERSION'].includes(e.code)) {
      dialog.showErrorBox('Archivio non aperto', e.message + '\nL’app verrà chiusa senza creare un archivio vuoto.')
      app.exit(1); return false
    }
    const conservato = db.isolaArchivioDanneggiato(dir)
    const r = dialog.showMessageBoxSync({
      type: 'error', title: 'Archivio danneggiato', buttons: ['Parti da un archivio nuovo', 'Esci'], defaultId: 0, cancelId: 1,
      message: "L'archivio dei dati non può essere aperto.",
      detail: `Il file è stato conservato (non è stato cancellato):\n${conservato}\n\nPuoi partire da un archivio vuoto e poi usare Impostazioni → Backup e dati → Ripristina da backup.\n\nDettaglio: ${e.message}`,
    })
    if (r !== 0) { app.exit(1); return false }
    db.open(dir)
    return true
  }
}

/** Su Mac, se l'app viene aperta dal disco immagine o dalla cartella Download, propone di spostarla in Applicazioni. */
function proponiSpostamentoInApplicazioni() {
  if (process.platform !== 'darwin' || isDev || isTest || !app.isPackaged) return
  try {
    if (app.isInApplicationsFolder()) return
    const r = dialog.showMessageBoxSync({
      type: 'question', buttons: ['Sposta in Applicazioni', 'Non ora'], defaultId: 0, cancelId: 1,
      message: 'Vuoi spostare TIO nella cartella Applicazioni?',
      detail: "È il posto giusto per le app del Mac: la trovi in Launchpad e si aggiorna senza problemi. L'archivio dei tuoi dati non cambia.",
    })
    if (r === 0) app.moveToApplicationsFolder()
  } catch (e) { console.error('Spostamento in Applicazioni non riuscito:', e.message) }
}

app.on('session-created', session => denyUnusedPermissions(session, contents => contents === getWindow()?.webContents && isAppUrl(contents.getURL(), isDev)))

app.whenReady().then(() => {
  require('./registro').segnaTempo('pronto')
  proponiSpostamentoInApplicazioni()
  if (!apriArchivio()) return
  require('./registro').init(db.getDataDir(), app.getVersion())
  blocco.init(db.getDataDir())
  require('./backup-key').init(db.getDataDir(), require('electron').safeStorage)
  docfile.init({ documenti: require('./cartelle-utente').basePredefinita(app) }) // Documenti; su Windows la cartella utente
  buildMenu()
  ipc.register({ getWindow, notifyChanged, onSettings: applySettings, runAlertCheck, controllaAggiornamenti })
  applySettings(db.getSettings())
  createWindow()
  createTray()
  updateBadge()

  const startupHidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden
  if (startupHidden && getWindow()) getWindow().once('ready-to-show', () => getWindow()?.hide())

  let sincronizzando = false
  const tick = () => {
    try { if (db.getDb() && require('./gestione').generaRicorrenze()) notifyChanged(['todos', 'gestione']) } catch (e) { console.error('Attività ricorrenti:', e.message) }
    require('./registro').segnaAttivita('controlli periodici (calendari, avvisi, indice documenti, backup automatico, aggiornamenti)')
    if (!sincronizzando) { // calendari collegati (sola lettura): aggiornamento secondo l'intervallo scelto per ciascuno
      sincronizzando = true
      calendari.sincronizzaScaduti(new Date()).then((ids) => { if (ids.length) { notifyChanged(['calendari', 'eventi_esterni', 'pratiche', 'notifiche']); try { runAlertCheck() } catch { /* ignora */ } } }).catch(() => {}).finally(() => { sincronizzando = false })
    }
    try { runAlertCheck() } catch (e) { console.error('Controllo avvisi fallito:', e) }
    doctext.indicizzaPendentiAsync(4).then((updated) => { if (updated) notifyChanged(['documenti']) }).catch(() => {})
    controllaAggiornamenti().catch(() => {}) // spento di default: senza il consenso nelle Impostazioni non fa nulla
    backup.autoBackupAsync(db.getSettings(), isTest ? null : require('./cartelle-utente').backupPredefinito(app), { passwordProvider: () => db.getSettings().backup_cifrato === true ? require('./backup-key').password() : '' }).then((updated) => { if (updated) notifyChanged(['settings']) }).catch((error) => console.error('Backup automatico fallito:', error.message))
  }
  setTimeout(tick, 2500)
  timer = setInterval(tick, 30 * 1000)
  powerMonitor.on('resume', () => { send('time-changed'); tick() })
  powerMonitor.on('lock-screen', () => { require('./preview').closeAll(); if (blocco.blocca().attivo) send('blocca') }) // schermo del computer bloccato → blocca anche TIO

  if (isTest) {
    // la finestra di prova lascia passare i clic del mouse vero: chi usa il computer mentre i test girano non fa comparire stati «hover» e non clicca per sbaglio
    // dentro la prova (gli scenari inviano i propri eventi direttamente alla pagina)
    try { getWindow()?.setIgnoreMouseEvents(true) } catch { /* non supportato: i test funzionano comunque */ }
    require('../scripts/' + (process.env.MNGMNT_TEST_SCENARIO || 'smoke-hooks')).attach({ getWindow, db, runAlertCheck })
    // uno scenario bloccato (finestra di sistema inattesa, attesa senza fine) fallisce invece di tenere occupato il computer per ore
    const minuti = Number(process.env.MNGMNT_TEST_MAX_MIN) || 15
    setTimeout(() => { console.log(`ERRORE: scenario ${process.env.MNGMNT_TEST_SCENARIO || 'smoke-hooks'} fermo oltre ${minuti} minuti`); app.exit(3) }, minuti * 60 * 1000).unref()
  }
})

app.on('will-quit', () => {
  if (timer) clearInterval(timer)
  db.close()
})
