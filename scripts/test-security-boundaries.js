'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { appPage, isAppUrl, denyUnusedPermissions, printResourceAllowed } = require('../electron/web-policy')
const { createSource } = require('../electron/print-pdf'), calendars = require('../electron/calendari')
let n = 0; const ok = s => console.log(`ok ${++n} - ${s}`)
;(async () => {
  assert.ok(isAppUrl(appPage + '#agenda'));assert.ok(isAppUrl(appPage + '?tab=backup'))
  for (const url of ['file:///tmp/estraneo/dist/index.html','https://example.invalid/dist/index.html','javascript:void(0)','file://' + appPage.slice(7) + '/altro']) assert.equal(isAppUrl(url),false)
  assert.ok(isAppUrl('http://localhost:5173/#agenda',true));assert.equal(isAppUrl('http://localhost:5173.attacker.invalid',true),false);assert.equal(isAppUrl('http://localhost:51730',true),false)
  ok('navigazione limitata alla pagina esatta e all’origine locale di sviluppo')
  let check, request; const trusted = {}, external = {}
  denyUnusedPermissions({setPermissionCheckHandler:f=>check=f,setPermissionRequestHandler:f=>request=f},wc=>wc===trusted)
  for (const permission of ['media','geolocation','notifications','clipboard-read','display-capture','unknown']) {assert.equal(check(trusted,permission),false);request(trusted,permission,r=>assert.equal(r,false))}
  assert.equal(check(trusted,'clipboard-sanitized-write'),true);assert.equal(check(external,'clipboard-sanitized-write'),false)
  ok('permessi non necessari negati; sola scrittura degli appunti limitata alla finestra autorizzata')
  assert.equal(printResourceAllowed(appPage,appPage),true);assert.equal(printResourceAllowed('file:///tmp/NOME~1/documento.html','file:///tmp/NOME%7E1/documento.html'),true);assert.equal(printResourceAllowed('file:///tmp/NOME~1/altro.html','file:///tmp/NOME%7E1/documento.html'),false);assert.equal(printResourceAllowed('data:image/png;base64,AAAA',appPage),true)
  for (const url of ['https://example.invalid/x','http://127.0.0.1/x','file:///etc/passwd','file:///tmp/altro.html','javascript:void(0)'])assert.equal(printResourceAllowed(url,appPage),false)
  ok('stampa senza rete e senza letture arbitrarie di altri file locali')
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'mngmnt-private-print-test-'))
  try {
    const first=createSource('<p>Documento sintetico</p>',root),second=createSource('<p>Altro</p>',root)
    assert.notEqual(first.file,second.file)
    if(process.platform!=='win32'){assert.equal(fs.statSync(path.dirname(first.file)).mode&0o777,0o700);assert.equal(fs.statSync(first.file).mode&0o777,0o600)}
    first.cleanup();second.cleanup();assert.equal(fs.readdirSync(root).length,0)
    assert.throws(()=>createSource(null,root),/non valido/);assert.throws(()=>createSource('a'.repeat(16*1024*1024+1),root),/troppo grande/);assert.equal(fs.readdirSync(root).length,0)
    ok('HTML temporanei privati, nomi non prevedibili, pulizia e limiti prima della scrittura')
  } finally {fs.rmSync(root,{recursive:true,force:true})}
  const original = global.fetch
  try {
    let pulls=0,canceled=false
    global.fetch=async()=>new Response(new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(1024*1024))},cancel(){canceled=true}}))
    await assert.rejects(calendars.scarica('https://example.invalid/feed.ics'),/troppo grande/);assert.ok(canceled&&pulls<=28)
    ok('feed senza Content-Length interrotto durante il download oltre 25 MB')
    let headerCanceled=false
    global.fetch=async()=>new Response(new ReadableStream({cancel(){headerCanceled=true}}),{headers:{'content-length':String(26*1024*1024)}})
    await assert.rejects(calendars.scarica('https://example.invalid/feed.ics'),/troppo grande/);assert.ok(headerCanceled)
    ok('feed dichiarato troppo grande cancellato prima della lettura')
    global.fetch=async()=>new Response('BEGIN:VCALENDAR\nEND:VCALENDAR',{headers:{etag:'"test"'}})
    const result=await calendars.scarica('https://example.invalid/feed.ics');assert.equal(result.testo,'BEGIN:VCALENDAR\nEND:VCALENDAR');assert.equal(result.etag,'"test"')
    ok('feed valido e metadati conservati dopo la lettura limitata')
  } finally {global.fetch=original}
  console.log(`${n} prove dei confini di sicurezza superate`)
})().catch(e=>{console.error(e);process.exitCode=1})
