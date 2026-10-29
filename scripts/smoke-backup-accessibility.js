'use strict'
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
let sleep = ms => new Promise(r => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
function attach({ getWindow, db }) {
  const win = getWindow(), wc = win.webContents, out = process.env.SMOKE_OUT || os.tmpdir(), results = [], reports = []
  sleep = require('./lib/attesa').adattiva(wc)
  fs.mkdirSync(out, { recursive: true })
  const js = code => wc.executeJavaScript(code, true)
  const click = (selector, text) => require('./smoke-ui').clickTextReady(js, selector, text)
  const check = (label, ok) => { results.push({ label, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + label) }
  const keypress = async (keyCode, modifiers = []) => { wc.focus(); wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); if(keyCode==='Return')wc.sendInputEvent({ type: 'char', keyCode: '\r', modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await sleep(40) }
  const setPasswords = (a, b) => js(`(()=>{const fields=[...document.querySelectorAll('.modal input[type=password]')];for(const [i,value]of ${JSON.stringify([a,b])}.entries()){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(fields[i],value);fields[i].dispatchEvent(new Event('input',{bubbles:true}))}})()`)
  const audit = async label => {
    const report = await js("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))")
    reports.push({ label, report }); check('accessibilità automatica ' + label, report.length === 0)
  }
  // Solo questo scenario usa un portachiavi in memoria: nessuna voce nel portachiavi personale.
  const wrappingKey = crypto.randomBytes(32)
  require('../electron/backup-key').init(db.getDataDir(), {
    isEncryptionAvailable: () => true, isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptStringAsync: async value => { const nonce = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', wrappingKey, nonce); return Buffer.concat([nonce, c.update(value), c.final(), c.getAuthTag()]) },
    decryptStringAsync: async value => { const c = crypto.createDecipheriv('aes-256-gcm', wrappingKey, value.subarray(0,12)); c.setAuthTag(value.subarray(-16)); return { result: Buffer.concat([c.update(value.subarray(12,-16)), c.final()]).toString(), shouldReEncrypt: false } },
  })
  wc.once('did-finish-load', async () => {
    try {
      db.setSettings({ onboarding_fatto: true, backup_automatico: false, tema: 'chiaro' }); wc.send('data-changed', ['settings']); await sleep(600)
      await js(require('axe-core').source)
      await click('.nav-item', 'Impostazioni'); await click('.tabs button', 'Backup e sicurezza'); await sleep(300)
      check('comandi licenze e sorgenti disponibili nelle impostazioni', await js("['Licenze e componenti','Cartella licenze e sorgenti'].every(t=>[...document.querySelectorAll('.content button')].some(b=>b.textContent.trim()===t))"))
      const licenseIndex = await js("window.mngmnt.invoke('app:licenses')"), licenseFolder = await js("window.mngmnt.invoke('app:licenseFolder')")
      check('licenze apribili tramite IPC e sorgenti disponibili localmente', path.dirname(licenseIndex)===licenseFolder && fs.readFileSync(licenseIndex,'utf8').includes('sources/mpl/') && fs.existsSync(path.join(licenseFolder,'native/sources/liberation-fonts-1.07.4.tar.gz')))
      check('stato iniziale della cifratura esplicito', await js("document.querySelector('.content').textContent.includes('Cifratura automatica non attiva')"))
      await audit('pannello backup')
      await js("[...document.querySelectorAll('.content button')].find(b=>b.textContent.includes('Cifra i backup automatici')).focus()")
      await keypress('Return'); await sleep(200)
      check('finestra aperta da tastiera e focus sulla password', await js("document.querySelector('.modal')?.contains(document.activeElement)&&document.activeElement.type==='password'"))
      const secret = 'Password-sintetica-test-2026!'
      await setPasswords(secret, 'diversa'); await sleep(150)
      check('password diverse impediscono l’attivazione', await js("document.querySelector('.modal-foot .btn-primary').disabled"))
      await setPasswords(secret, secret); await sleep(150)
      check('password mascherate e recupero spiegato', await js("[...document.querySelectorAll('.modal input')].every(i=>i.type==='password')&&document.querySelector('.modal').textContent.includes('Su un altro computer')"))
      await audit('configurazione cifratura')
      let contained = true
      for (let i=0; i<14; i++) { await keypress('Tab'); contained = contained && await js("document.querySelector('.modal').contains(document.activeElement)") }
      check('Tab mantiene il focus nella finestra', contained)
      await js("document.querySelector('.modal button').focus()")
      await keypress('Tab', ['shift'])
      check('Shift Tab torna all’ultimo controllo', await js("document.activeElement===document.querySelector('.modal-foot .btn-primary')"))
      wc.debugger.attach('1.3')
      const ax = await wc.debugger.sendCommand('Accessibility.getFullAXTree'); wc.debugger.detach()
      check('albero accessibile espone dialogo e campi con nome', ax.nodes.some(n=>n.role?.value==='dialog'&&n.name?.value==='Cifra i backup automatici') && ax.nodes.filter(n=>n.role?.value==='textbox'&&n.name?.value?.includes('password')).length>=1)
      win.setSize(980, 640); wc.setZoomFactor(2); await sleep(200)
      check('zoom 200%: finestra e pulsanti entro lo schermo', await js("(()=>{const m=document.querySelector('.modal').getBoundingClientRect(),b=document.querySelector('.modal-foot .btn-primary').getBoundingClientRect();return m.left>=0&&m.right<=innerWidth+1&&b.bottom<=innerHeight&&b.right<=innerWidth})()"))
      fs.writeFileSync(path.join(out, 'cifratura-zoom-200.png'), (await wc.capturePage()).toPNG())
      wc.setZoomFactor(1); win.setSize(1360, 860)
      await js("document.querySelector('.modal-foot .btn-primary').focus()"); await keypress('Return'); await sleep(500)
      check('attivazione tramite IPC e stato aggiornato', fs.existsSync(path.join(db.getDataDir(),'backup-key.json')) && await js("!document.querySelector('.modal')&&document.querySelector('.content').textContent.includes('Cifratura automatica attiva')"))
      check('scelta di cifrare persistente in SQLite',db.getSettings().backup_cifrato===true)
      await js("window.mngmnt.invoke('settings:set',{backup_cifrato:false})")
      check('salvataggio generale non disattiva la cifratura',db.getSettings().backup_cifrato===true)
      check('focus restituito al comando di apertura', await js("document.activeElement?.textContent.includes('Cambia password automatica')"))
      const status = await js("window.mngmnt.invoke('backup:keyStatus')")
      check('IPC restituisce solo stato e disponibilità', Object.keys(status).sort().join(',') === 'available,enabled')
      check('password assente da SQLite e dal file locale in chiaro', !JSON.stringify(db.getSettings()).includes(secret) && !fs.readFileSync(path.join(db.getDataDir(),'backup-key.json'),'utf8').includes(secret))
      await click('.content button', 'Disattiva cifratura'); await sleep(150); await click('.modal button', 'Disattiva cifratura'); await sleep(250)
      check('disattivazione confermata e configurazione rimossa', !fs.existsSync(path.join(db.getDataDir(),'backup-key.json')) && await js("document.querySelector('.content').textContent.includes('Cifratura automatica non attiva')"))
      await audit('pannello finale')
      fs.writeFileSync(path.join(out, 'backup-finale.png'), (await wc.capturePage()).toPNG())
      // Il nuovo layout deve restare utilizzabile con tastiera, finestra minima e temi diversi.
      await js("[...document.querySelectorAll('[role=switch]')].find(e=>e.closest('label').textContent.includes('Esegui un backup al giorno')).focus()")
      await keypress('Space'); await sleep(100)
      check('interruttore automatico utilizzabile da tastiera con salvataggio esplicito', await js("[...document.querySelectorAll('[role=switch]')].find(e=>e.closest('label').textContent.includes('Esegui un backup al giorno')).checked&&[...document.querySelectorAll('.page-head button')].some(b=>b.textContent.trim()==='Salva'&&!b.disabled)") && db.getSettings().backup_automatico===false)
      await keypress('Space'); await sleep(100)
      await js("document.querySelector('.settings-disclosure summary').focus()")
      await keypress('Return'); await sleep(100)
      check('configurazione del blocco espandibile da tastiera', await js("document.querySelector('.settings-disclosure').open&&document.querySelector('.settings-disclosure input[type=password]').getClientRects().length>0"))
      await audit('configurazione blocco')
      await keypress('Return'); await sleep(100)
      const shot = async (name, selector) => { await js(selector ? `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})` : "document.querySelector('.content').scrollTop=0"); await sleep(100); fs.writeFileSync(path.join(out,name+'.png'),(await wc.capturePage()).toPNG()) }
      const fits = () => js("(()=>{const panel=document.querySelector('.backup-settings'),r=panel.getBoundingClientRect();return panel.scrollWidth<=panel.clientWidth+1&&[...panel.querySelectorAll('button,input,summary')].filter(e=>e.getClientRects().length).every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1})})()")
      for (let i=0;i<35 && await js("!!document.querySelector('.toast')");i++) await sleep(100)
      await shot('backup-chiaro')
      await shot('backup-automatico-chiaro','.backup-settings > .settings-section:nth-of-type(3)')
      await shot('backup-sicurezza-informazioni','.backup-settings > .settings-section:nth-of-type(5)')
      win.setSize(980,640); await sleep(200)
      check('finestra minima: controlli e testi senza scorrimento orizzontale',await fits())
      await shot('backup-finestra-minima')
      wc.setZoomFactor(2); await sleep(200)
      check('zoom 200%: gruppi e controlli restano entro la colonna',await fits())
      await shot('backup-pannello-zoom-200')
      wc.setZoomFactor(1);win.setSize(1360,860)
      db.setSettings({tema:'scuro'});wc.send('data-changed',['settings']);await sleep(250)
      await audit('pannello scuro');await shot('backup-scuro')
      db.setSettings({tema:'chiaro',backup_cartella:'/Volumes/Archivio professionale/Documenti e copie dello studio/Una cartella con un nome molto lungo per verificare che il percorso vada a capo senza tagliare i pulsanti'});wc.send('data-changed',['settings']);await sleep(200)
      win.setSize(980,640);await sleep(200)
      check('percorso lungo leggibile senza spostare il comando di scelta',await fits())
      await shot('backup-percorso-lungo')
    } catch (error) { console.error('ERRORE', error); results.push({ label: String(error), ok: false }) }
    finally {
      fs.writeFileSync(path.join(out,'risultati.json'), JSON.stringify(results,null,2)); fs.writeFileSync(path.join(out,'axe.json'), JSON.stringify(reports,null,2))
      console.log(`RISULTATO: ${results.filter(r=>r.ok).length}/${results.length} controlli superati`)
      setTimeout(()=>process.exit(results.some(r=>!r.ok)?1:0),200)
    }
  })
}
module.exports = { attach }
