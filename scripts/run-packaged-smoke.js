'use strict'
// Prova gli eseguibili prodotti dal packaging prima di consentirne la pubblicazione.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { spawnSync, execFileSync } = require('node:child_process')
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
    const child = spawnSync(binary, [], { cwd: root, env: { ...process.env, MNGMNT_TEST: '1', MNGMNT_TEST_SCENARIO: 'smoke-packaged', MNGMNT_DATA_DIR: data, SMOKE_OUT: report }, encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 })
    fs.writeFileSync(path.join(report, 'esecuzione.log'), (child.stdout || '') + (child.stderr || ''))
    const file = path.join(report, 'risultati.json'), results = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []
    if (child.error || child.status !== 0 || results.length !== 21 || results.some(r => !r.ok)) throw new Error('Pacchetto non verificato: ' + binary + '\n' + (child.error?.message || '') + '\nRegistri: ' + report)
    console.log('PASS pacchetto ' + binary + ': 21/21 controlli')
  } finally { fs.rmSync(data, { recursive: true, force: true }) }
}
