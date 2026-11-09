// Modelli di documento (sezione Documenti): intestazione e piè di pagina come quelli della nota pro forma,
// un corpo con formattazione essenziale e campi che si compilano dai dati dell'archivio.
import type { Allineamento, Anagrafica, MarginiPagina, ModelloDocumento, Pratica, RigaModello, Settings } from '../types'
import { modelloEffettivo, riga } from './modello'
import { esc } from './format'
import { famigliaFont, fontFaceCss, nomeFont } from './font-documento'
import { logoHtml, footerImmagineHtml, righeHtml } from './print'
import { nomeConTitolo } from './recapiti'

// ------------------------------------------------------------------ campi

export interface Campo { id: string; etichetta: string; gruppo: string }
export function campiDisponibili(s: Settings): Campo[] {
  const L = s.etichette
  return [
    { id: 'oggi', etichetta: 'Data di oggi', gruppo: 'Generali' },
    { id: 'luogo', etichetta: 'Luogo', gruppo: 'Generali' },
    { id: 'destinatario.nome', etichetta: 'Nome', gruppo: 'Destinatario' },
    { id: 'destinatario.indirizzo', etichetta: 'Indirizzo', gruppo: 'Destinatario' },
    { id: 'destinatario.cap_citta', etichetta: 'CAP e città', gruppo: 'Destinatario' },
    { id: 'destinatario.cf', etichetta: 'Codice fiscale', gruppo: 'Destinatario' },
    { id: 'destinatario.piva', etichetta: 'Partita IVA', gruppo: 'Destinatario' },
    { id: 'destinatario.email', etichetta: 'Email', gruppo: 'Destinatario' },
    { id: 'destinatario.pec', etichetta: 'PEC', gruppo: 'Destinatario' },
    { id: 'destinatario.titolo', etichetta: 'Titolo (Avv., Ing.…)', gruppo: 'Destinatario' },
    { id: 'destinatario.nome_completo', etichetta: 'Titolo e nome', gruppo: 'Destinatario' },
    { id: 'destinatario.telefono', etichetta: 'Telefono', gruppo: 'Destinatario' },
    { id: 'destinatario.sdi', etichetta: 'Codice SDI', gruppo: 'Destinatario' },
    { id: 'pratica.numero', etichetta: 'Numero', gruppo: L.pratica },
    { id: 'pratica.titolo', etichetta: 'Titolo', gruppo: L.pratica },
    { id: 'pratica.rg', etichetta: L.rg, gruppo: L.pratica },
    { id: 'pratica.autorita', etichetta: L.autorita, gruppo: L.pratica },
    { id: 'pratica.giudice', etichetta: L.giudice, gruppo: L.pratica },
    { id: 'pratica.controparte', etichetta: L.controparte, gruppo: L.pratica },
    { id: 'studio.nome', etichetta: 'Nome', gruppo: 'La tua attività' },
    { id: 'studio.titolare', etichetta: 'Titolare', gruppo: 'La tua attività' },
    { id: 'studio.indirizzo', etichetta: 'Indirizzo', gruppo: 'La tua attività' },
    { id: 'studio.cap_citta', etichetta: 'CAP e città', gruppo: 'La tua attività' },
    { id: 'studio.telefono', etichetta: 'Telefono', gruppo: 'La tua attività' },
    { id: 'studio.email', etichetta: 'Email', gruppo: 'La tua attività' },
    { id: 'studio.pec', etichetta: 'PEC', gruppo: 'La tua attività' },
    { id: 'studio.piva', etichetta: 'Partita IVA', gruppo: 'La tua attività' },
    { id: 'studio.cf', etichetta: 'Codice fiscale', gruppo: 'La tua attività' },
    { id: 'studio.iban', etichetta: 'IBAN', gruppo: 'La tua attività' },
    { id: 'firma', etichetta: 'Firma (immagine)', gruppo: 'Speciali' },
    { id: 'corpo.documento', etichetta: 'Testo lungo da incollare', gruppo: 'Speciali' },
  ]
}

export const RE_CAMPO = /\{\{\s*([\p{L}\p{N}_.\- ]{1,60}?)\s*\}\}/gu
/** Campi usati dal modello, nell'ordine in cui compaiono (anche quelli liberi, inventati dall'utente). */
export function campiUsati(m: ModelloDocumento): string[] {
  const testi = [m.corpo, ...m.intestazione.map((r) => r.testo), ...m.footer.map((r) => r.testo)]
  return [...new Set(testi.flatMap((t) => [...t.matchAll(RE_CAMPO)].map((x) => x[1].trim())))]
}
/** Campi speciali che non si scrivono come testo: la firma è un'immagine del modello, il testo lungo si incolla a parte. */
export const CAMPI_SPECIALI = new Set(['firma', 'corpo.documento'])
/** Nome valido per un campo personalizzato («n.giorni», «compenso», «data di consegna»). */
export const nomeCampoValido = (n: string) => /^[\p{L}\p{N}_.\- ]{1,60}$/u.test(n.trim()) && !/^\s|\s$/.test(n.trim())

