// I documenti PDF non devono poter eseguire codice contenuto nei dati (nomi, voci, intestazioni, logo).
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/') // barre / anche su Windows: finisce dentro stringhe TypeScript
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-print-'))
fs.writeFileSync(path.join(tmp, 'e.ts'), `export * from '${root}/src/lib/print'\nexport * from '${root}/src/lib/font-documento'\nexport { modelloEffettivo } from '${root}/src/lib/modello'\nexport { calcolaCompenso, costruisciDettaglio } from '${root}/src/lib/compenso'\nexport * from '${root}/src/lib/defaults'\nexport { calcolaParcella } from '${root}/src/lib/calc'`)
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: path.join(tmp, 'e.ts'), formats: ['es'], fileName: () => 'e.mjs' }, outDir: tmp, emptyOutDir: false, minify: false } })
const E = await import(pathToFileURL(path.join(tmp, 'e.mjs')).href)
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)

const X = '<img src=x onerror=alert(1)><script>alert(2)</script>"><svg onload=alert(3)>'
const voci = [{ tipo: 'compenso', descrizione: X, quantita: 1, importo: 100 }, { tipo: 'spesa_imponibile', descrizione: X, quantita: 1, importo: 10 }, { tipo: 'spesa_esente', descrizione: X, quantita: 1, importo: 5 }]
const t = E.calcolaParcella(voci, { sg: 15, cpa: 4, iva: 22, rit: 20, bollo: 0 })
const dettaglio = { tabelle: X, competenza: X, valoreAffare: X, fasi: [{ nome: X, tipo: X, importo: 100 }], base: 100, ulteriorePct: 10, aumentoUlteriore: 10, baseUlteriore: 110, esitoPct: 30, esitoBase: 100, aumentoEsito: 30, maggiorato: 140, praticantePct: 10, riduzionePraticante: 14, compenso: 126, nascondiTipo: false, nVociCalcolate: 0, trasferta: 0, altre: 0 }
const p = { id: 1, anno: 2026, progressivo: 1, numero: X, tipo: 'proforma', data: '2026-01-01', oggetto: X, note: X, sg_perc: 15, cpa_perc: 4, iva_perc: 22, rit_perc: 20, bollo: 0, ...t, calcolo: JSON.stringify({ dettaglio }) }
const cli = { denominazione: X, indirizzo: X, cap: X, citta: X, provincia: X, tipo: 'azienda', codice_fiscale: X, partita_iva: X }
const riga = (testo) => ({ testo, dimensione: 'normale', grassetto: false, corsivo: false, allineamento: 'centro' })
const settings = { ...E.DEFAULT_SETTINGS, studio: { ...E.DEFAULT_SETTINGS.studio, nome: X, intestazione: X, indirizzo: X, cap_citta: X, iban: X, banca: X, cf: X, piva: X, domicilio_fiscale: X, telefono: X, email: X, pec: X },
  modello_pdf: { intestazione: [riga(X)], pagamento: [riga(X)], footer: [riga(X)], logo: 'data:image/png;base64,AAAA"><script>alert(9)</script>', logoAltezza: 60, logoAllineamento: 'centro', mostraLuogoData: true, luogo: X } }
// nel documento possono esistere solo i tag generati dal modello (nessun tag proveniente dai dati)
const PREVISTI = new Set(['html', 'head', 'meta', 'title', 'style', 'body', 'div', 'span', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'b', 'i', 'h1', 'h2', 'br', 'footer', 'dl', 'dt', 'dd', 'p', 'header'])
const controlla = (html, nome, { img = 0 } = {}) => {
  const tag = [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase())
  const strani = tag.filter((t) => !PREVISTI.has(t) && t !== 'img')
  assert.deepEqual(strani, [], `${nome}: tag non previsti ${strani.join(',')}`)
  assert.equal(tag.filter((t) => t === 'img').length, img, `${nome}: numero di <img> inatteso`)
  assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=/i.test(html), `${nome}: attributo evento in un tag`)
}

