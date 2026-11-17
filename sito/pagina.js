// TIO — pagina di download: i file giusti per il computer di chi visita, la demo, il confronto, chiaro e scuro, i passi d'installazione.
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
for (const nota of tutti('[data-nota-download]')) if (sistema.os === 'telefono') nota.textContent = 'TIO si installa sul computer: qui sotto puoi provarla, poi scarica il file dal tuo Mac o PC.'

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

/* ---------- per chi: libero professionista, ditta, studio legale ---------- */
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

/* ---------- prima e dopo: si trascina, si usano le frecce, e la prima volta che compare fa da solo un giro ---------- */
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

/* ---------- chiaro e scuro: due pulsanti scambiano la schermata e i colori della sezione ---------- */
;(() => {
  const scena = document.querySelector('.tramonto-fermo'); if (!scena) return
  const bottoni = tutti('[data-tema-scegli]')
  const metti = (tema) => { scena.dataset.tema = tema; for (const b of bottoni) b.setAttribute('aria-pressed', String(b.dataset.temaScegli === tema)) }
  bottoni.forEach((b) => b.addEventListener('click', () => metti(b.dataset.temaScegli)))
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) metti('scuro')
})()

/* ---------- demo: una TIO in miniatura. Dati inventati, tenuti in memoria: ricaricando la pagina si riparte ---------- */
;(() => {
  const radice = document.querySelector('[data-demo]'), vista = document.querySelector('[data-demo-vista]'); if (!radice || !vista) return
  const PRIORITA = [['bassa', '↓'], ['media', '–'], ['alta', '↑']]
  const stato = {
    vista: 'panoramica', aperta: null,
    pratiche: [
      { id: 1, numero: '2026/014', titolo: 'Rinaldi c. Edilnova', cliente: 'Giulia Rinaldi', stato: 'In corso', colore: '#c2410c', priorita: 2 },
      { id: 2, numero: '2026/011', titolo: 'Ristrutturazione uffici Aurora', cliente: 'Condominio Aurora', stato: 'In corso', colore: '#2563eb', priorita: 1 },
      { id: 3, numero: '2026/009', titolo: 'Successione Bianchi', cliente: 'Marta Bianchi', stato: 'In attesa', colore: '#0f766e', priorita: 0 },
    ],
    compiti: [
      { id: 1, pratica: 1, titolo: 'Depositare la memoria', quando: 'Oggi', fatto: false },
      { id: 2, pratica: 1, titolo: 'Chiamare il perito', quando: 'Domani', fatto: false },
      { id: 3, pratica: 2, titolo: 'Inviare il preventivo', quando: 'Oggi', fatto: true },
      { id: 4, pratica: 3, titolo: 'Richiedere i certificati', quando: 'Venerdì', fatto: false },
    ],
    impegni: [['09:30', 'Udienza di prima comparizione', 1], ['12:00', 'Sopralluogo in cantiere', 2], ['16:30', 'Appuntamento con Marta Bianchi', 3]],
  }
  let prossimo = 5
  const el = (tag, attr = {}, ...figli) => {
    const n = document.createElement(tag)
    for (const [k, v] of Object.entries(attr)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v) }
    for (const f of figli.flat()) if (f != null && f !== false) n.append(f)
    return n
  }
  const pratica = (id) => stato.pratiche.find((p) => p.id === id)
  const priorita = (p) => el('span', { class: 'demo-prio demo-prio-' + p.priorita, title: 'Priorità ' + PRIORITA[p.priorita][0], role: 'img', 'aria-label': 'Priorità ' + PRIORITA[p.priorita][0] }, PRIORITA[p.priorita][1])
  const rigaCompito = (c, conPratica = true) => el('label', { class: 'demo-compito' + (c.fatto ? ' fatto' : '') },
    el('input', { type: 'checkbox', checked: c.fatto, onchange: (e) => { c.fatto = e.target.checked; disegna() } }),
    el('span', { class: 'demo-compito-testo' }, el('b', {}, c.titolo), conPratica ? el('small', {}, pratica(c.pratica).titolo) : null),
    el('span', { class: 'demo-quando' }, c.quando))
  const aggiungi = (praticaId) => {
    const campo = el('input', { type: 'text', placeholder: 'Nuovo compito…', 'aria-label': 'Nuovo compito', maxlength: 60 })
    return el('form', { class: 'demo-nuovo', onsubmit: (e) => { e.preventDefault(); const t = campo.value.trim(); if (!t) return; stato.compiti.push({ id: prossimo++, pratica: praticaId, titolo: t, quando: 'Oggi', fatto: false }); disegna(); vista.querySelector('.demo-nuovo input')?.focus() } }, campo, el('button', { type: 'submit' }, 'Aggiungi'))
  }
  const scheda = (p) => el('button', { type: 'button', class: 'demo-pratica', style: `--pc:${p.colore}`, onclick: () => { stato.vista = 'pratiche'; stato.aperta = p.id; disegna() } },
    el('span', { class: 'demo-pratica-testa' }, priorita(p), el('small', {}, p.numero)), el('b', {}, p.titolo), el('small', {}, p.cliente), el('span', { class: 'demo-stato' }, p.stato))
  const viste = {
    panoramica: () => {
      const aperti = stato.compiti.filter((c) => !c.fatto)
      return [
        el('div', { class: 'demo-numeri' }, el('p', {}, el('b', {}, String(stato.impegni.length)), ' impegni oggi'), el('p', {}, el('b', {}, String(aperti.length)), aperti.length === 1 ? ' compito aperto' : ' compiti aperti'), el('p', {}, el('b', {}, '€ 3.660'), ' da incassare')),
        el('div', { class: 'demo-colonne' },
          el('section', {}, el('h3', {}, 'Oggi'), stato.impegni.map(([ora, titolo, id]) => el('p', { class: 'demo-impegno' }, el('time', {}, ora), el('span', {}, el('b', {}, titolo), el('small', {}, pratica(id).titolo))))),
          el('section', {}, el('h3', {}, 'Compiti'), stato.compiti.slice(0, 4).map((c) => rigaCompito(c)))),
      ]
    },
    pratiche: () => {
      const p = stato.aperta && pratica(stato.aperta)
      if (!p) return [el('h3', {}, 'Pratiche'), el('div', { class: 'demo-pratiche' }, [...stato.pratiche].sort((a, b) => b.priorita - a.priorita).map(scheda))]
      const suoi = stato.compiti.filter((c) => c.pratica === p.id)
      return [
        el('button', { type: 'button', class: 'demo-indietro', onclick: () => { stato.aperta = null; disegna() } }, '‹ Pratiche'),
        el('div', { class: 'demo-dettaglio', style: `--pc:${p.colore}` }, el('small', {}, `${p.numero} · ${p.stato}`), el('h3', {}, p.titolo), el('p', {}, 'Cliente: ', el('b', {}, p.cliente))),
        el('div', { class: 'demo-priorita', role: 'group', 'aria-label': 'Priorità' }, el('span', {}, 'Priorità'), PRIORITA.map(([nome, segno], i) => el('button', { type: 'button', 'aria-pressed': String(p.priorita === i), class: 'demo-prio-' + i, onclick: () => { p.priorita = i; disegna() } }, segno + ' ' + nome[0].toUpperCase() + nome.slice(1)))),
        el('h3', {}, 'Compiti'), suoi.map((c) => rigaCompito(c, false)), !suoi.length && el('p', { class: 'demo-vuoto' }, 'Nessun compito.'), aggiungi(p.id),
      ]
    },
    compiti: () => { const fatti = stato.compiti.filter((c) => c.fatto).length; return [el('h3', {}, `Compiti · ${fatti} di ${stato.compiti.length} fatti`), stato.compiti.map((c) => rigaCompito(c)), aggiungi(1)] },
  }
  const schede = tutti('[data-vista]', radice)
  function disegna() {
    for (const b of schede) b.setAttribute('aria-selected', String(b.dataset.vista === stato.vista))
    vista.replaceChildren(...viste[stato.vista]().flat().filter(Boolean))
  }
  schede.forEach((b) => b.addEventListener('click', () => { stato.vista = b.dataset.vista; stato.aperta = null; disegna() }))
  const tema = document.querySelector('[data-demo-tema]')
  tema?.addEventListener('click', () => { const scuro = radice.dataset.tema !== 'scuro'; radice.dataset.tema = scuro ? 'scuro' : 'chiaro'; tema.setAttribute('aria-pressed', String(scuro)); tema.textContent = scuro ? 'Tema chiaro' : 'Tema scuro' })
  disegna()
})()

/* ---------- la barra in alto diventa più trasparente quando qualcosa le scorre sotto ---------- */
;(() => {
  const barra = document.querySelector('[data-barra]'); if (!barra) return
  const segna = () => barra.classList.toggle('scorre', scrollY > 10)
  addEventListener('scroll', segna, { passive: true }); segna()
})()

window.TIO_PRONTO = true