const dataLunga = (d = new Date()) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
const cittaDa = (capCitta: string) => (capCitta || '').replace(/^\d{5}\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim()

/** Valori dei campi a partire da destinatario, pratica e dati dell'attività. */
export function valoriCampi(s: Settings, o: { destinatario?: Anagrafica | null; pratica?: Pratica | null; controparte?: Anagrafica | null; luogo?: string }): Record<string, string> {
  const st = s.studio, d = o.destinatario, p = o.pratica
  return {
    oggi: dataLunga(), luogo: o.luogo || cittaDa(st.cap_citta),
    'destinatario.nome': d?.denominazione || '', 'destinatario.indirizzo': d?.indirizzo || '',
    'destinatario.cap_citta': d ? [d.cap, d.citta, d.provincia ? `(${d.provincia})` : ''].filter(Boolean).join(' ') : '',
    'destinatario.titolo': d?.tipo !== 'azienda' ? d?.titolo || '' : '', 'destinatario.nome_completo': nomeConTitolo(d), 'destinatario.telefono': d?.telefono || '', 'destinatario.sdi': d?.sdi || '',
    'destinatario.cf': d?.codice_fiscale || '', 'destinatario.piva': d?.partita_iva || '', 'destinatario.email': d?.email || '', 'destinatario.pec': d?.pec || '',
    'pratica.numero': p?.numero || '', 'pratica.titolo': p?.titolo || '', 'pratica.rg': p?.rg || '', 'pratica.autorita': p?.autorita || '', 'pratica.giudice': p?.giudice || '',
    'pratica.controparte': o.controparte?.denominazione || '',
    'studio.nome': st.intestazione || st.nome || '', 'studio.titolare': st.titolare || '', 'studio.indirizzo': st.indirizzo || '', 'studio.cap_citta': st.cap_citta || '',
    'studio.telefono': st.telefono || '', 'studio.email': st.email || '', 'studio.pec': st.pec || '', 'studio.piva': st.piva || '', 'studio.cf': st.cf || '', 'studio.iban': st.iban || '',
  }
}

/** Sostituisce i campi; quelli senza valore restano visibili tra parentesi, così non passano inosservati. */
export const compila = (t: string, v: Record<string, string>, html = false) =>
  t.replace(RE_CAMPO, (tutto, id: string) => { const x = v[id.trim()]; return x ? (html ? esc(x) : x) : html ? `<mark>${esc(tutto)}</mark>` : tutto })

// ------------------------------------------------------------------ corpo formattato

const ALLINEA: Record<string, Allineamento> = { left: 'sinistra', start: 'sinistra', center: 'centro', right: 'destra', end: 'destra', justify: 'giustificato' }
export const CSS_ALLINEA: Record<Allineamento, string> = { sinistra: 'left', centro: 'center', destra: 'right', giustificato: 'justify' }
/**
 * Un pezzo di testo con la sua formattazione: grassetto, corsivo, sottolineato, barrato, dimensione in punti, colore del
 * testo, evidenziatore. `m`: campo senza valore (si evidenzia nell'anteprima, nei file resta tra doppie graffe).
 */
export interface Run { t: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean; pt?: number; c?: string; hl?: string; m?: boolean }
export type TipoBlocco = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'ul' | 'ol' | 'quote' | 'table' | 'img' | 'pagebreak'
/**
 * Blocco del corpo. Senza allineamento segue la disposizione di tutto il documento; `colonne: 2`: fa parte di una sezione
 * a due colonne. Tabelle: `celle` (righe → celle → pezzi di testo), con la prima riga d'intestazione se `intestazione`.
 * Immagini: `src` (data URL) e `larghezza` in percentuale della riga di testo. `pagebreak`: interruzione di pagina.
 */
export interface Blocco { tipo: TipoBlocco; allineamento?: Allineamento; colonne?: 2; runs: Run[]; celle?: Run[][][]; intestazione?: boolean; src?: string; larghezza?: number; altezza?: number }

const RE_IMG = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_IMG = 4 * 1024 * 1024
const PT_PAROLE: Record<string, number> = { 'xx-small': 7, 'x-small': 7.5, small: 10, medium: 12, large: 13.5, 'x-large': 18, 'xx-large': 24, 'xxx-large': 36 }
const PT_FONT_SIZE: Record<string, number> = { 1: 8, 2: 10, 3: 12, 4: 14, 5: 18, 6: 24, 7: 36 }
/** Dimensione CSS («14pt», «18px», «x-large») in punti, fra 6 e 96; altrimenti niente. */
export function ptDa(v: string | null | undefined): number | undefined {
  if (!v) return undefined
  const s = v.trim().toLowerCase()
  const n = PT_PAROLE[s] ?? (/^[\d.]+pt$/.test(s) ? parseFloat(s) : /^[\d.]+px$/.test(s) ? parseFloat(s) * 0.75 : /^[\d.]+(?:r?em)$/.test(s) ? parseFloat(s) * 11 : NaN)
  return Number.isFinite(n) && n >= 6 && n <= 96 ? Math.round(n * 2) / 2 : undefined
}
/** Colore CSS (#abc, #aabbcc, rgb()) in #rrggbb; trasparente, bianco come sfondo o nero come testo non contano. */
export function coloreDa(v: string | null | undefined, sfondo = false): string | undefined {
  if (!v) return undefined
  const s = v.trim().toLowerCase()
  let hex = ''
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s), m6 = /^#[0-9a-f]{6}$/.exec(s), rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(s)
  if (m3) hex = '#' + m3.slice(1).map((c) => c + c).join('')
  else if (m6) hex = s
  else if (rgb) { if (rgb[4] !== undefined && parseFloat(rgb[4]) === 0) return undefined; hex = '#' + rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('') }
  else return undefined
  if (sfondo ? hex === '#ffffff' : hex === '#000000') return undefined
  return hex
}
const stessoStile = (a: Run, b: Run) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && !!a.s === !!b.s && a.pt === b.pt && a.c === b.c && a.hl === b.hl && !!a.m === !!b.m
/** Pezzi consecutivi con lo stesso stile diventano uno solo (file più leggeri, nessuna differenza visibile). */
const unisci = (runs: Run[]) => runs.reduce<Run[]>((out, r) => { const u = out[out.length - 1]; if (u && stessoStile(u, r)) u.t += r.t; else if (r.t) out.push({ ...r }); return out }, [])

