import {build} from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tio-profili-'))
try {
 const modules={}
 for(const [name,entry] of Object.entries({calc:'src/lib/calc.ts',defaults:'src/lib/defaults.ts',print:'src/lib/print.ts',report:'src/lib/report.ts'})){
  await build({configFile:false,logLevel:'silent',build:{lib:{entry,formats:['es'],fileName:()=>name+'.mjs'},outDir:dir,emptyOutDir:false,minify:false}})
  modules[name]=await import(pathToFileURL(path.join(dir,name+'.mjs')).href)
 }
 const {calcolaParcella}=modules.calc,{PRESET_PROFESSIONISTA,PRESET_IMPRESA,DEFAULT_SETTINGS}=modules.defaults
 assert.equal(PRESET_PROFESSIONISTA.etichette.pratiche,'Incarichi');assert.equal(PRESET_IMPRESA.etichette.pratiche,'Commesse');assert.equal(PRESET_PROFESSIONISTA.aliquote.cpa,0)
 console.log('ok 1 - profili distinti con termini e contributo iniziale neutro')
 const voci=[{tipo:'compenso',descrizione:'Consulenza',quantita:1,importo:100}],a={sg:0,cpa:4,iva:22,rit:20,bollo:0}
 const escluso=calcolaParcella(voci,a),incluso=calcolaParcella(voci,{...a,contributo_ritenuta:true})
 assert.equal(escluso.ritenuta,20);assert.equal(incluso.ritenuta,20.8);assert.equal(incluso.netto,106.08);assert.equal(escluso.iva,incluso.iva)
 console.log('ok 2 - contributo configurabile: base IVA invariata, inclusione nella ritenuta esplicita e importi arrotondati')
 const p={id:1,numero:'PR 1/2026',data:'2026-10-27',anno:2026,tipo:'preventivo',cliente_id:1,validita:'2026-11-30',contributo_nome:'Rivalsa <script>x</script>',cpa_perc:4,iva_perc:22,rit_perc:20,...incluso,voci}
 const settings={...DEFAULT_SETTINGS,...PRESET_PROFESSIONISTA},html=modules.print.parcellaHtml(p,voci,null,settings,settings.etichette)
 assert.ok(html.includes('Rivalsa &lt;script&gt;'));assert.ok(!html.includes('<script>x</script>'));assert.ok(html.includes('30/11/2026'))
 console.log('ok 3 - PDF: denominazione contributo e validità del preventivo, testo ostile trattato come testo')
 const csv=modules.report.datiFatturazioneCsv([p],new Map([[1,{denominazione:'=formula',partita_iva:'00123456789',pec:'test@example.test',indirizzo:'Via; Prova'}]]))
 assert.ok(csv.includes("'=formula"));assert.ok(csv.includes('00123456789'));assert.ok(csv.includes('test@example.test'));assert.ok(csv.includes('"Via; Prova"'));assert.ok(csv.includes('Consulenza'))
 console.log('ok 4 - esportazione fiscale: voci e destinatario, zeri iniziali, separatori protetti e formule neutralizzate')
} finally {fs.rmSync(dir,{recursive:true,force:true})}
