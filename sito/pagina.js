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

/* ---------- demo: una TIO in miniatura. Dati inventati, tenuti solo in memoria (niente cookie né archiviazione del
   browser): ricaricando o chiudendo la pagina, oppure con «Ricomincia», si riparte da zero ---------- */
;(() => {
  const radice = document.querySelector('[data-demo]'), vista = document.querySelector('[data-demo-vista]'); if (!radice || !vista) return
  const elencoPassi = document.querySelector('[data-demo-passi]')
  const PRIORITA = [['bassa', '↓'], ['media', '–'], ['alta', '↑']]
  const COLORI = ['#7c3aed', '#c2410c', '#0f766e', '#2563eb', '#be185d']
  const ALIQUOTE = { sg: 15, cpa: 4, iva: 22 }
  // il percorso guidato: ogni passo si spunta da solo quando lo fai
  const PASSI = [
    ['contatto', 'Aggiungi un cliente in Anagrafica'],
    ['pratica', 'Apri una nuova pratica per quel cliente'],
    ['attivita', 'Registra un’attività: tempo e tariffa oraria, oppure una tariffa totale'],
    ['spesa', 'Aggiungi una spesa anticipata'],
    ['parcella', 'Crea la parcella dalle voci'],
    ['compito', 'Spunta un compito'],
  ]
  const iniziale = () => ({
    vista: 'panoramica', aperta: null, scheda: 'compiti', modulo: null, fatti: new Set(), prossimo: 100,
    contatti: [
      { id: 1, nome: 'Giulia Rinaldi', ruolo: 'Cliente', citta: 'Modena', email: 'giulia.rinaldi@esempio.it' },
      { id: 2, nome: 'Condominio Aurora', ruolo: 'Cliente', citta: 'Carpi', email: 'amministrazione@esempio.it' },
      { id: 3, nome: 'Marta Bianchi', ruolo: 'Cliente', citta: 'Sassuolo', email: '' },
      { id: 4, nome: 'Edilnova S.r.l.', ruolo: 'Controparte', citta: 'Reggio Emilia', email: '' },
    ],
    pratiche: [
      { id: 1, numero: '2026/014', titolo: 'Rinaldi c. Edilnova', cliente: 1, stato: 'In corso', colore: '#c2410c', priorita: 2 },
      { id: 2, numero: '2026/011', titolo: 'Ristrutturazione uffici Aurora', cliente: 2, stato: 'In corso', colore: '#2563eb', priorita: 1 },
      { id: 3, numero: '2026/009', titolo: 'Successione Bianchi', cliente: 3, stato: 'In attesa', colore: '#0f766e', priorita: 0 },
    ],
    compiti: [
      { id: 1, pratica: 1, titolo: 'Depositare la memoria', quando: 'Oggi', fatto: false },
      { id: 2, pratica: 1, titolo: 'Chiamare il perito', quando: 'Domani', fatto: false },
      { id: 3, pratica: 2, titolo: 'Inviare il preventivo', quando: 'Oggi', fatto: true },
      { id: 4, pratica: 3, titolo: 'Richiedere i certificati', quando: 'Venerdì', fatto: false },
    ],
    attivita: [
      { id: 1, pratica: 1, descrizione: 'Studio del fascicolo', minuti: 120, tariffa: 150, totale: null, fatturata: false },
      { id: 2, pratica: 1, descrizione: 'Invio PEC alla controparte', minuti: 20, tariffa: 150, totale: null, fatturata: false },
    ],
    spese: [{ id: 1, pratica: 1, descrizione: 'Contributo unificato', importo: 98, esente: true, fatturata: false }],
    parcelle: [],
    impegni: [['09:30', 'Udienza di prima comparizione', 1], ['12:00', 'Sopralluogo in cantiere', 2], ['16:30', 'Appuntamento con Marta Bianchi', 3]],
    // budget: saldo dei conti oggi, entrate e uscite attese nei prossimi sei mesi (a febbraio le imposte), tasse da mettere da parte
    budget: { saldo: 5800, tasse: 1200, entrate: [3660, 2400, 5200, 1800, 4100, 3000], uscite: [2950, 3100, 6400, 2900, 3050, 2900], tardano: false },
  })
  let stato = iniziale()
  const el = (tag, attr = {}, ...figli) => {
    const n = document.createElement(tag)
    for (const [k, v] of Object.entries(attr)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v) }
    for (const f of figli.flat()) if (f != null && f !== false) n.append(f)
    return n
  }
  const fatto = (passo) => { stato.fatti.add(passo) }
  const pratica = (id) => stato.pratiche.find((p) => p.id === id)
  const contatto = (id) => stato.contatti.find((c) => c.id === id)
  const euro = (n, dec = false) => (n < 0 ? '−' : '') + '€ ' + Math.abs(n).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 })
  const tempo = (m) => { const h = Math.floor(m / 60), r = m % 60; return m ? (h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`) : '—' }
  const valore = (a) => (a.totale != null ? a.totale : (a.minuti / 60) * a.tariffa)
  const numero = (v) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : NaN }
  const daIncassare = () => 3660 + stato.parcelle.reduce((s, p) => s + p.totale, 0)
  /** Un campo con l'etichetta sopra: input, select o gruppo di scelte. */
  const campo = (etichetta, controllo, nota) => el('label', { class: 'demo-campo' }, el('span', {}, etichetta), controllo, nota ? el('small', {}, nota) : null)
  const input = (nome, attr = {}) => el('input', { name: nome, autocomplete: 'off', ...attr })
  const tastoPrimario = (testo) => el('button', { type: 'submit', class: 'demo-primario' }, testo)
  const annulla = () => el('button', { type: 'button', class: 'demo-secondario', onclick: () => { stato.modulo = null; disegna() } }, 'Annulla')
  const priorita = (p) => el('span', { class: 'demo-prio demo-prio-' + p.priorita, title: 'Priorità ' + PRIORITA[p.priorita][0], role: 'img', 'aria-label': 'Priorità ' + PRIORITA[p.priorita][0] }, PRIORITA[p.priorita][1])
  const rigaCompito = (c, conPratica = true) => el('label', { class: 'demo-compito' + (c.fatto ? ' fatto' : '') },
    el('input', { type: 'checkbox', checked: c.fatto, onchange: (e) => { c.fatto = e.target.checked; if (c.fatto) fatto('compito'); disegna() } }),
    el('span', { class: 'demo-compito-testo' }, el('b', {}, c.titolo), conPratica ? el('small', {}, pratica(c.pratica).titolo) : null),
    el('span', { class: 'demo-quando' }, c.quando))
  const aggiungiCompito = (praticaId) => {
    const t = input('compito', { type: 'text', placeholder: 'Nuovo compito…', 'aria-label': 'Nuovo compito', maxlength: 60 })
    return el('form', { class: 'demo-nuovo', onsubmit: (e) => { e.preventDefault(); const v = t.value.trim(); if (!v) return; stato.compiti.push({ id: stato.prossimo++, pratica: praticaId, titolo: v, quando: 'Oggi', fatto: false }); disegna(); vista.querySelector('.demo-nuovo input')?.focus() } }, t, el('button', { type: 'submit' }, 'Aggiungi'))
  }
  const scheda = (p) => el('button', { type: 'button', class: 'demo-pratica', style: `--pc:${p.colore}`, onclick: () => { stato.vista = 'pratiche'; stato.aperta = p.id; stato.scheda = 'compiti'; stato.modulo = null; disegna() } },
    el('span', { class: 'demo-pratica-testa' }, priorita(p), el('small', {}, p.numero)), el('b', {}, p.titolo), el('small', {}, contatto(p.cliente)?.nome || ''), el('span', { class: 'demo-stato' }, p.stato))
  const mese = (i, lungo) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i); return d.toLocaleDateString('it-IT', { month: lungo ? 'long' : 'short' }) }
  /** Saldo a fine mese: con «se gli incassi tardano» ogni incasso arriva un mese dopo; le parcelle create si incassano il mese prossimo. */
  const previsione = () => {
    const b = stato.budget, entrate = b.entrate.map((x, i) => x + (i === 1 ? stato.parcelle.reduce((s, p) => s + p.totale, 0) : 0)); let saldo = b.saldo
    return b.uscite.map((u, i) => { saldo += (b.tardano ? (i ? entrate[i - 1] : 0) : entrate[i]) - u; return { mese: mese(i), lungo: mese(i, true), saldo: Math.round(saldo) } })
  }
  /** Parcella dalle voci non ancora fatturate: compensi, spese generali, CPA, IVA e spese esenti. */
  const calcolaParcella = (pid) => {
    const att = stato.attivita.filter((a) => a.pratica === pid && !a.fatturata), sp = stato.spese.filter((s) => s.pratica === pid && !s.fatturata)
    const compensi = att.reduce((s, a) => s + valore(a), 0), sg = compensi * ALIQUOTE.sg / 100, cpa = (compensi + sg) * ALIQUOTE.cpa / 100
    const imponibiliSpese = sp.filter((s) => !s.esente).reduce((s, x) => s + x.importo, 0), esenti = sp.filter((s) => s.esente).reduce((s, x) => s + x.importo, 0)
    const imponibile = compensi + sg + cpa + imponibiliSpese, iva = imponibile * ALIQUOTE.iva / 100
    const t = (n) => Math.round(n * 100) / 100
    return { att, sp, compensi: t(compensi), sg: t(sg), cpa: t(cpa), imponibile: t(imponibile), iva: t(iva), esenti: t(esenti), totale: t(imponibile + iva + esenti) }
  }

  // ---------- moduli
  const moduloContatto = () => {
    const nome = input('nome', { required: true, maxlength: 60, placeholder: 'Es. Paolo Neri' })
    const ruolo = el('select', { name: 'ruolo' }, ['Cliente', 'Controparte', 'Fornitore', 'Collaboratore'].map((r) => el('option', {}, r)))
    const citta = input('citta', { maxlength: 40, placeholder: 'Es. Modena' }), email = input('email', { type: 'email', maxlength: 60, placeholder: 'nome@esempio.it' })
    return el('form', { class: 'demo-modulo', 'aria-label': 'Nuovo contatto', onsubmit: (e) => {
      e.preventDefault(); const n = nome.value.trim(); if (!n) { nome.focus(); return }
      stato.contatti.unshift({ id: stato.prossimo++, nome: n, ruolo: ruolo.value, citta: citta.value.trim(), email: email.value.trim() })
      if (ruolo.value === 'Cliente') fatto('contatto')
      stato.modulo = null; disegna()
    } }, el('h3', {}, 'Nuovo contatto'), el('div', { class: 'demo-griglia' }, campo('Nome o ragione sociale', nome), campo('Ruolo', ruolo), campo('Città', citta), campo('Email', email)), el('div', { class: 'demo-azioni' }, annulla(), tastoPrimario('Salva il contatto')))
  }
  const moduloPratica = () => {
    const clienti = stato.contatti.filter((c) => c.ruolo === 'Cliente')
    const titolo = input('titolo', { required: true, maxlength: 60, placeholder: 'Es. Recupero crediti Omega' })
    const cliente = el('select', { name: 'cliente' }, clienti.map((c) => el('option', { value: c.id }, c.nome)))
    const prio = el('select', { name: 'priorita' }, PRIORITA.map(([n, s], i) => el('option', { value: i, selected: i === 1 }, `${s} ${n[0].toUpperCase()}${n.slice(1)}`)))
    return el('form', { class: 'demo-modulo', 'aria-label': 'Nuova pratica', onsubmit: (e) => {
      e.preventDefault(); const t = titolo.value.trim(); if (!t) { titolo.focus(); return }
      const id = stato.prossimo++, n = stato.pratiche.length + 12
      stato.pratiche.push({ id, numero: `2026/0${n}`, titolo: t, cliente: Number(cliente.value), stato: 'In corso', colore: COLORI[n % COLORI.length], priorita: Number(prio.value) })
      fatto('pratica')
      stato.modulo = null; stato.aperta = id; stato.scheda = 'lavoro'; disegna()
    } }, el('h3', {}, 'Nuova pratica'), el('div', { class: 'demo-griglia' }, campo('Titolo', titolo), campo('Cliente', cliente, 'I clienti dell’Anagrafica, anche quelli appena aggiunti'), campo('Priorità', prio)), el('div', { class: 'demo-azioni' }, annulla(), tastoPrimario('Apri la pratica')))
  }
  const moduloAttivita = (pid) => {
    const desc = input('descrizione', { required: true, maxlength: 60, placeholder: 'Es. Redazione del ricorso' })
    let minuti = 60
    const tempi = el('div', { class: 'demo-chips', role: 'group', 'aria-label': 'Tempo dedicato' }, [['30 min', 30], ['1 h', 60], ['2 h', 120], ['4 h', 240]].map(([t, m]) => el('button', { type: 'button', 'aria-pressed': String(m === minuti), onclick: (e) => { minuti = m; for (const b of tempi.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); anteprima() } }, t)))
    const modo = el('select', { name: 'modo', onchange: () => { importo.placeholder = modo.value === 'totale' ? '€ totali' : '€ / ora'; importo.value = modo.value === 'totale' ? '' : '150'; etichetta.textContent = modo.value === 'totale' ? 'Tariffa totale (€)' : 'Tariffa oraria (€)'; anteprima() } }, el('option', { value: 'oraria' }, 'Tariffa oraria'), el('option', { value: 'totale' }, 'Tariffa totale'))
    const importo = input('importo', { inputmode: 'decimal', value: '150', placeholder: '€ / ora', oninput: () => anteprima() })
    const etichetta = el('span', {}, 'Tariffa oraria (€)')
    const val = el('output', { class: 'demo-valore', 'aria-live': 'polite' })
    const anteprima = () => { const n = numero(importo.value); val.textContent = Number.isFinite(n) ? `Valore: ${euro(modo.value === 'totale' ? n : (minuti / 60) * n, true)}` : 'Scrivi un importo' }
    anteprima()
    return el('form', { class: 'demo-modulo', 'aria-label': 'Nuova attività', onsubmit: (e) => {
      e.preventDefault(); const d = desc.value.trim(), n = numero(importo.value); if (!d) { desc.focus(); return } if (!Number.isFinite(n) || !n) { importo.focus(); return }
      stato.attivita.push({ id: stato.prossimo++, pratica: pid, descrizione: d, minuti, tariffa: modo.value === 'totale' ? 0 : n, totale: modo.value === 'totale' ? n : null, fatturata: false })
      fatto('attivita'); stato.modulo = null; disegna()
    } }, el('h3', {}, 'Nuova attività'), el('div', { class: 'demo-griglia' }, campo('Attività', desc), el('div', { class: 'demo-campo' }, el('span', {}, 'Tempo dedicato'), tempi), campo('Compenso', modo), el('label', { class: 'demo-campo' }, etichetta, importo)), val, el('div', { class: 'demo-azioni' }, annulla(), tastoPrimario('Registra')))
  }
  const moduloSpesa = (pid) => {
    const desc = input('descrizione', { required: true, maxlength: 60, placeholder: 'Es. Marca da bollo' }), importo = input('importo', { inputmode: 'decimal', placeholder: '0,00' })
    const esente = el('input', { type: 'checkbox', name: 'esente', checked: true })
    return el('form', { class: 'demo-modulo', 'aria-label': 'Nuova spesa', onsubmit: (e) => {
      e.preventDefault(); const d = desc.value.trim(), n = numero(importo.value); if (!d) { desc.focus(); return } if (!Number.isFinite(n) || !n) { importo.focus(); return }
      stato.spese.push({ id: stato.prossimo++, pratica: pid, descrizione: d, importo: n, esente: esente.checked, fatturata: false })
      fatto('spesa'); stato.modulo = null; disegna()
    } }, el('h3', {}, 'Spesa anticipata'), el('div', { class: 'demo-griglia' }, campo('Descrizione', desc), campo('Importo (€)', importo)), el('label', { class: 'demo-spunta' }, esente, ' Anticipazione esente IVA'), el('div', { class: 'demo-azioni' }, annulla(), tastoPrimario('Aggiungi la spesa')))
  }

  // ---------- viste
  const dettaglioPratica = (p) => {
    const suoi = stato.compiti.filter((c) => c.pratica === p.id)
    const att = stato.attivita.filter((a) => a.pratica === p.id), sp = stato.spese.filter((s) => s.pratica === p.id), parc = stato.parcelle.filter((x) => x.pratica === p.id)
    const schede = [['compiti', 'Compiti'], ['lavoro', 'Attività e spese'], ['parcelle', `Parcelle${parc.length ? ` (${parc.length})` : ''}`]]
    const corpo = {
      compiti: () => [suoi.map((c) => rigaCompito(c, false)), !suoi.length && el('p', { class: 'demo-vuoto' }, 'Nessun compito.'), aggiungiCompito(p.id)],
      lavoro: () => {
        if (stato.modulo === 'attivita') return moduloAttivita(p.id)
        if (stato.modulo === 'spesa') return moduloSpesa(p.id)
        const daFatturare = calcolaParcella(p.id)
        return [
          el('div', { class: 'demo-barra-azioni' }, el('button', { type: 'button', class: 'demo-secondario', onclick: () => { stato.modulo = 'attivita'; disegna(); vista.querySelector('.demo-modulo input')?.focus() } }, '+ Attività'), el('button', { type: 'button', class: 'demo-secondario', onclick: () => { stato.modulo = 'spesa'; disegna(); vista.querySelector('.demo-modulo input')?.focus() } }, '+ Spesa'),
            el('button', { type: 'button', class: 'demo-primario', disabled: !(daFatturare.att.length + daFatturare.sp.length), onclick: () => {
              const c = calcolaParcella(p.id); if (!c.att.length && !c.sp.length) return
              c.att.forEach((a) => { a.fatturata = true }); c.sp.forEach((s) => { s.fatturata = true })
              stato.parcelle.push({ id: stato.prossimo++, numero: `${stato.parcelle.length + 1}/2026`, pratica: p.id, ...c }); fatto('parcella'); stato.scheda = 'parcelle'; disegna()
            } }, 'Crea la parcella')),
          att.length ? el('ul', { class: 'demo-voci', 'aria-label': 'Attività' }, att.map((a) => el('li', { class: a.fatturata ? 'fatturata' : '' }, el('span', {}, el('b', {}, a.descrizione), el('small', {}, `${tempo(a.minuti)} · ${a.totale != null ? 'tariffa totale' : `${euro(a.tariffa)}/ora`}${a.fatturata ? ' · fatturata' : ''}`)), el('b', { class: 'demo-importo' }, euro(valore(a), true))))) : el('p', { class: 'demo-vuoto' }, 'Nessuna attività.'),
          el('h3', {}, 'Spese anticipate'),
          sp.length ? el('ul', { class: 'demo-voci', 'aria-label': 'Spese' }, sp.map((s) => el('li', { class: s.fatturata ? 'fatturata' : '' }, el('span', {}, el('b', {}, s.descrizione), el('small', {}, `${s.esente ? 'esente IVA' : 'imponibile'}${s.fatturata ? ' · fatturata' : ''}`)), el('b', { class: 'demo-importo' }, euro(s.importo, true))))) : el('p', { class: 'demo-vuoto' }, 'Nessuna spesa.'),
          el('p', { class: 'demo-totale' }, 'Da fatturare: ', el('b', {}, euro(daFatturare.compensi + daFatturare.sp.reduce((s, x) => s + x.importo, 0), true))),
        ]
      },
      parcelle: () => parc.length ? parc.map((x) => el('article', { class: 'demo-parcella', 'aria-label': `Parcella ${x.numero}` },
        el('header', {}, el('b', {}, `Parcella ${x.numero}`), el('small', {}, contatto(p.cliente)?.nome || '')),
        el('table', {}, el('tbody', {}, [['Compensi', x.compensi], [`Spese generali ${ALIQUOTE.sg}%`, x.sg], [`CPA ${ALIQUOTE.cpa}%`, x.cpa], ['Imponibile', x.imponibile], [`IVA ${ALIQUOTE.iva}%`, x.iva], ['Spese esenti', x.esenti]].filter(([, v], i) => v || i < 5).map(([l, v]) => el('tr', {}, el('td', {}, l), el('td', {}, euro(v, true)))),
          el('tr', { class: 'demo-parcella-totale' }, el('td', {}, 'Totale documento'), el('td', {}, euro(x.totale, true))))),
        el('p', { class: 'demo-vuoto' }, 'Nell’app vera: PDF, Word, fattura elettronica e incasso.')))
        : el('p', { class: 'demo-vuoto' }, 'Nessuna parcella. Registra attività e spese, poi «Crea la parcella».'),
    }
    return [
      el('button', { type: 'button', class: 'demo-indietro', onclick: () => { stato.aperta = null; stato.modulo = null; disegna() } }, '‹ Pratiche'),
      el('div', { class: 'demo-dettaglio', style: `--pc:${p.colore}` }, el('small', {}, `${p.numero} · ${p.stato}`), el('h3', {}, p.titolo), el('p', {}, 'Cliente: ', el('b', {}, contatto(p.cliente)?.nome || '—'))),
      el('div', { class: 'demo-priorita', role: 'group', 'aria-label': 'Priorità' }, el('span', {}, 'Priorità'), PRIORITA.map(([nome, segno], i) => el('button', { type: 'button', 'aria-pressed': String(p.priorita === i), class: 'demo-prio-' + i, onclick: () => { p.priorita = i; disegna() } }, segno + ' ' + nome[0].toUpperCase() + nome.slice(1)))),
      el('div', { class: 'demo-sottoschede', role: 'group', 'aria-label': 'Parti della pratica' }, schede.map(([k, t]) => el('button', { type: 'button', 'aria-pressed': String(stato.scheda === k), 'data-scheda': k, onclick: () => { stato.scheda = k; stato.modulo = null; disegna() } }, t))),
      corpo[stato.scheda](),
    ]
  }
  const viste = {
    panoramica: () => {
      const aperti = stato.compiti.filter((c) => !c.fatto)
      return [
        el('div', { class: 'demo-numeri' }, el('p', {}, el('b', {}, String(stato.impegni.length)), ' impegni oggi'), el('p', {}, el('b', {}, String(aperti.length)), aperti.length === 1 ? ' compito aperto' : ' compiti aperti'), el('p', {}, el('b', {}, euro(daIncassare())), ' da incassare')),
        el('div', { class: 'demo-colonne' },
          el('section', {}, el('h3', {}, 'Oggi'), stato.impegni.map(([ora, titolo, id]) => el('p', { class: 'demo-impegno' }, el('time', {}, ora), el('span', {}, el('b', {}, titolo), el('small', {}, pratica(id).titolo))))),
          el('section', {}, el('h3', {}, 'Compiti'), stato.compiti.slice(0, 4).map((c) => rigaCompito(c)))),
      ]
    },
    anagrafica: () => [
      el('div', { class: 'demo-intestazione' }, el('h3', {}, `Anagrafica · ${stato.contatti.length} contatti`), stato.modulo !== 'contatto' && el('button', { type: 'button', class: 'demo-primario', onclick: () => { stato.modulo = 'contatto'; disegna(); vista.querySelector('.demo-modulo input')?.focus() } }, '+ Nuovo contatto')),
      stato.modulo === 'contatto' && moduloContatto(),
      el('ul', { class: 'demo-contatti', 'aria-label': 'Contatti' }, stato.contatti.map((c) => el('li', {}, el('span', { class: 'demo-iniziali', 'aria-hidden': 'true' }, c.nome.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()), el('span', {}, el('b', {}, c.nome), el('small', {}, [c.citta, c.email].filter(Boolean).join(' · ') || '—')), el('span', { class: 'demo-stato' }, c.ruolo)))),
    ],
    pratiche: () => {
      const p = stato.aperta && pratica(stato.aperta)
      if (p) return dettaglioPratica(p)
      return [
        el('div', { class: 'demo-intestazione' }, el('h3', {}, 'Pratiche'), stato.modulo !== 'pratica' && el('button', { type: 'button', class: 'demo-primario', onclick: () => { stato.modulo = 'pratica'; disegna(); vista.querySelector('.demo-modulo input')?.focus() } }, '+ Nuova pratica')),
        stato.modulo === 'pratica' && moduloPratica(),
        el('div', { class: 'demo-pratiche' }, [...stato.pratiche].sort((a, b) => b.priorita - a.priorita).map(scheda)),
      ]
    },
    budget: () => {
      const b = stato.budget, mesi = previsione(), max = Math.max(...mesi.map((m) => Math.abs(m.saldo))), rosso = mesi.find((m) => m.saldo < 0)
      const disponibile = b.saldo - b.tasse - b.uscite[0]
      return [
        el('div', { class: 'demo-numeri' }, el('p', {}, el('b', {}, euro(b.saldo)), ' saldo dei conti'), el('p', {}, el('b', {}, euro(b.uscite[0])), ' uscite entro 30 giorni'), el('p', { class: 'demo-disponibile' }, el('b', {}, euro(disponibile)), ' disponibile davvero')),
        el('div', { class: 'demo-budget-testa' }, el('h3', {}, 'Saldo previsto a fine mese'),
          el('button', { type: 'button', class: 'demo-interruttore', 'aria-pressed': String(b.tardano), onclick: () => { b.tardano = !b.tardano; disegna() } }, 'Se gli incassi tardano')),
        el('div', { class: 'demo-mesi', role: 'img', 'aria-label': 'Saldo previsto: ' + mesi.map((m) => `${m.lungo} ${euro(m.saldo)}`).join(', ') },
          mesi.map((m) => el('div', { class: 'demo-mese' + (m.saldo < 0 ? ' sotto' : '') },
            el('span', { class: 'demo-colonna' }, el('i', { style: `--h:${Math.max(3, Math.round((Math.abs(m.saldo) / max) * 100))}%` })),
            el('small', {}, euro(m.saldo).replace(' ', ' ')), el('span', { class: 'demo-mese-nome' }, m.mese)))),
        rosso ? el('p', { class: 'demo-avviso', role: 'status' }, `Se gli incassi tardano, a fine ${rosso.lungo} il saldo va sotto zero (${euro(rosso.saldo)}).`)
          : el('p', { class: 'demo-vuoto' }, `Tasse da mettere da parte: ${euro(b.tasse)}, già tolte dal disponibile.${stato.parcelle.length ? ' Le parcelle create entrano tra gli incassi del mese prossimo.' : ''}`),
      ]
    },
    compiti: () => { const fatti = stato.compiti.filter((c) => c.fatto).length; return [el('h3', {}, `Compiti · ${fatti} di ${stato.compiti.length} fatti`), stato.compiti.map((c) => rigaCompito(c)), aggiungiCompito(1)] },
  }
  const schede = tutti('[data-vista]', radice)
  function disegnaPassi() {
    if (!elencoPassi) return
    const n = PASSI.filter(([k]) => stato.fatti.has(k)).length
    elencoPassi.querySelector('[data-demo-avanzamento]').textContent = n === PASSI.length ? 'Fatto tutto: TIO è così, ma con i tuoi dati.' : `${n} di ${PASSI.length} passi`
    elencoPassi.querySelector('ol').replaceChildren(...PASSI.map(([k, t]) => el('li', { class: stato.fatti.has(k) ? 'fatto' : '' }, el('span', { class: 'demo-passo-segno', 'aria-hidden': 'true' }), t, stato.fatti.has(k) ? el('span', { class: 'sr-solo' }, ' (fatto)') : null)))
  }
  function disegna() {
    for (const b of schede) b.setAttribute('aria-selected', String(b.dataset.vista === stato.vista))
    vista.replaceChildren(...viste[stato.vista]().flat(2).filter(Boolean))
    disegnaPassi()
  }
  schede.forEach((b) => b.addEventListener('click', () => { stato.vista = b.dataset.vista; stato.aperta = null; stato.modulo = null; disegna() }))
  const tema = document.querySelector('[data-demo-tema]')
  tema?.addEventListener('click', () => { const scuro = radice.dataset.tema !== 'scuro'; radice.dataset.tema = scuro ? 'scuro' : 'chiaro'; tema.setAttribute('aria-pressed', String(scuro)); tema.textContent = scuro ? 'Tema chiaro' : 'Tema scuro' })
  document.querySelector('[data-demo-ricomincia]')?.addEventListener('click', () => { stato = iniziale(); disegna(); schede[0]?.focus() })
  disegna()
})()

/* ---------- la barra in alto diventa più trasparente quando qualcosa le scorre sotto ---------- */
;(() => {
  const barra = document.querySelector('[data-barra]'); if (!barra) return
  const segna = () => barra.classList.toggle('scorre', scrollY > 10)
  addEventListener('scroll', segna, { passive: true }); segna()
})()

window.TIO_PRONTO = true
