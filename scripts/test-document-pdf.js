'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { createCanvas } = require('@napi-rs/canvas')
const db = require('../electron/db'), dt = require('../electron/doctext'), docfile = require('../electron/docfile')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-pdf-text-'))
function pdf(text) {
  const stream = `BT /F1 24 Tf 40 150 Td (${text}) Tj ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 250] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let result = '%PDF-1.4\n', offsets = [0]
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(result)); result += `${i+1} 0 obj\n${obj}\nendobj\n` })
  const xref = Buffer.byteLength(result)
  result += `xref\n0 6\n0000000000 65535 f \n` + offsets.slice(1).map((off) => String(off).padStart(10,'0')+' 00000 n \n').join('') + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(result)
}
;(async () => {
  try {
    const file = path.join(root, 'contratto.pdf'); fs.writeFileSync(file, pdf('Contratto professionale Zanzibar'))
    const extracted = await dt.estraiFileAsync(file, 'contratto.pdf'); assert.match(extracted.text, /Zanzibar/)
    console.log('ok 1 - testo PDF estratto localmente in un worker')
    db.open(path.join(root,'data')); const p=db.save('pratiche',{titolo:'PDF'}), doc=docfile.collega(p.id,file)
    await dt.indicizzaDocumento(doc.id); assert.deepEqual(dt.cercaNeiDocumenti('Zanzibar').map((d)=>d.id),[doc.id])
    console.log('ok 2 - contenuto PDF ricercabile e stato indice visibile')
    const image = path.join(root,'scansione.png'), canvas = createCanvas(1200,240), ctx = canvas.getContext('2d')
    ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,240);ctx.fillStyle='#000';ctx.font='52px sans-serif';ctx.fillText('CONTRATTO PROFESSIONALE',40,120);fs.writeFileSync(image,canvas.toBuffer('image/png'))
    const ocr = await dt.estraiFileAsync(image,'scansione.png',true);assert.match(ocr.text.toUpperCase(),/CONTRATTO/)
    console.log('ok 3 - OCR reale in italiano, modelli locali senza download')
    fs.writeFileSync(path.join(root,'guasto.pdf'),'non PDF');await assert.rejects(dt.estraiFileAsync(path.join(root,'guasto.pdf'),'guasto.pdf'),/PDF|document/i)
    console.log('ok 4 - PDF danneggiato rifiutato senza alterare i file')
  } finally { db.close();fs.rmSync(root,{recursive:true,force:true}) }
})().catch((error)=>{console.error(error);process.exitCode=1})
module.exports.pdf = pdf
