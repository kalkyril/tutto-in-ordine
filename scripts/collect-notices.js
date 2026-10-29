'use strict'
// Testi effettivi dei pacchetti installati: comprende anche React/Lucide, incorporati dal bundle Vite.
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'..'),out=path.join(root,'licenses','packages')
function find(start,name){let current=start;while(true){const file=path.join(current,'node_modules',name,'package.json');if(fs.existsSync(file))return path.dirname(file);const parent=path.dirname(current);if(parent===current)throw Error('Pacchetto non trovato: '+name);current=parent}}
function collect(){
 fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true})
 const found=new Map(),missing=[]
 function visit(dir){const meta=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));const key=meta.name+'@'+meta.version;if(found.has(key))return
  const texts=[]
  function notices(folder,relative=''){for(const e of fs.readdirSync(folder,{withFileTypes:true})){if(e.isSymbolicLink())continue;const rel=relative?relative+'/'+e.name:e.name;if(e.isDirectory()){if(e.name!=='node_modules')notices(path.join(folder,e.name),rel)}else if(/^(license|licence|notice|copying|copyright)([._-]|$)/i.test(e.name))texts.push(rel)}}
  notices(dir)
  const dest=path.join(out,key.replace(/[^a-zA-Z0-9.@_-]/g,'_'));fs.mkdirSync(dest)
  for(const file of texts){fs.mkdirSync(path.dirname(path.join(dest,file)),{recursive:true});fs.copyFileSync(path.join(dir,file),path.join(dest,file))}
  found.set(key,{name:meta.name,version:meta.version,license:meta.license,repository:meta.repository,files:texts.map(f=>'packages/'+path.basename(dest)+'/'+f)})
  if(!texts.length) {
    const extra = meta.name.startsWith('@tesseract.js-data/') ? ['native/notices/tessdata/LICENSE'] : meta.name.startsWith('@napi-rs/canvas-') ? ['packages/'+('@napi-rs/canvas@'+meta.version).replace(/[^a-zA-Z0-9.@_-]/g,'_')+'/LICENSE','native/notices/skia/LICENSE'] : meta.name==='is-url' ? ['upstream/is-url-MIT.txt'] : meta.name==='tr46' ? ['upstream/tr46-MIT.txt'] : []
    found.get(key).upstreamNotices=extra
    if(!extra.length || extra.some(f=>!fs.existsSync(path.join(root,'licenses',f))))missing.push(key)
  }
  for(const name of Object.keys(meta.dependencies||{}))visit(find(dir,name))
 }
 for(const name of [...Object.keys(require('../package.json').dependencies),'react','react-dom','lucide-react'])visit(find(root,name))
 for(const name of fs.readdirSync(path.join(root,'node_modules','@napi-rs')).filter(n=>n.startsWith('canvas-')))visit(path.join(root,'node_modules','@napi-rs',name))
 fs.copyFileSync(path.join(root,'node_modules','electron','dist','LICENSE'),path.join(root,'licenses','upstream','Electron-MIT.txt'))
 fs.copyFileSync(path.join(root,'node_modules','electron','dist','LICENSES.chromium.html'),path.join(root,'licenses','upstream','Chromium-Notices.html'))
 if(missing.length)throw new Error('Licenze mancanti: '+missing.join(', '))
 const native=require('./check-native-licenses').verify()
 fs.writeFileSync(path.join(root,'licenses','inventory.json'),JSON.stringify({version:require('../package.json').version,packages:[...found.values()],packagesWithoutLicenseFile:missing,native},null,2)+'\n')
 require('./license-index')()
 console.log('Licenze raccolte:',found.size,'pacchetti; senza testo nel pacchetto:',missing.join(', '))
 return missing
}
if(require.main===module)collect();module.exports=collect
