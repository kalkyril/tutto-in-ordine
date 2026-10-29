'use strict'
// Prova gli eseguibili prodotti dal packaging prima di consentirne la pubblicazione.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { spawn, spawnSync, execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..'), pkg = require('../package.json')
function binaries() {
  const release = path.join(root, 'release')
  return fs.readdirSync(release, { withFileTypes: true }).filter(e => e.isDirectory()).flatMap(e => {
    const directory = path.join(release, e.name)
    if (process.platform === 'darwin' && /^mac(?:-|$)/.test(e.name)) return [path.join(directory, 'TIO.app/Contents/MacOS/TIO')]
    if (process.platform === 'win32' && /^win.*unpacked$/.test(e.name)) return [path.join(directory, 'TIO.exe')]
    return []
  }).filter(f => fs.existsSync(f))
}
const targets = process.argv.length > 2 ? process.argv.slice(2).map(f => path.resolve(f)) : binaries()
if (!targets.length) throw new Error('Nessun eseguibile della piattaforma da verificare: crea prima gli installer')
const out = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'tio-packaged-smoke')
fs.mkdirSync(out, { recursive: true })
// Avvia l'app impacchettata scrivendo subito ciò che stampa (in CI si vede dove si ferma) e, allo scadere, chiude
// l'intero gruppo di processi: con spawnSync il processo principale veniva fermato ma i processi di supporto di Electron
// tenevano aperta l'uscita e l'attesa non finiva mai.
function esegui(binary, env, tempo) {
  return new Promise((resolve) => {
    const child = spawn(binary, [], { cwd: root, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let uscita = '', scaduto = false, finito = false
    const scrivi = (dati) => { const t = dati.toString(); uscita += t; process.stdout.write(t.replace(/^(?=.)/gm, '  | ')) }
    child.stdout.on('data', scrivi); child.stderr.on('data', scrivi)
    const chiudiTutto = () => {
      try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']); else process.kill(-child.pid, 'SIGKILL') } catch { /* già chiuso */ }
    }
    const fine = (status, error) => { if (finito) return; finito = true; clearTimeout(timer); clearTimeout(riserva); resolve({ status, error, uscita, scaduto }) }
    const timer = setTimeout(() => { scaduto = true; console.log(`  | ERRORE: nessuna conclusione dopo ${tempo / 60000} minuti, chiudo l'app e i suoi processi`); chiudiTutto() }, tempo)
    // se dopo la chiusura forzata l'uscita resta aperta, si prosegue comunque
    let riserva; child.on('exit', (status) => { riserva = setTimeout(() => fine(status), 10000) })
    child.on('close', (status) => fine(status))
    child.on('error', (error) => fine(null, error))
  })
}

;(async () => {
  for (const [index, binary] of targets.entries()) {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-packaged-data-')), report = path.join(out, String(index + 1))
    fs.rmSync(report, { recursive: true, force: true })
    fs.mkdirSync(report, { recursive: true })
    try {
      if (process.platform === 'darwin') {
        const plist = path.resolve(path.dirname(binary), '../Info.plist')
        const minimum = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', plist], { encoding: 'utf8' }).trim()
        if (minimum !== pkg.build.mac.minimumSystemVersion) throw new Error(`Requisito macOS inatteso nel pacchetto: ${minimum}`)
      }
      // su un Mac Apple Silicon il binario Intel girerebbe solo tramite Rosetta, lento e non rappresentativo di un Mac Intel
      // vero (in CI si fermava all'anteprima PDF): se ne verificano architettura e requisiti, senza avviarlo
      if (process.platform === 'darwin') {
        const archs = execFileSync('lipo', ['-archs', binary], { encoding: 'utf8' }).trim().split(/\s+/)
        const attesa = /mac-arm64/.test(binary) ? 'arm64' : /[\\/]mac[\\/]/.test(binary) ? 'x86_64' : null
        if (attesa && !archs.includes(attesa)) throw new Error(`Architettura inattesa in ${binary}: ${archs.join(' ')} (attesa ${attesa})`)
        if (!archs.includes(process.arch === 'arm64' ? 'arm64' : 'x86_64')) { console.log(`PASS pacchetto ${binary}: architettura ${archs.join(' ')} e requisito macOS verificati (non avviato su un Mac ${process.arch})`); continue }
      }
      console.log('Avvio ' + binary)
      const child = await esegui(binary, { ...process.env, MNGMNT_TEST: '1', MNGMNT_TEST_SCENARIO: 'smoke-packaged', MNGMNT_TEST_MAX_MIN: '4', MNGMNT_DATA_DIR: data, SMOKE_OUT: report }, 5 * 60000)
      fs.writeFileSync(path.join(report, 'esecuzione.log'), child.uscita)
      const file = path.join(report, 'risultati.json'), results = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []
      if (child.error || child.scaduto || child.status !== 0 || results.length !== 21 || results.some(r => !r.ok)) throw new Error('Pacchetto non verificato: ' + binary + '\n' + (child.error?.message || (child.scaduto ? 'tempo scaduto' : 'uscita ' + child.status)) + '\nRegistri: ' + report)
      console.log('PASS pacchetto ' + binary + ': 21/21 controlli')
    } finally { fs.rmSync(data, { recursive: true, force: true }) }
  }
})().catch((error) => { console.error(error.message); process.exit(1) })
