'use strict'
// Prove diagnostiche della versione corrente. Non modificano il codice applicativo.
// Exit 1 se vengono riprodotte criticità; esiti JSON in AUDIT_OUT (solo dati sintetici).
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const db = require('../electron/db'), docfile = require('../electron/docfile'), text = require('../electron/doctext'), backup = require('../electron/backup')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-audit-limiti-'))
const observations = []
function result(id, title, ok, actual) { observations.push({ id, title, ok, actual }); console.log(`${ok ? 'PASS' : 'CRITICITA'} ${id}: ${title} ${JSON.stringify(actual)}`) }
function pdf(content) {
  const stream=`BT /F1 24 Tf 40 150 Td (${content}) Tj ET`, objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 250] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let data='%PDF-1.4\n';const offsets=[];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${o}\nendobj\n`});const xref=Buffer.byteLength(data)
  return Buffer.from(data+'xref\n0 6\n0000000000 65535 f \n'+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
}
async function main() {
  try {
    db.open(path.join(root,'data'))
    const p=db.save('pratiche',{titolo:'Archivio sintetico'})
    const file=path.join(root,'documento.txt');fs.writeFileSync(file,'PrimaVersioneUnica')
    const doc=docfile.collega(p.id,file);await text.indicizzaDocumento(doc.id)
    fs.writeFileSync(file,'NuovaVersioneUnica');docfile.sincronizza({praticaId:p.id});await text.indicizzaPendentiAsync(20)
    result('indice-modifica','Ricerca aggiornata dopo una modifica del file collegato',text.cercaNeiDocumenti('NuovaVersioneUnica').length===1&&text.cercaNeiDocumenti('PrimaVersioneUnica').length===0,{vecchiaVersione:text.cercaNeiDocumenti('PrimaVersioneUnica').length,nuovaVersione:text.cercaNeiDocumenti('NuovaVersioneUnica').length})

    const matchRoot=path.join(root,'abbinamento'),source=path.join(matchRoot,'lavoro','originale','contratto-collisione.txt'),other=path.join(matchRoot,'ritrovati','contratto-collisione.txt')
    fs.mkdirSync(path.dirname(source),{recursive:true});fs.mkdirSync(path.dirname(other),{recursive:true});fs.writeFileSync(source,'AAA');fs.writeFileSync(other,'BBB')
    const matching=docfile.collega(p.id,source);fs.unlinkSync(source)
    const report=docfile.sincronizza({praticaId:p.id,radici:[path.dirname(other)]})
    result('sincronizza-contenuto','Sincronizza non collega automaticamente un documento diverso',db.get('documenti',matching.id).percorso!==other,{ritrovati:report.ritrovati.filter(d=>d.id===matching.id).length,fileDiversoCollegato:db.get('documenti',matching.id).percorso===other,impronteDiverse:matching.impronta!==docfile.impronta(other)})

    const named=path.join(root,'contratto.pdf');fs.writeFileSync(named,pdf('ParolaPdfUnica'))
    const renamed=docfile.collega(p.id,named);db.save('documenti',{id:renamed.id,nome:'Contratto del cliente'})
    const renamedResult=await text.indicizzaDocumento(renamed.id)
    result('nome-visualizzato','PDF riconosciuto anche quando il nome mostrato non ha estensione',renamedResult.caratteri>0,{stato:renamedResult.stato,caratteri:renamedResult.caratteri})

    const unavailable=path.join(root,'temporaneamente-assente.txt');fs.writeFileSync(unavailable,'TestoRipristinatoUnico')
    const missing=docfile.collega(p.id,unavailable);fs.unlinkSync(unavailable)
    try { await text.indicizzaDocumento(missing.id) } catch { /* indisponibilità prevista */ }
    fs.writeFileSync(unavailable,'TestoRipristinatoUnico');await text.indicizzaPendentiAsync(20)
    result('indice-ripresa','Indice riprovato quando il file torna disponibile',text.cercaNeiDocumenti('TestoRipristinatoUnico').length===1,{ricerca:text.cercaNeiDocumenti('TestoRipristinatoUnico').length,stato:db.getDb().prepare('SELECT stato FROM documenti_testo WHERE documento_id=?').get(missing.id).stato})

    const quote=db.saveParcella({tipo:'preventivo',data:'2026-10-13',netto:100,voci:[{importo:100,quantita:1,descrizione:'Consulenza'}]})
    const invoice=db.saveParcella({...quote,tipo:'parcella'})
    result('conversione-serie','Preventivo convertito con numero della serie parcelle',!invoice.numero.startsWith('PR '),{prima:quote.numero,dopo:invoice.numero,prossima:db.nextParcellaNumero(2026).numero})

    const portable=backup.run(path.join(root,'backup'),{includeLinked:true})
    const manifest=JSON.parse(fs.readFileSync(path.join(portable,'manifest.json'),'utf8'))
    const copied=path.join(portable,manifest.linked.find(entry=>entry.id===doc.id).file),bytes=fs.readFileSync(copied);bytes[0]^=1;fs.writeFileSync(copied,bytes)
    let corruptionDetected=false;try { backup.inspect(portable) } catch { corruptionDetected=true }
    result('backup-integrita-file','Verifica rileva un documento alterato a dimensione invariata',corruptionDetected,{alterazioneRilevata:corruptionDetected})

    const cal=db.save('calendari',{nome:'Calendario ripristinato',url:'https://example.invalid/nuovo.ics',etag:'nuovo-etag'})
    const before=backup.run(path.join(root,'backup-calendario'))
    db.save('calendari',{id:cal.id,nome:'Calendario precedente',url:'https://example.invalid/vecchio.ics',etag:'vecchio-etag'})
    const originalFetch=global.fetch;let finish
    global.fetch=()=>new Promise(resolve=>{finish=resolve})
    try {
      const pending=require('../electron/calendari').sincronizza(cal.id)
      backup.restore(before)
      finish(new Response(null,{status:304}));await pending
      const current=db.get('calendari',cal.id)
      result('calendario-ripristino','Risposta precedente al ripristino non aggiorna il nuovo calendario',!current.ultimo_sync,{url:current.url,ultimoSyncAssegnato:!!current.ultimo_sync,esito:current.ultimo_esito})
    } finally { global.fetch=originalFetch }
    const clientB=db.save('anagrafica',{denominazione:'Cliente B sintetico'}),clientA=db.save('anagrafica',{denominazione:'Cliente A sintetico'})
    db.save('pratiche',{id:p.id,titolo:'Pratica del cliente B',cliente_id:clientB.id})
    const archive=backup.run(path.join(root,'backup-annulla'))
    db.save('pratiche',{id:p.id,titolo:'Pratica del cliente A',cliente_id:clientA.id})
    const callbacks=new Map()
    require('../electron/ipc/dati')({handle:(name,fn)=>callbacks.set(name,fn),changed:()=>{},onSettings:()=>{}})
    const note=db.save('note',{pratica_id:p.id,testo:'Nota riservata del cliente A'})
    const token=callbacks.get('db:deleteUndo')('note',note.id)
    backup.restore(archive)
    let undoRejected=false;try{callbacks.get('db:undo')(token)}catch{undoRejected=true}
    result('annulla-ripristino','Ripristino invalida i token Annulla dell’archivio precedente',undoRejected,{tokenPrecedenteAccettato:!undoRejected,notaEstraneaReinserita:!!db.get('note',note.id),praticaDopoRipristino:db.get('pratiche',p.id).titolo,notaReinserita:db.get('note',note.id)?.testo})
    const incomplete=path.join(root,'schema-incompleto');fs.mkdirSync(incomplete)
    const fake=new (require('node:sqlite').DatabaseSync)(path.join(incomplete,'mngmnt.db'))
    fake.exec('CREATE TABLE pratiche(id INTEGER PRIMARY KEY);CREATE TABLE anagrafica(id INTEGER PRIMARY KEY);CREATE TABLE settings(id INTEGER PRIMARY KEY);CREATE TABLE documenti(id INTEGER PRIMARY KEY)');fake.close()
    let schemaDetected=false;try {backup.inspect(incomplete)}catch{schemaDetected=true}
    result('backup-schema','Verifica rifiuta un database con schema incompleto',schemaDetected,{schemaIncompletoRifiutato:schemaDetected})
    const zip=require('../electron/zip'),payload=Buffer.alloc(1024*1024,65)
    const forged=zip.creaZip([{nome:'word/document.xml',dati:payload}])
    const central=forged.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));forged.writeUInt32LE(1,central+24)
    let zipRejected=false,decoded=0;try{decoded=zip.leggiZip(forged).leggi('word/document.xml').length}catch{zipRejected=true}
    result('zip-dimensione','ZIP rifiutato se la dimensione dichiarata non coincide con i dati',zipRejected,{byteDichiarati:1,byteEstratti:decoded,zipRifiutato:zipRejected})
    const interrupted=path.join(root,'interruzione-cifratura'),destination=path.join(interrupted,'destinazione')
    fs.mkdirSync(destination,{recursive:true})
    const child=require('node:child_process').spawnSync(process.execPath,['-e',`
      const fs=require('node:fs'),path=require('node:path'),db=require(${JSON.stringify(path.resolve(__dirname,'../electron/db'))}),backup=require(${JSON.stringify(path.resolve(__dirname,'../electron/backup'))});
      const root=process.argv[1];db.open(path.join(root,'data'));db.save('pratiche',{titolo:'RISERVATO_SOLAMENTE_DI_PROVA'});
      const write=fs.writeFileSync;fs.writeFileSync=function(file,...args){const value=write.call(this,file,...args);if(path.basename(file)==='LEGGIMI.txt')process.kill(process.pid,'SIGKILL');return value};
      backup.run(path.join(root,'destinazione'),{password:'Password-sintetica-2026'});
    `,interrupted],{encoding:'utf8',timeout:15000})
    if(child.signal!=='SIGKILL'&&!(process.platform==='win32'&&child.status!==0))throw Error('Interruzione di prova non eseguita: '+child.stderr)
    const leftovers=fs.readdirSync(destination).filter(name=>name.endsWith('.incomplete'))
    const plaintext=leftovers.some(name=>{const file=path.join(destination,name,'mngmnt.db');return fs.existsSync(file)&&fs.readFileSync(file).subarray(0,16).toString().startsWith('SQLite format 3')})
    result('backup-cifrato-interrotto','Interruzione del backup cifrato non lascia dati in chiaro nella destinazione',!plaintext,{cartelleIntermedie:leftovers.length,databaseInChiaro:plaintext})
  } finally {
    db.close();fs.rmSync(root,{recursive:true,force:true,maxRetries:10})
    if(process.env.AUDIT_OUT){fs.mkdirSync(process.env.AUDIT_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.AUDIT_OUT,'casi-limite.json'),JSON.stringify(observations,null,2))}
  }
  console.log(`\n${observations.filter(r=>!r.ok).length} criticità riprodotte su ${observations.length} prove mirate`)
  process.exitCode=observations.some(r=>!r.ok)?1:0
}
main().catch(error=>{console.error('ERRORE DI PROVA',error);process.exitCode=2})
