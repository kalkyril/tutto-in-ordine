'use strict'
const fs = require('node:fs'), path = require('node:path')
const root = path.resolve(__dirname, '..'), folder = path.join(root, 'licenses')
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const href = file => file.split('/').map(encodeURIComponent).join('/')
module.exports = function generate() {
  const inventory = JSON.parse(fs.readFileSync(path.join(folder, 'inventory.json'), 'utf8'))
  const native = JSON.parse(fs.readFileSync(path.join(folder, 'native', 'manifest.json'), 'utf8'))
  const sources = native.components.filter(c => c.sourceArchive)
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(folder, 'PROJECT-LICENSE.txt'))
  fs.writeFileSync(path.join(folder, 'THIRD-PARTY.md'), fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8').replace('](AUDIT-LICENZE-NATIVE-1.3.2.md)', '](native/README.md)'))
  const sections = new Map()
  for (const pkg of inventory.packages) for (const file of [...pkg.files, ...(pkg.upstreamNotices || [])]) sections.set(file, pkg.name)
  for (const component of native.components) for (const file of component.notices) sections.set('native/' + file, component.name)
  sections.set('upstream/Electron-MIT.txt', 'Electron')
  sections.set('upstream/Chromium-Notices.html', 'Chromium e componenti del runtime Electron')
  const contents = [...sections].map(([file, name]) => {
    if (file.endsWith('.html')) return `<p><a href="${href(file)}">${escape(name)}: avvisi completi</a></p>`
    return `<details><summary>${escape(name)} — ${escape(file)}</summary><pre>${escape(fs.readFileSync(path.join(folder, file), 'utf8'))}</pre></details>`
  }).join('\n')
  const html = `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>TIO — Licenze e sorgenti</title><style>body{font:16px/1.55 system-ui,sans-serif;margin:32px auto;padding:0 24px;max-width:1000px;color:#17243a;background:#fff}a{color:#3730a3}summary{cursor:pointer;padding:12px 0}details{border-bottom:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}li{margin:8px 0}</style><h1>TIO — Licenze e sorgenti</h1><p>Versione ${escape(inventory.version)}. Il codice e le icone originali del progetto sono MIT. Le parti di terzi mantengono le proprie licenze: la MIT del progetto non modifica i tuoi diritti su tali parti.</p><p><a href="PROJECT-LICENSE.txt">Licenza del progetto</a> · <a href="THIRD-PARTY.md">Avvisi e attribuzioni</a> · <a href="native/manifest.json">Inventario nativo e impronte</a></p><h2>Sorgenti forniti con l’app</h2><p>I seguenti archivi contengono i sorgenti originali non modificati, i testi di licenza e le istruzioni di compilazione. Sono disponibili localmente, senza account o download esterni. I sorgenti MPL restano MPL 2.0; i font Liberation 1.07.4 restano GPL v2 con le eccezioni originali. Il resto di TIO mantiene la MIT.</p><ul>${sources.map(c => `<li>${escape(c.name)} ${escape(c.version)} — <a href="${href('native/' + c.sourceArchive)}" download>Sorgenti e licenza</a></li>`).join('')}</ul><p>Gli archivi .crate si aprono come archivi tar.gz. Per Liberation usare FontForge e le istruzioni README/Makefile incluse. Questi font non vengono installati nel sistema dall’app.</p><h2>Attribuzioni</h2><p>Portions of this software are based in part on the work of the FreeType Team. This software is based in part on the work of the Independent JPEG Group. Vedere sotto copyright, condizioni e avvisi sui brevetti dei rispettivi titolari.</p><h2>Testi delle licenze</h2>${contents}</html>`
  fs.writeFileSync(path.join(folder, 'index.html'), html)
}
if (require.main === module) module.exports()
