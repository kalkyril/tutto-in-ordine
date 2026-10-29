'use strict'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const ROOT = path.resolve(__dirname, '..')
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function inside(root, rel) {
  if (typeof rel !== 'string' || rel.includes('\\') || path.isAbsolute(rel) || rel.split('/').some(s => !s || s === '..' || s === '.')) throw new Error('Percorso licenza non valido: ' + rel)
  let current = root
  for (const piece of rel.split('/')) { current = path.join(current, piece); if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Collegamento simbolico nelle licenze') }
  return current
}
function verify({ root = ROOT, modules = path.join(ROOT, 'node_modules'), target, packaged = false, licenseRoot = path.join(root, 'licenses') } = {}) {
  const native = path.join(licenseRoot, 'native'), manifest = JSON.parse(fs.readFileSync(path.join(native, 'manifest.json'), 'utf8'))
  if (manifest.format !== 1 || !manifest.files.length || !manifest.components.length) throw new Error('Catalogo nativo assente o non valido')
  const records = new Map()
  for (const entry of manifest.files) {
    const file = inside(native, entry.file)
    if (records.has(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !fs.existsSync(file) || sha256(file) !== entry.sha256) throw new Error('Avviso o sorgente mancante/modificato: ' + entry.file)
    records.set(entry.file, entry)
  }
  for (const component of manifest.components) {
    if (!component.notices?.length || component.notices.some(file => !records.has(file))) throw new Error('Avvisi incompleti: ' + component.id)
    if (component.license === 'MPL-2.0' && (!component.sourceArchive || !records.has(component.sourceArchive))) throw new Error('Sorgente MPL non disponibile: ' + component.id)
    if (component.id === 'liberation-fonts' && (!component.sourceArchive || !records.has(component.sourceArchive))) throw new Error('Sorgenti Liberation non disponibili')
  }
  for (const [name, expected] of Object.entries(manifest.versions)) {
    const file = path.join(modules, name, 'package.json')
    // Electron è un runtime esterno a node_modules nell'app installata.
    if (packaged && name === 'electron') continue
    if (!fs.existsSync(file) || JSON.parse(fs.readFileSync(file, 'utf8')).version !== expected) throw new Error('Versione da revisionare per le licenze native: ' + name)
  }
  const known = new Map(manifest.artifacts.map(a => [a.package + '/' + a.file, a]))
  let checked = 0
  for (const artifact of manifest.artifacts) {
    const file = inside(modules, artifact.package + '/' + artifact.file)
    if (!fs.existsSync(file)) continue // architetture non installate
    if (sha256(file) !== artifact.sha256) throw new Error('Binario o dato nativo non corrispondente alla revisione: ' + artifact.package + '/' + artifact.file)
    checked++
  }
  const findPackage = (start, name) => { let at = start; for (;;) { const dir = path.join(at, 'node_modules', name); if (fs.existsSync(path.join(dir, 'package.json'))) return dir; const next = path.dirname(at); if (next === at) throw new Error('Dipendenza non trovata: ' + name); at = next } }
  const visited = new Set()
  const scan = (dir, name) => {
    if (visited.has(dir)) return; visited.add(dir)
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const walk = (folder, rel = '') => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue
        const sub = rel ? rel + '/' + entry.name : entry.name, file = path.join(folder, entry.name), key = name + '/' + sub
        if (entry.isDirectory()) walk(file, sub)
        else if (entry.isFile() && /\.(?:node|wasm|wasm\.js|traineddata\.gz|ttf|pfb|bcmap|icc|so|dll|dylib)$/.test(sub)) {
          const excluded = manifest.excluded.includes('node_modules/' + key)
          if (excluded && packaged) throw new Error('Componente escluso ancora presente nel pacchetto: ' + key)
          if (!excluded && !known.has(key)) throw new Error('Nuovo componente nativo privo di revisione: ' + key)
        }
      }
    }
    walk(dir)
    for (const dependency of Object.keys(meta.dependencies || {})) scan(findPackage(dir, dependency), dependency)
    for (const optional of Object.keys(meta.optionalDependencies || {})) { try { const found = findPackage(dir, optional); scan(found, optional) } catch (error) { if (!error.message.startsWith('Dipendenza non trovata:')) throw error } }
  }
  const packageMeta = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  for (const name of Object.keys(packageMeta.dependencies)) scan(path.join(modules, name), name)
  if (target) {
    const name = '@napi-rs/canvas-' + target, artifact = manifest.artifacts.find(a => a.package === name)
    if (!artifact || !fs.existsSync(path.join(modules, name, artifact.file))) throw new Error('Architettura nativa non revisionata/disponibile: ' + target)
    const evidence = JSON.parse(fs.readFileSync(inside(native, artifact.evidence), 'utf8'))
    const file = evidence.components.find(c => c.type === 'file' && c.name === artifact.file)
    if (!file?.hashes?.some(h => h.alg === 'SHA-256' && h.content === artifact.sha256)) throw new Error('SBOM non corrispondente al binario selezionato')
  }
  return { components: manifest.components.length, files: records.size, artifacts: checked }
}
if (require.main === module) { try { console.log('Licenze native verificate:', JSON.stringify(verify())) } catch (error) { console.error(error.message); process.exitCode = 1 } }
module.exports = { verify, inside, sha256 }
