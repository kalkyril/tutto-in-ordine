'use strict'
// Anonimizza sui PDF: mappa del testo con le posizioni e copia oscurata con la stessa impaginazione, senza testo recuperabile.
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { Worker } = require('node:worker_threads')
let n = 0
const ok = (t) => console.log(`ok ${++n} - ${t}`)
const lavoro = (d) => new Promise((res, rej) => { const w = new Worker(path.join(__dirname, '..', 'electron', 'pdf-oscura-worker.js'), { workerData: d }); w.once('message', (m) => { w.terminate(); m.error ? rej(new Error(m.error)) : res(m) }); w.once('error', rej) })

// PDF di prova con testo vero (Helvetica), due pagine A4 e metadati da non conservare
function pdfDiProva() {
  const righe = [['Il sottoscritto Mario Rossi, C.F. RSSMRA85T10A562S,', 760], ['residente in Via Garibaldi n. 10, Modena.', 740]]
  const testo = (rr) => `BT /F1 12 Tf ${rr.map(([t, y]) => `1 0 0 1 72 ${y} Tm (${t}) Tj`).join(' ')} ET`
  const pagine = [testo(righe), testo([['Seconda pagina: IBAN IT60X0542811101000000123456', 760]])]
  const og = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pagine.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pagine.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']
  pagine.forEach((c, i) => { og.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${c.length} >>\nstream\n${c}\nendstream`) })
  og.push('<< /Title (Atto riservato di Mario Rossi) /Author (Mario Rossi) >>')
  let out = '%PDF-1.4\n'; const off = []
  og.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const x = out.length
  out += `xref\n0 ${og.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${og.length + 1} /Root 1 0 R /Info ${og.length} 0 R >>\nstartxref\n${x}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-oscura-'))
  try {
    const file = path.join(dir, 'atto.pdf'); fs.writeFileSync(file, pdfDiProva())
    const m = await lavoro({ azione: 'mappa', file })
    assert.equal(m.stato, 'testo'); assert.equal(m.pagine.length, 2)
    assert.ok(m.testo.includes('Mario Rossi') && m.testo.includes('RSSMRA85T10A562S') && m.testo.includes('IT60X0542811101000000123456'), m.testo)
    const pz = m.pagine[0].pezzi[0]
    assert.ok(pz.x > 60 && pz.x < 80 && pz.y > 60 && pz.y < 90 && Math.abs(m.pagine[0].larghezza - 595.28) < 0.1, JSON.stringify(pz))
    ok('mappa: testo, pagine e posizione delle righe (origine in alto a sinistra)')

    const span = (t, ph) => { const s = m.testo.indexOf(t); return { start: s, end: s + t.length, ph } }
    const spans = [span('Mario Rossi', '[FULLNAME_1]'), span('RSSMRA85T10A562S', '[CF_1]'), span('Via Garibaldi n. 10', '[STREET_1]'), span('IT60X0542811101000000123456', '[IBAN_1]')]
    const r = await lavoro({ azione: 'oscura', file, mappa: m, spans })
    const pdf = Buffer.from(r.pdf), out = path.join(dir, 'oscurato.pdf'); fs.writeFileSync(out, pdf)
    assert.equal(r.riquadri, 4)
    const grezzo = pdf.toString('latin1')
    assert.ok(!/Mario|Rossi|RSSMRA|Garibaldi|IT60X/.test(grezzo) && !/Atto riservato/.test(grezzo) && /\/Producer \(TIO\)/.test(grezzo))
    assert.equal((grezzo.match(/\/Type \/Page /g) || []).length, 2)
    assert.ok(/\/MediaBox \[0 0 595\.28 841\.89\]/.test(grezzo))
    ok('copia oscurata: stesse pagine e dimensioni, nessun dato né metadato originale nel file')

    const dopo = await lavoro({ azione: 'mappa', file: out })
    assert.equal(dopo.testo.trim(), '')
    assert.equal(dopo.stato, 'scansione')
    ok('nella copia non c’è testo da copiare o cercare')

    // il riquadro copre davvero il nome: sull'originale si misura dove sono le sue lettere, sulla copia si controlla che siano coperte
    const { createCanvas } = require('@napi-rs/canvas')
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const disegna = async (dati) => {
      const base = path.dirname(require.resolve('pdfjs-dist/package.json')) + path.sep, task = pdfjs.getDocument({ data: new Uint8Array(dati), isEvalSupported: false, useSystemFonts: false, standardFontDataUrl: base + 'standard_fonts/' }), doc = await task.promise
      const page = await doc.getPage(1), vp = page.getViewport({ scale: 2 })
      const c = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)), ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      await task.destroy()
      const px = ctx.getImageData(0, 0, c.width, c.height).data
      return { c, scuro: (x, y) => { const k = (Math.round(y) * c.width + Math.round(x)) * 4; return px[k] + px[k + 1] + px[k + 2] < 300 } }
    }
    const O = await disegna(fs.readFileSync(file)), R = await disegna(pdf)
    const nome = m.pagine[0].pezzi[0], y0 = (nome.y + 2) * 2, y1 = (nome.y + nome.h - 3) * 2
    const colonna = (img, x) => { for (let y = y0; y < y1; y++) if (img.scuro(x, y)) return true; return false }
    // colonne con inchiostro nell'originale, raggruppate in parole: «Il», «sottoscritto», «Mario», «Rossi,», …
    const parole = []; let dentro = false, vuote = 0
    for (let x = nome.x * 2; x < (nome.x + nome.w) * 2 + 10; x++) {
      const nero = colonna(O, x)
      if (nero) { if (!dentro) { parole.push([x, x]); dentro = true } parole[parole.length - 1][1] = x; vuote = 0 } else if (dentro && ++vuote > 4) dentro = false
    }
    const [mario, rossi] = [parole[2], parole[3]]
    // nella copia ogni colonna da «M» alla «i» di «Rossi» è coperta dal riquadro nero
    // (il segnaposto occupa la fascia centrale: sopra e sotto il riquadro resta nero)
    const coperta = (x) => R.scuro(x, (nome.y + 0.6) * 2) && R.scuro(x, (nome.y + nome.h - 0.6) * 2) && R.scuro(x, (nome.y + nome.h * 0.5) * 2) !== undefined
    const scoperte = []; for (let x = mario[0]; x <= rossi[1] - 4; x++) if (!coperta(x)) scoperte.push(x)
    assert.equal(scoperte.length, 0, `colonne del nome non coperte: ${scoperte.slice(0, 8).join(',')} (nome da ${mario[0]} a ${rossi[1]})`)
    // e il resto della riga resta leggibile: «Il» e «sottoscritto» non sono stati coperti
    assert.ok(parole[0][1] < mario[0] && !coperta(parole[0][0] + 1), 'testo prima del nome coperto per errore')
    if (process.env.TIO_PNG) fs.writeFileSync(process.env.TIO_PNG, R.c.toBuffer('image/png'))
    ok('i riquadri coprono ogni colonna del nome e lasciano leggibile il resto della riga')
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10 }) }
})().catch((e) => { console.error(e); process.exit(1) })
