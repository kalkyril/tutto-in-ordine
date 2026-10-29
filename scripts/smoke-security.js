'use strict'
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http')
const { BrowserWindow } = require('electron'), { pathToFileURL } = require('node:url')
let sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
function attach({ getWindow, db }) {
 const win = getWindow(), wc = win.webContents, results = [], out = process.env.SMOKE_OUT || os.tmpdir()
 sleep = require('./lib/attesa').adattiva(wc)
 const js = code => wc.executeJavaScript(code,true), check = (name,ok) => { results.push({name,ok:!!ok});console.log((ok?'PASS ':'FAIL ')+name) }
 wc.once('did-finish-load',async()=>{
  let server, stranger
  try {
   await sleep(500);db.setSettings({onboarding_fatto:true,backup_automatico:false});wc.send('data-changed',['settings'])
   const prefs=wc.getLastWebPreferences();check('renderer con sandbox, isolamento e senza Node',prefs.sandbox&&prefs.contextIsolation&&!prefs.nodeIntegration)
   let requests=0;server=http.createServer((_req,res)=>{requests++;res.end('RISORSA REMOTA SINTETICA')})
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port
   const csp=await js("document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content")
   check('CSP di produzione senza connessioni, frame, oggetti o moduli esterni',csp.includes("connect-src 'none'")&&csp.includes("frame-src 'none'")&&csp.includes("object-src 'none'")&&csp.includes("form-action 'none'"))
   check('connessione dal renderer bloccata prima di raggiungere il server',await js(`fetch(${JSON.stringify(base+'/renderer')}).then(()=>false,()=>true)`)&&requests===0)
   const notification=await js('Notification.requestPermission()');check('notifiche web non autorizzate negate',notification==='denied')
   stranger=new BrowserWindow({show:false,webPreferences:{preload:path.resolve(__dirname,'../electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}})
   await stranger.loadURL('data:text/html,<html><body>Finestra di prova</body></html>')
   const rejected=await stranger.webContents.executeJavaScript("window.mngmnt.invoke('db:list','pratiche').then(()=>false,e=>e.message.includes('Origine della richiesta'))")
   check('finestra estranea non può leggere SQLite tramite IPC',rejected);stranger.destroy();stranger=null
   const fake=path.join(db.getDataDir(),'estraneo','dist','index.html');fs.mkdirSync(path.dirname(fake),{recursive:true});fs.writeFileSync(fake,'<html>Pagina estranea</html>')
   const original=wc.getURL();await js(`location.href=${JSON.stringify(pathToFileURL(fake).href)}`);await sleep(200)
   check('un altro file chiamato dist/index.html non sostituisce la pagina autorizzata',wc.getURL()===original)
   const before=fs.readdirSync(os.tmpdir()).filter(f=>f.startsWith('mngmnt-print-'))
   const canvas=require('@napi-rs/canvas').createCanvas(40,40),ctx=canvas.getContext('2d');ctx.fillStyle='#4338ca';ctx.fillRect(0,0,40,40)
   const html=`<html><head><meta charset="utf-8"><style>@import url('${base}/stile');</style></head><body><p>Documento sintetico prova riservatezza</p><img src="${base}/immagine"><img src="data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}"><script>window.eseguito=true</script></body></html>`
   const dest=path.join(db.getDataDir(),'esportati');fs.mkdirSync(dest);process.env.MNGMNT_TEST_PDF_DIR=dest
   const pdf=await js(`window.mngmnt.invoke('pdf:print',${JSON.stringify(html)},'prova-privacy')`)
   check('esportazione PDF reale completata con immagine incorporata',fs.readFileSync(pdf).subarray(0,5).toString()==='%PDF-')
   const text=await require('../electron/doctext').estraiFileAsync(pdf,'prova-privacy.pdf')
   check('testo del PDF generato leggibile',text.text.includes('prova riservatezza'))
   check('stampa senza richieste HTTP anche con immagini e CSS esterni',requests===0)
   check('HTML temporaneo eliminato dopo la stampa',fs.readdirSync(os.tmpdir()).filter(f=>f.startsWith('mngmnt-print-')&&!before.includes(f)).length===0)
   const preview=await js(`window.mngmnt.invoke('pdf:preview',${JSON.stringify(html)},1)`)
   check('anteprima PDF rasterizzata senza eseguire script né richieste HTTP',preview.immagine.startsWith('data:image/png;base64,')&&preview.pagine===1&&requests===0)
   check('anteprima rifiuta pagine non valide',await js(`window.mngmnt.invoke('pdf:preview','<html>Prova</html>',0).then(()=>false,()=>true)`))
   const coalesced=await js(`Promise.all([1,2,3].map(n=>window.mngmnt.invoke('pdf:preview','<html><body>Anteprima '+n+'</body></html>',1))).then(r=>r.map(v=>v===null?'superseded':v.pagine))`)
   check('anteprime serializzate con sostituzione delle modifiche in attesa',coalesced[0]===1&&coalesced[1]==='superseded'&&coalesced[2]===1)
   check('interfaccia ancora operativa dopo le richieste rifiutate',await js("window.mngmnt.invoke('app:info').then(r=>!!r.version)"))
  }catch(e){console.error(e);check(String(e),false)}finally{
   if(stranger&&!stranger.isDestroyed())stranger.destroy();if(server)await new Promise(resolve=>server.close(resolve))
   fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'risultati.json'),JSON.stringify(results,null,2));console.log(`RISULTATO: ${results.filter(r=>r.ok).length}/${results.length} controlli superati`);setTimeout(()=>process.exit(results.some(r=>!r.ok)?1:0),200)
  }
 })
}
module.exports={attach}
