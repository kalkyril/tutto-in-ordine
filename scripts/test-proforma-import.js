'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const importer=require('../electron/proforma-import'),{creaZip}=require('../electron/zip')
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mngmnt-import-proforma-'))
let count=0; const ok=s=>console.log(`ok ${++count} - ${s}`)
const plain="Onorari\n€ 1.000,00\nSpese generali (15%)\n€ 150,00\nCassa Avvocati (4%)\n€ 46,00\nTotale imponibile\n€ 1.196,00\nIVA 22% su imponibile\n€ 263,12\nTotale documento\n€ 1.459,12\nRitenuta d'acconto 20%\n€ 230,00\nNetto a pagare\n€ 1.229,12"
async function main(){try{
 const result=importer.interpreta(plain); assert.equal(result.voci[0].importo,1000);assert.deepEqual(result.aliquote,{sg_perc:15,cpa_perc:4,iva_perc:22,rit_perc:20});assert.equal(result.nettoOriginale,1229.12);ok('riepilogo fiscale e netto italiano, senza duplicare imponibile o totale')
 const sameLine=importer.interpreta(plain.replace(/\n€/g,' €'));assert.deepEqual(sameLine,result);ok('colonne Word e righe PDF producono gli stessi dati')
 assert.throws(()=>importer.interpreta(plain+'\nOnorari € 500,00'),/Più importi/);assert.throws(()=>importer.interpreta('Onorari € -10,00'),/Importo non valido/);assert.throws(()=>importer.interpreta('Testo generico senza compensi'),/non riconosciuto/);ok('documenti multipli, importi negativi e testo non pertinente rifiutati')
 assert.throws(()=>importer.interpreta('Onorari € 100,00\nIVA € 22,00'),/Percentuale/);ok('nessuna aliquota inventata quando manca la percentuale')
 const quote=importer.interpreta('Compenso tabellare € 1.985,00\nSpese generali (15%) € 297,75\nIPOTESI DI COMPENSO LIQUIDABILE € 2.282,75');assert.equal(quote.nettoOriginale,2282.75);assert.equal(quote.aliquote.cpa_perc,0);ok('prospetto di compenso senza accessori convertito senza aggiungere IVA o CPA')
 const changed=importer.interpreta('Compenso tabellare € 100,00\nCompenso totale € 120,00\nNetto a pagare € 120,00');assert.equal(changed.voci[0].importo,120);ok('compenso finale dopo le variazioni preferito alla base delle fasi')
 const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+plain.split('\n').map(s=>'<w:p><w:r><w:t>'+esc(s)+'</w:t></w:r></w:p>').join('')+'</w:body></w:document>'
 const file=path.join(dir,'documento.docx');fs.writeFileSync(file,creaZip([{nome:'word/document.xml',dati:Buffer.from(xml)}]));assert.equal((await importer.leggi(file)).nettoOriginale,1229.12);ok('lettura DOCX reale nel worker, senza scritture dati o servizi esterni')
 await assert.rejects(()=>importer.leggi(path.join(dir,'script.html')),/Scegli/);fs.writeFileSync(file,'ZIP non valido');await assert.rejects(()=>importer.leggi(file),/ZIP|archivio/);ok('formati attivi e contenitore Word danneggiato rifiutati')
}finally{fs.rmSync(dir,{recursive:true,force:true})}console.log(`${count} prove importazione superate`)}
main().catch(e=>{console.error(e);process.exitCode=1})
