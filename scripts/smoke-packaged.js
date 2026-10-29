'use strict'
// Verifica le librerie e i worker nell’app realmente impacchettata, usando dati temporanei.
const fs=require('node:fs'),path=require('node:path')
function makePdf(text) {
 const stream=`BT /F1 24 Tf 40 150 Td (${text}) Tj ET`, objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 250] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
 let result='%PDF-1.4\n',offsets=[];objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(result));result+=`${i+1} 0 obj\n${obj}\nendobj\n`});const xref=Buffer.byteLength(result)
 return Buffer.from(result+`xref\n0 6\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
}
function attach({getWindow,db}) {
 const wc=getWindow().webContents,js=(code)=>wc.executeJavaScript(code,true),results=[]
 const check=(name,ok)=>{results.push({name,ok:!!ok});console.log((ok?'PASS ':'FAIL ')+name)}
 wc.once('did-finish-load',async()=>{
  try {
   await new Promise(r=>setTimeout(r,600));db.setSettings({onboarding_fatto:true,backup_automatico:false});wc.send('data-changed',['settings'])
   // su un computer lento l'interfaccia può metterci qualche secondo: si attende fino a 20 s invece di una pausa fissa
   let caricata=false;for(let t0=Date.now();!caricata&&Date.now()-t0<20000;await new Promise(r=>setTimeout(r,200)))caricata=await js("!!document.querySelector('.app')")
   check('interfaccia caricata dal pacchetto',caricata)
   const expectedRuntime=JSON.parse(fs.readFileSync(path.join(process.resourcesPath,'licenses/native/manifest.json'),'utf8')).versions.electron
   check('CSP di produzione e runtime previsto nel pacchetto',process.versions.electron===expectedRuntime&&require('../electron/aggiornamenti').confronta(process.versions.electron,'44.9.1')>=0&&await js("document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content.includes(\"connect-src 'none'\")"))
   let printRequests=0;const printServer=require('node:http').createServer((_req,res)=>{printRequests++;res.end('risorsa di prova')})
   await new Promise(resolve=>printServer.listen(0,'127.0.0.1',resolve))
   try {
    const destination=path.join(db.getDataDir(),'pdf-test');fs.mkdirSync(destination);process.env.MNGMNT_TEST_PDF_DIR=destination
    const html=`<html><body>Prova di stampa locale<img src="http://127.0.0.1:${printServer.address().port}/immagine"></body></html>`
    const printed=await js(`window.mngmnt.invoke('pdf:print',${JSON.stringify(html)},'prova-locale')`)
    check('stampa PDF dal pacchetto senza caricare risorse in rete',fs.readFileSync(printed).subarray(0,5).toString()==='%PDF-'&&printRequests===0)
   } finally {await new Promise(resolve=>printServer.close(resolve))}
   const licenses=await js("window.mngmnt.invoke('app:licenseFolder')"),index=await js("window.mngmnt.invoke('app:licenses')")
   check('licenze e sorgenti leggibili fuori da ASAR nel pacchetto',licenses===path.join(process.resourcesPath,'licenses')&&path.dirname(index)===licenses&&fs.readFileSync(index,'utf8').includes('sources/mpl/')&&fs.existsSync(path.join(licenses,'native/sources/liberation-fonts-1.07.4.tar.gz')))
   const nativeCatalog=JSON.parse(fs.readFileSync(path.join(licenses,'native/manifest.json'),'utf8')),hash=file=>require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')
   check('avvisi integri e sandbox QuickJS escluso dal pacchetto',nativeCatalog.files.every(e=>hash(path.join(licenses,'native',e.file))===e.sha256)&&nativeCatalog.excluded.every(e=>!fs.existsSync(path.join(process.resourcesPath,'app.asar',e))&&!fs.existsSync(path.join(process.resourcesPath,'app.asar.unpacked',e))))
   const data=db.getDataDir(),p=db.save('pratiche',{titolo:'Verifica pacchetto'}),pdf=path.join(data,'contratto.pdf');fs.writeFileSync(pdf,makePdf('Contratto professionale Zanzibar'))
   const doc=require('../electron/docfile').collega(p.id,pdf)
   const extracted=await js(`window.mngmnt.invoke('documenti:indicizza',${doc.id},false)`)
   check('worker PDF e modulo grafico caricati dal pacchetto',extracted?.caratteri>0)
   const hits=await js("window.mngmnt.invoke('db:search','Zanzibar')");check('ricerca PDF operativa nel pacchetto',hits.some(hit=>hit.id===doc.id&&hit.kind==='documento'))
   const {createCanvas}=require('@napi-rs/canvas'),canvas=createCanvas(1200,240),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,240);ctx.fillStyle='#000';ctx.font='52px sans-serif';ctx.fillText('CONTRATTO PROFESSIONALE',40,120)
   const image=path.join(data,'scansione.png');fs.writeFileSync(image,canvas.toBuffer('image/png'));const scan=require('../electron/docfile').collega(p.id,image)
   const ocr=await js(`window.mngmnt.invoke('documenti:indicizza',${scan.id},true)`);check('OCR con worker WASM e modelli inclusi nel pacchetto',ocr?.stato==='ocr'&&ocr.caratteri>10)
   const exported=path.join(data,'fattura.docx'),xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Onorari € 1.000,00</w:t></w:r></w:p><w:p><w:r><w:t>Netto a pagare € 1.000,00</w:t></w:r></w:p></w:body></w:document>'
   fs.writeFileSync(exported,require('../electron/zip').creaZip([{nome:'word/document.xml',dati:Buffer.from(xml)}]));process.env.MNGMNT_TEST_PROFORMA_FILE=exported
   const importedWord=await js("window.mngmnt.invoke('import:proforma')");check('importazione Word locale operativa nel pacchetto',importedWord?.voci?.[0]?.importo===1000&&importedWord.nettoOriginale===1000)
   const exportedPdf=path.join(data,'riepilogo.pdf');fs.writeFileSync(exportedPdf,makePdf('Onorari 1.000,00'));process.env.MNGMNT_TEST_PROFORMA_FILE=exportedPdf
   const importedPdf=await js("window.mngmnt.invoke('import:proforma')");check('importazione PDF locale operativa nel pacchetto',importedPdf?.voci?.[0]?.importo===1000)
   check('schema previsto, revisione e gestione inclusi nel pacchetto',db.getDb().prepare('PRAGMA user_version').get().user_version===db.SCHEMA_VERSION&&db.getDb().prepare('PRAGMA table_info(parcelle)').all().some(c=>c.name==='importazione')&&Object.entries(db.backupBusinessSchema).every(([t,cols])=>{const presenti=db.getDb().prepare('PRAGMA table_info('+t+')').all().map(c=>c.name);return cols.every(c=>presenti.includes(c))}))
   const review=await js("window.mngmnt.invoke('parcella:save',{data:'2026-10-14',tipo:'proforma',stato:'bozza',netto:100,totale:100,voci:[{tipo:'compenso',descrizione:'Dato sintetico',quantita:1,importo:100}],importazione:{version:1,nettoOriginale:80}})")
   check('revisione della pro forma persistente nel pacchetto',JSON.parse(db.getParcella(review.id).importazione).nettoOriginale===80)
   check('emissione importata bloccata fino alla verifica nel pacchetto',await js(`window.mngmnt.invoke('parcella:save',${JSON.stringify({...review,stato:'emessa'})}).then(()=>false,e=>e.message.includes('Verifica'))`))
   const storage=require('electron').safeStorage;check('runtime con API asincrone del portachiavi',typeof storage.encryptStringAsync==='function'&&typeof storage.decryptStringAsync==='function')
   const missingDest=path.join(data,'automatici');fs.mkdirSync(missingDest);db.setSettings({backup_cifrato:true})
   await require('../electron/backup').autoBackupAsync({...db.getSettings(),backup_automatico:true,backup_cartella:missingDest},null,{passwordProvider:()=>require('../electron/backup-key').password()})
   check('chiave assente impedisce copie automatiche in chiaro dal pacchetto',db.getSettings().backup_esito==='errore'&&db.getSettings().backup_cifrato===true&&fs.readdirSync(missingDest).length===0)
   const dest=await js(`window.mngmnt.invoke('backup:run',${JSON.stringify(path.join(data,'backup-test'))},{includeLinked:true,password:'Password-di-prova-2026'})`)
   check('backup cifrato prodotto da un worker nel pacchetto',fs.existsSync(path.join(dest,'indice.enc'))&&!fs.existsSync(path.join(dest,'mngmnt.db')))
   const verified=await require('../electron/backup').inspectAsync(dest,'Password-di-prova-2026');check('backup portabile decifrato e verificato dal pacchetto',verified.valido&&verified.documenti===2)
   require('../electron/backup').restore(dest,'Password-di-prova-2026');check('ripristino cifrato e revisione operativi dal pacchetto',db.verificaIntegrita()&&JSON.parse(db.getParcella(review.id).importazione).nettoOriginale===80)
   await js(`window.mngmnt.invoke('documenti:anteprima',${doc.id})`); await new Promise(r=>setTimeout(r,600))
   const preview=require('electron').BrowserWindow.getAllWindows().find(window=>window!==getWindow())
   check('anteprima PDF aperta in una finestra isolata',!!preview&&preview.webContents.getURL().startsWith('file:'))
   if(preview&&process.env.SMOKE_OUT){fs.mkdirSync(process.env.SMOKE_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.SMOKE_OUT,'anteprima-pdf.png'),(await preview.webContents.capturePage()).toPNG())}
   await js("window.mngmnt.invoke('app:blocca')");check('blocco chiude le anteprime dei documenti',require('electron').BrowserWindow.getAllWindows().length===1)
   check('API blocco accessibile dalla finestra autorizzata',!(await js("window.mngmnt.invoke('app:statoBlocco')")).attivo)
   console.log(`\nRISULTATO: ${results.filter(r=>r.ok).length}/${results.length} controlli superati`)
   if(process.env.SMOKE_OUT){fs.mkdirSync(process.env.SMOKE_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.SMOKE_OUT,'risultati.json'),JSON.stringify(results,null,2))}
  }catch(error){console.log('ERRORE PACCHETTO',error)}finally{setTimeout(()=>process.exit(results.length===21&&results.every(r=>r.ok)?0:1),200)}
 })
}
module.exports={attach}
