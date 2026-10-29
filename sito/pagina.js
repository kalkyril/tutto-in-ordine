// TIO — pagina di download: il pulsante giusto per il computer di chi visita, la barra PillNav, il confronto,
// giorno e sera, i passi d'installazione per sistema, piccoli movimenti.
// Nessun cookie e nessuna memoria: l'unica richiesta esterna è a GitHub, solo se config.js indica il progetto.

const progettoCandidato = String(window.TIO_PROGETTO || '').trim()
const progetto = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(progettoCandidato) ? progettoCandidato : ''
const tutti = (sel, dove = document) => [...dove.querySelectorAll(sel)]
const riduciMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---------- quale computer ---------- */
function rileva() {
  const ua = navigator.userAgent
  const piattaforma = navigator.userAgentData?.platform || navigator.platform || ''
  const tocco = navigator.maxTouchPoints > 1
  if (/Android|iPhone|iPod/i.test(ua) || (/iPad/.test(ua)) || (/Mac/.test(piattaforma) && tocco)) return { os: 'telefono' }
  if (/Win/i.test(piattaforma) || /Windows/.test(ua)) return { os: 'windows' }
  if (/Mac/i.test(piattaforma) || /Mac OS X/.test(ua)) return { os: 'mac' }
  return { os: 'altro' }
}
const sistema = rileva()
const FILE = {
  macArm: (n) => /arm64\.dmg$/i.test(n),
  macIntel: (n) => /\.dmg$/i.test(n) && !/arm64/i.test(n),
  windows: (n) => /\.exe$/i.test(n),
  codici: (n) => /SHA256SUMS\.txt$/i.test(n),
}

const VERSIONE = /^v?\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[0-9A-Za-z.-]{1,40})?$/
const paginaRelease = progetto ? `https://github.com/${progetto}/releases` : '#installare'
// I riferimenti al progetto sono utilizzabili anche prima che l'API risponda.
for (const a of tutti('[data-github]')) if (progetto) a.href = `https://github.com/${progetto}/${a.dataset.github}`.replace(/\/$/, '')
for (const a of tutti('[data-scarica-os], [data-scarica-file]')) a.href = paginaRelease
for (const nota of tutti('[data-nota-download]')) if (sistema.os === 'telefono') nota.textContent = 'TIO si installa sul computer: scegli il file dal tuo Mac o PC Windows.'

async function chiediRelease(url, signal) {
  const r = await fetch(url, { signal, headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (r.status === 404) return null
  if (!r.ok) throw new Error('Versioni non disponibili')
  const reader = r.body.getReader(), chunks = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Risposta troppo grande') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder().decode(bytes))
}

function releaseValida(dati) { return dati && !dati.draft && typeof dati.tag_name === 'string' && VERSIONE.test(dati.tag_name) }
function urlFile(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.hostname === 'github.com' && !u.username && !u.password && u.pathname.startsWith(`/${progetto}/releases/download/`) ? u.href : null
  } catch { return null }
}

async function ultimaVersione() {
  if (!progetto) return null
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const base = `https://api.github.com/repos/${progetto}/releases`
    let dati = await chiediRelease(`${base}/latest`, controller.signal)
    if (!dati) {
      const elenco = await chiediRelease(`${base}?per_page=30`, controller.signal)
      dati = Array.isArray(elenco) ? elenco.find(releaseValida) : null
    }
    if (!releaseValida(dati)) return null
    const assets = Array.isArray(dati.assets) ? dati.assets : []
    const file = Object.fromEntries(Object.entries(FILE).map(([k, prova]) => [k, assets.find((a) => typeof a.name === 'string' && prova(a.name) && urlFile(a.browser_download_url)) || null]))
    return { versione: dati.tag_name.replace(/^v/, ''), beta: !!dati.prerelease || dati.tag_name.includes('-'), pagina: `${paginaRelease}/tag/${encodeURIComponent(dati.tag_name)}`, file }
  } catch { return null } finally { clearTimeout(timeout) }
}

const mb = (byte) => `${Math.round(byte / 1048576)} MB`

