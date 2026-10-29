'use strict'
// Documenti collegati nell'app vera: nessuna copia, spostamento di file e cartelle, «Sincronizza», «Ricollega», cartella della pratica.
// Avvio: sh scripts/run-smoke.sh <cartella> smoke-documenti
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
let sleep = (ms) => new Promise((r) => setTimeout(r, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)

function attach({ getWindow, db }) {
  const wc = getWindow().webContents
  sleep = require('./lib/attesa').adattiva(wc)
  const results = []
  const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
  const js = (c) => wc.executeJavaScript(c, true)
  const clickText = (sel, text) => require('./smoke-ui').clickTextReady(js, sel, text)
  const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'mngmnt-documenti'); fs.mkdirSync(out, { recursive: true })
  const shot = async (n) => { await sleep(350); for (let i = 0; i < 3; i++) { try { fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); return } catch { await sleep(500) } } }
  const text = () => js('document.body.innerText')
  const attendi = async (cond, ms = 8000) => { for (let t = 0; t < ms; t += 250) { if (await cond()) return true; await sleep(250) } return false }
  const scrivi = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); return p }
  const interni = () => { const d = path.join(db.getDataDir(), 'documenti'); return fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).filter((x) => fs.statSync(path.join(d, x)).isFile()) : [] }

  wc.once('did-finish-load', async () => {
    try {
      await sleep(900)
      db.setSettings({ onboarding_fatto: true, studio: { nome: 'Studio Prova' } })
      const utente = fs.mkdtempSync(path.join(os.tmpdir(), 'mngmnt-utente-'))
      const dir = path.join(utente, 'Scritture', 'Pratica 1')
      const f1 = scrivi(path.join(dir, 'ScritturaPrivata.pdf'), '%PDF-1.4 ' + 'scrittura privata '.repeat(300))
      const f2 = scrivi(path.join(dir, 'Verbale.docx'), 'verbale '.repeat(500))
      const f3 = scrivi(path.join(dir, 'Prove', 'Foto.jpg'), 'foto '.repeat(400))
      const p = db.save('pratiche', { numero: '2026/001', titolo: 'Rossi c. Bianchi', stato: 'In corso', priorita: 'media', colore: '#3b82f6' })
      await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Pratiche'); await sleep(500); await js(`document.querySelector('.pcard h2').click()`); await sleep(600)
      await clickText('.tabs button', 'Documenti'); await sleep(500)
      check('pratica senza documenti: spiega che i file non vengono copiati', /TIO non ne fa una copia/.test(await text()))

      // ---- collegare: nessuna copia ----
      process.env.MNGMNT_TEST_COLLEGA = [f1, f2].join('|')
      await clickText('button', 'Collega file'); await sleep(900)
      const docs = db.list('documenti', { pratica_id: p.id })
      check('due file collegati, con percorso reale e nessuna copia nella cartella dell\'app', docs.length === 2 && docs.every((d) => d.percorso && d.file === '') && interni().length === 0, JSON.stringify(docs.map((d) => d.percorso && path.basename(d.percorso))))
      const t1 = await text()
      check('l\'elenco mostra i nomi e la cartella di ogni file', /ScritturaPrivata\.pdf/.test(t1) && /Verbale\.docx/.test(t1) && /Pratica 1/.test(t1))
      check('nessun avviso di file mancanti', !/non si trovano più|non si trova più/.test(t1))
      await clickText('.doc-nome button', 'ScritturaPrivata'); await sleep(400)
      check('apertura del file dal percorso reale (nessun errore)', !/non si trova più/.test(await text()))

      // ---- cartella della pratica ----
      process.env.MNGMNT_TEST_CARTELLA = dir
      await clickText('button', 'Scegli cartella'); await sleep(800)
      const cartellaOk = await require('./lib/attesa').attendi(async () => db.get('pratiche', p.id).cartella === dir && /Cartella della pratica/.test(await text()), { tempo: 5000 })
      check('cartella della pratica impostata e mostrata', cartellaOk, JSON.stringify({ salvata: db.get('pratiche', p.id).cartella, attesa: dir, testo: /Cartella della pratica/.test(await text()) }))
      process.env.MNGMNT_TEST_COLLEGA = f3; await clickText('button', 'Collega file'); await sleep(700)
      check('i nuovi file ricordano la posizione relativa alla cartella della pratica', db.list('documenti', { pratica_id: p.id }).find((d) => /Foto/.test(d.nome))?.rel === path.join('Prove', 'Foto.jpg'))
      await shot('docs-1-collegati')

      // ---- l'utente sposta l'intera cartella dal Finder ----
      const nuova = path.join(utente, 'Scritture', 'Archivio 2026', 'Pratica 1 (chiusa)')
      fs.mkdirSync(path.dirname(nuova), { recursive: true }); fs.renameSync(dir, nuova)
      await js(`window.dispatchEvent(new Event('focus'))`); await sleep(700)
      const t2 = await text()
      check('tornando sull\'app: avviso «3 file non si trovano più» e file segnati «non trovato»', /3 file non si trovano più/.test(t2) && (t2.match(/non trovato/g) || []).length >= 3)
      await clickText('.doc-nome button', 'Verbale'); await sleep(500)
      check('aprire un file spostato spiega cosa fare (Sincronizza o Ricollega)', /Sincronizza/.test(await text()) && /Ricollega/.test(await text()))
      await shot('docs-2-mancanti')
      await clickText('.doc-avviso button', 'Sincronizza'); await sleep(1500)
      const sy = await js('document.querySelector(".modal")?.innerText || ""')
      check('«Sincronizza»: tutti e 3 ritrovati nella nuova cartella', /3\s*ritrovati/.test(sy.replace(/\n/g, ' ')) && /0\s*da sistemare/.test(sy.replace(/\n/g, ' ')), sy.replace(/\n/g, ' ').slice(0, 160))
      await shot('docs-3-sincronizza')
      const axeSrc = fs.readFileSync((process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')), 'utf8'); await js(axeSrc + '; true')
      for (const tema of ['light', 'dark']) {
        await js(`(() => { const r = document.documentElement; r.classList.add('sem-transizioni'); r.setAttribute('data-theme','${tema}'); void r.offsetHeight })()`); await sleep(300)
        const viol = await js(`axe.run(document.querySelector('.modal'), { resultTypes: ['violations'] }).then(r => r.violations.map(v => v.id + ':' + v.nodes.map(n => n.target.join(' ') + ' ' + ((n.any[0] && n.any[0].message) || '').slice(0, 90)).join(' || ')))`)
        check(`accessibilità (axe-core) della finestra Sincronizza, tema ${tema}`, viol.length === 0, JSON.stringify(viol))
      }
      await clickText('.modal button', 'Chiudi'); await sleep(500)
      const dopo = db.list('documenti', { pratica_id: p.id })
      check('percorsi aggiornati nel database, file intatti nella nuova posizione', dopo.every((d) => d.percorso.startsWith(nuova + path.sep) && fs.existsSync(d.percorso)) && fs.readFileSync(path.join(nuova, 'Verbale.docx'), 'utf8').startsWith('verbale'))
      check('ora la pratica non mostra più avvisi', !/non si trovano più/.test(await text()) && !/non trovato/.test(await text()))

      // ---- file rinominato ----
      fs.renameSync(path.join(nuova, 'Verbale.docx'), path.join(nuova, 'Verbale udienza 12 ottobre.docx'))
      await js(`window.dispatchEvent(new Event('focus'))`); await sleep(600)
      await clickText('.doc-avviso button', 'Sincronizza'); await sleep(1500)
      const sy2 = (await js('document.querySelector(".modal")?.innerText || ""')).replace(/\n/g, ' ')
      check('file rinominato: riconosciuto dal contenuto', /file rinominato/.test(sy2) && /1\s*ritrovati/.test(sy2), sy2.slice(0, 200))
      await clickText('.modal button', 'Chiudi'); await sleep(400)

      // ---- file scomparso: Ricollega ----
      const nuovoF = path.join(utente, 'Altrove', 'Verbale ritrovato.docx'); scrivi(nuovoF, 'verbale '.repeat(500))
      fs.unlinkSync(path.join(nuova, 'Verbale udienza 12 ottobre.docx'))
      await js(`window.dispatchEvent(new Event('focus'))`); await sleep(600)
      process.env.MNGMNT_TEST_RICOLLEGA = nuovoF
      await clickText('.plain-row button', 'Ricollega'); await sleep(900)
      check('«Ricollega»: il documento punta al file indicato', db.list('documenti', { pratica_id: p.id }).some((d) => d.percorso === nuovoF) && !/non trovato/.test(await text()))

      // ---- rimozione: il file dell'utente resta ----
      await js(`document.querySelector('.plain-row button[aria-label^="Rimuovi il collegamento a Verbale"]').click()`); await sleep(500)
      check('il collegamento si toglie subito con «Annulla», senza finestra di conferma', /Collegamento al documento eliminato/.test(await text()) && !(await js('!!document.querySelector(".modal")')))
      await sleep(300)
      check('rimosso il collegamento, il file sul computer c\'è ancora', fs.existsSync(nuovoF) && db.list('documenti', { pratica_id: p.id }).length === 2)

      // ---- trascinare i file sulla pratica, come allegati di una email ----
      const rilascia = (selettore, percorsi, fasi = ['dragenter', 'dragover', 'drop']) => js(`(() => { const el = document.querySelector(${JSON.stringify(selettore)}); if (!el) return false; const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.pdf')); dt.setData('text/x-mngmnt-test-path', ${JSON.stringify(percorsi.join('|'))}); for (const t of ${JSON.stringify(fasi)}) el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })); return true })()`)
      const extra = scrivi(path.join(utente, 'Da archiviare', 'Lettera.pdf'), '%PDF lettera '.repeat(100))
      await clickText('.tabs button', 'Compiti'); await sleep(400)
      check('le prove possono simulare il rilascio di file', await js('window.mngmnt.test === true'))
      await rilascia('.page[data-zona-file]', [extra], ['dragenter', 'dragover']); await sleep(200)
      check('trascinando un file sulla pratica compare «Rilascia per collegare i file a questa pratica»', /Rilascia per collegare i file a questa pratica/.test(await js('document.querySelector(".drop-overlay")?.innerText || ""')))
      await shot('docs-5-rilascio')
      await rilascia('.page[data-zona-file]', [extra], ['drop']); await sleep(900)
      check('rilasciato su qualsiasi scheda della pratica (qui «Compiti»): collegato, senza copie, avviso a schermo', db.list('documenti', { pratica_id: p.id }).some((d) => d.percorso === extra) && interni().length === 0 && /1 file collegato alla pratica/.test(await text()) && !(await js('!!document.querySelector(".drop-overlay")')))

      const p2 = db.save('pratiche', { numero: '2026/002', titolo: 'Verdi c. Neri', stato: 'In corso', priorita: 'media', colore: '#22c55e' })
      await js('location.reload()'); await sleep(1500)
      await clickText('.nav-item', 'Pratiche'); await sleep(600)
      const extra2 = scrivi(path.join(utente, 'Da archiviare', 'Memoria.docx'), 'memoria '.repeat(300))
      await rilascia(`.pcard[data-pratica-id="${p2.id}"]`, [extra2], ['dragenter', 'dragover']); await sleep(200)
      check('trascinando un file su una pratica dell\'elenco, quella pratica si evidenzia', await js(`document.querySelector('.pcard[data-pratica-id="${p2.id}"]').classList.contains('drop-target') && !document.querySelector('.pcard[data-pratica-id="${p.id}"]').classList.contains('drop-target')`))
      await rilascia(`.pcard[data-pratica-id="${p2.id}"]`, [extra2], ['drop']); await sleep(900)
      check('rilasciato su una scheda dell\'elenco: collegato a quella pratica e non alle altre', db.list('documenti', { pratica_id: p2.id }).length === 1 && db.list('documenti', { pratica_id: p2.id })[0].percorso === extra2 && !db.list('documenti', { pratica_id: p.id }).some((d) => d.percorso === extra2) && /collegato a «Verdi c\. Neri»/.test(await text()))

      // fuori da una pratica: si sceglie la pratica
      await clickText('.nav-item', 'Panoramica'); await sleep(500)
      const extra3 = scrivi(path.join(utente, 'Da archiviare', 'Perizia.pdf'), '%PDF perizia '.repeat(100))
      await rilascia('.content', [extra3]); await sleep(700)
      check('rilasciato fuori da una pratica: chiede a quale pratica collegarlo', /Collega i file a una pratica/.test(await js('document.querySelector(".modal")?.innerText || ""')) && /Perizia\.pdf/.test(await js('document.querySelector(".modal")?.innerText || ""')))
      await js(`(() => { const s = document.querySelector('.modal select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s, '${p2.id}'); s.dispatchEvent(new Event('change',{bubbles:true})) })()`); await sleep(200)
      await clickText('.modal .btn-primary', 'Collega'); await sleep(1200)
      check('scelta la pratica: file collegato e apertura della sua scheda Documenti', db.list('documenti', { pratica_id: p2.id }).some((d) => d.percorso === extra3) && /Perizia\.pdf/.test(await text()))

      // cartella intera
      const cart = path.join(utente, 'Fascicolo'); for (const f of ['a.pdf', 'sub/b.pdf', 'sub/c.docx']) scrivi(path.join(cart, f), f.repeat(200))
      await rilascia('.page[data-zona-file]', [cart]); await sleep(1200)
      check('cartella trascinata: collegati tutti i suoi file (3) e impostata come cartella della pratica', db.list('documenti', { pratica_id: p2.id }).filter((d) => d.percorso.startsWith(cart + path.sep)).length === 3 && db.get('pratiche', p2.id).cartella === cart)
      // dentro una finestra di dialogo non si apre nessuna zona di rilascio
      await clickText('button', 'Sincronizza'); await sleep(700)
      await rilascia('.modal', [extra], ['dragenter', 'dragover']); await sleep(200)
      check('con una finestra aperta il trascinamento sopra di essa non apre la zona di rilascio', !(await js('!!document.querySelector(".drop-overlay")')))
      await clickText('.modal button', 'Chiudi'); await sleep(400)

      // ---- impostazioni ----
      await clickText('.nav-item', 'Impostazioni'); await sleep(400); await clickText('.tabs button', 'Documenti'); await sleep(500)
      const imp = await text()
      check('Impostazioni → Documenti: sincronizzazione, cartelle di ricerca, cartella dei documenti creati, avviso sul backup', /Sincronizza tutti i collegamenti/.test(imp) && /Dove cercare i file spostati/.test(imp) && /Documenti creati da TIO/.test(imp) && /non sono inclusi nel backup/.test(imp))
      await shot('docs-4-impostazioni')
      // ---- nota pro forma in PDF: salvata nella cartella locale della pratica e collegata ----
      process.env.MNGMNT_TEST_PDF_NELLA_PRATICA = '1'
      const pf = await js(`window.mngmnt.invoke('pdf:print', '<html><body><h1>Nota pro forma</h1></body></html>', 'Nota-pro-forma-PF-1', ${p.id})`)
      const cartP = db.get('pratiche', p.id).cartella
      check('PDF pro forma salvato nella cartella locale della pratica e collegato ai suoi documenti', !!pf && path.dirname(pf) === cartP && fs.existsSync(pf) && db.list('documenti', { pratica_id: p.id }).some((d) => d.percorso === pf && d.categoria === 'Parcelle'), pf)
      delete process.env.MNGMNT_TEST_PDF_NELLA_PRATICA
      check('mai nulla copiato nella cartella dell\'app', interni().length === 0)

      const bad = results.filter((r) => !r.ok)
      console.log(`\nRISULTATO: ${results.length - bad.length}/${results.length} controlli superati`)
    } catch (e) { console.log('ERRORE', e, e && e.stack) } finally { setTimeout(() => process.exit(0), 300) }
  })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', message) })
}
module.exports = { attach }
