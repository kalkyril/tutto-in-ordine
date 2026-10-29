'use strict'
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
function attach({ getWindow, db }) {
  const win = getWindow(), wc = win.webContents, out = process.env.SMOKE_OUT || os.tmpdir(), results = []
  sleep = require('./lib/attesa').adattiva(wc)
  fs.mkdirSync(out, { recursive: true })
  const js = (code) => wc.executeJavaScript(code, true)
  const check = (label, value) => { results.push({ label, ok: !!value }); console.log((value ? 'PASS ' : 'FAIL ') + label) }
  const click = (selector, text) => js(`(() => { const element=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim().includes(${JSON.stringify(text)})); if(!element) throw Error('Elemento assente: '+${JSON.stringify(text)}); element.click(); })()`)
  const field = (label, text) => js(`(() => { const lab=[...document.querySelectorAll('.field > label')].find(e=>e.textContent.trim()===${JSON.stringify(label)}); const input=lab.parentElement.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  wc.on('did-finish-load', async () => {
    try {
      db.setSettings({ onboarding_fatto: true, tema: 'chiaro', studio: { nome: 'Studio di prova' } }); wc.send('data-changed',['settings']); await sleep(600)
      const p=db.save('pratiche',{titolo:'Pratica protetta'});wc.send('data-changed',['pratiche']);await sleep(200)
      check('IPC rifiuta ID traversal senza cancellare cartelle', await js("window.mngmnt.invoke('db:delete','pratiche','../fuori').then(()=>false,e=>/Identificativo/.test(e.message))"))
      check('IPC rifiuta snapshot di annullamento inventata', await js("window.mngmnt.invoke('db:undo',{t:'documenti',riga:{id:1,percorso:'/tmp/segreto'}}).then(()=>false,e=>/annullamento/.test(e.message))"))
      await click('.nav-item','Impostazioni');await sleep(500)
      await field('Nome dello studio o della ditta','Nome non ancora salvato');await sleep(100)
      db.setSettings({ backup_esito: 'ok', backup_ultimo: new Date().toISOString() });wc.send('data-changed',['settings']);await sleep(300)
      check('aggiornamento backup conserva il nome non salvato', await js("document.querySelector('.field input').value==='Nome non ancora salvato'"))
      await click('.nav-item','Pratiche');await sleep(250)
      check('cambio pagina chiede come gestire le modifiche',await js("!![...document.querySelectorAll('.modal h2')].find(e=>e.textContent==='Impostazioni non salvate')"))
      await click('.modal button','Annulla');await sleep(150)
      check('Annulla conserva il modulo e i dati',await js("document.querySelector('.field input').value==='Nome non ancora salvato'"))
      await click('.page-head button','Salva');await sleep(400)
      await click('.nav-item','Pratiche');await sleep(400)
      check('dopo Salva la navigazione non mostra un falso avviso',await js("!document.querySelector('.modal') && !!document.querySelector('.pcard')"))
      await click('button','Nuova pratica');await sleep(200)
      await field('Titolo *','Modifica non salvata');await sleep(150)
      check('contenuto dietro la modale reso inerte',await js("!!document.querySelector('.nav-item').closest('[inert]')"))
      await js("document.querySelector('.modal .modal-foot button:last-child').focus()")
      wc.sendInputEvent({type:'keyDown',keyCode:'Tab'});wc.sendInputEvent({type:'keyUp',keyCode:'Tab'});await sleep(100)
      check('Tab resta nella modale',await js("document.querySelector('.modal').contains(document.activeElement)"))
      await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await sleep(150)
      check('Esc propone di scartare le modifiche del modulo',await js("[...document.querySelectorAll('.modal h2')].some(e=>e.textContent==='Modifiche non salvate')"))
      await click('.modal button','Scarta modifiche');await sleep(200)
      check('modale chiusa, contenuto riattivato',await js("!document.querySelector('.modal') && !document.querySelector('.nav-item').closest('[inert]')"))
      for(let i=0;i<160;i++)db.save('pratiche',{titolo:'Pratica aggiuntiva '+i});wc.send('data-changed',['pratiche']);await sleep(300)
      check('paginazione limita le schede presenti nel DOM',await js("document.querySelectorAll('.pcard').length===60 && !!document.querySelector('.pagination')"))
      await click('.pagination button','Successiva');await sleep(150)
      check('pagina successiva disponibile',await js("document.querySelector('.pagination').textContent.includes('Pagina 2')"))
      win.setSize(980,640);await sleep(300)
      check('finestra minima senza overflow orizzontale',await js("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"))
      fs.writeFileSync(path.join(out,'release-finestra-minima.png'),(await wc.capturePage()).toPNG())
      check('pratica di prova conservata dopo le richieste ostili',!!db.get('pratiche',p.id))
      console.log(`\nRISULTATO: ${results.filter(r=>r.ok).length}/${results.length} controlli superati`)
      fs.writeFileSync(path.join(out,'risultati.json'),JSON.stringify(results,null,2))
    } catch(error) { console.log('ERRORE',error) }
    finally { setTimeout(()=>process.exit(0),200) }
  })
}
module.exports={attach}
