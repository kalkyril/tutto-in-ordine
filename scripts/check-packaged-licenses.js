'use strict'
const path = require('node:path'), fs = require('node:fs')
module.exports = async function afterPack(context) {
  const { Arch } = require('builder-util'), arch = Arch[context.arch], platform = context.electronPlatformName
  const resources = platform === 'darwin' ? path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app', 'Contents', 'Resources') : path.join(context.appOutDir, 'resources')
  const target = platform === 'darwin' ? `darwin-${arch}` : platform === 'win32' ? `win32-${arch}-msvc` : `linux-${arch}-gnu`
  const licenseRoot = path.join(resources, 'licenses'), modules = path.join(resources, 'app.asar.unpacked', 'node_modules')
  const result = require('./check-native-licenses').verify({ licenseRoot, modules, target, packaged: true })
  for (const name of ['index.html', 'PROJECT-LICENSE.txt', 'THIRD-PARTY.md']) if (!fs.existsSync(path.join(licenseRoot, name))) throw new Error('Licenze non accessibili nel pacchetto: ' + name)
  const asar = require('@electron/asar'), entries = asar.listPackage(path.join(resources, 'app.asar'))
  if (entries.some(e => /pdfjs-dist[\\/]wasm[\\/]quickjs-eval\./.test(e))) throw new Error('QuickJS non deve essere redistribuito dal pacchetto')
  console.log('Licenze nel pacchetto verificate:', target, JSON.stringify(result))
}
