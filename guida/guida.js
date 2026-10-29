// Guida di TIO: indice che segue la lettura, ricerca nel testo, indice a scomparsa sulle finestre strette. Nessuna rete.
'use strict'
;(() => {
  const voci = [...document.querySelectorAll('.indice nav a[href^="#"]')]
  const bersagli = voci.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean)

  // la voce dell'indice si accende per la sezione che si sta leggendo
  const accendi = (id) => voci.forEach((a) => a.classList.toggle('attivo', a.getAttribute('href') === '#' + id))
  const osserva = new IntersectionObserver((ingressi) => {
    const visibili = ingressi.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    if (visibili.length) accendi(visibili[0].target.id)
  }, { rootMargin: '0px 0px -70% 0px' })
  bersagli.forEach((b) => osserva.observe(b))

  // ricerca: restano nell'indice le sezioni che contengono tutte le parole scritte
  const campo = document.querySelector('[data-cerca]'), esito = document.querySelector('[data-cerca-esito]')
  const testoDi = (id) => {
    const el = document.getElementById(id); if (!el) return ''
    // una sottosezione (h3) arriva fino al titolo successivo dello stesso livello
    if (el.tagName === 'H3') { let t = el.textContent, n = el.nextElementSibling; while (n && n.tagName !== 'H3' && n.tagName !== 'H2') { t += ' ' + n.textContent; n = n.nextElementSibling } return t }
    return el.textContent
  }
  const normalizza = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const indice = new Map(voci.map((a) => [a, normalizza(testoDi(a.getAttribute('href').slice(1)))]))
  const filtra = () => {
    const parole = normalizza(campo.value).split(/\s+/).filter(Boolean)
    let n = 0
    for (const [a, t] of indice) {
      const ok = !parole.length || parole.every((p) => t.includes(p))
      a.parentElement.classList.toggle('nascosto', !ok)
      if (ok && parole.length) n++
    }
    // un capitolo resta visibile se una sua sottosezione corrisponde
    for (const li of document.querySelectorAll('.indice nav > ol > li')) if (li.querySelector('ol li:not(.nascosto)')) li.classList.remove('nascosto')
    // durante la ricerca i nomi dei gruppi (Per iniziare, Il lavoro…) non servono
    for (const g of document.querySelectorAll('.indice .gruppo')) g.classList.toggle('nascosto', parole.length > 0)
    esito.textContent = parole.length ? (n ? `${n} ${n === 1 ? 'sezione trovata' : 'sezioni trovate'}` : 'Nessuna sezione: prova con un’altra parola') : ''
  }
  if (campo) {
    campo.addEventListener('input', filtra)
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { campo.value = ''; filtra() }
      if (e.key === 'Enter') { const prima = voci.find((a) => !a.parentElement.classList.contains('nascosto') && campo.value.trim()); if (prima) { location.hash = prima.getAttribute('href'); document.querySelector('.indice')?.classList.remove('aperto') } }
    })
  }
  // «/» porta alla ricerca, come in molti siti di documentazione
  addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement !== campo && !e.metaKey && !e.ctrlKey) { e.preventDefault(); campo?.focus() } })

  // finestra stretta: l'indice si apre e si chiude
  const apri = document.querySelector('[data-apri-indice]'), pannello = document.querySelector('.indice')
  apri?.addEventListener('click', () => { const aperto = pannello.classList.toggle('aperto'); apri.setAttribute('aria-expanded', String(aperto)) })
  voci.forEach((a) => a.addEventListener('click', () => { pannello.classList.remove('aperto'); apri?.setAttribute('aria-expanded', 'false') }))
})()
