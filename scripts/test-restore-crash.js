'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { spawnSync } = require('node:child_process')
const db = require('../electron/db'), backup = require('../electron/backup')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-restore-crash-'))
let n = 0
const ok = s => console.log(`ok ${++n} - ${s}`)
const child = `
const fs=require('node:fs'),path=require('node:path'),db=require('./electron/db'),backup=require('./electron/backup');
const [dir,source,point]=process.argv.slice(1);db.open(dir);
const rename=fs.renameSync,copy=fs.cpSync,copyFile=fs.copyFileSync;let failing=false;
const kill=()=>process.kill(process.pid,'SIGKILL');
fs.renameSync=function(a,b){const result=rename.apply(this,arguments);
 if(point==='pending'&&b===path.join(dir,'.restore-state.json'))kill();
 if(point==='old-db'&&b.endsWith('_precedente.db'))kill();
 if(point==='old-docs'&&b.endsWith('_precedenti-documenti'))kill();
 if(point==='new-db'&&path.basename(a)==='mngmnt.db'&&b===path.join(dir,'mngmnt.db'))kill();
 if(point==='rollback-db'&&a.endsWith('_recupero.db'))kill();
 if(point==='committed'&&b===path.join(dir,'.restore-state.json')&&JSON.parse(fs.readFileSync(b)).status==='committed')kill();
 return result;};
fs.cpSync=function(a,b){
 if(!failing&&b===path.join(dir,'documenti')&&!a.endsWith('_precedenti-documenti')){
   if(point==='partial-docs'){fs.mkdirSync(b,{recursive:true});fs.writeFileSync(path.join(b,'parziale.txt'),'parziale');kill();}
   if(point.startsWith('rollback-')||point==='disk-full'){failing=true;throw Object.assign(new Error('Disco pieno simulato'),{code:'ENOSPC'});}
 }
 if(point==='rollback-docs'&&a.endsWith('_precedenti-documenti')){fs.mkdirSync(b,{recursive:true});fs.writeFileSync(path.join(b,'incompleto'),'incompleto');kill();}
 return copy.apply(this,arguments);};
fs.copyFileSync=function(a,b){const r=copyFile.apply(this,arguments);if(point==='linked'&&b.includes('ripristinati-'))kill();return r;};
try{backup.restore(source);db.close();process.exit(0)}catch(e){db.close();if(point==='disk-full'&&e.message.includes('precedente recuperato'))process.exit(3);console.error(e);process.exit(2)}
`
try {
  const fixture = (dir, label) => {
    db.open(dir)
    const p = db.save('pratiche', { titolo: label })
    fs.writeFileSync(path.join(dir, 'documenti', 'atto.txt'), label)
    db.save('documenti', { pratica_id: p.id, nome: 'atto', file: 'atto.txt', dimensione: label.length })
    return p
  }
  const next = path.join(root, 'next'); const p = fixture(next, 'nuovo')
  const linked = path.join(root, 'esterno.txt'); fs.writeFileSync(linked, 'collegato')
  db.save('documenti', { pratica_id: p.id, nome: 'esterno', file: '', percorso: linked, dimensione: 9 })
  const source = backup.run(path.join(root, 'backup'), { includeLinked: true }); db.close()
  for (const point of ['pending', 'old-db', 'old-docs', 'new-db', 'partial-docs', 'linked', 'rollback-db', 'rollback-docs', 'committed', 'disk-full']) {
    const dir = path.join(root, point); fixture(dir, 'precedente'); db.close()
    const result = spawnSync(process.execPath, ['-e', child, dir, source, point], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000 })
    if (point === 'disk-full') assert.equal(result.status, 3, result.stderr)
    else assert.ok(result.signal === 'SIGKILL' || (process.platform === 'win32' && result.status !== 0), result.stderr || `Crash non provocato: ${point}`)
    const expected = point === 'committed' ? 'nuovo' : 'precedente'
    for (let restart = 0; restart < 2; restart++) {
      db.open(dir)
      assert.equal(db.list('pratiche')[0].titolo, expected)
      assert.equal(fs.readFileSync(path.join(dir, 'documenti', 'atto.txt'), 'utf8'), expected)
      assert.equal(db.verificaIntegrita(), true)
      assert.equal(db.getDb().prepare('PRAGMA foreign_key_check').all().length, 0)
      if (point === 'committed') {
        const doc = db.list('documenti').find(d => d.nome === 'esterno')
        assert.equal(fs.readFileSync(doc.percorso, 'utf8'), 'collegato')
      }
      db.close()
    }
    assert.ok(!fs.existsSync(path.join(dir, '.restore-state.json')))
    ok(`ripristino ${point}: archivio e documenti coerenti dopo due riavvii`)
  }
  const journalFailure = path.join(root, 'flush-registro'); fixture(journalFailure, 'precedente')
  const sync = fs.fsyncSync; let journalWritten = false
  const rename = fs.renameSync
  fs.renameSync = function(a,b) { const r = rename.apply(this,arguments); if(b===path.join(journalFailure,'.restore-state.json')) journalWritten=true; return r }
  fs.fsyncSync = function(fd) { if(journalWritten) throw new Error('Flush del registro fallito'); return sync.apply(this,arguments) }
  try { assert.throws(()=>backup.restore(source), /Flush/) } finally { fs.fsyncSync=sync; fs.renameSync=rename; db.close() }
  db.open(journalFailure); assert.equal(db.list('pratiche')[0].titolo,'precedente'); db.close()
  ok('errore nel flush del registro conserva l’area necessaria al recupero')
  const committedFailure = path.join(root, 'flush-commit'); fixture(committedFailure, 'precedente')
  let thrown = false
  fs.fsyncSync = function(fd) {
    const file = path.join(committedFailure,'.restore-state.json')
    if(!thrown && fs.existsSync(file) && JSON.parse(fs.readFileSync(file,'utf8')).status==='committed') { thrown=true; throw new Error('Flush finale interrotto') }
    return sync.apply(this,arguments)
  }
  // su Windows le cartelle non si sincronizzano (syncDir), quindi dopo il registro «committed» non c'è un flush da far fallire
  try { assert.ok(backup.restore(source).safety); assert.ok(thrown || process.platform === 'win32') } finally { fs.fsyncSync=sync; db.close() }
  db.open(committedFailure); assert.equal(db.list('pratiche')[0].titolo,'nuovo'); db.close()
  ok('commit già registrato: un errore transitorio di flush non dichiara un falso rollback')
  const broken = path.join(root, 'registro-rotto'); fixture(broken, 'intatto'); db.close()
  const file = path.join(broken, '.restore-state.json')
  for (const value of ['{', JSON.stringify({ version: 1, stage: '../altrove', status: 'pending' }), JSON.stringify({ version: 1, stage: '.restore-assente', status: 'pending' })]) {
    fs.writeFileSync(file, value)
    assert.throws(() => db.open(broken), e => e.code === 'RESTORE_RECOVERY_REQUIRED')
    assert.ok(fs.existsSync(file)); db.close()
  }
  fs.unlinkSync(file); db.open(broken); assert.equal(db.list('pratiche')[0].titolo, 'intatto')
  ok('registro danneggiato o area assente: avvio bloccato senza creare un archivio vuoto')
} finally { db.close(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 }) }
console.log(`${n} prove crash e recupero superate`)
