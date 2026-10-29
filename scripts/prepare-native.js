'use strict'
// Include il modulo grafico della piattaforma/architettura di destinazione anche nelle build incrociate.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { execFileSync } = require('node:child_process')
const { Arch } = require('builder-util')
module.exports = async function beforePack(context) {
  const platform = context.electronPlatformName, arch = Arch[context.arch]
  const suffix = platform === 'darwin' ? `darwin-${arch}` : platform === 'win32' ? `win32-${arch}-msvc` : platform === 'linux' ? `linux-${arch}-gnu` : null
  if (!suffix) throw new Error('Piattaforma grafica non supportata: ' + platform)
  const name = '@napi-rs/canvas-' + suffix, version = require('@napi-rs/canvas/package.json').version, target = path.join(context.packager.info.appDir, 'node_modules', name)
  if (fs.existsSync(path.join(target, 'package.json')) && JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).version === version) { require('./collect-notices')(); require('./check-native-licenses').verify({target:suffix}); return }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-native-'))
  try {
    const npm = process.env.npm_execpath
    if (!npm) throw new Error('Avvia la compilazione con npm run dist per includere i moduli della piattaforma')
    execFileSync(process.execPath, [npm, 'pack', `${name}@${version}`, '--pack-destination', temporary, '--ignore-scripts'], { stdio: 'pipe', timeout: 120000 })
    const archive = fs.readdirSync(temporary).find((file) => file.endsWith('.tgz'))
    if (!archive) throw new Error('Modulo grafico non scaricato')
    fs.mkdirSync(target, { recursive: true })
    await require('tar').x({ file: path.join(temporary, archive), cwd: target, strip: 1 })
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
  require('./collect-notices')()
  require('./check-native-licenses').verify({target:suffix})
}
