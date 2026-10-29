'use strict'
// Generatore dei documenti (sezioni Documenti e Anonimizza): ogni formato si apre ed espone testo, intestazione e piè di pagina.
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { execFileSync } = require('node:child_process')
const { genera, pulisci, FORMATI } = require('../electron/documento')
const { leggiZip } = require('../electron/zip')
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)

// PNG 1×1 valido
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const doc = {
  titolo: 'Lettera di prova', font: 'Georgia', numeriPagina: true,
  intestazione: [{ testo: 'Studio Legale Esempio', dimensione: 'grande', grassetto: true, corsivo: false, allineamento: 'centro' }],
  footer: [{ testo: 'Via delle Prove 1 · Modena', dimensione: 'piccola', grassetto: false, corsivo: false, allineamento: 'centro' }],
  logo: { png, larghezza: 80, altezza: 40, allineamento: 'sinistra' },
  corpo: [
    { tipo: 'h1', allineamento: 'sinistra', runs: [{ t: 'Oggetto: sollecito <pagamento> & interessi' }] },
    { tipo: 'p', allineamento: 'giustificato', runs: [{ t: 'Gentile ' }, { t: 'Mario Rossì', b: true }, { t: ', con la presente ' }, { t: 'la invito', i: true, u: true }, { t: '.\nSeconda riga.' }] },
    { tipo: 'ul', allineamento: 'sinistra', runs: [{ t: 'primo punto' }] }, { tipo: 'ul', allineamento: 'sinistra', runs: [{ t: 'secondo punto' }] },
    { tipo: 'ol', allineamento: 'sinistra', runs: [{ t: 'uno' }] }, { tipo: 'ol', allineamento: 'sinistra', runs: [{ t: 'due' }] },
    { tipo: 'p', allineamento: 'destra', runs: [{ t: 'Cordiali saluti — € 1.000,00 · “virgolette” 😀' }] },
  ],
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-documento-'))
try {
  for (const f of FORMATI) assert.ok(genera(f, doc).length > 50, f)
  ok('tutti i formati: ' + FORMATI.join(', '))

  const z = leggiZip(genera('docx', doc))
  for (const p of ['[Content_Types].xml', 'word/document.xml', 'word/header1.xml', 'word/footer1.xml', 'word/media/logo.png', 'word/_rels/header1.xml.rels', 'word/numbering.xml']) assert.ok(z.nomi.includes(p), p)
  const docXml = z.leggi('word/document.xml').toString()
  assert.ok(docXml.includes('&lt;pagamento&gt; &amp; interessi') && docXml.includes('<w:b/>') && docXml.includes('w:val="both"'))
  assert.ok(z.leggi('word/footer1.xml').toString().includes('NUMPAGES'))
  ok('Word: intestazione con logo, piè di pagina con numeri di pagina, elenchi, grassetto e testo giustificato')

  const o = leggiZip(genera('odt', doc))
  assert.equal(o.nomi[0], 'mimetype'); assert.equal(o.leggi('mimetype').toString(), 'application/vnd.oasis.opendocument.text')
  assert.ok(o.leggi('styles.xml').toString().includes('<style:header>') && o.nomi.includes('Pictures/logo.png'))
  ok('OpenDocument: mimetype in testa e non compresso, intestazione nella pagina mastro')

  // lettura indipendente con textutil (macOS): i file si aprono davvero
  if (process.platform === 'darwin') {
    for (const f of ['docx', 'odt', 'rtf', 'html']) {
      const file = path.join(dir, 'prova.' + f); fs.writeFileSync(file, genera(f, doc))
      const t = execFileSync('textutil', ['-convert', 'txt', '-encoding', 'UTF-8', '-stdout', file], { encoding: 'utf8' })
      for (const atteso of ['Oggetto: sollecito <pagamento> & interessi', 'Mario Rossì', 'secondo punto', '€ 1.000,00', '“virgolette”']) assert.ok(t.includes(atteso), `${f}: manca «${atteso}» in ${t}`)
    }
    ok('textutil apre i file DOCX, ODT, RTF e HTML e ne legge testo, accenti e simboli')
  }

  const md = genera('md', doc).toString(), txt = genera('txt', doc).toString()
  assert.ok(md.includes('# Oggetto: sollecito \\<pagamento\\> & interessi') && md.includes('**Mario Rossì**') && md.includes('- primo punto\n- secondo punto') && md.includes('1. uno\n2. due'))
  assert.ok(txt.includes('Studio Legale Esempio') && txt.includes('• primo punto') && txt.includes('2. due'))
  ok('Markdown e testo semplice: titoli, enfasi, elenchi puntati e numerati')

  // validazione: nessun campo inatteso, immagini non PNG scartate, limiti
  const p = pulisci({ corpo: [{ tipo: 'script', allineamento: 'x', runs: [{ t: 1, b: 'si' }] }], logo: { png: Buffer.from('GIF89a....................').toString('base64') }, font: 'Arial"/><x' })
  assert.deepEqual(p.corpo, [{ tipo: 'p', allineamento: 'sinistra', colonne: 1, runs: [{ t: '1', b: true, i: false, u: false }] }])
  assert.equal(p.logo, null); assert.equal(p.font, 'Arial')
  assert.throws(() => genera('exe', doc), /Formato non supportato/)
  ok('i dati in ingresso vengono validati: tipi, allineamenti, font, immagini e formati')
} finally { fs.rmSync(dir, { recursive: true, force: true }) }

// disposizione del testo: allineamento predefinito per i paragrafi senza un proprio allineamento, e due colonne
{
  const d2 = { ...doc, allineamento: 'giustificato', colonne: 2, corpo: [{ tipo: 'p', runs: [{ t: 'segue il documento' }] }, { tipo: 'p', allineamento: 'destra', runs: [{ t: 'a destra' }] }] }
  const p = pulisci(d2)
  assert.deepEqual(p.corpo.map((b) => b.allineamento), ['giustificato', 'destra'])
  const w = leggiZip(genera('docx', d2)).leggi('word/document.xml').toString()
  assert.ok(w.includes('<w:cols w:num="2"') && w.includes('w:val="both"') && w.includes('w:val="right"'))
  assert.ok(leggiZip(genera('odt', d2)).leggi('styles.xml').toString().includes('fo:column-count="2"'))
  assert.ok(genera('rtf', d2).toString('latin1').includes('\\cols2') && genera('html', d2).toString().includes('column-count:2'))
  const uno = leggiZip(genera('docx', { ...d2, colonne: 1 })).leggi('word/document.xml').toString()
  assert.ok(!uno.includes('<w:cols'))
  ok('disposizione del testo: allineamento del documento e due colonne in Word, OpenDocument, RTF e HTML')
}

// ogni parte XML di Word e OpenDocument è ben formata (xmllint, se disponibile)
{
  let xmllint = true
  try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }) } catch { xmllint = false }
  if (xmllint) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-xml-'))
    try {
      for (const f of ['docx', 'odt']) for (const col of [1, 2]) {
        const z = leggiZip(genera(f, { ...doc, colonne: col, allineamento: 'giustificato' }))
        for (const n of z.nomi.filter((x) => /\.(xml|rels)$/.test(x))) { const p = path.join(tmp, n.replace(/[\/\[\]]/g, '_')); fs.writeFileSync(p, z.leggi(n)); execFileSync('xmllint', ['--noout', p], { stdio: 'pipe' }) }
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
    ok('xmllint: tutte le parti XML di Word e OpenDocument sono ben formate')
  }
}

