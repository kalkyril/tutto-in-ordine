// Novità 1.0.5 fuori dall'interfaccia: interlinea e spazio prima/dopo dei paragrafi, sottolineature colorate e di più tipi,
// linea dell'intestazione facoltativa, intestazione solo sulla prima pagina con le altre come un documento vuoto di Word
// (Word, OpenDocument, RTF, PDF), luogo e data, «Tariffa totale» delle attività nell'archivio, uscite ricorrenti con fine.
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { DOMParser } = require('@xmldom/xmldom')
const { genera } = require('../electron/documento')
const { leggiZip } = require('../electron/zip')

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-105-'))
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: { documento: 'src/lib/documento.ts', attivita: 'src/lib/attivita.ts' }, formats: ['es'], fileName: (_f, n) => `${n}.mjs` }, outDir: out, emptyOutDir: false, minify: false } })
const d = await import(pathToFileURL(path.join(out, 'documento.mjs')).href)
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)
/** XML ben formato: @xmldom segnala gli errori invece di correggerli in silenzio. */
const benFormato = (x, nome) => { const errori = []; new DOMParser({ onError: (l, m) => { if (l !== 'warning') errori.push(m) } }).parseFromString(x, 'text/xml'); assert.deepEqual(errori, [], nome) }
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-105-db-'))

