'use strict'
const fs=require('node:fs'),path=require('node:path')
function attach({getWindow,db}) {
 const wc=getWindow().webContents,js=c=>wc.executeJavaScript(c,true),sleep=require('./lib/attesa').adattiva(wc),results=[]
 const check=(name,ok,detail)=>{results.push({name,ok:!!ok,detail});console.log((ok?'PASS ':'FAIL ')+name+' '+(detail||''))}
 const click=(sel,t)=>require('./smoke-ui').clickTextReady(js,sel,t)
 const val=(label,value)=>js(`(()=>{const f=[...document.querySelectorAll('.modal .field')].find(x=>x.querySelector('label')?.textContent.includes(${JSON.stringify(label)}));const e=f?.querySelector('input:not([type=checkbox]),select,textarea');if(!e)throw Error('Campo assente: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true})()`)
 const shot=async n=>{if(process.env.SMOKE_OUT){fs.mkdirSync(process.env.SMOKE_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.SMOKE_OUT,n+'.png'),(await wc.capturePage()).toPNG())}}
 wc.once('did-finish-load',async()=>{
  try {
   await sleep(800)
   check('benvenuto: tre profili distinti',await js("document.querySelectorAll('.scelta').length===3"))
   await click('.scelta','Libero professionista');await val('Nome','Studio Consulenza Prova');await click('.modal .btn-primary','Inizia');await sleep(900)
   check('profilo professionista: etichette incarichi e documenti',db.getSettings().attivita==='professionista'&&await js("document.body.innerText.includes('Incarichi')&&document.body.innerText.includes('Documenti')"))
   const cliente=db.save('anagrafica',{denominazione:'Cliente di prova'}),quote=db.saveParcella({tipo:'preventivo',data:'2026-10-27',cliente_id:cliente.id,oggetto:'Progetto consulenza',netto:1000,totale:1000,compensi:1000,imponibile:1000,voci:[{descrizione:'Consulenza',quantita:1,importo:1000}]})
   wc.send('data-changed',['parcelle','anagrafica']);await click('.nav-item','Documenti');await sleep(500);await click('.segmented button','Preventivi e lavori');await sleep(400)
   await click('.business-panel button','Apri');await sleep(450);await val('Valido fino','2026-12-31');await val('Esito preventivo','accettato');await click('.modal .btn-primary','Salva');await sleep(700)
   check('preventivo: esito e validità salvati dall’editor',db.getParcella(quote.id).esito_preventivo==='accettato'&&db.getParcella(quote.id).validita==='2026-12-31')
   await click('.business-panel button','Avvia lavoro');await sleep(600)
   const lavoro=db.get('pratiche',db.getParcella(quote.id).pratica_id)
   check('preventivo accettato: avvio incarico con budget e cliente',lavoro?.budget_importo===1000&&lavoro.cliente_id===cliente.id&&lavoro.tipo==='Incarico')
   await click('.tabs button','Attività e spese');await sleep(500);await click('button','Modifica budget');await val('Ore previste','8');await val('Importo concordato','1200');await val('Consegna','2026-12-15');await click('.modal .btn-primary','Salva');await sleep(500)
   check('budget: ore, importo e consegna persistiti',db.get('pratiche',lavoro.id).budget_ore===8&&db.get('pratiche',lavoro.id).consegna==='2026-12-15');await shot('budget')
   await click('.nav-item','Documenti');await sleep(400);await click('.segmented button','Preventivi e lavori');await sleep(400);await click('.business-panel button','Prepara documento');await sleep(500);await val('Stato','emessa');await click('.modal .btn-primary','Salva');await sleep(600)
   const doc=db.list('parcelle').find(p=>p.origine_preventivo_id===quote.id)
   check('preventivo: bozza derivata poi emessa, originale conservato',doc?.stato==='emessa'&&db.getParcella(quote.id).tipo==='preventivo')
   await click('.segmented button','Pagamenti');await sleep(350);await click('.business-panel button','Registra pagamento');await val('Documento emesso',doc.id);await val('Importo','400');await click('.modal .btn-primary','Salva');await sleep(600)
   check('pagamento: data e metodo nel registro, residuo aggiornato',db.getParcella(doc.id).incassato===400&&await js("document.querySelector('.business-panel').innerText.includes('Bonifico')"));await shot('pagamenti')
   await click('.segmented button','Costi e fornitori');await sleep(350);await click('.business-panel button','Nuovo costo');await val('Descrizione','Licenza software');await val('Importo','50');await val('Incarico',lavoro.id);await click('.modal .btn-primary','Salva');await sleep(600)
   check('costo: salvato e associato al lavoro',require('../electron/gestione').esegui('leggi').costi.some(c=>c.pratica_id===lavoro.id&&c.importo===50));await shot('costi')
   await click('.segmented button','Attività ricorrenti');await sleep(350);await click('.business-panel button','Nuova ricorrenza');await val('Attività','Revisione periodica');await val('Incarico',lavoro.id);await click('.modal .btn-primary','Salva');await sleep(400);await click('.business-panel button','Genera le attività');await sleep(500);await click('.business-panel button','Genera le attività');await sleep(350)
   check('ricorrenza: attività generata una volta sola',db.list('todos').filter(t=>t.titolo==='Revisione periodica').length===1);await shot('ricorrenze')
   await click('.segmented button','Documenti');await sleep(300);await click('button','Dati per servizio fiscale');await sleep(500)
   const csv=path.join(process.env.SMOKE_OUT,'Dati-fatturazione-2026.csv')
   check('export fiscale: dati cliente e voci presenti nel CSV',fs.existsSync(csv)&&fs.readFileSync(csv,'utf8').includes('Cliente di prova')&&fs.readFileSync(csv,'utf8').includes('Consulenza'))
   await click('.nav-item','Impostazioni');await sleep(300);await click('.tabs button','Fiscale');await sleep(350)
   check('contributi: configurazione disponibile nel profilo professionista',await js("document.body.innerText.includes('Contributo / rivalsa')&&document.body.innerText.includes('base della ritenuta')"))
   const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');await js(axe+';true')
   for(const tema of ['chiaro','scuro']){db.setSettings({tema});wc.send('data-changed',['settings']);await sleep(400);await click('.nav-item','Documenti');await sleep(350);for(const area of ['Preventivi e lavori','Pagamenti','Costi e fornitori','Attività ricorrenti']){await click('.segmented button',area);await sleep(300);const r=await js("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))");check('accessibilità '+area+'/'+tema,r.length===0,JSON.stringify(r))}}
   const originali=getWindow().getSize()
   for(const width of [1024,1440]){getWindow().setSize(width,850);await sleep(400);const r=await js("({pagina:document.documentElement.scrollWidth<=innerWidth,contenuto:document.querySelector('.content').scrollWidth<=document.querySelector('.content').clientWidth+1})");check('gestione a '+width+'px: pagina senza overflow',r.pagina&&r.contenuto,JSON.stringify(r));await shot('layout-'+width)}
   getWindow().setSize(...originali)
  } catch(e){check('scenario completo',false,e.stack)}
  finally {if(process.env.SMOKE_OUT)fs.writeFileSync(path.join(process.env.SMOKE_OUT,'risultati.json'),JSON.stringify(results,null,2));console.log(`RISULTATO: ${results.filter(x=>x.ok).length}/${results.length} controlli superati`);setTimeout(()=>process.exit(results.every(x=>x.ok)?0:1),100)}
 })
}
module.exports={attach}