// due colonne per una sola parte del testo: sezione continua in Word, sezione in OpenDocument, \sbknone in RTF, blocco in HTML
{
  const p = (t, colonne) => ({ tipo: 'p', runs: [{ t }], ...(colonne && { colonne }) })
  const d3 = { ...doc, corpo: [p('Premessa a tutta pagina'), p('Colonna uno', 2), { tipo: 'ul', colonne: 2, runs: [{ t: 'punto in colonna' }] }, p('Colonna due', 2), p('Conclusione a tutta pagina')] }
  const w = leggiZip(genera('docx', d3)).leggi('word/document.xml').toString()
  assert.equal((w.match(/<w:sectPr>/g) || []).length, 3)
  assert.equal((w.match(/<w:cols w:num="2"/g) || []).length, 1)
  assert.equal((w.match(/<w:type w:val="continuous"\/>/g) || []).length, 2)
  // la sezione si chiude nelle proprietà del suo ultimo paragrafo: «Premessa» chiude la prima, «Colonna due» quella a due colonne
  const paragrafi = w.split('<w:p>').slice(1)
  assert.ok(/<w:sectPr>(?:(?!<w:cols).)*<\/w:sectPr>.*Premessa/s.test(paragrafi.find((x) => x.includes('Premessa'))))
  assert.ok(/<w:cols w:num="2".*Colonna due/s.test(paragrafi.find((x) => x.includes('Colonna due'))))
  const o = leggiZip(genera('odt', d3)).leggi('content.xml').toString()
  assert.ok(/<text:section text:style-name="Colonne2"[^>]*>.*Colonna uno.*punto in colonna.*Colonna due.*<\/text:section>/s.test(o) && !/<text:section[^>]*>[^]*Premessa/.test(o.slice(o.indexOf('<text:section'))))
  const r = genera('rtf', d3).toString('latin1')
  assert.ok(/\\sect\\sectd\\sbknone\\cols2\\colsx510[^]*Colonna uno[^]*\\sect\\sectd\\sbknone\n[^]*Conclusione/.test(r))
  assert.ok(/<div style="column-count:2;column-gap:9mm"><p[^>]*>Colonna uno/.test(genera('html', d3).toString()))
  if (process.platform === 'darwin') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-sez-'))
    try { for (const f of ['docx', 'odt', 'rtf']) { const file = path.join(tmp, 'p.' + f); fs.writeFileSync(file, genera(f, d3)); const t = execFileSync('textutil', ['-convert', 'txt', '-encoding', 'UTF-8', '-stdout', file], { encoding: 'utf8' }); for (const x of ['Premessa', 'Colonna uno', 'punto in colonna', 'Colonna due', 'Conclusione']) assert.ok(t.includes(x), f + ': ' + x) } } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
  }
  ok('due colonne solo per una parte del testo: Word, OpenDocument, RTF e HTML, testo completo e nell’ordine')
}