async function preparaDownload() {
  const rel = await ultimaVersione()
  const pagina = rel?.pagina || paginaRelease
  for (const a of tutti('[data-scarica-file]')) a.href = rel?.file[a.dataset.scaricaFile]?.browser_download_url || pagina
  const elenco = document.querySelector('[data-elenco-file]')
  if (elenco && rel) {
    elenco.replaceChildren(document.createTextNode(`${rel.beta ? 'Versione di prova' : 'Versione'} ${rel.versione}: `))
    const link = (label, url) => { const a = document.createElement('a'); a.className = 'collegamento'; a.href = url; a.textContent = label; elenco.append(a) }
    let count = 0
    for (const [k, nome] of [['macArm', 'Mac Apple Silicon'], ['macIntel', 'Mac Intel'], ['windows', 'Windows 10 e 11']]) {
      const asset = rel.file[k]; if (!asset) continue
      if (count++) elenco.append(' · ')
      link(nome, asset.browser_download_url)
      if (Number.isFinite(asset.size) && asset.size > 0) elenco.append(` (${mb(asset.size)})`)
    }
    if (rel.file.codici) { elenco.append(' · '); link('codici SHA-256', rel.file.codici.browser_download_url) }
    elenco.append(' · '); link('tutte le versioni', paginaRelease)
  }
}
preparaDownload()

/* ---------- tutto incluso: il palco di chi visita (libero professionista, ditta, studio legale) ---------- */
;(() => {
  const bottoni = tutti('[data-pubblico] button'), schede = tutti('.profilo-voce[data-profilo]')
  bottoni.forEach((b) => b.addEventListener('click', () => {
    for (const x of bottoni) x.setAttribute('aria-pressed', String(x === b))
    for (const sc of schede) sc.hidden = sc.dataset.profilo !== b.dataset.profilo
  }))
})()

/* ---------- installare: i tre pulsanti sempre visibili; i passi sono quelli del sistema del visitatore e cambiano
   quando si indica (o si raggiunge da tastiera) il pulsante dell'altro sistema ---------- */
;(() => {
  const pulsanti = tutti('.installa-scarica [data-os]'), passi = tutti('.passo')
  const scegli = (os) => { for (const p of passi) p.hidden = p.dataset.os !== os }
  for (const b of pulsanti) for (const evento of ['pointerenter', 'focus']) b.addEventListener(evento, () => scegli(b.dataset.os))
  scegli(['mac', 'windows'].includes(sistema.os) ? sistema.os : 'mac')
})()

/* ---------- comparse una volta sola, mai contenuto nascosto se lo script non parte ---------- */
;(() => {
  const voci = tutti('[data-reveal]')
  // fratelli che compaiono insieme: uno dopo l'altro, al massimo sei passi da 80 ms (come Free My TV)
  for (const el of voci) {
    const fratelli = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal') && !c.hidden)
    const i = fratelli.indexOf(el)
    if (i > 0) el.style.setProperty('--d', Math.min(i, 6) * 0.08 + 's')
  }
  if (!('IntersectionObserver' in window)) { voci.forEach((el) => el.classList.add('is-in')); return }
  const io = new IntersectionObserver((e) => { for (const v of e) if (v.isIntersecting) { v.target.classList.add('is-in'); io.unobserve(v.target) } }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 })
  voci.forEach((el) => io.observe(el))
  addEventListener('load', () => setTimeout(() => voci.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in') }), 2500))
})()

/* ---------- giorno e sera: scorrendo la sezione, il fondo va dal rosa carta al bordeaux notte ---------- */
;(() => {
  const sezione = document.querySelector('[data-tramonto]')
  if (!sezione) return
  const fermo = sezione.querySelector('.tramonto-fermo')
  const cielo = sezione.querySelector('.cielo'), sole = sezione.querySelector('.sole'), luna = sezione.querySelector('.luna')
  const finestra = sezione.querySelector('.tramonto-finestra .finestra-app')
  cielo?.classList.add('in-orbita')
  // la ruota: un cerchio con il centro sopra la finestra, che passa per il punto di partenza del sole (in alto a sinistra,
  // fuori dalla finestra) e per il centro della finestra (il punto più basso, dove sole e luna si danno il cambio, nascosti)
  const orbita = (e) => {
    if (!cielo || !finestra) return
    const f = fermo.getBoundingClientRect(), w = finestra.getBoundingClientRect()
    const bx = w.left + w.width / 2 - f.left, by = w.top + w.height * 0.55 - f.top
    // sul telefono non c'è spazio ai lati: il sole parte già basso, appoggiato sul bordo della finestra, lontano dal testo
    const stretto = f.width < 768
    const sx = stretto ? f.width * 0.14 : Math.max(f.width * 0.08, w.left - f.left - f.width * 0.08)
    const sy = stretto ? w.top - f.top - sole.offsetWidth * 0.15 : Math.max(f.height * 0.1, w.top - f.top - w.height * 0.2)
    const dx = bx - sx, cy = (by * by - sy * sy - dx * dx) / (2 * (by - sy)), r = by - cy
    const a0 = Math.atan2(sx - bx, sy - cy), a = a0 * (1 - 2 * e) // da sinistra (a0 < 0) a destra, passando per il basso
    const x = bx + r * Math.sin(a), y = cy + r * Math.cos(a)
    for (const [astro, visibile] of [[sole, a < 0], [luna, a >= 0]]) {
      const d = astro.offsetWidth / 2
      astro.style.transform = `translate(${(x - d).toFixed(1)}px, ${(y - d).toFixed(1)}px)${astro === luna ? ' rotate(-18deg)' : ''}`
      astro.style.opacity = visibile ? '1' : '0'
    }
  }
  // gli stessi colori della pagina: carta e inchiostro di giorno, bordeaux profondo e carta di sera
  const GIORNO = { fondo: [251, 233, 240], testo: [61, 0, 18], piano: [122, 53, 80] }, SERA = { fondo: [26, 0, 9], testo: [253, 232, 240], piano: [211, 154, 182] }
  let ultimo = -1
  const aggiorna = () => {
    const r = sezione.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - innerHeight)))
    const e = riduciMovimento ? (p < 0.5 ? 0 : 1) : p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
    if (Math.abs(e - ultimo) < 0.002) return
    ultimo = e
    sezione.style.setProperty('--p', e.toFixed(3))
    orbita(e)
    // Le coppie complete cambiano insieme: nessuno stato intermedio perde contrasto.
    const notte = e >= 0.5, palette = notte ? SERA : GIORNO
    sezione.style.setProperty('--notte', notte ? '1' : '0')
    for (const [variabile, colore] of [['fondo', palette.fondo], ['testo', palette.testo], ['piano', palette.piano]]) fermo.style.setProperty(`--cielo-${variabile}`, `rgb(${colore.join(',')})`)
  }
  // aggiornato subito a ogni scorrimento: il calcolo è leggero e così non dipende dal fotogramma successivo
  addEventListener('scroll', aggiorna, { passive: true })
  addEventListener('resize', () => { ultimo = -1; aggiorna() })
  // la finestra prende la sua altezza quando arriva l'immagine: la ruota si ricalcola
  finestra?.querySelector('img')?.addEventListener('load', () => { ultimo = -1; aggiorna() })
  aggiorna()
})()