try {
  // ---------- funzioni pure della spaziatura
  assert.equal(d.interlineaDa('1.5'), 1.5); assert.equal(d.interlineaDa('150%'), 1.5); assert.equal(d.interlineaDa('107%'), 1.07)
  assert.equal(d.interlineaDa('0.5'), 1); assert.equal(d.interlineaDa('9'), 3); assert.equal(d.interlineaDa('normal'), undefined); assert.equal(d.interlineaDa(''), undefined)
  assert.equal(d.spazioDa('12pt'), 12); assert.equal(d.spazioDa('16px'), 12); assert.equal(d.spazioDa('0cm'), 0); assert.equal(d.spazioDa('0'), 0); assert.equal(d.spazioDa('0.42cm'), 12)
  assert.equal(d.spazioDa('500pt'), 72); assert.equal(d.spazioDa('auto'), undefined)
  assert.equal(d.cssSpaziatura({ interlinea: 1.5, spazioPrima: 12, spazioDopo: 0 }), 'line-height:1.725;margin-top:12pt;margin-bottom:0pt')
  assert.equal(d.cssSpaziatura({}), '')
  ok('interlinea («1.5», «150%», «107%» di Word) e spazi («12pt», «16px», «0cm») letti entro i limiti; CSS con la riga singola di Word')

  const h = d.htmlDaBlocchi([
    { tipo: 'p', interlinea: 2, spazioPrima: 12, spazioDopo: 0, runs: [{ t: 'Doppia interlinea' }] },
    { tipo: 'p', runs: [{ t: 'Sottolineato rosso ondulato', u: true, uc: '#b91c1c', us: 'ondulata' }, { t: ' e semplice', u: true }] },
    { tipo: 'h2', spazioDopo: 6, runs: [{ t: 'Titolo' }] },
  ])
  assert.match(h, /<p style="line-height:2\.3;margin-top:12pt;margin-bottom:0pt" data-interlinea="2">Doppia interlinea<\/p>/)
  assert.match(h, /<u style="text-decoration-color:#b91c1c;text-decoration-style:wavy">Sottolineato rosso ondulato<\/u><u> e semplice<\/u>/)
  assert.match(h, /<h2 style="margin-bottom:6pt">Titolo<\/h2>/)
  ok('HTML del corpo: interlinea in data-interlinea e nel CSS, spazi in punti, sottolineatura con colore e tipo')

  // ---------- luogo e data
  const oggi = new Date(2026, 10, 27)
  const m = { mostraLuogoData: true, luogo: 'Modena', formatoData: 'lunga' }
  assert.equal(d.testoLuogoData(m, { valori: {} }, oggi), 'Modena, 27 novembre 2026')
  assert.equal(d.testoLuogoData({ ...m, formatoData: 'breve' }, { valori: {} }, oggi), 'Modena, 27/11/2026')
  assert.equal(d.testoLuogoData({ ...m, formatoData: 'li' }, { valori: {} }, oggi), 'Modena, lì 27 novembre 2026')
  assert.equal(d.testoLuogoData({ ...m, luogo: '' }, { valori: { luogo: 'Carpi' } }, oggi), 'Carpi, 27 novembre 2026')
  assert.equal(d.testoLuogoData({ ...m, luogo: '' }, { valori: {} }, oggi), '27 novembre 2026')
  assert.equal(d.testoLuogoData({ ...m, mostraLuogoData: false }, { valori: {} }, oggi), '')
  assert.equal(d.margineSenzaIntestazione(16), 25); assert.equal(d.margineSenzaIntestazione(30), 30)
  ok('luogo e data in tre forme (lunga, 27/11/2026, «lì»), città del modello o dell’attività; margine delle pagine senza intestazione = 2,5 cm')

  // ---------- esportazione
  const doc = (o = {}) => ({
    titolo: 'Lettera', font: 'Arial', intestazione: [{ testo: 'Studio Ferrari', dimensione: 'grande', grassetto: true, allineamento: 'centro' }], footer: [{ testo: 'Via Emilia 1, Modena', dimensione: 'piccola', allineamento: 'centro' }],
    numeriPagina: true, margini: { sopra: 16, sotto: 14, lati: 20 },
    corpo: [
      { tipo: 'p', interlinea: 1.5, spazioPrima: 12, spazioDopo: 0, runs: [{ t: 'Paragrafo a interlinea 1,5 ' }, { t: 'sottolineato rosso doppio', u: true, uc: '#B91C1C', us: 'doppia' }] },
      { tipo: 'ul', interlinea: 2, runs: [{ t: 'voce a interlinea doppia' }] },
      { tipo: 'p', runs: [{ t: 'ondulato blu', u: true, uc: '#2563eb', us: 'ondulata' }, { t: ' non valido', u: false, uc: '#ff0000', us: 'zigzag' }] },
      { tipo: 'table', interlinea: 2, celle: [[[{ t: 'A' }], [{ t: 'B' }]]] },
    ],
    ...o,
  })
  let z = leggiZip(genera('docx', doc()))
  let x = z.leggi('word/document.xml').toString()
  assert.match(x, /<w:spacing w:before="240" w:after="0" w:line="360" w:lineRule="auto"\/><w:jc/)
  assert.match(x, /<w:numId w:val="1"\/><\/w:numPr><w:spacing w:line="480" w:lineRule="auto"\/>/)
  assert.match(x, /<w:u w:val="double" w:color="b91c1c"\/>/); assert.match(x, /<w:u w:val="wave" w:color="2563eb"\/>/)
  assert.ok(!/ff0000/.test(x), 'colore di sottolineatura senza sottolineatura scartato')
  assert.ok(z.leggi('word/header1.xml').toString().includes('<w:pBdr>'), 'linea sotto l’intestazione predefinita')
  assert.ok(!x.includes('titlePg') && !z.nomi?.includes?.('word/header2.xml'))
  for (const f of ['word/document.xml', 'word/header1.xml', 'word/styles.xml']) benFormato(z.leggi(f).toString(), f)
  ok('Word: interlinea e spazi nel paragrafo (anche negli elenchi, nell’ordine dello schema), sottolineatura doppia e ondulata colorata, valori non validi scartati')

  z = leggiZip(genera('docx', doc({ intestazioneSoloPrima: true, lineaIntestazione: false })))
  x = z.leggi('word/document.xml').toString()
  assert.match(x, /<w:headerReference w:type="first" r:id="rIdTesta"\/><w:headerReference w:type="default" r:id="rIdTestaVuota"\/>/)
  assert.match(x, /<w:pgMar w:top="1417" [^>]*w:header="709"/); assert.ok(x.includes('<w:titlePg/>'))
  const vuota = z.leggi('word/header2.xml').toString(), testa = z.leggi('word/header1.xml').toString()
  assert.ok(vuota.includes('<w:pStyle w:val="Intestazione"/>') && !/<w:t[ >]/.test(vuota), 'intestazione vuota di Word nelle altre pagine')
  assert.ok(!testa.includes('<w:pBdr>') && testa.includes('Studio Ferrari') && testa.includes('w:after="400"'))
  assert.ok(z.leggi('word/_rels/document.xml.rels').toString().includes('header2.xml') && z.leggi('[Content_Types].xml').toString().includes('/word/header2.xml'))
  assert.ok(z.leggi('word/styles.xml').toString().includes('w:styleId="Intestazione"'))
  for (const f of ['word/document.xml', 'word/header1.xml', 'word/header2.xml', 'word/styles.xml', '[Content_Types].xml']) benFormato(z.leggi(f).toString(), f)
  ok('Word, intestazione solo sulla prima: altre pagine con l’intestazione vuota (stile «Intestazione») e margine di 2,5 cm; linea tolta')

  let o = leggiZip(genera('odt', doc({ intestazioneSoloPrima: true, lineaIntestazione: false })))
  let c = o.leggi('content.xml').toString(), st = o.leggi('styles.xml').toString()
  assert.match(st, /<style:master-page style:name="Standard" style:page-layout-name="PaginaAltre"><style:footer>/)
  assert.match(st, /<style:master-page style:name="Prima" [^>]*style:next-style-name="Standard"><style:header>.*Studio Ferrari/)
  assert.match(st, /style:name="PaginaAltre"><style:page-layout-properties [^>]*fo:margin-top="2.5cm"/)
  assert.ok(!st.includes('fo:border-bottom'), 'linea tolta')
  const primo = /<office:text>(?:<text:list[^>]*><text:list-item>)?<text:(?:p|h) text:style-name="([^"]+)"/.exec(c)?.[1]
  assert.ok(primo && new RegExp(`style:name="${primo}"[^>]*style:master-page-name="Prima"`).test(c), 'il primo paragrafo apre la pagina con l’intestazione: ' + primo)
  assert.match(c, /fo:line-height="150%" fo:margin-top="12pt" fo:margin-bottom="0pt"/)
  assert.match(c, /style:text-underline-style="solid" style:text-underline-type="double" style:text-underline-width="auto" style:text-underline-color="#b91c1c"/)
  assert.match(c, /style:text-underline-style="wave"[^>]*style:text-underline-color="#2563eb"/)
  for (const [f, t] of [['content.xml', c], ['styles.xml', st]]) benFormato(t, f)
  o = leggiZip(genera('odt', doc({ corpo: [{ tipo: 'table', celle: [[[{ t: 'A' }]]] }], intestazioneSoloPrima: true })))
  c = o.leggi('content.xml').toString()
  assert.ok(/table:style-name="TabPrima"/.test(c) && o.leggi('styles.xml').toString().includes('fo:border-bottom'))
  o = leggiZip(genera('odt', doc()))
  assert.ok(!o.leggi('styles.xml').toString().includes('"Prima"') && !o.leggi('content.xml').toString().includes('master-page-name'))
  ok('OpenDocument: prima pagina con l’intestazione e le altre senza (anche se il testo inizia con una tabella), interlinea, spazi e sottolineature')

  let r = genera('rtf', doc({ intestazioneSoloPrima: true })).toString('latin1')
  assert.ok(r.includes('\\titlepg') && r.includes('{\\headerf ') && r.includes('{\\header \\pard\\plain\\par}') && r.includes('\\margt1417'))
  assert.ok(r.includes('\\sb240\\sa0\\sl360\\slmult1') && /\\uldb\\ulc\d/.test(r) && /\\ulwave\\ulc\d/.test(r) && r.includes('\\brdrb'))
  r = genera('rtf', doc({ lineaIntestazione: false })).toString('latin1')
  assert.ok(!r.includes('\\brdrb') && !r.includes('\\titlepg'))
  const html = genera('html', doc({ lineaIntestazione: false })).toString()
  assert.ok(html.includes('line-height:1.725;margin-top:12pt;margin-bottom:0pt') && html.includes('text-decoration-style:double') && !html.includes('border-bottom:1px solid #999'))
  ok('RTF e HTML: interlinea, spazi, sottolineature colorate, linea facoltativa, prima pagina diversa con le altre vuote')

  // ---------- archivio: «Tariffa totale»
  process.env.MNGMNT_DATA_DIR = dataDir
  const db = require('../electron/db'); db.open(dataDir)
  const pr = db.save('pratiche', { numero: '2026/1', titolo: 'Parere', stato: 'In corso' })
  const ora = db.save('ore', { pratica_id: pr.id, data: '2026-11-27', minuti: 90, descrizione: 'Parere scritto', tariffa_oraria: 266.6667, tariffa_totale: 400 })
  assert.equal(ora.tariffa_totale, 400)
  const a = await import(pathToFileURL(path.join(out, 'attivita.mjs')).href)
  assert.equal(a.valoreOra(ora), 400); assert.ok(Math.abs((ora.minuti / 60) * ora.tariffa_oraria - 400) < 0.01, 'le versioni precedenti vedono lo stesso valore')
  assert.equal(db.save('ore', { id: ora.id, tariffa_totale: null, tariffa_oraria: 100 }).tariffa_totale, null)
  assert.throws(() => db.save('ore', { id: ora.id, tariffa_totale: -5 }), /non negativo/)
  const senzaTempo = db.save('ore', { pratica_id: pr.id, data: '2026-11-27', minuti: 0, descrizione: 'Forfait', tariffa_oraria: 0, tariffa_totale: 250 })
  assert.equal(a.valoreOra(senzaTempo), 250)
  ok('archivio: «Tariffa totale» salvata, tolta e validata; con il tempo anche le versioni precedenti mostrano lo stesso valore; vale anche senza tempo')

  // ---------- uscite ricorrenti: rate con una fine, ogni 2 e ogni 6 mesi
  const g = require('../electron/gestione')
  const serie = (d) => db.getDb().prepare('SELECT * FROM costi WHERE descrizione=? ORDER BY scadenza').all(d)
  g.esegui('costo', { data: '2031-01-15', descrizione: 'Rata auto', categoria: 'Rate e finanziamenti', importo: 320, scadenza: '2031-01-15', ripeti: 'mensile', ripeti_fine: '2031-04-15' })
  g.estendiUsciteRicorrenti('2031-12-31')
  assert.deepEqual(serie('Rata auto').map((x) => x.scadenza), ['2031-01-15', '2031-02-15', '2031-03-15', '2031-04-15'])
  assert.ok(serie('Rata auto').every((x) => x.ripeti_fine === '2031-04-15'), 'ogni rata della serie conosce l’ultima scadenza')
  g.esegui('costo', { ...serie('Rata auto')[0], ripeti_fine: '2031-02-15' })
  assert.deepEqual(serie('Rata auto').map((x) => x.scadenza), ['2031-01-15', '2031-02-15'], 'fine anticipata: tolte le rate oltre')
  assert.throws(() => g.esegui('costo', { data: '2031-05-01', descrizione: 'X', categoria: 'Altro', importo: 1, ripeti: 'mensile', ripeti_fine: '2031-01-01' }), /prima di questa voce/)
  g.esegui('costo', { data: '2031-01-31', descrizione: 'Bolletta luce', categoria: 'Utenze', importo: 90, scadenza: '2031-01-31', ripeti: 'bimestrale' })
  g.esegui('costo', { data: '2031-01-10', descrizione: 'Assicurazione studio', categoria: 'Assicurazioni', importo: 400, scadenza: '2031-01-10', ripeti: 'semestrale' })
  g.estendiUsciteRicorrenti('2031-08-01')
  assert.deepEqual(serie('Bolletta luce').map((x) => x.scadenza), ['2031-01-31', '2031-03-31', '2031-05-31', '2031-07-31'])
  assert.deepEqual(serie('Assicurazione studio').map((x) => x.scadenza), ['2031-01-10', '2031-07-10'])
  const pag = await (async () => { const o2 = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-105-p-')); await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: { pagamenti: 'src/lib/pagamenti.ts' }, formats: ['es'], fileName: (_f, x) => `${x}.mjs` }, outDir: o2, emptyOutDir: false, minify: false } }); return import(pathToFileURL(path.join(o2, 'pagamenti.mjs')).href) })()
  const prev = pag.usciteRicorrentiPreviste([{ id: 1, pratica_id: null, fornitore_id: null, data: '2031-01-15', descrizione: 'Leasing', categoria: 'Rate e finanziamenti', importo: 200, scadenza: '2031-01-15', pagata: 0, ripeti: 'bimestrale', serie: 1, ripeti_giorno: 15, ripeti_fine: '2031-07-15' }], '2032-12-31')
  assert.deepEqual(prev.map((x) => x.data), ['2031-03-15', '2031-05-15', '2031-07-15'])
  assert.equal(pag.NOMI_RIPETI.semestrale, 'ogni 6 mesi')
  ok('uscite ricorrenti: rate con l’ultima scadenza (anche anticipata), ogni 2 e ogni 6 mesi, nell’archivio e nella previsione')
  db.close?.()
} finally {
  fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(dataDir, { recursive: true, force: true })
}
console.log(`\n${n} prove superate`)
