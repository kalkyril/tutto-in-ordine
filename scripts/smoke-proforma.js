'use strict'
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {creaZip}=require('../electron/zip')
let sleep=ms=>new Promise(r=>setTimeout(r,ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
function attach({getWindow,db}){
 const win=getWindow(),wc=win.webContents,out=process.env.SMOKE_OUT||os.tmpdir(),results=[]
 sleep=require('./lib/attesa').adattiva(wc)
 fs.mkdirSync(out,{recursive:true})
 const js=code=>wc.executeJavaScript(code,true).catch(error=>{console.log('SCRIPT NON RIUSCITO',code);throw error}),check=(label,ok)=>{results.push({label,ok:!!ok});console.log((ok?'PASS ':'FAIL ')+label)}
 const click=(selector,text)=>js(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(x=>!x.disabled).sort((a,b)=>(b.textContent.trim()===${JSON.stringify(text)})-(a.textContent.trim()===${JSON.stringify(text)})).find(x=>x.textContent.trim().includes(${JSON.stringify(text)}));if(!e)throw Error('Elemento assente: '+${JSON.stringify(text)});e.click()})()`)
 wc.once('did-finish-load',async()=>{try{
  db.setSettings({onboarding_fatto:true,backup_automatico:false,tema:'chiaro',studio:{nome:'Studio dimostrativo'}});wc.send('data-changed',['settings']);await sleep(600)
  const input='Onorari\n€ 1.000,00\nSpese generali (15%)\n€ 150,00\nCassa Avvocati (4%)\n€ 46,00\nIVA 22%\n€ 263,12\nRitenuta d’acconto 20%\n€ 230,00\nNetto a pagare\n€ 1.229,12'
  const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+input.split('\n').map(t=>'<w:p><w:r><w:t>'+t+'</w:t></w:r></w:p>').join('')+'</w:body></w:document>'
  const file=path.join(db.getDataDir(),'prova-import.docx');fs.writeFileSync(file,creaZip([{nome:'word/document.xml',dati:Buffer.from(xml)}]));process.env.MNGMNT_TEST_PROFORMA_FILE=file
  await click('.nav-item','Parcelle');await sleep(400);await click('.page-head button','Importa PDF / Word');await sleep(800)
  check('anteprima importa Word reale tramite IPC',await js("document.querySelector('.modal h2')?.textContent.includes('Verifica')"))
  check('netto originale e ricalcolato coincidono',await js("document.querySelector('.modal')?.textContent.includes('I totali coincidono')"))
  check('nessuna scrittura prima di aprire la bozza',db.list('parcelle').length===0)
  fs.writeFileSync(path.join(out,'importazione-anteprima.png'),(await wc.capturePage()).toPNG())
  await click('.modal button','Apri bozza');await sleep(500)
  check('editor compilato come nota pro forma',await js("document.querySelector('.modal h2')?.textContent.includes('nota pro forma')"))
  check('voce importata presente nell’editor',await js("document.querySelector('.modal')?.textContent.includes('1.229,12')"))
  check('PDF disabilitato finché i dati importati non sono verificati',await js("[...document.querySelectorAll('.modal-foot button')].find(b=>b.textContent.includes('PDF'))?.disabled"))
  await click('.modal .modal-foot button','Salva');await sleep(500)
  const saved=db.list('parcelle')[0];if(!saved)console.log('DIAGNOSTICA',await js("document.body.innerText"));check('salvataggio nella serie PF con netto corretto',saved?.numero==='PF 1/'+new Date().getFullYear()&&Math.abs(saved.netto-1229.12)<.001)
  check('nessun incasso o stato emesso inventato',saved?.stato==='bozza'&&saved.incassato===0)
  await click('table tbody tr',saved.numero);await sleep(250)
  check('revisione pendente persistente alla riapertura',await js("document.querySelector('[aria-label=\"Verifica dei dati importati\"]')?.textContent.includes('Importazione da verificare')"))
  await js("document.querySelector('[aria-label=\"Verifica dei dati importati\"] input').click()");await sleep(150)
  await click('.modal .modal-foot button','PDF');await sleep(1000)
  check('verifica esplicita salvata nel documento',JSON.parse(db.getParcella(saved.id).importazione).verificato)
  const pdfs=fs.readdirSync(out).filter(f=>f.endsWith('.pdf'));check('PDF TIO creato dall’editor',pdfs.length>0)
  await click('table tbody tr',saved.numero);await sleep(350)
  check('verifica conservata dopo il caricamento asincrono delle voci',await js("document.querySelector('[aria-label=\"Verifica dei dati importati\"] input')?.checked"))
  fs.writeFileSync(path.join(out,'proforma-editor.png'),(await wc.capturePage()).toPNG())
  const axe=require('axe-core');await js(axe.source);const audit=await js("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.map(v=>({id:v.id,n:v.nodes.length})))");check('editor senza violazioni automatiche WCAG',audit.length===0)
  win.setSize(980,640);await sleep(200);check('importatore senza overflow orizzontale',await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'))

  await click('.modal .modal-foot button','Chiudi');await sleep(150)
  // Una discrepanza da acconto rimane visibile; il bollo predefinito non viene aggiunto al documento importato.
  const second='Onorari € 100,00\nAcconto € 20,00\nNetto a pagare € 80,00'
  fs.writeFileSync(file,creaZip([{nome:'word/document.xml',dati:Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+second.split('\n').map(t=>'<w:p><w:r><w:t>'+t+'</w:t></w:r></w:p>').join('')+'</w:body></w:document>')}]))
  await click('.page-head button','Importa PDF / Word');await sleep(500)
  check('acconto non riconciliato segnalato nell’anteprima',await js("document.querySelector('.modal')?.textContent.includes('acconti o anticipi')"))
  await click('.modal button','Apri bozza');await sleep(250)
  check('bollo assente nell’originale non aggiunto dal valore predefinito',await js("document.querySelector('.totals-table')?.textContent.includes('100,00')&&!document.querySelector('.totals-table')?.textContent.includes('102,00')"))
  await click('.modal .modal-foot button','Salva');await sleep(250)
  const draft=db.list('parcelle').find(p=>p.id!==saved.id)
  check('bozza con differenza conservata e bollo zero',draft?.netto===100&&draft.bollo===0&&JSON.parse(draft.importazione).nettoOriginale===80)
  await click('table tbody tr',draft.numero);await sleep(300)
  check('differenza ancora visibile alla riapertura',await js("document.querySelector('[aria-label=\"Verifica dei dati importati\"]')?.textContent.includes('I totali differiscono')"))
  await js("document.querySelector('[aria-label=\"Verifica dei dati importati\"] input').click()");await sleep(100)
  await js("(()=>{const e=document.querySelector('.voci input[aria-label=\"Descrizione\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Descrizione modificata');e.dispatchEvent(new Event('input',{bubbles:true}))})()");await sleep(200)
  check('modifica di una voce richiede nuova verifica',await js("!!document.querySelector('[aria-label=\"Verifica dei dati importati\"] input')&&!document.querySelector('[aria-label=\"Verifica dei dati importati\"] input').checked"))
  await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await sleep(300)
  fs.writeFileSync(path.join(out,'importazione-differenze.png'),(await wc.capturePage()).toPNG())
  // Documento PDF testuale di due pagine, con riepilogo separato dalle voci.
  const {BrowserWindow}=require('electron'),reader=new BrowserWindow({show:false,webPreferences:{sandbox:true,javascript:false}})
  try{
    await reader.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html><body><h1>Prospetto sintetico</h1><p>Onorari € 100,00</p><div style="break-before:page"><h2>Riepilogo</h2><p>Netto a pagare € 100,00</p></div></body></html>'))
    const pdf=path.join(db.getDataDir(),'due-pagine.pdf');fs.writeFileSync(pdf,await reader.webContents.printToPDF({pageSize:'A4'}))
    const parsed=await require('../electron/proforma-import').leggi(pdf);check('PDF multipagina senza duplicazione delle voci',parsed.voci.length===1&&parsed.voci[0].importo===100&&parsed.nettoOriginale===100)
  }finally{reader.destroy()}

 }catch(e){console.log('ERRORE',e);results.push({label:String(e),ok:false})}finally{
  fs.writeFileSync(path.join(out,'risultati.json'),JSON.stringify(results,null,2));console.log(`RISULTATO: ${results.filter(r=>r.ok).length}/${results.length} controlli superati`);setTimeout(()=>process.exit(results.some(r=>!r.ok)?1:0),200)
 }})
}
module.exports={attach}