/* ---------- prima e dopo: si trascina, si usano le frecce, e la prima volta che compare fa da solo un giro (come Free My TV) ---------- */
;(() => {
  const c = document.querySelector('[data-confronto]')
  if (!c) return
  let x = 50, trascina = false, toccato = false
  const imposta = (v) => { x = Math.max(0, Math.min(100, v)); c.style.setProperty('--x', x + '%'); c.setAttribute('aria-valuenow', String(Math.round(x))) }
  const daEvento = (ev) => { const r = c.getBoundingClientRect(); imposta(((ev.clientX - r.left) / r.width) * 100) }
  // preventDefault: niente trascinamento nativo delle immagini né selezione del testo mentre si sposta il cursore
  c.addEventListener('pointerdown', (ev) => { if (ev.button > 0) return; ev.preventDefault(); trascina = true; toccato = true; c.setPointerCapture(ev.pointerId); daEvento(ev) })
  c.addEventListener('dragstart', (ev) => ev.preventDefault())
  c.addEventListener('pointermove', (ev) => { if (trascina) daEvento(ev) })
  const ferma = () => { trascina = false }
  c.addEventListener('pointerup', ferma); c.addEventListener('pointercancel', ferma)
  c.addEventListener('keydown', (ev) => {
    const passi = { ArrowLeft: -5, ArrowRight: 5, Home: -100, End: 100 }
    if (!(ev.key in passi)) return
    toccato = true; imposta(x + passi[ev.key]); ev.preventDefault()
  })
  imposta(50)
  if (riduciMovimento || !('IntersectionObserver' in window)) return
  const morbido = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const giro = () => {
    const tappe = [[0, 50], [1000, 86], [2300, 14], [3400, 50]], t0 = performance.now()
    const passo = (ora) => {
      if (toccato) return
      const t = ora - t0
      let i = 0
      while (i < tappe.length - 2 && t > tappe[i + 1][0]) i++
      const [a, va] = tappe[i], [b, vb] = tappe[i + 1]
      imposta(va + (vb - va) * morbido(Math.min(1, Math.max(0, (t - a) / (b - a)))))
      if (t < tappe[tappe.length - 1][0]) requestAnimationFrame(passo)
    }
    requestAnimationFrame(passo)
  }
  const una = new IntersectionObserver(([v]) => { if (!v.isIntersecting) return; una.disconnect(); setTimeout(giro, 500) }, { threshold: 0.6 })
  una.observe(c)
})()

