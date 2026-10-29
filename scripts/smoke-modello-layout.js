'use strict'
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { Worker } = require('node:worker_threads')
const { BrowserWindow } = require('electron')
const { clickTextReady } = require('./smoke-ui')
let sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) // dentro attach() diventa un'attesa adattiva (scripts/lib/attesa.js)
function attach({ getWindow, db }) {
  const win = getWindow(), wc = win.webContents, out = process.env.SMOKE_OUT || os.tmpdir(), results = []
  sleep = require('./lib/attesa').adattiva(wc)
  const js = code => wc.executeJavaScript(code, true)
  const check = (name, condition) => { results.push({ name, ok: !!condition }); console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`) }
  const click = (selector, text) => clickTextReady(js, selector, text)
  const section = title => `[...document.querySelectorAll('.modello-blocco')].find(s => s.querySelector('h3')?.textContent === ${JSON.stringify(title)})`
  const setInput = (selector, value, select = false) => js(`(() => { const e=${selector}; if(!e)throw Error('Campo assente'); Object.getOwnPropertyDescriptor(${select ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('${select ? 'change' : 'input'}',{bubbles:true})) })()`)
  const fileInput = async (label, bytes, name, type) => {
    await js(`(() => { const e=[...document.querySelectorAll('input[type=file]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)});if(!e)throw Error('Importazione assente');const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0))],${JSON.stringify(name)},{type:${JSON.stringify(type)}}));e.files=transfer.files;e.dispatchEvent(new Event('change',{bubbles:true})); })()`)
    await sleep(400)
  }
  const sheetVisible = () => js(`(() => { const r=document.querySelector('.a4-frame').getBoundingClientRect();const c=document.querySelector('.a4-frame').closest('.modal-body,.content').getBoundingClientRect();return r.top>=c.top&&r.bottom<=Math.min(c.bottom,innerHeight)+1&&r.left>=c.left&&r.right<=c.right })()`)
  const waitPreview = async () => {
    for (let i=0;i<150;i++) {
      if (await js("document.querySelector('.a4-fit')?.getAttribute('aria-busy')==='false' && document.querySelector('.a4-frame img')?.naturalWidth>0")) return
      await sleep(100)
    }
    throw new Error('Anteprima PDF non pronta: ' + await js("document.querySelector('.modello-preview')?.innerText"))
  }
  wc.once('did-finish-load', async () => {
    let probe
    try {
      db.setSettings({ onboarding_fatto: true, backup_automatico: false, tema: 'chiaro' })
      const { build } = await import('vite')
      const bundle = path.join(db.getDataDir(), 'template-test')
      await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: path.resolve(__dirname, '../src/lib/print.ts'), formats: ['es'], fileName: () => 'print.mjs' }, outDir: bundle } })
      const E = await import(pathToFileURL(path.join(bundle, 'print.mjs')).href)
      const example = (preview = true) => E.esempioNotaHtml({ ...db.getSettings(), studio: db.getSettings().studio || {} }, preview)
      wc.send('data-changed', ['settings']); await sleep(500)
      await click('.nav-item', 'Impostazioni'); await click('.tabs button', 'Modello PDF'); await sleep(350)
      await waitPreview()
      fs.mkdirSync(out, { recursive: true })
      check('foglio A4 interamente visibile entrando nelle Impostazioni', await sheetVisible())
      fs.writeFileSync(path.join(out, 'modello.png'), (await wc.capturePage()).toPNG())
      check('anteprima come immagine PDF, senza contenuti attivi', await js("!document.querySelector('.a4-frame iframe') && document.querySelector('.a4-frame img').src.startsWith('data:image/png;base64,')"))
      // Inspect the HTML template separately; the visible preview is the actual rendered PDF.
      probe = new BrowserWindow({ show: false, useContentSize: true, width: 794, height: 1123,
        webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, partition: `modello-layout-${Date.now()}` } })
      probe.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      probe.webContents.session.webRequest.onBeforeRequest((details, done) => done({ cancel: !details.url.startsWith('data:') }))
      const measure = async html => {
        await probe.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
        await probe.webContents.executeJavaScript('document.fonts.ready.then(()=>true)')
        return probe.webContents.executeJavaScript(`(() => {
          const box = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom}}
          return {header:box('header'),prestazioni:box('body > table'),calcolo:box('.calculation table'),riepilogo:box('.summary'),compensi:box('.summary td'),importo:box('.summary td.amount'),meta:box('.meta'),destinatario:box('.recipient'),legal:box('.legal'),footer:box('footer'),altezza:document.documentElement.scrollHeight,fontCaricati:[...document.fonts].map(f=>({family:f.family,status:f.status}))}
        })()`)
      }
      const initial = await measure(example())
      for (const name of ['prestazioni', 'calcolo', 'riepilogo', 'compensi']) assert.ok(Math.abs(initial[name].left - initial.header.left) < 1)
      for (const name of ['prestazioni', 'calcolo', 'riepilogo', 'importo']) assert.ok(Math.abs(initial[name].right - initial.header.right) < 1)
      check('tabelle e compensi allineati ai margini', true)
      check('destinatario vicino al numero della nota', initial.destinatario.top - initial.meta.bottom < 10)
      check('esempio completo senza scorrimento interno', initial.altezza <= 1124 && initial.legal.bottom < initial.footer.top)

      await fileInput('Importa font personale', Buffer.from('non è un font'), 'invalido.ttf', 'font/ttf')
      check('file rinominato come font rifiutato', await js("!document.querySelector('.modello-font-list') && document.body.innerText.includes('non contiene un font')"))
      const font = fs.readFileSync(path.resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'))
      await fileInput('Importa font personale', font, 'LiberationSans-Regular.ttf', 'font/ttf')
      const fontId = await js("document.querySelector('.modello-blocco select').value")
      check('font TTF locale importato e selezionato', fontId.startsWith('font-') && await js("!!document.querySelector('.modello-font-list')"))
      await fileInput('Importa font personale', font, 'duplicato.ttf', 'font/ttf')
      check('font duplicato rifiutato', await js("document.querySelectorAll('.modello-font-list li').length===1 && document.body.innerText.includes('già presente')"))
      const { createCanvas } = require('@napi-rs/canvas'), canvas = createCanvas(480, 70), ctx = canvas.getContext('2d')
      ctx.fillStyle = '#24483e'; ctx.fillRect(0, 0, 480, 70); ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif'; ctx.fillText('STUDIO DIMOSTRATIVO', 18, 45)
      const image = canvas.toBuffer('image/png')
      await fileInput('Carica immagine intestazione', image, 'intestazione.png', 'image/png')
      await fileInput('Carica immagine piè di pagina', image, 'footer.png', 'image/png')
      check('immagini caricate nei due blocchi', await js("document.querySelectorAll('.modello-immagine img').length===2"))
      await setInput(`${section('Intestazione')}.querySelector('.riga-ed input')`, 'Studio dimostrativo')
      // Add text through the last add-row button (empty block or last row's +) rather than image controls.
      const addRow = async (title, text) => {
        await js(`(()=>{const s=${section(title)};[...s.querySelectorAll('button')].filter(b=>b.textContent.includes('Aggiungi riga')||b.getAttribute('aria-label')==='Aggiungi riga').at(-1).click()})()`); await sleep(70)
        await setInput(`${section(title)}.querySelector('.riga-ed:last-of-type input')`, text); await sleep(70)
      }
      await addRow('Intestazione', 'Avvocato · Libero professionista')
      await addRow('Piè di pagina', 'Studio dimostrativo · Via Esempio 10 · Modena')
      await addRow('Piè di pagina', 'Codice fiscale e partita IVA · Dati di esempio')
      await addRow('Coordinate di pagamento', 'Pagamento tramite bonifico · IBAN di esempio')
      await setInput(`${section('Intestazione')}.querySelector('.riga-ed select')`, 'georgia', true)
      await click('.page-head button', 'Salva'); await sleep(300)
      const saved = db.getSettings().modello_pdf
      check('font, immagini e testi salvati nelle impostazioni', saved.fontDocumento === fontId && saved.fontPersonali.length === 1 && !!saved.logo && !!saved.immagineFooter && saved.footer.length === 2)
      await waitPreview()
      const customMetrics = await measure(example())
      check('font importato effettivamente caricato nel documento', customMetrics.fontCaricati.some(f => f.family.includes(fontId) && f.status === 'loaded'))
      check('modello completo su un solo foglio senza sovrapposizioni', customMetrics.altezza <= 1124 && customMetrics.legal.bottom < customMetrics.footer.top)
      fs.writeFileSync(path.join(out, 'metriche.json'), JSON.stringify({ initial, custom: customMetrics }, null, 2))
      await js("document.querySelector('.content').scrollTop=0"); await sleep(250)
      fs.writeFileSync(path.join(out, 'modello-personalizzato.png'), (await wc.capturePage()).toPNG())
      check('foglio intero visibile anche con immagini e font personali', await sheetVisible())
      const printed = example(false)
      fs.writeFileSync(path.join(out, 'modello-stampa.html'), printed)
      const pdf = await js(`window.mngmnt.invoke('pdf:print',${JSON.stringify(printed)},'modello-completo')`)
      const details = await new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, 'check-pdf-layout-worker.js'), { workerData: { file: pdf, png: path.join(out, 'pdf-modello.png') } })
        worker.once('message', r => r.error ? reject(new Error(r.error)) : resolve(r)); worker.once('error', reject)
      })
      fs.writeFileSync(path.join(out, 'pdf-metriche.json'), JSON.stringify(details, null, 2))
      check('PDF completo esportato su una sola pagina', details.pages === 1)
      check('PDF con destinatario, totale, pagamento e footer leggibili', ['Mario Rossi', 'Netto da pagare', 'IBAN di esempio', 'Dati di esempio'].every(t => details.text.includes(t)))
      check('entrambe le immagini presenti nel PDF', details.images >= 2)
      check('font personale incorporato nel PDF', /LiberationSans/.test(fs.readFileSync(pdf).toString('latin1')) && /\/FontFile2\b/.test(fs.readFileSync(pdf).toString('latin1')))
      check('anteprima PDF su una pagina completa', await js("document.querySelector('.a4-frame img').alt.endsWith('pagina 1 di 1')"))
      const axe = require('axe-core'); await js(axe.source)
      const issues = await js("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))")
      fs.writeFileSync(path.join(out, 'accessibilita.json'), JSON.stringify(issues, null, 2))
      check('nuovi controlli senza violazioni automatiche WCAG', issues.length === 0)
      win.setSize(980, 640); await sleep(300)
      check('foglio intero visibile su finestra compatta', await sheetVisible())
      check('nessuno scorrimento orizzontale nella finestra compatta', await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1 && document.querySelector(".content").scrollWidth<=document.querySelector(".content").clientWidth+1'))
      fs.writeFileSync(path.join(out, 'modello-compatto.png'), (await wc.capturePage()).toPNG())
      win.setSize(1360,860); await sleep(150)
      for(let i=0;i<9;i++) await addRow('Intestazione', `Riga aggiuntiva ${i+1} · Controllo del modello esteso`)
      await waitPreview()
      check('modello esteso diviso in pagine, senza ritagliare il foglio', await js("!!document.querySelector('.preview-pagine')") && await sheetVisible())
      await js("document.querySelector('button[aria-label=\"Pagina successiva\"]').click()")
      await waitPreview()
      check('seconda pagina visualizzabile interamente senza scorrimento', await js("document.querySelector('.a4-frame img').alt.includes('pagina 2 di')") && await sheetVisible())
      await js("document.querySelector('button[aria-label=\"Pagina precedente\"]').click()")
      await waitPreview()
      check('ritorno alla prima pagina del modello esteso', await js("document.querySelector('.a4-frame img').alt.includes('pagina 1 di')"))
      await click('.page-head button','Annulla modifiche');await waitPreview()
      await js(`document.querySelector('button[aria-label=${JSON.stringify('Rimuovi font LiberationSans-Regular')} ]')?.click()`)
      await sleep(150)
      check('rimozione del font con ritorno al carattere predefinito', await js("!document.querySelector('.modello-font-list') && document.querySelector('.modello-blocco select').value==='arial'"))
      await click('.page-head button','Annulla modifiche');await waitPreview()
      await js("document.querySelector('.content').scrollTop=0");await sleep(200)
      fs.writeFileSync(path.join(out, 'modello-finale.png'), (await wc.capturePage()).toPNG())
      db.setSettings({tema:'scuro'});wc.send('data-changed',['settings']);await sleep(200)
      check('anteprima a foglio intero anche nel tema scuro', await sheetVisible())
      fs.writeFileSync(path.join(out, 'modello-scuro.png'), (await wc.capturePage()).toPNG())
      const note=db.saveParcella({tipo:'proforma',data:'2026-10-14',stato:'bozza',compensi:100,imponibile:100,totale:100,netto:100,sg_perc:0,cpa_perc:0,iva_perc:0,rit_perc:0,voci:[{tipo:'compenso',descrizione:'Controllo modello',quantita:1,importo:100}]})
      wc.send('data-changed',['parcelle']);await sleep(150)
      await click('.nav-item','Parcelle');await click('tbody tr',note.numero)
      await click('.modal button','Intestazione e piè di pagina');await waitPreview()
      check('foglio interamente visibile anche nell’editor aperto dalla nota', await sheetVisible())
      fs.writeFileSync(path.join(out, 'modello-nella-nota.png'), (await wc.capturePage()).toPNG())
    } catch (error) { console.error(error); check(String(error), false) }
    finally {
      if (probe && !probe.isDestroyed()) probe.destroy()
      fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'risultati.json'), JSON.stringify(results, null, 2))
      console.log(`RISULTATO: ${results.filter(r => r.ok).length}/${results.length} controlli superati`)
      setTimeout(() => process.exit(results.some(r => !r.ok) ? 1 : 0), 100)
    }
  })
}
module.exports = { attach }
