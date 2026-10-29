'use strict'
// Inventario locale: segue le esclusioni del progetto, senza creare un repository o stampare segreti.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { minimatch } = require('minimatch')
const ROOT = path.resolve(__dirname, '..')
const PRIVATE = /(?:^|\/)(?:\.env(?:\.[^/]+)?|blocco\.json|backup-key\.json(?:\.tmp)?|\.restore-state\.json(?:\.tmp)?)$|\.(?:db|sqlite3?|key|pem|p12|pfx|p8)(?:-wal|-shm)?$/i
const SECRETS = [/gh[pousr]_[a-zA-Z0-9]{36,}/, /github_pat_[a-zA-Z0-9_]{70,}/, /AKIA[A-Z0-9]{16}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /(?:sk_live_|sk-proj-)[a-zA-Z0-9_-]{24,}/]
function ignored(rel, directory, patterns) {
  let result = false
  for (const raw of patterns) {
    if (!raw || raw.startsWith('#')) continue
    const negate = raw.startsWith('!'), value = negate ? raw.slice(1) : raw
    const directoryOnly = value.endsWith('/'), anchored = value.startsWith('/'), pattern = value.replace(/^\//, '').replace(/\/$/, '')
    if (!pattern || directoryOnly && !directory) continue
    const subject = anchored || pattern.includes('/') ? rel : path.posix.basename(rel)
    if (minimatch(subject, pattern, { dot: true, nonegate: true, nocomment: true })) result = !negate
  }
  return result
}
function scan(root = ROOT) {
  const patterns = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/), failures = [], files = [], excluded = []
  let textFiles = 0
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name, file = path.join(dir, entry.name)
      if (entry.name === '.git' || ignored(rel, entry.isDirectory(), patterns)) { excluded.push(rel); continue }
      if (entry.isSymbolicLink()) { failures.push('Collegamento simbolico: ' + rel); continue }
      if (entry.isDirectory()) { walk(file, rel + '/'); continue }
      if (!entry.isFile()) { failures.push('File non regolare: ' + rel); continue }
      if (PRIVATE.test(rel) && !rel.endsWith('.env.example')) { failures.push('File riservato candidato alla pubblicazione: ' + rel); continue }
      files.push({ file: rel, bytes: fs.statSync(file).size })
      if (!/\.(?:js|mjs|mts|ts|tsx|json|md|yml|yaml|html|css|sh|py|svg|txt|toml|lock)$/.test(rel) && !['LICENSE', '.gitignore', '.npmrc'].includes(entry.name)) continue
      const content = fs.readFileSync(file, 'utf8'); textFiles++
      if (SECRETS.some(re => re.test(content))) failures.push('Possibile segreto: ' + rel)
    }
  }
  walk(root)
  return { files, excluded, textFiles, failures }
}
function verify(root = ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')), ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/)
  for (const pattern of ['.env', '.env.*', '*.key', '*.pem', '*.p12', '*.db', '*.sqlite', 'blocco.json', 'backup-key.json*', '.restore-state.json*', 'release/', 'node_modules']) assert.ok(ignore.includes(pattern), 'Protezione gitignore mancante: ' + pattern)
  const result = scan(root)
  for (const included of pkg.build.files) assert.ok(!/\.env|\.db|\.key/.test(included), 'File sensibile nella distribuzione')
  assert.ok(pkg.build.extraResources?.some(r => r.from === 'licenses' && r.to === 'licenses'), 'Licenze e sorgenti non inclusi nel pacchetto')
  require('./check-native-licenses').verify({ root, modules: path.join(root, 'node_modules') })
  assert.ok(fs.existsSync(path.join(root, 'PRIVACY.md')) && fs.existsSync(path.join(root, 'SECURITY.md')), 'Documentazione mancante')
  if (fs.existsSync(path.join(root, '.git'))) {
    const files = require('node:child_process').execFileSync('git', ['ls-files', '-cz'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
    for (const rel of files) if (PRIVATE.test(rel) && !rel.endsWith('.env.example')) result.failures.push('File riservato tracciato da Git: ' + rel)
  }
  return result
}
if (require.main === module) {
  try {
    const result = verify(), report = process.argv.indexOf('--report')
    if (report >= 0) {
      if (!process.argv[report + 1]) throw new Error('Percorso del rapporto mancante')
      fs.writeFileSync(process.argv[report + 1], JSON.stringify(result, null, 2) + '\n')
    }
    if (result.failures.length) { console.error(result.failures.join('\n')); process.exitCode = 1 }
    else console.log(`Controllo locale superato: ${result.files.length} file candidati, ${result.textFiles} file testuali esaminati, radice/workflow/licenze inclusi. ${result.excluded.length} esclusioni. Nessun repository creato; ricontrollare il primo commit effettivo.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { scan, ignored, verify }
