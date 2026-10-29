'use strict'
const { contextBridge, ipcRenderer } = require('electron')

const INVOKE = /^(db|settings|pratica|parcella|todos|documenti|shell|app|notifiche|alerts|ics|pdf|backup|tariffe|import|calendari|eventi|anonimizza|modelli):[A-Za-z]+$/
const EVENTS = new Set(['data-changed', 'navigate', 'blocca', 'menu', 'time-changed'])

contextBridge.exposeInMainWorld('mngmnt', {
  invoke: (channel, ...args) => {
    if (!INVOKE.test(channel)) throw new Error('Canale non consentito: ' + channel)
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (event, cb) => {
    if (!EVENTS.has(event)) throw new Error('Evento non consentito: ' + event)
    const h = (_e, payload) => cb(payload)
    ipcRenderer.on(event, h)
    return () => ipcRenderer.removeListener(event, h)
  },
  // percorso di un file trascinato (drag&drop di documenti)
  pathForFile: (file) => {
    try { const path = require('electron').webUtils.getPathForFile(file); return path && ipcRenderer.sendSync('authorize-dropped-file', path) ? path : '' } catch { return '' }
  },
  platform: process.platform,
  test: !!process.env.MNGMNT_TEST, // solo prove automatiche
})
