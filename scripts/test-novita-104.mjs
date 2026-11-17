// Novità 1.0.4 nella logica dei documenti: «Altra persona» (delegato, collega, collaboratore) compilata dalla persona scelta,
// campi liberi dei modelli precedenti riconosciuti, delega che usa i nuovi campi; uscite ricorrenti (archivio e previsione) e budget dell'anno.
import { build } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-104-'))
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: { documento: 'src/lib/documento.ts', pagamenti: 'src/lib/pagamenti.ts', budget: 'src/lib/budget.ts' }, formats: ['es'], fileName: (_f, n) => `${n}.mjs` }, outDir: out, emptyOutDir: false, minify: false } })
const d = await import(pathToFileURL(path.join(out, 'documento.mjs')).href)
const pag = await import(pathToFileURL(path.join(out, 'pagamenti.mjs')).href), bud = await import(pathToFileURL(path.join(out, 'budget.mjs')).href)
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)
try {
  const settings = { profilo: 'ditta', attivita: 'impresa', etichette: { pratica: 'Commessa', pratiche: 'Commesse', cliente: 'Cliente', clienti: 'Clienti', controparte: 'Fornitore', autorita: 'Ente', rg: 'Rif.', giudice: 'Referente', parcella: 'Documento', parcelle: 'Documenti' }, studio: { nome: 'Impianti Galli', cap_citta: '41121 Modena' } }
  const delegante = { id: 1, tipo: 'persona', denominazione: 'Giulia Rinaldi', codice_fiscale: 'RNLGLI80A41F257X', indirizzo: 'Via Roma 3', cap: '41012', citta: 'Carpi', provincia: 'MO' }
  const delegato = { id: 2, tipo: 'persona', titolo: 'Geom.', denominazione: 'Paolo Neri', codice_fiscale: 'NREPLA75C01F257K', indirizzo: 'Via Emilia 10', cap: '41121', citta: 'Modena', provincia: 'MO' }
  const v = d.valoriCampi(settings, { destinatario: delegante, persona: delegato })
  assert.equal(v['destinatario.nome'], 'Giulia Rinaldi'); assert.equal(v['persona.nome'], 'Paolo Neri'); assert.equal(v['persona.nome_completo'], 'Geom. Paolo Neri')
  assert.equal(v['persona.cf'], 'NREPLA75C01F257K'); assert.equal(v['persona.cap_citta'], '41121 Modena (MO)')
  assert.equal(v['nome del delegato'], 'Paolo Neri') // modelli delle versioni precedenti
  assert.equal(d.valoriCampi(settings, { destinatario: delegante })['persona.nome'], '') // senza persona scelta il campo resta da compilare
  ok('«Altra persona»: nome, titolo, codice fiscale e indirizzo dalla persona scelta; vecchi campi liberi riconosciuti')

  const delega = d.nuovoModello(settings, 'Delega')
  const campi = d.campiUsati(delega)
  assert.ok(campi.includes('persona.nome') && campi.includes('persona.cf') && d.usaAltraPersona(campi))
  const testo = d.compila(delega.corpo, v)
  assert.ok(testo.includes('Giulia Rinaldi') && testo.includes('Paolo Neri') && testo.includes('NREPLA75C01F257K') && !/persona\./.test(testo))
  assert.ok(!d.usaAltraPersona(d.campiUsati(d.nuovoModello(settings, 'Lettera'))))
  ok('la delega usa delegante e delegato scelti; la lettera non chiede un’altra persona')

  // ---------- uscite ricorrenti nell'archivio
  process.env.MNGMNT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-104-db-'))
  const db = require('../electron/db'); db.open(process.env.MNGMNT_DATA_DIR)
  const g = require('../electron/gestione')
  const voci = () => db.getDb().prepare('SELECT * FROM costi ORDER BY COALESCE(scadenza,data), id').all()
  g.esegui('costo', { data: '2030-01-31', descrizione: 'Affitto', categoria: 'Affitto', importo: 750, scadenza: '2030-01-31', ripeti: 'mensile' })
  assert.equal(g.estendiUsciteRicorrenti('2030-03-15'), 2) // febbraio e marzo (fine mese), aprile non ancora: mancano più di 30 giorni
  assert.deepEqual(voci().map((x) => x.scadenza), ['2030-01-31', '2030-02-28', '2030-03-31'])
  assert.equal(g.estendiUsciteRicorrenti('2030-03-15'), 0) // nessun doppione
  g.esegui('eliminaCosto', { id: voci()[2].id }); assert.equal(g.estendiUsciteRicorrenti('2030-03-15'), 0) // la voce eliminata non torna
  g.esegui('costo', { ...voci()[1], importo: 800 }); assert.equal(g.estendiUsciteRicorrenti('2030-04-20'), 1)
  assert.equal(voci().at(-1).scadenza, '2030-04-30'); assert.equal(voci().at(-1).importo, 800) // la nuova copia l'ultima della serie
  g.esegui('costo', { ...voci()[0], pagata: 1 }); g.esegui('costo', { ...voci()[1], ripeti: '' })
  assert.deepEqual(voci().map((x) => `${x.scadenza}:${x.ripeti || ''}`), ['2030-01-31:', '2030-02-28:']) // interrotta: tolte le successive non pagate
  assert.equal(g.estendiUsciteRicorrenti('2030-12-31'), 0)
  assert.throws(() => g.esegui('costo', { data: '2030-01-01', descrizione: 'X', categoria: 'Altro', importo: 1, ripeti: 'ogni ora' }), /Frequenza non valida/)
  g.esegui('costo', { data: '2030-01-10', descrizione: 'Assicurazione', categoria: 'Servizi', importo: 480, scadenza: '2030-01-10', ripeti: 'trimestrale' })
  g.estendiUsciteRicorrenti('2030-07-01')
  assert.deepEqual(voci().filter((x) => x.descrizione === 'Assicurazione').map((x) => x.scadenza), ['2030-01-10', '2030-04-10', '2030-07-10'])
  db.close()
  // un backup di una versione precedente, senza le colonne facoltative nuove, si deve poter ancora ripristinare
  const vecchio = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-104-vecchio-'))
  fs.cpSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'archivio-1.0.0'), vecchio, { recursive: true })
  assert.equal(require('../electron/backup').isBackup(vecchio), true, 'il backup della 1.0.0 deve restare valido')
  fs.rmSync(vecchio, { recursive: true, force: true })
  ok('uscite ricorrenti: mensili a fine mese e trimestrali, create 30 giorni prima, senza doppioni; eliminate e interrotte non tornano; l’importo nuovo vale per le prossime; i backup delle versioni precedenti restano ripristinabili')

  // ---------- previsione nello scadenzario
  const costi = [{ id: 1, pratica_id: null, fornitore_id: null, data: '2026-10-05', descrizione: 'Affitto', categoria: 'Affitto', importo: 750, scadenza: '2026-10-05', pagata: 1, ripeti: 'mensile', serie: 1, ripeti_giorno: 5 },
    { id: 2, pratica_id: null, fornitore_id: null, data: '2026-11-05', descrizione: 'Affitto', categoria: 'Affitto', importo: 750, scadenza: '2026-11-05', pagata: 0, ripeti: 'mensile', serie: 1, ripeti_giorno: 5 },
    { id: 3, pratica_id: null, fornitore_id: null, data: '2026-11-02', descrizione: 'Cancelleria', categoria: 'Materiali', importo: 120, scadenza: null, pagata: 1 }]
  const previste = pag.usciteRicorrentiPreviste(costi, '2027-02-28')
  assert.deepEqual(previste.map((x) => x.data), ['2026-12-05', '2027-01-05', '2027-02-05'])
  assert.ok(previste.every((x) => x.previsto && x.stato === 'da_pagare' && x.categoria === 'Affitto' && x.importo === 750))
  assert.equal(pag.prossimaScadenza('2026-01-31', 'mensile', 31), '2026-02-28'); assert.equal(pag.prossimaScadenza('2026-11-30', 'trimestrale', 30), '2027-02-28'); assert.equal(pag.prossimaScadenza('2024-02-29', 'annuale', 29), '2025-02-28')
  ok('scadenzario: le uscite ricorrenti dei mesi successivi compaiono come previste, con il giorno del mese corretto')

  // ---------- budget dell'anno
  const parcella = (id, netto, stato, data) => ({ id, tipo: 'parcella', stato, numero: String(id), data, netto, incassato: stato === 'pagata' ? netto : 0, data_pagamento: stato === 'pagata' ? data : null, pratica_id: null, cliente_id: null, incassi_dettagliati: 0 })
  const mov = [...pag.movimenti([parcella(1, 60000, 'pagata', '2026-03-01'), parcella(2, 10000, 'pagata', '2026-06-01'), parcella(3, 5000, 'emessa', '2026-11-01')],
    [...costi, { id: 4, pratica_id: null, fornitore_id: null, data: '2026-06-16', descrizione: 'F24 saldo', categoria: 'Imposte e contributi', importo: 4000, scadenza: '2026-06-16', pagata: 1 }], [], '2026-11-17'), ...previste.filter((x) => x.data.startsWith('2026'))]
  const b = bud.calcolaBudget(mov, 2026, { categorie: { Affitto: 2000, Materiali: 1000 }, accantonamento: 25, obiettivo: 80000 }, { forfettario: true })
  assert.equal(b.incassato, 70000); assert.equal(b.daIncassare, 5000)
  const affitto = b.righe.find((r) => r.categoria === 'Affitto'), materiali = b.righe.find((r) => r.categoria === 'Materiali')
  assert.deepEqual([affitto.pagato, affitto.daPagare, affitto.stato], [750, 1500, 'superato']) // novembre da pagare + dicembre previsto
  assert.equal(materiali.stato, 'ok'); assert.equal(b.righe[0].budget != null, true)
  assert.deepEqual(b.accantonamento, { percentuale: 25, daParte: 17500, giaPagato: 4000, resta: 13500 })
  assert.equal(b.obiettivo.quota, 70000 / 80000)
  assert.equal(b.soglia.stato, 'attenzione') // 70.000 su 85.000: oltre l'80%
  assert.equal(bud.calcolaBudget(mov, 2026, {}, { forfettario: true }).soglia.stato, 'attenzione')
  assert.equal(bud.calcolaBudget(mov, 2026, {}, {}).soglia, null); assert.equal(bud.calcolaBudget(mov, 2026, {}).accantonamento, null)
  const molto = bud.calcolaBudget([{ chiave: 'x', data: '2026-05-01', stato: 'incassate', importo: 101000, descrizione: '', pratica_id: null, scaduto: false }], 2026, {}, { forfettario: true })
  assert.equal(molto.soglia.stato, 'uscita')
  assert.deepEqual(['ok', 'attenzione', 'superato', 'nessuno'], [bud.statoDi(10, 100), bud.statoDi(80, 100), bud.statoDi(101, 100), bud.statoDi(5, null)])
  ok('budget: spese per categoria con le previste, accantonamento meno imposte già pagate, obiettivo e soglia del forfettario')


  // ---------- cartella della pratica con file di ogni tipo: tutti collegati, sottocartelle comprese; fuori solo nascosti, di sistema e temporanei
  if (!db.getDb()) db.open(process.env.MNGMNT_DATA_DIR)
  const cliens = require('../electron/cliens'), docfile = require('../electron/docfile')
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-104-cartella-')), cart = path.join(base, 'Commessa Bianchi')
  const veri = ['Contratto firmato.pdf', 'Preventivo.docx', 'Computo.xlsx', 'Note.txt', 'Foto/Sopralluogo 1.jpg', 'Foto/Sopralluogo 2.HEIC', 'Foto/2026/Marzo/Cantiere.png',
    'Email/Conferma.eml', 'Email/Allegati.zip', 'Disegni/Pianta.dwg', 'Disegni/Pianta.pdf', 'Già fatture/Fattura n. 12.xml.p7m']
  const scarti = ['.DS_Store', '~$Preventivo.docx', 'Scaricando.pdf.crdownload', 'Copia.part', 'Lavoro.tmp', '.nascosta/segreto.pdf', 'Thumbs.db', 'desktop.ini']
  for (const f of [...veri, ...scarti]) { fs.mkdirSync(path.dirname(path.join(cart, f)), { recursive: true }); fs.writeFileSync(path.join(cart, f), `contenuto di ${f}`) }
  fs.mkdirSync(path.join(cart, 'Vuota'))
  const pc = db.save('pratiche', { numero: '2026/099', titolo: 'Commessa Bianchi', stato: 'In corso', cartella: cart })
  const esito = await cliens.sincronizzaPratica(pc.id, { automatica: true })
  const collegati = db.list('documenti', { pratica_id: pc.id }).map((d) => path.relative(cart, d.percorso).split(path.sep).join('/')).sort()
  assert.equal(esito.nuovi, veri.length)
  assert.deepEqual(collegati, [...veri].sort((a, b) => (a < b ? -1 : 1)))
  const sulDisco = await docfile.contenutoDisco(pc.id)
  assert.deepEqual(sulDisco.cartelle.sort(), ['Disegni', 'Email', 'Foto', 'Foto/2026', 'Foto/2026/Marzo', 'Già fatture', 'Vuota'])
  assert.equal(sulDisco.daCollegare, 0)
  assert.equal((await cliens.sincronizzaPratica(pc.id, { automatica: true })).nuovi, 0) // una seconda lettura non crea doppioni
  fs.rmSync(base, { recursive: true, force: true })
  ok('cartella della pratica: PDF, Word, Excel, immagini, email, ZIP, DWG e p7m collegati in ogni sottocartella; nascosti, di sistema e temporanei esclusi; nessun doppione')

  console.log(`\n${n} gruppi di controlli superati`)
} finally { fs.rmSync(out, { recursive: true, force: true }) }