type Formato = Omit<Run, 't'>
/** Blocchi del corpo: paragrafi, titoli, elenchi, citazioni, tabelle, immagini e interruzioni di pagina. Tutto il resto viene scartato. */
export function blocchiDaHtml(html: string): Blocco[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out: Blocco[] = []
  let corrente: Blocco | null = null, inColonne = false
  const nuovo = (tipo: Blocco['tipo'], el: Element | null) => {
    const a = (el as HTMLElement | null)?.style?.textAlign || el?.getAttribute('align') || ''
    corrente = { tipo, ...(ALLINEA[a] && { allineamento: ALLINEA[a] }), ...(inColonne && { colonne: 2 as const }), runs: [] }; out.push(corrente)
  }
  const formato = (el: HTMLElement, f: Formato): Formato => {
    const tag = el.tagName, st = el.style
    const g: Formato = { ...f }
    if (['B', 'STRONG'].includes(tag) || Number(st?.fontWeight) >= 600 || st?.fontWeight === 'bold') g.b = true
    if (st?.fontWeight === 'normal' || st?.fontWeight === '400') g.b = false
    if (['I', 'EM'].includes(tag) || st?.fontStyle === 'italic') g.i = true
    if (tag === 'U' || /underline/.test(st?.textDecoration || st?.textDecorationLine || '')) g.u = true
    if (['S', 'STRIKE', 'DEL'].includes(tag) || /line-through/.test(st?.textDecoration || st?.textDecorationLine || '')) g.s = true
    const pt = ptDa(st?.fontSize) ?? (tag === 'FONT' ? PT_FONT_SIZE[el.getAttribute('size') || ''] : undefined)
    if (pt) g.pt = pt
    const c = coloreDa(st?.color || (tag === 'FONT' ? el.getAttribute('color') : ''))
    if (c) g.c = c
    const hl = coloreDa(st?.backgroundColor, true) || (tag === 'MARK' ? '#fff3b0' : undefined)
    if (hl) g.hl = hl
    return g
  }
  // testo di una cella (o di un elemento qualsiasi) come pezzi formattati, con gli a capo al posto dei paragrafi interni
  const pezzi = (n: Node, f: Formato, acc: Run[]) => {
    if (n.nodeType === Node.TEXT_NODE) { const t = (n.textContent || '').replace(/[\r\n]+/g, ' '); if (t) acc.push({ t, ...pulito(f) }); return }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as HTMLElement
    if (scartato(el)) return
    if (el.tagName === 'BR') { acc.push({ t: '\n' }); return }
    const g = formato(el, f)
    const blocco = /^(P|DIV|LI|H[1-6])$/.test(el.tagName)
    if (blocco && acc.length && acc[acc.length - 1].t !== '\n') acc.push({ t: '\n' })
    el.childNodes.forEach((c) => pezzi(c, g, acc))
  }
  const pulito = (f: Formato): Formato => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== false)) as Formato
  const scartato = (el: HTMLElement) => ['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'SVG', 'HEAD', 'TITLE', 'META', 'LINK', 'XML'].includes(el.tagName) || /mso-list:\s*ignore/i.test(el.getAttribute('style') || '') || el.getAttribute('aria-hidden') === 'true' && el.hasAttribute('data-tio-ignora')
  const tabella = (el: HTMLTableElement) => {
    const righe = [...el.rows].slice(0, 500)
    if (!righe.length) return
    const celle = righe.map((r) => [...r.cells].slice(0, 30).map((c) => { const acc: Run[] = []; c.childNodes.forEach((x) => pezzi(x, formato(c, {}), acc)); while (acc.length && acc[acc.length - 1].t === '\n') acc.pop(); return unisci(acc) }))
    const intestazione = !!el.tHead?.rows.length || [...righe[0].cells].every((c) => c.tagName === 'TH')
    corrente = null
    out.push({ tipo: 'table', runs: [], celle, ...(intestazione && { intestazione: true }), ...(inColonne && { colonne: 2 as const }) })
    corrente = null
  }
  const immagine = (el: HTMLImageElement) => {
    const src = el.getAttribute('src') || ''
    if (!RE_IMG.test(src) || src.length > MAX_IMG) return
    const contenitore = el.closest('figure, p, div') as HTMLElement | null
    const a = contenitore?.style?.textAlign || ''
    const w = parseFloat(el.style.width || el.getAttribute('data-larghezza') || ''), h = el.style.height.endsWith('px') ? parseFloat(el.style.height) : NaN
    corrente = null
    out.push({ tipo: 'img', runs: [], src, ...(Number.isFinite(h) && h > 0 && !el.style.width ? { altezza: Math.min(300, Math.max(16, Math.round(h))) } : { larghezza: Number.isFinite(w) && w > 0 ? Math.min(100, Math.max(5, Math.round(w))) : 100 }), ...(ALLINEA[a] && { allineamento: ALLINEA[a] }), ...(inColonne && { colonne: 2 as const }) })
    corrente = null
  }
  const visita = (n: Node, f: Formato) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent || '').replace(/[\r\n]+/g, ' ')
      if (!t) return
      if (!corrente) { if (!t.trim()) return; nuovo('p', null) }
      corrente!.runs.push({ t, ...pulito(f) })
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as HTMLElement, tag = el.tagName
    if (scartato(el)) return
    if (tag === 'IMG') { immagine(el as HTMLImageElement); return }
    if (tag === 'TABLE') { tabella(el as HTMLTableElement); return }
    if (tag === 'HR') { if (el.hasAttribute('data-interruzione') || /page-break|break-(?:before|after)/.test(el.getAttribute('style') || '')) { corrente = null; out.push({ tipo: 'pagebreak', runs: [] }); corrente = null } return }
    if (/page-break-before:\s*always|break-before:\s*page/i.test(el.getAttribute('style') || '')) { corrente = null; out.push({ tipo: 'pagebreak', runs: [] }); corrente = null }
    if (tag === 'BR') { if (!corrente) nuovo('p', null); corrente!.runs.push({ t: '\n' }); return }
    const g = formato(el, f)
    // sezione a due colonne: contenitore dei paragrafi, non un paragrafo a sé
    if (tag === 'DIV' && el.dataset.colonne === '2' && !inColonne) { corrente = null; inColonne = true; el.childNodes.forEach((c) => visita(c, g)); inColonne = false; corrente = null; return }
    // segnaposto del testo lungo: resta un blocco a sé, riconoscibile nell'editor
    if (el.hasAttribute('data-corpo-documento')) { corrente = null; nuovo('p', el); corrente!.runs.push({ t: CORPO_DOCUMENTO }); corrente = null; return }
    const classe = el.getAttribute('class') || ''
    const titoloWord = /MsoTitle\b/.test(classe) ? 'h1' : /MsoSubtitle\b/.test(classe) ? 'h2' : null
    const listaWord = /MsoListParagraph/.test(classe) ? (/mso-list:[^;"]*\bl\d+\s+level\d/i.test(el.getAttribute('style') || '') && /^\s*\d/.test(el.querySelector('[style*="mso-list"]')?.textContent || '') ? 'ol' : 'ul') : null
    if (/^(P|H[1-6]|LI|DIV|BLOCKQUOTE|FIGURE|PRE)$/.test(tag)) {
      // un DIV che contiene soltanto altri blocchi non è un paragrafo: si visitano i figli
      if ((tag === 'DIV' || tag === 'FIGURE') && [...el.children].some((c) => /^(P|H[1-6]|UL|OL|DIV|TABLE|BLOCKQUOTE|FIGURE|IMG)$/.test(c.tagName))) { corrente = null; el.childNodes.forEach((c) => visita(c, g)); corrente = null; return }
      const lista = tag === 'LI' ? (el.parentElement?.tagName === 'OL' ? 'ol' : 'ul') : listaWord
      const tipo: Blocco['tipo'] = lista || titoloWord || (/^H[1-6]$/.test(tag) ? (`h${Math.min(4, Number(tag[1]))}` as Blocco['tipo']) : tag === 'BLOCKQUOTE' ? 'quote' : 'p')
      nuovo(tipo, el)
      // nei titoli il grassetto è già dello stile
      el.childNodes.forEach((c) => visita(c, tipo.startsWith('h') ? { ...g, b: undefined } : g))
      corrente = null
      return
    }
    el.childNodes.forEach((c) => visita(c, g))
  }
  doc.body.childNodes.forEach((c) => visita(c, {}))
  // via gli a capo finali che il browser lascia nei paragrafi vuoti
  for (const b of out) { while (b.runs.length && b.runs[b.runs.length - 1].t === '\n') b.runs.pop(); b.runs = unisci(b.runs) }
  return out
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
/** Un pezzo di testo in HTML, con la sua formattazione. */
export function runHtml(r: Run): string {
  let t = esc(r.t).replace(/\n/g, '<br>')
  const stile = [r.pt ? `font-size:${r.pt}pt` : '', r.c ? `color:${r.c}` : '', r.hl && !r.m ? `background-color:${r.hl}` : ''].filter(Boolean).join(';')
  if (stile) t = `<span style="${stile}">${t}</span>`
  if (r.s) t = `<s>${t}</s>`
  if (r.u) t = `<u>${t}</u>`
  if (r.i) t = `<em>${t}</em>`
  if (r.b) t = `<strong>${t}</strong>`
  if (r.m) t = `<mark>${t}</mark>`
  return t
}
/** HTML pulito del corpo, da salvare nel modello e da rimettere nell'editor (e da stampare in PDF). */
export function htmlDaBlocchi(blocchi: Blocco[]): string {
  let h = '', lista: string | null = null, sezione = false
  for (const b of blocchi) {
    const l = b.tipo === 'ul' || b.tipo === 'ol' ? b.tipo : null
    if (lista && (l !== lista || !!b.colonne !== sezione)) { h += `</${lista}>`; lista = null }
    if (sezione && !b.colonne) { h += '</div>'; sezione = false }
    if (!sezione && b.colonne) { h += '<div data-colonne="2">'; sezione = true }
    if (l && !lista) { h += `<${l}>`; lista = l }
    const stile = b.allineamento ? ` style="text-align:${CSS_ALLINEA[b.allineamento]}"` : ''
    if (b.tipo === 'pagebreak') { h += '<hr data-interruzione="1">'; continue }
    if (b.tipo === 'img') { if (b.src && RE_IMG.test(b.src)) h += `<figure${stile}><img src="${attr(b.src)}" style="${b.altezza ? `height:${b.altezza}px;width:auto` : `width:${b.larghezza || 100}%`}" alt=""></figure>`; continue }
    if (b.tipo === 'table') {
      const righe = (b.celle || []).map((r, i) => `<tr>${r.map((c) => { const tag = i === 0 && b.intestazione ? 'th' : 'td'; return `<${tag}>${c.map(runHtml).join('') || '<br>'}</${tag}>` }).join('')}</tr>`)
      h += `<table>${b.intestazione && righe.length ? `<thead>${righe[0]}</thead><tbody>${righe.slice(1).join('')}</tbody>` : `<tbody>${righe.join('')}</tbody>`}</table>`
      continue
    }
    const tag = l ? 'li' : b.tipo === 'quote' ? 'blockquote' : b.tipo
    const runs = b.runs.map(runHtml).join('')
    h += `<${tag}${stile}>${runs || '<br>'}</${tag}>`
  }
  return h + (lista ? `</${lista}>` : '') + (sezione ? '</div>' : '')
}
export const pulisciHtml = (html: string) => htmlDaBlocchi(blocchiDaHtml(html))

/** Testo semplice → blocchi (un paragrafo per ogni riga vuota). Serve ad Anonimizza per salvare il testo anonimizzato. */
export const blocchiDaTesto = (testo: string): Blocco[] => testo.replace(/\r/g, '').split(/\n{2,}/).map((p) => ({ tipo: 'p', runs: [{ t: p.replace(/\n+$/, '') }] }))

/**
 * Testo incollato senza formattazione (da un PDF, da un'email, da un file .txt o Markdown) → blocchi con la struttura
 * riconosciuta: capitoli e titoli («CAPITOLO 1», «Art. 3», «1.2 Oggetto», righe tutte maiuscole, «# Titolo»), elenchi
 * («- », «• », «a) », «1) »), tabelle (colonne separate da tabulazioni o da «|») e paragrafi (le righe spezzate si riuniscono).
 */
export function blocchiDaTestoStrutturato(testo: string): Blocco[] {
  const righe = testo.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n')
  const out: Blocco[] = []
  let par: string[] = []
  const chiudi = () => { if (par.length) { out.push({ tipo: 'p', runs: inlineMd(par.join(' ').replace(/\s+/g, ' ').trim()) }); par = [] } }
  const titolo = (r: string): Blocco['tipo'] | null => {
    const t = r.trim()
    if (!t || t.length > 120) return null
    const md = /^(#{1,4})\s+\S/.exec(t); if (md) return `h${md[1].length}` as Blocco['tipo']
    if (/^(capitolo|parte|libro|titolo|sezione)\s+([\divxlc]+|primo|secondo|terzo|quarto|quinto|unico)\b/i.test(t)) return 'h1'
    if (/^(capo|art\.|articolo|paragrafo|§)\s*[\divxlc]+/i.test(t) && t.length < 90) return 'h2'
    const num = /^(\d+(?:\.\d+){0,3})[.)]?\s+[A-ZÀ-Ú]/.exec(t)
    if (num && t.length < 90 && !/[.;,:]$/.test(t)) return (`h${Math.min(4, num[1].split('.').filter(Boolean).length + 1)}`) as Blocco['tipo']
    if (t.length >= 3 && t.length < 80 && /[A-ZÀ-Ú]{3}/.test(t) && t === t.toUpperCase() && !/[.;,]$/.test(t)) return 'h2'
    return null
  }
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i], t = r.trim()
    if (!t) { chiudi(); continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { chiudi(); continue }
    if (r.startsWith('\f')) { chiudi(); out.push({ tipo: 'pagebreak', runs: [] }) }
    // tabella: due o più righe di fila con tabulazioni (o con «|» come in Markdown)
    const colonne = (x: string) => x.includes('\t') ? x.split('\t') : /^\|.*\|$/.test(x.trim()) ? x.trim().slice(1, -1).split('|') : null
    if (colonne(r) && i + 1 < righe.length && colonne(righe[i + 1])) {
      chiudi()
      const celle: Run[][][] = []
      let j = i
      for (; j < righe.length && colonne(righe[j]); j++) { if (/^\|?\s*:?-{2,}/.test(righe[j].trim())) continue; celle.push(colonne(righe[j])!.map((c) => inlineMd(c.trim()))) }
      out.push({ tipo: 'table', runs: [], celle, intestazione: r.trim().startsWith('|') || celle[0].every((c) => c.some((x) => x.b)) })
      i = j - 1; continue
    }
    const elenco = /^\s*(?:[-•*–·▪]\s+|(\d{1,3}|[a-z])[.)]\s+)(.*)$/.exec(r)
    const h = titolo(r)
    // «1. Premessa» da solo (anche prima di un elenco puntato) è un titolo; «1. …» subito seguito o preceduto da «2. …» è un elenco numerato
    const voce = (x?: string) => !!x && /^\s*\d{1,3}[.)]\s+/.test(x)
    const titoloNumerato = !!(elenco?.[1] && /^\d/.test(elenco[1]) && h && !voce(righe[i - 1]) && !voce(righe[i + 1]) && !par.length)
    if (elenco && elenco[2] !== undefined && !titoloNumerato) { chiudi(); out.push({ tipo: elenco[1] ? 'ol' : 'ul', runs: inlineMd(elenco[2].trim()) }); continue }
    if (h && !par.length) { out.push({ tipo: h, runs: inlineMd(t.replace(/^#{1,4}\s+/, '')) }); continue }
    if (h && par.length && /[.!?:;]$/.test(par[par.length - 1])) { chiudi(); out.push({ tipo: h, runs: inlineMd(t.replace(/^#{1,4}\s+/, '')) }); continue }
    if (/^>\s?/.test(t)) { chiudi(); out.push({ tipo: 'quote', runs: inlineMd(t.replace(/^>\s?/, '')) }); continue }
    par.push(t)
    // una riga che termina con un punto e la seguente che inizia con maiuscola dopo un rientro: nuovo paragrafo
    if (/[.!?:]$/.test(t) && i + 1 < righe.length && /^\s{2,}\S/.test(righe[i + 1])) chiudi()
  }
  chiudi()
  return out
}
/** **grassetto**, *corsivo*, __sottolineato__ e ~~barrato~~ in stile Markdown dentro una riga. */
function inlineMd(t: string): Run[] {
  const out: Run[] = []
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*\s][^*]*)\*)/g
  let ultimo = 0, x: RegExpExecArray | null
  while ((x = re.exec(t))) {
    if (x.index > ultimo) out.push({ t: t.slice(ultimo, x.index) })
    out.push(x[2] ? { t: x[2], b: true } : x[3] ? { t: x[3], u: true } : x[4] ? { t: x[4], s: true } : { t: x[5], i: true })
    ultimo = x.index + x[0].length
  }
  if (ultimo < t.length) out.push({ t: t.slice(ultimo) })
  return out.length ? out : [{ t }]
}

/** Paragrafi che sembrano titoli o capitoli («CAPITOLO 2», «3.1 Oggetto», righe in maiuscolo) diventano titoli veri. */
export function riconosciTitoli(blocchi: Blocco[]): { blocchi: Blocco[]; trovati: number } {
  let trovati = 0
  const res = blocchi.map((b) => {
    if (b.tipo !== 'p') return b
    const t = b.runs.map((r) => r.t).join('').trim()
    if (!t || t.length > 120 || t.includes('\n')) return b
    const tipo = blocchiDaTestoStrutturato(t)[0]?.tipo
    if (tipo && /^h[1-4]$/.test(tipo)) { trovati++; return { ...b, tipo, runs: b.runs.map((r) => ({ ...r, b: undefined })) } }
    return b
  })
  return { blocchi: res, trovati }
}

/** Titoli del documento (per l'indice dei capitoli nell'editor). */
export const capitoli = (blocchi: Blocco[]) => blocchi.map((b, i) => ({ i, livello: /^h[1-4]$/.test(b.tipo) ? Number(b.tipo[1]) : 0, testo: b.runs.map((r) => r.t).join('').trim() })).filter((x) => x.livello && x.testo)

// ------------------------------------------------------------------ compilazione dei campi nel corpo

/** Campo speciale: qui si incolla, al momento di creare il documento, un testo lungo con titoli, capitoli, tabelle e immagini. */
export const CORPO_DOCUMENTO = '{{corpo.documento}}'
export const CAMPO_FIRMA = '{{firma}}'
const RE_SOLO = (nome: string) => new RegExp(`^\\s*\\{\\{\\s*${nome.replace('.', '\\.')}\\s*\\}\\}\\s*$`)
/** Sostituisce i campi dentro i pezzi di testo: quelli senza valore restano tra doppie graffe e si segnano come mancanti. */
function compilaRuns(runs: Run[], v: Record<string, string>): Run[] {
  const out: Run[] = []
  for (const r of runs) {
    let ultimo = 0
    for (const x of r.t.matchAll(RE_CAMPO)) {
      const id = x[1].trim()
      if (id === 'firma') continue // la firma è un'immagine: la sistema corpoCompilato
      if (x.index! > ultimo) out.push({ ...r, t: r.t.slice(ultimo, x.index) })
      const val = v[id]
      out.push(val ? { ...r, t: val } : { ...r, t: x[0], m: true })
      ultimo = x.index! + x[0].length
    }
    if (ultimo < r.t.length) out.push({ ...r, t: r.t.slice(ultimo) })
  }
  return unisci(out)
}
export interface Firma { src: string; altezza: number; allineamento: Allineamento }
/**
 * Il corpo del modello pronto per la pagina: il testo lungo al posto di {{corpo.documento}}, i campi compilati e
 * l'immagine della firma al posto di {{firma}} (se il modello non ha la firma, il campo resta da completare).
 */
export function corpoCompilato(m: Pick<ModelloDocumento, 'corpo' | 'firma' | 'firmaAltezza' | 'firmaAllineamento'>, c: { valori: Record<string, string>; corpoDocumento?: string }): Blocco[] {
  const out: Blocco[] = []
  const firma = m.firma && RE_IMG.test(m.firma) ? m.firma : null
  for (const b of blocchiDaHtml(m.corpo)) {
    const testo = b.runs.map((r) => r.t).join('')
    if (b.tipo !== 'table' && RE_SOLO('corpo.documento').test(testo)) {
      const lungo = c.corpoDocumento ? blocchiDaHtml(c.corpoDocumento) : []
      if (lungo.length) { out.push(...lungo.map((x) => ({ ...x, ...(x.tipo !== 'table' && x.tipo !== 'img' && { runs: compilaRuns(x.runs, c.valori) }), ...(x.celle && { celle: x.celle.map((r) => r.map((cella) => compilaRuns(cella, c.valori))) }), ...(b.colonne && { colonne: b.colonne }) }))); continue }
      out.push({ ...b, runs: [{ t: CORPO_DOCUMENTO, m: true }] }); continue
    }
    if (b.tipo === 'table') { out.push({ ...b, celle: (b.celle || []).map((r) => r.map((cella) => compilaRuns(cella, c.valori))) }); continue }
    if (firma && /\{\{\s*firma\s*\}\}/.test(testo)) {
      const resto = compilaRuns(b.runs.map((r) => ({ ...r, t: r.t.replace(/\{\{\s*firma\s*\}\}/g, '') })), c.valori)
      if (resto.some((r) => r.t.trim())) out.push({ ...b, runs: resto })
      out.push({ tipo: 'img', runs: [], src: firma, altezza: Math.min(200, Math.max(20, m.firmaAltezza || 60)), allineamento: m.firmaAllineamento || b.allineamento || 'sinistra', ...(b.colonne && { colonne: b.colonne }) })
      continue
    }
    out.push({ ...b, runs: compilaRuns(b.runs, c.valori) })
  }
  // {{firma}} senza immagine: si segnala come campo mancante
  if (!firma) for (const b of out) b.runs = b.runs.flatMap((r) => r.m || !/\{\{\s*firma\s*\}\}/.test(r.t) ? [r] : r.t.split(/(\{\{\s*firma\s*\}\})/).filter(Boolean).map((t) => (t.startsWith('{{') ? { ...r, t, m: true } : { ...r, t })))
  return out
}

// ------------------------------------------------------------------ modelli predefiniti

const nuovoId = () => 'mod-' + (crypto.randomUUID?.() || Math.random().toString(36).slice(2))
const corpo = (...righe: string[]) => righe.map((r) => r.startsWith('#') ? `<h2>${esc(r.slice(1).trim())}</h2>` : r.startsWith('- ') ? `<ul><li>${esc(r.slice(2))}</li></ul>` : `<p>${r ? esc(r) : '<br>'}</p>`).join('').replace(/<\/ul><ul>/g, '')
const DESTINATARIO = ['Spett.le {{destinatario.nome}}', '{{destinatario.indirizzo}}', '{{destinatario.cap_citta}}', '']

type Profilo = 'avvocato' | 'professionista' | 'impresa'
interface TipoDocumento { tipo: string; descrizione: string; corpo: () => string; profili: Profilo[] }
const TUTTI: Profilo[] = ['avvocato', 'professionista', 'impresa']
const FIRMA = ['', 'Restando a disposizione per qualsiasi chiarimento, porgo cordiali saluti.', '', '{{studio.titolare}}']

// testi di partenza da adattare: ogni profilo vede i documenti del proprio lavoro, con le proprie parole
export const TIPI_DOCUMENTO: TipoDocumento[] = [
  { tipo: 'Lettera', descrizione: 'Corrispondenza con clienti, fornitori e uffici', profili: TUTTI, corpo: () => corpo(...DESTINATARIO, 'Oggetto: …', '', 'Gentile cliente,', 'con la presente …', ...FIRMA) },
  { tipo: 'Preventivo', descrizione: 'Offerta con attività, tempi e condizioni', profili: TUTTI, corpo: () => corpo(...DESTINATARIO, '#Preventivo', 'Oggetto: …', '', 'Con riferimento alla Sua richiesta, Le sottopongo la seguente proposta.', '#Attività previste', '- …', '- …', '#Importo e condizioni', 'Importo complessivo: € … oltre IVA e accessori di legge.', 'Validità dell’offerta: 30 giorni dalla data del presente documento.', '', 'Per accettazione', '', '______________________') },
  { tipo: 'Diffida e messa in mora', descrizione: 'Sollecito formale per conto del cliente', profili: ['avvocato'], corpo: () => corpo(...DESTINATARIO, 'Oggetto: diffida e messa in mora', '', 'Per conto e nell’interesse di …, Le comunico che …', '', 'La invito pertanto a provvedere entro e non oltre 15 giorni dal ricevimento della presente. In mancanza, sarò costretto a tutelare i diritti del mio assistito nelle sedi opportune, senza ulteriore avviso.', '', 'Distinti saluti.', '', '{{studio.titolare}}') },
  { tipo: 'Sollecito di pagamento', descrizione: 'Promemoria per un documento non ancora saldato', profili: ['professionista', 'impresa'], corpo: () => corpo(...DESTINATARIO, 'Oggetto: sollecito di pagamento', '', 'Gentile cliente,', 'da un controllo risulta ancora da saldare il documento n. {{numero documento}} del {{data documento}}, per un importo di € {{importo}}.', '', 'La invito a provvedere al pagamento entro 15 giorni con bonifico sul conto {{studio.iban}}. Se ha già pagato, consideri questa comunicazione come non inviata.', ...FIRMA) },
  { tipo: 'Procura alle liti', descrizione: 'Mandato difensivo da far sottoscrivere al cliente', profili: ['avvocato'], corpo: () => corpo('#Procura alle liti', 'Il/La sottoscritto/a {{destinatario.nome}} (C.F. {{destinatario.cf}}) nomina e costituisce proprio difensore {{studio.titolare}}, conferendo ogni più ampia facoltà di legge, nel procedimento {{pratica.titolo}} ({{pratica.rg}}) davanti a {{pratica.autorita}}.', '', 'Elegge domicilio presso lo studio del difensore.', 'Dichiara di aver ricevuto l’informativa sul trattamento dei dati personali.', '', '{{luogo}}, {{oggi}}', '', 'Firma ______________________', '', 'Per autentica ______________________') },
  { tipo: 'Delega', descrizione: 'Delega a una persona di fiducia per ritirare, consegnare o firmare per conto del delegante', profili: TUTTI, corpo: () => corpo('#Delega', 'Il/La sottoscritto/a {{destinatario.nome}}, nato/a a {{luogo di nascita}} il {{data di nascita}}, C.F. {{destinatario.cf}}, residente in {{destinatario.indirizzo}}, {{destinatario.cap_citta}},', '', 'DELEGA', '', '{{nome del delegato}}, nato/a a {{luogo di nascita del delegato}} il {{data di nascita del delegato}}, C.F. {{codice fiscale del delegato}},', '', 'a {{oggetto della delega}} in suo nome e per suo conto presso {{ufficio}}, sollevando l’ente da ogni responsabilità al riguardo.', '', 'Si allegano copia del documento d’identità del delegante e del delegato.', '', '{{luogo}}, {{oggi}}', '', 'Il delegante ______________________', '', 'Il delegato ______________________') },
  { tipo: 'Delega di udienza', descrizione: 'Sostituzione in udienza da parte di un collega (art. 14 L. 247/2012)', profili: ['avvocato'], corpo: () => corpo('#Delega di udienza', 'Il sottoscritto {{studio.titolare}}, con studio in {{studio.indirizzo}}, {{studio.cap_citta}}, difensore di {{destinatario.nome}} nel procedimento {{pratica.titolo}} (R.G. {{pratica.rg}}) pendente davanti a {{pratica.autorita}}, giudice {{pratica.giudice}},', '', 'DELEGA', '', 'l’Avv. {{nome del collega}} del Foro di {{foro del collega}} a sostituirlo all’udienza del {{data udienza}} e a compiere tutte le attività processuali necessarie, con ogni facoltà di legge.', '', '{{luogo}}, {{oggi}}', '', '{{studio.titolare}}', '', '______________________') },
  { tipo: 'Incarico professionale', descrizione: 'Conferimento dell’incarico, compenso e trattamento dei dati', profili: ['avvocato', 'professionista'], corpo: () => corpo('#Conferimento di incarico professionale', 'Tra {{destinatario.nome}} (C.F. {{destinatario.cf}}), residente in {{destinatario.indirizzo}}, {{destinatario.cap_citta}}, di seguito «cliente», e {{studio.nome}} (C.F. {{studio.cf}} – P.IVA {{studio.piva}}), con sede in {{studio.indirizzo}}, {{studio.cap_citta}}, di seguito «professionista», si conviene quanto segue.', '#1. Oggetto dell’incarico', '{{pratica.titolo}}: …', '#2. Compenso, spese e tempi', 'Il compenso è determinato in € … oltre accessori di legge, secondo il preventivo allegato. Le spese anticipate sono rimborsate a parte. Tempi previsti: …', '#3. Obblighi delle parti', 'Il cliente fornisce informazioni e documenti completi e veritieri. Il professionista svolge l’incarico con diligenza e informa il cliente sull’andamento dell’attività.', '#4. Recesso', 'Ciascuna parte può recedere con comunicazione scritta; restano dovuti i compensi per l’attività svolta e le spese sostenute.', '#5. Trattamento dei dati personali', 'Il professionista è titolare del trattamento dei dati personali del cliente, trattati per eseguire l’incarico (art. 6, par. 1, lett. b, Regolamento UE 2016/679) e per adempiere agli obblighi di legge, anche fiscali e antiriciclaggio (art. 6, par. 1, lett. c). I dati sono conservati per la durata dell’incarico e per i termini di prescrizione e di legge successivi. Il cliente dichiara di aver ricevuto l’informativa ai sensi dell’art. 13 del Regolamento e può esercitare i diritti previsti dagli artt. 15-22 scrivendo a {{studio.email}}.', '#6. Strumenti di intelligenza artificiale', 'Ai sensi dell’art. 13 della legge 23 settembre 2025, n. 132, il professionista informa il cliente che nello svolgimento dell’incarico può avvalersi di sistemi di intelligenza artificiale solo per attività strumentali e di supporto (per esempio ricerca, sintesi e prima stesura di testi), sempre sotto il proprio controllo: valutazioni, scelte e atti restano frutto della sua attività intellettuale e della sua responsabilità. Sistemi utilizzati: {{sistemi di IA utilizzati}}. Prima di usarli i dati personali e riservati del cliente vengono rimossi o pseudonimizzati, salvo diverso accordo.', '#7. Copertura assicurativa', 'Il professionista dichiara gli estremi della polizza di responsabilità civile professionale: …', '', '{{luogo}}, {{oggi}}', '', 'Il cliente ______________________          Il professionista ______________________') },
  { tipo: 'Informativa privacy', descrizione: 'Informativa sul trattamento dei dati (art. 13 GDPR) per clienti e contatti', profili: ['avvocato', 'professionista', 'impresa'], corpo: () => corpo('#Informativa sul trattamento dei dati personali', 'ai sensi dell’art. 13 del Regolamento UE 2016/679 («GDPR»)', '', 'Gentile {{destinatario.nome}},', 'la presente informativa descrive come trattiamo i Suoi dati personali.', '#1. Titolare del trattamento', '{{studio.nome}}, {{studio.indirizzo}}, {{studio.cap_citta}} – C.F. {{studio.cf}}, P.IVA {{studio.piva}} – email {{studio.email}}, PEC {{studio.pec}}, telefono {{studio.telefono}}.', '#2. Dati trattati', 'Dati anagrafici e di contatto, dati fiscali e di pagamento, documenti e informazioni necessari per l’incarico; solo se indispensabili, categorie particolari di dati (art. 9) o dati giudiziari (art. 10), nei limiti consentiti dalla legge.', '#3. Finalità e basi giuridiche', '- esecuzione dell’incarico e delle misure precontrattuali richieste (art. 6, par. 1, lett. b);', '- adempimento di obblighi di legge, fiscali, contabili e, dove previsti, antiriciclaggio (art. 6, par. 1, lett. c);', '- tutela dei diritti del titolare in sede giudiziaria e gestione di eventuali contestazioni (art. 6, par. 1, lett. f).', '#4. Modalità e conservazione', 'I dati sono trattati con strumenti informatici e cartacei, con misure di sicurezza adeguate, e conservati per la durata del rapporto e successivamente per i termini di prescrizione e gli obblighi di legge (di norma 10 anni).', '#5. Destinatari', 'Collaboratori autorizzati e, quando necessario, commercialista, consulenti, autorità giudiziarie e amministrazioni, istituti bancari, fornitori di servizi informatici nominati responsabili del trattamento. I dati non sono diffusi né trasferiti fuori dallo Spazio economico europeo, salvo con le garanzie previste dal Regolamento.', '#6. Natura del conferimento', 'Il conferimento è necessario per svolgere l’incarico e adempiere agli obblighi di legge; in mancanza non è possibile dare seguito al rapporto.', '#7. Diritti dell’interessato', 'Può chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporsi al trattamento (artt. 15-22), scrivendo a {{studio.email}}. Ha inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).', '', '{{luogo}}, {{oggi}}', '', 'Per presa visione ______________________') },
  { tipo: 'Informativa uso dell’intelligenza artificiale', descrizione: 'Comunicazione al cliente sui sistemi di IA usati nell’incarico (art. 13 L. 132/2025)', profili: ['avvocato', 'professionista'], corpo: () => corpo(...DESTINATARIO, '#Informativa sull’uso di sistemi di intelligenza artificiale', 'ai sensi dell’art. 13, comma 2, della legge 23 settembre 2025, n. 132', '', 'Gentile {{destinatario.nome}},', 'con la presente La informo sull’eventuale uso di sistemi di intelligenza artificiale nello svolgimento dell’incarico {{pratica.titolo}}.', '#1. Sistemi utilizzati', '{{sistemi di IA utilizzati}} (per esempio: assistente per la ricerca e la sintesi di documenti, riconoscimento del testo nelle scansioni, strumenti di traduzione).', '#2. Finalità e limiti', 'I sistemi di intelligenza artificiale sono usati esclusivamente per attività strumentali e di supporto, come ricerca, sintesi, organizzazione dei documenti e prima stesura di testi. Le valutazioni, le scelte, la redazione definitiva degli atti e i consigli che Le fornisco restano frutto della mia attività intellettuale, che prevale in ogni caso.', '#3. Controllo e responsabilità', 'Ogni contenuto prodotto con questi strumenti è verificato da me prima dell’uso. La responsabilità professionale per la prestazione resta interamente in capo al sottoscritto.', '#4. Riservatezza e dati personali', 'Prima di usare sistemi forniti da terzi, i dati personali e le informazioni riservate che La riguardano vengono rimossi o sostituiti con segnaposto (pseudonimizzazione), salvo Suo diverso consenso. I dati sono trattati come descritto nell’informativa sul trattamento dei dati personali già ricevuta.', '#5. Richieste', 'Può chiedere in qualsiasi momento chiarimenti sui sistemi utilizzati, oppure che per il Suo incarico non ne vengano usati, scrivendo a {{studio.email}}.', '', '{{luogo}}, {{oggi}}', '', '{{studio.titolare}}', '', 'Per presa visione ______________________') },
  { tipo: 'Conferma d’ordine', descrizione: 'Lavori o forniture accettati, tempi e pagamento', profili: ['impresa'], corpo: () => corpo(...DESTINATARIO, '#Conferma d’ordine', 'Riferimento: {{pratica.numero}} – {{pratica.titolo}}', '', 'Confermiamo l’ordine ricevuto per:', '- …', '- …', '#Tempi di esecuzione', 'Inizio previsto: …  Consegna: …', '#Prezzo e pagamento', 'Importo: € … oltre IVA. Pagamento: …', '', 'Per accettazione', '', '______________________') },
  { tipo: 'Verbale', descrizione: 'Resoconto di riunioni, sopralluoghi e interventi', profili: TUTTI, corpo: () => corpo('#Verbale', 'In data {{oggi}}, presso …, sono presenti:', '- …', '- …', '#Argomenti trattati', '…', '#Decisioni', '…', '', 'Letto, confermato e sottoscritto.') },
  { tipo: 'Relazione', descrizione: 'Parere, relazione o aggiornamento al cliente', profili: ['avvocato', 'professionista'], corpo: () => corpo(...DESTINATARIO, '#Relazione', 'Oggetto: {{pratica.titolo}}', '#Premessa', '…', '#Analisi', '…', '#Conclusioni', '…', '', '{{studio.titolare}}') },
  { tipo: 'Relazione tecnica', descrizione: 'Stato dei lavori, interventi eseguiti e materiali', profili: ['impresa'], corpo: () => corpo(...DESTINATARIO, '#Relazione tecnica', 'Lavoro: {{pratica.numero}} – {{pratica.titolo}}', '#Situazione riscontrata', '…', '#Interventi eseguiti', '- …', '#Materiali impiegati', '- …', '#Note e indicazioni', '…', '', '{{studio.titolare}}') },
  { tipo: 'Documento libero', descrizione: 'Pagina bianca con la tua intestazione', profili: TUTTI, corpo: () => corpo('') },
]
/** Profilo dell'attività: studio legale, libero professionista o ditta individuale. */
export const profiloDi = (s: Settings): Profilo => (s.profilo === 'ditta' ? (s.attivita === 'professionista' ? 'professionista' : 'impresa') : 'avvocato')
export const tipiDocumento = (s: Settings) => TIPI_DOCUMENTO.filter((t) => t.profili.includes(profiloDi(s)))

/** Nuovo modello: intestazione, piè di pagina, logo e font presi dal modello delle parcelle, già curato dall'utente. */
export function nuovoModello(s: Settings, tipo: string, nome?: string): ModelloDocumento {
  const base = modelloEffettivo(s)
  const preset = TIPI_DOCUMENTO.find((t) => t.tipo === tipo) || TIPI_DOCUMENTO[TIPI_DOCUMENTO.length - 1]
  return {
    ...base, pagamento: [], id: nuovoId(), nome: nome || preset.tipo, tipo: preset.tipo, corpo: preset.corpo(),
    numeriPagina: true, mostraLuogoData: !['Procura alle liti', 'Incarico professionale', 'Verbale', 'Informativa privacy', 'Informativa uso dell’intelligenza artificiale', 'Delega', 'Delega di udienza'].includes(tipo), aggiornato: new Date().toISOString(),
  }
}
export const MARGINI_PREDEFINITI: MarginiPagina = { sopra: 16, sotto: 14, lati: 20 }
/** Modello personalizzato da zero: pagina bianca col nome scelto; a richiesta intestazione, piè di pagina e font dei documenti di vendita. */
export function modelloPersonalizzato(s: Settings, nome: string, conIntestazione: boolean): ModelloDocumento {
  const m = nuovoModello(s, 'Documento libero', nome)
  return {
    ...m, tipo: 'Personalizzato', mostraLuogoData: false, margini: { ...MARGINI_PREDEFINITI },
    ...(!conIntestazione && { intestazione: [rigaVuota({ dimensione: 'grande', grassetto: true })], footer: [rigaVuota({ dimensione: 'piccola' })], logo: null, immagineFooter: null, fontDocumento: 'arial' }),
  }
}
export const duplicaModello = (m: ModelloDocumento): ModelloDocumento => ({ ...structuredClone(m), id: nuovoId(), nome: `${m.nome} (copia)`, predefinito: false, aggiornato: new Date().toISOString() })
/** I modelli pronti del profilo (lettera, preventivo…), con l'intestazione delle parcelle: si usano subito e si modificano a piacere. */
export const modelliPredefiniti = (s: Settings): ModelloDocumento[] => tipiDocumento(s).filter((t) => t.tipo !== 'Documento libero').map((t) => ({ ...nuovoModello(s, t.tipo), predefinito: true }))
/** Modelli da proporre: quelli salvati; se l'utente non ha ancora aperto Documenti, quelli predefiniti. */
export const modelliDisponibili = (s: Settings): ModelloDocumento[] => (s.modelli_documento === undefined ? modelliPredefiniti(s) : s.modelli_documento)
/** Predefiniti non più presenti (eliminati o mai aggiunti), per rimetterli con un clic. */
export const predefinitiMancanti = (s: Settings, lista: ModelloDocumento[]) => modelliPredefiniti(s).filter((p) => !lista.some((m) => m.predefinito && m.tipo === p.tipo))
export const vuoto = (r: RigaModello[]) => !r.some((x) => x.testo.trim())
export const rigaVuota = (o: Partial<RigaModello> = {}) => riga('', o)

// ------------------------------------------------------------------ anteprima e PDF

/** `corpoDocumento`: testo lungo (HTML pulito) da mettere al posto di {{corpo.documento}}. */
export interface Compilazione { valori: Record<string, string>; luogo?: string; corpoDocumento?: string }
const POSIZIONI_LD: Record<string, { alto: boolean; allineamento: Allineamento }> = {
  'alto-destra': { alto: true, allineamento: 'destra' }, 'alto-sinistra': { alto: true, allineamento: 'sinistra' },
  'basso-sinistra': { alto: false, allineamento: 'sinistra' }, 'basso-destra': { alto: false, allineamento: 'destra' },
}
export const NOMI_POSIZIONE_LD: Record<string, string> = { 'alto-destra': 'In alto a destra', 'alto-sinistra': 'In alto a sinistra', 'basso-sinistra': 'In basso a sinistra', 'basso-destra': 'In basso a destra' }
export const posizioneLuogoData = (m: Pick<ModelloDocumento, 'posizioneLuogoData'>) => POSIZIONI_LD[m.posizioneLuogoData || 'alto-destra'] || POSIZIONI_LD['alto-destra']
const testoLuogoData = (m: ModelloDocumento, c: Compilazione) => m.mostraLuogoData ? [c.luogo || c.valori.luogo || m.luogo, c.valori.oggi || dataLunga()].filter(Boolean).join(', ') : ''

/** HTML A4 del documento: intestazione ripetuta in ogni pagina, piè di pagina fisso in fondo, luogo e data per le lettere. */
export function documentoHtml(m: ModelloDocumento, c: Compilazione, anteprima = false): string {
  const v = c.valori
  const righe = (r: RigaModello[]) => righeHtml(r.map((x) => ({ ...x, testo: compila(x.testo, v) })), m)
  const corpoHtml = htmlDaBlocchi(corpoCompilato(m, c))
  const luogoData = testoLuogoData(m, c), pos = posizioneLuogoData(m)
  const ld = luogoData ? `<p class="luogo-data" style="text-align:${CSS_ALLINEA[pos.allineamento]};${pos.alto ? '' : 'margin:8mm 0 0'}">${esc(luogoData)}</p>` : ''
  const footer = `<div class="piede">${footerImmagineHtml(m)}${righe(m.footer)}</div>`
  const haTesta = !!m.logo || !vuoto(m.intestazione)
  const mg = { ...MARGINI_PREDEFINITI, ...m.margini }, pt = m.corpoPt ?? 11
  return `<!doctype html><html lang="it"><head><meta charset="utf-8">${m.numeriPagina && !anteprima ? '<meta name="tio-numeri-pagina" content="1">' : ''}<title>${esc(compila(m.nome, v))}</title><style>
  ${fontFaceCss({ ...m, pagamento: [] })}
  @page{size:A4;margin:${mg.sopra}mm ${mg.lati}mm ${mg.sotto + (m.numeriPagina ? 4 : 0)}mm}*{box-sizing:border-box}
  body{font:${pt}pt/1.5 ${famigliaFont(m.fontDocumento, m.fontPersonali)};color:#14202e;margin:0;${anteprima ? `padding:${mg.sopra}mm ${mg.lati}mm ${mg.sotto}mm;min-height:297mm;position:relative;` : ''}}
  .testa{padding-bottom:3.5mm;margin-bottom:7mm;border-bottom:1pt solid #9aa5b1}.luogo-data{text-align:right;margin:0 0 6mm}
  .corpo{text-align:${CSS_ALLINEA[m.allineamento || 'sinistra']};${m.allineamento === 'giustificato' ? 'hyphens:auto;' : ''}${m.colonne === 2 ? 'column-count:2;column-gap:9mm;' : ''}}.corpo h1,.corpo h2,.corpo h3,.corpo h4{break-after:avoid}.corpo [data-colonne]{column-count:2;column-gap:9mm;margin:0 0 .55em}
  .corpo p{margin:0 0 .55em;orphans:3;widows:3}.corpo h1{font-size:${Math.max(18, pt + 7)}pt;margin:.6em 0 .35em}.corpo h2{font-size:${Math.max(13.5, pt + 3)}pt;margin:.9em 0 .3em}.corpo h3{font-size:${Math.max(12, pt + 1)}pt;margin:.8em 0 .3em}.corpo h4{font-size:${pt}pt;font-style:italic;margin:.7em 0 .25em}
  .corpo ul,.corpo ol{margin:0 0 .6em;padding-left:7mm}.corpo li{margin:0 0 .2em}mark{background:#fff3b0;color:inherit}
  .corpo blockquote{margin:0 0 .6em;padding:0 0 0 5mm;border-left:2pt solid #9aa5b1;color:#3d4b5c;font-style:italic}
  .corpo table{width:100%;border-collapse:collapse;margin:0 0 .7em;break-inside:auto;text-align:left}.corpo tr{break-inside:avoid}.corpo thead{display:table-header-group}
  .corpo td,.corpo th{border:.6pt solid #8a96a3;padding:1.4mm 2mm;vertical-align:top}.corpo th{background:#eef1f4;font-weight:700}
  .corpo figure{margin:0 0 .6em}.corpo figure img{max-width:100%;height:auto}.corpo hr[data-interruzione]{break-after:page;border:0;margin:0;height:0}
  .layout{width:100%;border-collapse:collapse}.layout>thead{display:table-header-group}.layout>tfoot{display:table-footer-group}.layout td{padding:0}.riserva{visibility:hidden}
  .piede{font-size:8pt;line-height:1.4;color:#536276;padding-top:4mm}
  footer{${anteprima ? `position:absolute;left:${mg.lati}mm;right:${mg.lati}mm;bottom:${Math.max(3, mg.sotto - 2)}mm;` : 'position:fixed;left:0;right:0;bottom:0;'}}
  </style></head><body>
  ${anteprima ? '' : '<table class="layout"><thead><tr><td>'}${haTesta ? `<div class="testa">${logoHtml(m)}${righe(m.intestazione)}</div>` : ''}${anteprima ? '' : '</td></tr></thead><tbody><tr><td>'}
  ${pos.alto ? ld : ''}<div class="corpo">${corpoHtml}</div>${pos.alto ? '' : ld}
  ${anteprima ? '' : `</td></tr></tbody><tfoot><tr><td><div class="riserva" aria-hidden="true">${footer}</div></td></tr></tfoot></table>`}
  <footer>${footer}</footer></body></html>`
}

// ------------------------------------------------------------------ esportazione (Word, OpenDocument, RTF…)

/** Immagine in PNG (Word e RTF accettano PNG e JPEG; SVG e WebP si convertono qui). Dimensioni in pixel CSS. */
async function png(src: string | null | undefined, altezza: number | null, allineamento: string, larghezzaMax = 600, larghezzaPerc?: number) {
  if (!src) return null
  const img = await new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src })
  if (!img || !img.naturalWidth) return null
  let w: number, h: number
  if (altezza) { h = Math.max(16, Math.min(400, altezza)); w = Math.round(img.naturalWidth * h / img.naturalHeight) }
  else { w = Math.round(larghezzaMax * Math.min(100, Math.max(5, larghezzaPerc || 100)) / 100); h = Math.round(img.naturalHeight * w / img.naturalWidth); if (h > 900) { w = Math.round(w * 900 / h); h = 900 } }
  if (w > larghezzaMax) { h = Math.round(h * larghezzaMax / w); w = larghezzaMax }
  let dati = src
  // nei file le immagini restano nitide (doppia risoluzione) ma non oltre 1600 px
  const k = Math.min(2, 1600 / Math.max(1, w))
  if (!src.startsWith('data:image/png;base64,') || img.naturalWidth > w * 2.5) {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); dati = c.toDataURL('image/png')
  }
  return { png: dati.slice('data:image/png;base64,'.length), larghezza: w, altezza: Math.max(8, h), allineamento: allineamento === 'destra' ? 'destra' : allineamento === 'sinistra' ? 'sinistra' : 'centro' }
}

/** Struttura neutra che il processo principale trasforma in .docx, .odt, .rtf, .html, .md o .txt. */
export async function documentoEsportabile(m: ModelloDocumento, c: Compilazione) {
  const v = c.valori
  const righe = (r: RigaModello[]) => r.map((x) => ({ ...x, testo: compila(x.testo, v) })).filter((x) => x.testo.trim())
  const larghezzaTesto = Math.round((210 - 2 * ({ ...MARGINI_PREDEFINITI, ...m.margini }).lati) * 96 / 25.4)
  const corpoBlocchi = await Promise.all(corpoCompilato(m, c).map(async (b) => {
    const { m: _m, ...base } = b as Blocco & { m?: boolean }
    if (b.tipo === 'img') {
      const im = await png(b.src, b.altezza || null, b.allineamento || 'centro', larghezzaTesto, b.larghezza)
      return im ? { tipo: 'img' as const, allineamento: im.allineamento as Allineamento, ...(b.colonne && { colonne: b.colonne }), runs: [], immagine: im } : null
    }
    const senzaSegni = (r: Run[]) => r.map(({ m: _x, ...y }) => y)
    return { ...base, src: undefined, runs: senzaSegni(b.runs), ...(b.celle && { celle: b.celle.map((riga) => riga.map(senzaSegni)) }) }
  }))
  const luogoData = testoLuogoData(m, c), pos = posizioneLuogoData(m)
  const ld = luogoData ? [{ tipo: 'p' as const, allineamento: pos.allineamento, runs: [{ t: luogoData }] }] : []
  const font = nomeFont(m.fontDocumento, m)
  return {
    titolo: compila(m.nome, v), font, numeriPagina: m.numeriPagina, ...(m.margini && { margini: { ...MARGINI_PREDEFINITI, ...m.margini } }), ...(m.corpoPt && { corpoPt: m.corpoPt }), allineamento: m.allineamento || 'sinistra', colonne: m.colonne === 2 ? 2 : 1,
    intestazione: righe(m.intestazione), footer: righe(m.footer),
    logo: await png(m.logo, m.logoAltezza, m.logoAllineamento),
    immagineFooter: await png(m.immagineFooter, m.immagineFooterAltezza ?? 36, m.immagineFooterAllineamento || 'centro'),
    corpo: [...(pos.alto ? ld : []), ...corpoBlocchi.filter((x): x is NonNullable<typeof x> => !!x), ...(pos.alto ? [] : [{ tipo: 'p' as const, runs: [{ t: '' }] }, ...ld])],
  }
}

export const FORMATI_DOCUMENTO = [
  { id: 'docx', nome: 'Word (.docx)', nota: 'si apre con Word, Pages e LibreOffice' },
  { id: 'pdf', nome: 'PDF', nota: 'pronto da firmare, inviare o depositare' },
  { id: 'odt', nome: 'OpenDocument (.odt)', nota: 'LibreOffice e OpenOffice' },
  { id: 'rtf', nome: 'RTF', nota: 'compatibile con qualsiasi programma di videoscrittura' },
  { id: 'html', nome: 'Pagina web (.html)', nota: 'da aprire nel browser o incollare in un’email' },
  { id: 'md', nome: 'Markdown (.md)', nota: 'testo con formattazione leggera' },
  { id: 'txt', nome: 'Testo semplice (.txt)', nota: 'senza formattazione' },
] as const