const nota = E.notaProFormaHtml(p, voci, cli, settings)
controlla(nota, 'nota pro forma'); assert.ok(nota.includes('&lt;img src=x')); ok('nota pro forma: nessun elemento o attributo iniettato, il testo compare in forma letterale')
const dett = E.parcellaHtml({ ...p, tipo: 'parcella' }, voci, cli, settings, E.DEFAULT_SETTINGS.etichette, X)
controlla(dett, 'parcella dettagliata'); ok('parcella dettagliata: idem')
const anteprima = E.esempioNotaHtml(settings); controlla(anteprima, 'anteprima modello'); ok('anteprima del modello: idem')
assert.ok(!/alert\(9\)/.test(E.logoHtml(settings.modello_pdf))); assert.equal(E.logoHtml(settings.modello_pdf), ''); ok('logo con valore manomesso scartato')
assert.ok(E.logoHtml({ ...settings.modello_pdf, logo: 'data:image/png;base64,iVBORw0KGgo=' }).includes('<img')); ok('logo valido accettato')

// ---- nota pro forma con calcolo civile e penale: testi e importi come nel prospetto del sito ----
const fase = (cod, nome, medio, attiva = true) => ({ cod: String(cod), nome, attiva, scelta: 2, libero: 0, terna: [medio / 2, medio, medio * 1.5] })
const inp = (competenza, fasi, extra = {}) => ({ anno: 2022, competenza, competenzaNome: competenza === 570 ? 'Tribunale monocratico' : 'Giudizi di cognizione innanzi al tribunale', tipo: 'tabellare', scaglione: competenza === 570 ? 0 : 30, valore: 0, metodo: 'F', pct: 0, variazione: [50, 50], fasi, ulteriorePct: 0, esitoPositivo: false, esitoImporto: 0, praticantePct: 0, speseEsenti: 0, speseTrasferta: 0, speseAltre: 0, sgOn: true, sgPct: 15, ...extra })
function notaDa(input, scaglione) {
  const r = E.calcolaCompenso(input); const d = E.costruisciDettaglio(input, r, scaglione, false, 1)
  const v = [{ tipo: 'compenso', descrizione: 'Compenso', quantita: 1, importo: r.compenso }]
  const tot = E.calcolaParcella(v, { sg: 15, cpa: 4, iva: 22, rit: 0, bollo: 0 })
  const pp = { id: 2, anno: 2026, progressivo: 2, numero: 'PF 2/2026', tipo: 'proforma', data: '2026-10-13', oggetto: 'Causa X', note: '', sg_perc: 15, cpa_perc: 4, iva_perc: 22, rit_perc: 0, bollo: 0, ...tot, calcolo: JSON.stringify({ dettaglio: d }) }
  return E.notaProFormaHtml(pp, v, null, settings)
}
const testoDi = (h) => h.replace(/<style>.*?<\/style>/s, '').replace(/<\/(tr|div)>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ')
const F4 = [fase(10, 'Studio', 919), fase(20, 'Introduttiva', 777), fase(30, 'Istruttoria / trattazione', 1680), fase(40, 'Decisionale', 1701)]
const civ = testoDi(notaDa(inp(110, F4, { ulteriorePct: 5, variazioni: { piuParti: { pct: 30 }, fondatezza: { pct: 10 }, assenzaQfd: { pct: 20 }, gp: { pct: 50 } }, praticantePct: 10 }), 'Da € 5.201 a € 26.000'))
for (const expected of ['NOTA PRO FORMA','D.M. n. 147','giudizi di cognizione innanzi al tribunale','Fase di studio della controversia','Fase decisionale','Maggiorazione 1','Riduzione 1','Riepilogo degli importi','Netto da pagare','Sistema di Interscambio']) assert.ok(civ.includes(expected), 'manca: ' + expected)
ok('modello autonomo civile: fasi, variazioni e limiti fiscali leggibili')
const pen = testoDi(notaDa(inp(570, [fase(10, 'Studio', 473), fase(20, 'Introduttiva', 567), fase(60, 'Istruttoria / dibattiment.', 1134), fase(90, 'Decisionale', 1418)], { variazioni: { piuParti: { pct: 60 }, gp: { pct: 50 } } }), ''))
for (const expected of ['tribunale monocratico','Fase istruttoria e/o dibattimentale','Maggiorazione 1','Riduzione 1']) assert.ok(pen.includes(expected), 'manca: ' + expected)
assert.ok(!/Valore della causa|Valore dell'affare/.test(pen)); ok('modello penale: fasi, variazioni e nessun valore della causa')
const X2 = '<img src=x onerror=alert(1)>'
const dX = JSON.parse(p.calcolo).dettaglio; dX.intestazione = [X2]; dX.aumenti = [{ id: 'a', testo: X2, importo: 5 }]; dX.riduzioni = [{ id: 'b', testo: X2, importo: 5 }, { id: 'c', testo: X2, importo: 5 }]; dX.aumentoEsito = 5
const hx = E.notaProFormaHtml({ ...p, calcolo: JSON.stringify({ dettaglio: dX }) }, voci, cli, settings); controlla(hx, 'nota con aumenti e riduzioni'); assert.ok(hx.includes('&lt;img src=x')); ok('testi di aumenti, riduzioni e intestazione del calcolo: nessun tag iniettato')
// documenti salvati prima di questa versione: si rigenerano identici (esito positivo e praticante)
const vecchio = { ...dX }; delete vecchio.aumenti; delete vecchio.riduzioni; delete vecchio.intestazione; vecchio.aumentoEsito = 300; vecchio.riduzionePraticante = 50
const hv = testoDi(E.notaProFormaHtml({ ...p, calcolo: JSON.stringify({ dettaglio: vecchio }) }, voci, null, settings)); assert.ok(hv.includes('Maggiorazione 1') && hv.includes('300,00') && hv.includes('Riduzione 1') && hv.includes('−50,00')); ok('documenti salvati con la versione precedente: valori delle variazioni conservati nel nuovo modello')
const font = { id: 'font-' + 'a'.repeat(32), nome: X, formato: 'ttf', dati: 'data:font/ttf;base64,AAAAAA==' }
const modello = { ...E.modelloEffettivo(E.DEFAULT_SETTINGS), fontDocumento: font.id, fontPersonali: [font], immagineFooter: 'data:image/png;base64,AAAA', footer: [riga('Recapiti')], logo: 'data:image/png;base64,AAAA' }
const personalizzata = E.notaProFormaHtml(p, voci, cli, { ...E.DEFAULT_SETTINGS, modello_pdf: modello })
controlla(personalizzata, 'modello con immagini e font', { img: 3 }) // footer copy reserves exact space and is not painted
assert.ok(personalizzata.includes('@font-face') && personalizzata.includes('MNGMNT_' + font.id)); assert.ok(!personalizzata.includes(font.nome))
ok('intestazione e footer contengono immagini e testo; font locale incorporato senza inserire il nome nel CSS')
for (const patch of [{ id: '");}body{color:red}' }, { formato: 'ttf);src:url(https://example.com)' }, { dati: 'https://example.com/font.ttf' }, { dati: 'data:font/ttf;base64,AA"</style><script>alert(1)</script>' }, { dati: 'data:font/ttf;base64,' + 'A'.repeat(3 * 1024 * 1024) }]) {
  assert.deepEqual(E.fontValidi([{ ...font, ...patch }]), [])
}
assert.equal(E.famigliaFont('";color:red', [font]), E.famigliaFont('arial'))
ok('font con URL esterno, identificatore/formato manomesso, dati iniettati o dimensioni eccessive scartati')
assert.equal(E.fontValidi([font, font]).length, 1)
assert.equal(E.fontFaceCss({ ...modello, fontDocumento: 'georgia' }), '')
assert.equal(E.fontValidi('non-un-array').length, 0)
ok('font duplicati e dati corrotti gestiti; font inutilizzati esclusi dai documenti')
const rigaFont = E.righeHtml([{ ...riga('Testo'), font: font.id }], modello)
assert.ok(rigaFont.includes('MNGMNT_' + font.id))
assert.ok(!E.righeHtml([{ ...riga('Testo'), font: '"><script>alert(1)</script>' }], modello).includes('<script>'))
assert.ok(!E.footerImmagineHtml({ ...modello, immagineFooter: 'https://example.com/img.png' }))
assert.ok(!E.logoHtml({ ...modello, logoAltezza: '42px;"><script>alert(1)</script>' }).includes('<script>'))
ok('font per riga sicuro; immagini esterne e altezza immagine manomessa non entrano nel documento')
assert.equal(E.modelloEffettivo(settings).fontDocumento, 'arial')
assert.deepEqual(E.modelloEffettivo(settings).fontPersonali, [])
ok('modelli già salvati compatibili con i nuovi campi, senza migrazione dei dati')
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${n} test superati`)
