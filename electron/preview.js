'use strict'
const { BrowserWindow, shell } = require('electron')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const windows = new Set()
async function open(file, name, parent) {
  const ext = path.extname(file).toLowerCase()
  if (!['.pdf','.png','.jpg','.jpeg','.webp','.bmp'].includes(ext)) throw new Error('Anteprima disponibile per PDF e immagini; per gli altri documenti usa Apri')
  const win = new BrowserWindow({ parent, width: 960, height: 740, title: name, show: false, autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, plugins: true } })
  windows.add(win); win.on('closed',()=>windows.delete(win))
  const url = pathToFileURL(file).href
  win.webContents.setWindowOpenHandler(({url})=>{ if (/^https?:\/\//i.test(url)) shell.openExternal(url); return {action:'deny'} })
  win.webContents.on('will-navigate',(event,target)=>{ if (target!==url) { event.preventDefault(); if (/^https?:\/\//i.test(target)) shell.openExternal(target) } })
  try { await win.loadURL(url); if (!win.isDestroyed()) win.show(); return true } catch(error) { if (!win.isDestroyed()) win.destroy(); throw error }
}
function closeAll() { for(const win of windows) if(!win.isDestroyed()) win.destroy(); windows.clear() }
module.exports={open,closeAll}
