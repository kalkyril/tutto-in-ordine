'use strict'
const assert=require('node:assert/strict'),data=require('../electron/data/tariffe-dm55.json')
let count=0;const ok=s=>console.log(`ok ${++count} - ${s}`)
const t=(y,c)=>data.tabelle[y][c],v=(y,c,s,p)=>t(y,c).scaglioni.find(x=>x.id===s).valori[p]
assert.equal(data.competenze.length,48);assert.equal(Object.keys(data.tabelle[2014]).length,43);ok('edizioni distinte: 48 competenze 2022, 43 originarie 2014')
// Confronti con celle specifiche dei due allegati ufficiali, non con il servizio privato.
assert.equal(v(2022,110,60,30)[1],10411);assert.equal(v(2014,110,60,30)[1],9915);assert.equal(v(2022,130,30,40)[1],2021);ok('Tribunale e previdenza: celle degli allegati 2022/2014')
assert.deepEqual(v(2014,110,30,30),[480,1600,3200]);assert.deepEqual(v(2022,110,30,30),[840,1680,2520]);ok('fase istruttoria civile: intervalli specifici dell’edizione 2014, uniformi 2022')
assert.deepEqual(v(2022,360,30,99),[993,1985,2978]);assert.deepEqual(v(2014,360,30,99),[945,1890,3402]);ok('assistenza stragiudiziale: medio e intervalli')
assert.equal(v(2022,380,50,130)[1],3931);assert.ok(!t(2014,380));ok('mediazione 2022 presente, nessuna attribuzione all’allegato originario 2014')
assert.equal(t(2022,570).fisse[60][1],1134);assert.equal(t(2014,570).fisse[60][1],1080);assert.ok(!t(2022,615).fisse[60]);ok('penale: lettura della tabella 15 e fasi non previste assenti')
const app=t(2022,335);assert.deepEqual(app.fasi.map(f=>f.cod),['10','20','40']);assert.equal(v(2022,335,30,40)[1],955.5);ok('art. 4 comma 10-ter: appello cautelare con metà della fase decisionale')
assert.ok(t(2022,110).scaglioni.filter(s=>[901,902,903,910].includes(s.id)).every(s=>s.calcolato&&!s.valori));ok('indeterminabili: nel file restano vuoti, li calcola electron/tariffe.js dagli scaglioni vicini')
for(const tables of Object.values(data.tabelle))for(const tab of Object.values(tables)){
 const keys=tab.fasi.map(f=>f.cod);for(const values of [...tab.scaglioni.filter(s=>s.valori).map(s=>s.valori),...(tab.fisse?[tab.fisse]:[])]){assert.deepEqual(Object.keys(values).sort(),keys.slice().sort());for(const triple of Object.values(values)){assert.equal(triple.length,3);assert.ok(triple.every(Number.isFinite));assert.ok(triple[0]<=triple[1]&&triple[1]<=triple[2])}}
}
ok('tutte le tabelle: fasi coerenti, importi finiti, intervalli ordinati')
console.log(`${count} prove normative superate`)