/* ---------- collegamenti interni: il titolo della sezione arriva subito sotto la barra, a qualunque altezza sia la barra.
   La posizione si misura sulla disposizione (offsetTop), non sul disegno: le comparse spostano i titoli di qualche pixel.
   Ogni voce del menu porta all'inizio della sua sezione, come Strumenti. ---------- */
;(() => {
  const pillola = document.querySelector('.barra-pillola')
  const alto = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y }
  const vai = (hash) => {
    let meta = null
    try { meta = document.querySelector(hash) } catch { return false }
    if (!meta) return false
    const sotto = (pillola ? pillola.getBoundingClientRect().bottom : 0) + 24
    const sezione = meta.closest('section') || meta
    const bersaglio = sezione.querySelector('h2') || sezione
    // Funzioni e Strumenti (palco fermo) e le sezioni impaginate allo stesso modo (.palco) mettono già il titolo sotto la
    // barra: si va all'inizio della sezione, così ognuna arriva nello stesso punto
    const y = sezione.matches('.palco, .funz') ? alto(sezione) : alto(bersaglio) - sotto
    scrollTo({ top: Math.max(0, y), behavior: riduciMovimento ? 'auto' : 'smooth' })
    if (meta !== sezione) { meta.classList.remove('evidenzia'); void meta.offsetWidth; meta.classList.add('evidenzia') }
    return true
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]')
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const hash = a.getAttribute('href')
    if (hash.length < 2 || hash === '#contenuto') return
    if (vai(hash)) { e.preventDefault(); if (location.hash !== hash) history.pushState(null, '', hash) }
  })
  // avanti e indietro nel browser riportano alla sezione giusta
  addEventListener('popstate', () => { if (location.hash) vai(location.hash); else scrollTo({ top: 0, behavior: riduciMovimento ? 'auto' : 'smooth' }) })
})()

/* ---------- la barra prende l'ombra solo quando qualcosa le scorre sotto ---------- */
;(() => {
  const barra = document.querySelector('[data-barra]')
  if (!barra) return
  const segna = () => barra.classList.toggle('scorre', scrollY > 10)
  addEventListener('scroll', segna, { passive: true })
  segna()
})()

/* ---------- Funzioni e Strumenti: il palco resta fermo; quanto si è scorso nella sezione decide immagine e testo ---------- */
for (const box of document.querySelectorAll('[data-funz-scorri]')) (() => {
  const sezione = box.closest('section')
  const voci = tutti('.funz-voce', box), punti = tutti('.funz-punti i', box)
  const titolo = box.querySelector('[data-funz-titolo]'), testo = box.querySelector('[data-funz-testo]')
  const tag = box.querySelector('[data-funz-tag]'), elenco = box.querySelector('[data-funz-elenco]') // solo negli Strumenti
  const grazie = box.querySelector('[data-funz-grazie]') // il ringraziamento a Simone Rizzo, solo sull'ultima slide
  const palco = matchMedia('(min-width: 64.01em) and (min-height: 37.5em)') // come in stile.css
  const pillola = document.querySelector('.barra-pillola')
  let attiva = -1, inAttesa = false
  const mostra = (k) => {
    if (k === attiva) return
    const primaVolta = attiva < 0
    attiva = k
    voci.forEach((v, i) => { v.classList.toggle('attiva', i === k); v.classList.toggle('passata', i < k) })
    punti.forEach((p, i) => p.classList.toggle('on', i === k))
    titolo.textContent = voci[k].querySelector('.funz-testo h3').textContent
    testo.textContent = voci[k].querySelector('.funz-testo p').textContent
    if (tag) tag.textContent = voci[k].querySelector('.funz-tag').textContent
    if (elenco) elenco.replaceChildren(...[...voci[k].querySelectorAll('.funz-elenco li')].map((li) => li.cloneNode(true)))
    if (grazie) grazie.hidden = !voci[k].querySelector('.funz-grazie')
    if (primaVolta) return
    for (const el of [tag, titolo, testo, elenco]) if (el) { el.classList.remove('cambia'); void el.offsetWidth; el.classList.add('cambia') }
  }
  // il titolo sul palco sta dove lo porta il menu: 24 px sotto la barra
  const misuraBarra = () => { if (pillola) document.documentElement.style.setProperty('--barra-sotto', `${pillola.getBoundingClientRect().bottom}px`) }
  const fisso = box.querySelector('.funz-fisso')
  const allinea = () => {
    const finestra = voci[0].querySelector('.finestra-app')
    fisso.style.marginTop = palco.matches ? `${Math.max(0, (finestra.offsetHeight - fisso.offsetHeight) / 2)}px` : ''
  }
  const aggiorna = () => {
    inAttesa = false
    if (!palco.matches) return
    const r = sezione.getBoundingClientRect()
    const corsa = Math.max(1, r.height - innerHeight)
    const avanzamento = Math.min(1, Math.max(0, -r.top / corsa))
    mostra(Math.min(voci.length - 1, Math.floor(avanzamento * voci.length)))
  }
  addEventListener('scroll', () => { if (!inAttesa) { inAttesa = true; requestAnimationFrame(aggiorna) } }, { passive: true })
  addEventListener('resize', () => { misuraBarra(); allinea(); aggiorna() })
  palco.addEventListener('change', () => { allinea(); aggiorna() })
  addEventListener('load', allinea)
  misuraBarra(); mostra(0); allinea(); aggiorna()
})()

