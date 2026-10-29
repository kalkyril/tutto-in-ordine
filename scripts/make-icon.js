'use strict'
// Genera build/icon.png (1024x1024) disegnando un SVG in una finestra Electron.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const svg = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.svg'), 'utf8')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: true, useContentSize: true, frame: false, transparent: true })
  await win.loadURL('data:text/html,' + encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:512px;height:512px}</style>${svg}`))
  await new Promise((r) => setTimeout(r, 500))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true })
  const { width, height } = img.getSize()
  const out = width === 1024 && height === 1024 ? img : img.resize({ width: 1024, height: 1024, quality: 'best' })
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), out.toPNG())
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.svg'), svg)
  const { execFileSync } = require('node:child_process')
  const dir = path.join(__dirname, '..', 'build'), sizes = [16,32,48,64,128,256], header = Buffer.alloc(6 + 16 * sizes.length), images = sizes.map((size) => out.resize({width:size,height:size}).toPNG())
  header.writeUInt16LE(1,2); header.writeUInt16LE(sizes.length,4)
  let offset = header.length
  sizes.forEach((size,i) => { const at=6+i*16; header[at]=header[at+1]=size===256?0:size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(images[i].length,at+8);header.writeUInt32LE(offset,at+12);offset+=images[i].length })
  fs.writeFileSync(path.join(dir,'icon.ico'),Buffer.concat([header,...images]))
  if (process.platform === 'darwin') {
    const iconset=path.join(dir,'icon.iconset');fs.mkdirSync(iconset,{recursive:true})
    for (const size of [16,32,128,256,512]) for (const factor of [1,2]) fs.writeFileSync(path.join(iconset,`icon_${size}x${size}${factor===2?'@2x':''}.png`),out.resize({width:size*factor,height:size*factor}).toPNG())
    execFileSync('/usr/bin/iconutil',['-c','icns',iconset,'-o',path.join(dir,'icon.icns')]);fs.rmSync(iconset,{recursive:true})
  }
  const template = fs.readFileSync(path.join(__dirname, '..', 'build', 'trayTemplate.svg'), 'utf8')
  // barra dei menu di macOS: 18 punti di altezza, con la versione Retina «@2x» a 36 pixel. Senza i due file l'immagine verrebbe mostrata
  // a 40 punti e sporgerebbe dalla barra.
  for (const [px, nome] of [[18, 'trayTemplate.png'], [36, 'trayTemplate@2x.png']]) {
    win.setContentSize(px, px)
    await win.loadURL('data:text/html,' + encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:${px}px;height:${px}px}</style>` + template))
    await new Promise((r) => setTimeout(r, 300))
    fs.writeFileSync(path.join(__dirname, '..', 'build', nome), (await win.webContents.capturePage()).resize({ width: px, height: px, quality: 'best' }).toPNG())
  }
  console.log('Icona applicazione e icona monocromatica della barra di sistema create')
  app.quit()
})
