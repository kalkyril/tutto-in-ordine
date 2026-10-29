'use strict'
// Revisione visiva e accessibilità della UI desktop, sempre su dati sintetici.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
function attach({ getWindow, db }) {
  const win = getWindow(), wc = win.webContents, out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-hig')
  sleep = require('./lib/attesa').adattiva(wc)
  fs.mkdirSync(out, { recursive: true })
  const results = [], violations = []
  const js = code => wc.executeJavaScript(code, true)
  const check = (label, value) => { results.push({ label, ok: !!value }); console.log((value ? 'PASS ' : 'FAIL ') + label) }
  const click = (selector, text) => require('./smoke-ui').clickTextReady(js, selector, text)
  const pageReady = (name, selector) => js(`new Promise((resolve,reject)=>{const started=Date.now();const poll=()=>{const title=document.querySelector('.content h1');if(document.querySelector(${JSON.stringify(selector)})&&title&&(${JSON.stringify(name)}==='Panoramica'||title.textContent.startsWith(${JSON.stringify(name)})))requestAnimationFrame(()=>requestAnimationFrame(resolve));else if(Date.now()-started>5000)reject(Error('Pagina non caricata: '+${JSON.stringify(name)}));else setTimeout(poll,50)};poll()})`)
  const shot = async name => { await sleep(200); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()) }
  const date = days => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
  const theme = async tema => { db.setSettings({ tema }); wc.send('data-changed',['settings']); await sleep(300) }
  const axe = async name => {
    // la verifica riguarda lo stato a riposo: il puntatore vero del mouse (anche quello di chi usa il computer mentre il test gira) non deve cambiare i colori
    await js("document.documentElement.style.pointerEvents='none'; new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")
    const report = await js("axe.run(document,{resultTypes:['violations']}).then(r=>r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})))")
    await js("document.documentElement.style.pointerEvents=''")
    violations.push({ screen: name, report })
    check('accessibilità ' + name, report.length === 0)
    if (report.length) console.log('  ↳ elementi sotto il puntatore del mouse: ' + await js("[...document.querySelectorAll(':hover')].map(e => e.tagName + '.' + String(e.className).split(' ')[0]).slice(-4).join(' > ')"))
    for (const v of report) console.log('  ↳ ' + v.id + ' (' + v.impact + '): ' + v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' — ' + String(n.summary).replace(/\s+/g, ' ').slice(0, 160)).join(' | '))
  }
  wc.once('did-finish-load', async () => {
    let complete = false
    try {
      await sleep(600)
      db.setSettings({ onboarding_fatto:true, tema:'chiaro', backup_automatico:false, notifiche_desktop:false, tariffe_online:false, studio:{nome:'Studio di Giulia Rossi',titolare:'Giulia'} })
      const client=db.save('anagrafica',{denominazione:'Alessandro Bianchi',email:'alessandro@example.org',citta:'Milano'})
      const titles=['Bianchi · tutela del patrimonio','Accordo di consulenza professionale','Recupero crediti · Aurora S.r.l.','Locazione commerciale · Via Brera','Successione e pianificazione familiare','Rinnovo incarico · Studio Verdi']
      const colors=['#0d9488','#3b82f6','#d97706','#8b5cf6','#64748b','#0d9488']
      const practices=titles.map((titolo,i)=>db.save('pratiche',{titolo,numero:'2026/'+String(i+1).padStart(3,'0'),cliente_id:client.id,stato:i===2?'In attesa':'In corso',colore:colors[i],preferita:i<2?1:0}))
      for(const [i,title] of ['Udienza di comparizione','Revisione accordo con il cliente','Deposito della memoria','Invio proposta di accordo'].entries()) db.save('scadenze',{pratica_id:practices[i].id,titolo:title,tipo:i===0?'udienza':'scadenza',data_ora:date(i===3?-1:i)+'T23:30',promemoria:[]})
      for(const [i,title] of ['Preparare la documentazione per l’udienza','Rileggere la bozza di accordo','Contattare il consulente tecnico'].entries()) db.save('todos',{pratica_id:practices[i].id,titolo:title,scadenza:date(i+1),priorita:i===0?2:0,ordine:i})
      db.saveParcella({data:date(-4),pratica_id:practices[0].id,cliente_id:client.id,stato:'emessa',netto:2400,voci:[{tipo:'compenso',descrizione:'Assistenza professionale',quantita:1,importo:2400}]})
      wc.send('data-changed',[...db.TABLES,'settings']); await sleep(700)
      await js(fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8')+';true')
      for(const mode of ['chiaro','scuro']) {
        await theme(mode)
        for(const [name,selector] of [['Panoramica','.dashboard'],['Pratiche','.pcard'],['Agenda','.cal-cell'],['Compiti','.row-item'],['Anagrafica','.contact'],['Parcelle','.table'],['Collegamenti','.page-head'],['Impostazioni','.tabs']]) {
          await click('.nav-item',name); await pageReady(name,selector); await sleep(150)
          await axe(name+'/'+mode)
          if(['Panoramica','Pratiche','Agenda','Impostazioni'].includes(name)) await shot(name.toLowerCase()+'-'+mode)
          check('nessun overflow pagina '+name+'/'+mode,await js("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.content').scrollWidth<=document.querySelector('.content').clientWidth+1"))
          if(!await js('!!document.querySelector('+JSON.stringify(selector)+')')) throw Error('Pagina non caricata: '+name)
        }
      }
      await theme('chiaro'); await click('.nav-item','Panoramica'); await sleep(250)
      await js("document.querySelector('.sidebar-toggle').click()"); await sleep(200)
      check('sidebar nascosta: contenuti disponibili e controllo raggiungibile',await js("!document.querySelector('.sidebar') && !!document.querySelector('.dashboard') && document.querySelector('.sidebar-toggle').getAttribute('aria-expanded')==='false'"))
      await shot('sidebar-nascosta')
      await js("document.querySelector('.sidebar-toggle').click()"); await sleep(200)
      check('sidebar ripristinata con le voci di navigazione',await js("document.querySelectorAll('.nav-item').length===11 && document.querySelector('.sidebar-toggle').getAttribute('aria-expanded')==='true'"))
      win.setSize(980,640); await sleep(250); await shot('finestra-minima')
      check('finestra 980×640 senza overflow dei contenuti',await js("document.querySelector('.content').scrollWidth<=document.querySelector('.content').clientWidth+1"))
      wc.setZoomFactor(1.25); await sleep(250); await shot('zoom-125')
      check('zoom 125%: controlli visibili e contenuti senza overflow',await js("document.querySelector('.content').scrollWidth<=document.querySelector('.content').clientWidth+1 && document.querySelector('.sidebar-toggle').getBoundingClientRect().right<innerWidth"))
      wc.setZoomFactor(1);win.setSize(1360,860)
      wc.debugger.attach('1.3')
      await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-reduced-transparency',value:'reduce'},{name:'prefers-contrast',value:'more'}]})
      await sleep(200); await shot('contrasto-aumentato')
      check('preferenze accessibili: movimento ridotto e superfici opache',await js("getComputedStyle(document.querySelector('.sidebar')).backdropFilter==='none' && getComputedStyle(document.querySelector('.nav-item')).transitionDuration==='0s'"))
      await axe('Contrasto aumentato/chiaro')
      await theme('scuro');await shot('contrasto-aumentato-scuro');await axe('Contrasto aumentato/scuro')
      check('contrasto aumentato: contorni distinguibili in tema scuro',await js(`(()=>{const s=getComputedStyle(document.querySelector('.card'));const lum=value=>value.match(/[\\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);const a=lum(s.borderTopColor),b=lum(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3})()`))
      await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});wc.debugger.detach()
      await theme('chiaro')
      await click('.nav-item','Pratiche');await click('button','Nuova pratica');await sleep(250)
      await shot('modulo-pratica');await axe('Modulo pratica/chiaro')
      await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await sleep(200)
      // Lo stato iniziale deve invitare all’azione anche senza dati.
      db.transaction(()=>{for(const p of practices)db.remove('pratiche',p.id);db.getDb().exec('DELETE FROM parcelle')})
      wc.send('data-changed',db.TABLES); await click('.nav-item','Panoramica');await sleep(350)
      await shot('panoramica-vuota');await axe('Panoramica vuota/chiaro')
      complete=true
    } catch(error) { console.error('ERRORE',error) }
    finally {
      fs.writeFileSync(path.join(out,'risultati.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(out,'axe.json'),JSON.stringify(violations,null,2))
      console.log(`\nRISULTATO: ${results.filter(r=>r.ok).length}/${results.length} controlli superati`)
      setTimeout(()=>process.exit(complete&&results.every(r=>r.ok)?0:1),200)
    }
  })
}
module.exports={attach}