/* ---------- «Tutto In Ordine» scritto lettera per lettera, una ogni 50 ms: ogni lettera tiene il suo posto, il cursore avanza ---------- */
;(() => {
  const nome = document.querySelector('[data-scrivi]')
  if (!nome || !document.documentElement.classList.contains('scrive')) return
  const lettere = []
  const avvolgi = (nodo) => {
    for (const figlio of [...nodo.childNodes]) {
      if (figlio.nodeType === 1) { avvolgi(figlio); continue }
      const frammento = document.createDocumentFragment()
      for (const ch of figlio.textContent) {
        const l = document.createElement('span'); l.className = 'lettera'; l.textContent = ch
        l.setAttribute('aria-hidden', 'true'); frammento.appendChild(l); lettere.push(l)
      }
      figlio.replaceWith(frammento)
    }
  }
  avvolgi(nome)
  const cursore = document.createElement('span'); cursore.className = 'cursore'; cursore.setAttribute('aria-hidden', 'true')
  nome.prepend(cursore)
  nome.classList.add('pronta')
  let i = 0
  const batti = () => {
    const l = lettere[i++]
    l.classList.add('vista'); l.after(cursore)
    if (i < lettere.length) setTimeout(batti, 50)
    else setTimeout(() => cursore.classList.add('via'), 1600)
  }
  setTimeout(batti, 250)
})()

/* ---------- primo schermo: i pezzi dell'app scorrono a profondità diverse e seguono di poco il puntatore.
   Una sola molla in requestAnimationFrame, ferma quando arriva. ---------- */
;(() => {
  const eroe = document.querySelector('[data-eroe]')
  const frammenti = tutti('.frammento').map((f) => ({ el: f, z: Number(f.style.getPropertyValue('--z')) || 0.5 }))
  if (!eroe || !frammenti.length || riduciMovimento) return
  const puntatore = matchMedia('(hover: hover) and (pointer: fine)')
  let mx = 0, my = 0, visibile = true, giro = 0
  const ora = { mx: 0, my: 0, y: scrollY }
  const passo = () => {
    giro = 0
    const meta = { mx, my, y: scrollY }
    let ancora = false
    for (const k in ora) { const d = meta[k] - ora[k]; ora[k] += k === 'y' ? d * 0.18 : d * 0.09; if (Math.abs(d) > (k === 'y' ? 0.3 : 0.004)) ancora = true }
    for (const f of frammenti) f.el.style.translate = `${(-ora.mx * 46 * f.z).toFixed(1)}px ${(-ora.my * 34 * f.z - ora.y * 0.22 * f.z).toFixed(1)}px`
    if (ancora && visibile) giro = requestAnimationFrame(passo)
  }
  const avvia = () => { if (!giro && visibile) giro = requestAnimationFrame(passo) }
  addEventListener('pointermove', (e) => { if (!puntatore.matches) return; mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; avvia() }, { passive: true })
  addEventListener('scroll', avvia, { passive: true })
  if ('IntersectionObserver' in window) new IntersectionObserver(([v]) => { visibile = v.isIntersecting; avvia() }).observe(eroe)
  avvia()
})()

window.TIO_PRONTO = true
