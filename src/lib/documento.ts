// Modelli di documento (sezione Documenti): intestazione e piè di pagina come quelli della nota pro forma,
// un corpo con formattazione essenziale e campi che si compilano dai dati dell'archivio.
import type { Allineamento, Anagrafica, ModelloDocumento, Pratica, RigaModello, Settings } from '../types'
import { modelloEffettivo, riga } from './modello'
import { esc } from './format'
import { famigliaFont, fontFaceCss, FONT_DOCUMENTO } from './font-documento'
import { logoHtml, footerImmagineHtml, righeHtml } from './print'

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
  ]
}

export const RE_CAMPO = /\{\{\s*([\p{L}\p{N}_.\- ]{1,60}?)\s*\}\}/gu
/** Campi usati dal modello, nell'ordine in cui compaiono (anche quelli liberi, inventati dall'utente). */
export function campiUsati(m: ModelloDocumento): string[] {
  const testi = [m.corpo, ...m.intestazione.map((r) => r.testo), ...m.footer.map((r) => r.testo)]
  return [...new Set(testi.flatMap((t) => [...t.matchAll(RE_CAMPO)].map((x) => x[1].trim())))]
}

const dataLunga = (d = new Date()) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
const cittaDa = (capCitta: string) => (capCitta || '').replace(/^\d{5}\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim()

/** Valori dei campi a partire da destinatario, pratica e dati dell'attività. */
export function valoriCampi(s: Settings, o: { destinatario?: Anagrafica | null; pratica?: Pratica | null; controparte?: Anagrafica | null; luogo?: string }): Record<string, string> {
  const st = s.studio, d = o.destinatario, p = o.pratica
  return {
    oggi: dataLunga(), luogo: o.luogo || cittaDa(st.cap_citta),
    'destinatario.nome': d?.denominazione || '', 'destinatario.indirizzo': d?.indirizzo || '',
    'destinatario.cap_citta': d ? [d.cap, d.citta, d.provincia ? `(${d.provincia})` : ''].filter(Boolean).join(' ') : '',
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

const BLOCCHI = new Set(['P', 'H1', 'H2', 'H3', 'LI', 'DIV', 'BLOCKQUOTE'])
const ALLINEA: Record<string, Allineamento> = { left: 'sinistra', start: 'sinistra', center: 'centro', right: 'destra', end: 'destra', justify: 'giustificato' }
export const CSS_ALLINEA: Record<Allineamento, string> = { sinistra: 'left', centro: 'center', destra: 'right', giustificato: 'justify' }
export interface Run { t: string; b?: boolean; i?: boolean; u?: boolean }
/** Senza allineamento il blocco segue la disposizione scelta per tutto il documento. */
/** `colonne: 2`: il blocco fa parte di una sezione a due colonne (i blocchi consecutivi formano la stessa sezione). */
export interface Blocco { tipo: 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol'; allineamento?: Allineamento; colonne?: 2; runs: Run[] }

/** Blocchi del corpo: paragrafi, titoli ed elenchi con grassetto, corsivo e sottolineato. Tutto il resto viene scartato. */
export function blocchiDaHtml(html: string): Blocco[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out: Blocco[] = []
  let corrente: Blocco | null = null, inColonne = false
  const nuovo = (tipo: Blocco['tipo'], el: Element | null) => {
    const a = (el as HTMLElement | null)?.style?.textAlign || el?.getAttribute('align') || ''
    corrente = { tipo, ...(ALLINEA[a] && { allineamento: ALLINEA[a] }), ...(inColonne && { colonne: 2 as const }), runs: [] }; out.push(corrente)
  }
  const visita = (n: Node, f: { b: boolean; i: boolean; u: boolean }) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent || '').replace(/[\r\n]+/g, ' ')
      if (!t) return
      if (!corrente) nuovo('p', null)
      corrente!.runs.push({ t, ...(f.b && { b: true }), ...(f.i && { i: true }), ...(f.u && { u: true }) })
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as HTMLElement, tag = el.tagName
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'IMG', 'IFRAME', 'OBJECT'].includes(tag)) return
    if (tag === 'BR') { if (!corrente) nuovo('p', null); corrente!.runs.push({ t: '\n' }); return }
    const g = { b: f.b || ['B', 'STRONG'].includes(tag) || Number(el.style?.fontWeight) >= 600 || el.style?.fontWeight === 'bold', i: f.i || ['I', 'EM'].includes(tag) || el.style?.fontStyle === 'italic', u: f.u || tag === 'U' || /underline/.test(el.style?.textDecoration || '') }
    // sezione a due colonne: contenitore dei paragrafi, non un paragrafo a sé
    if (tag === 'DIV' && el.dataset.colonne === '2' && !inColonne) { corrente = null; inColonne = true; el.childNodes.forEach((c) => visita(c, g)); inColonne = false; corrente = null; return }
    if (BLOCCHI.has(tag)) {
      const lista = tag === 'LI' ? (el.parentElement?.tagName === 'OL' ? 'ol' : 'ul') : null
      nuovo(lista || (/^H[123]$/.test(tag) ? (tag.toLowerCase() as Blocco['tipo']) : 'p'), el)
      el.childNodes.forEach((c) => visita(c, g))
      corrente = null
      return
    }
    el.childNodes.forEach((c) => visita(c, g))
  }
  doc.body.childNodes.forEach((c) => visita(c, { b: false, i: false, u: false }))
  // via gli a capo finali che il browser lascia nei paragrafi vuoti
  for (const b of out) { while (b.runs.length && b.runs[b.runs.length - 1].t === '\n') b.runs.pop() }
  return out
}

/** HTML pulito del corpo, da salvare nel modello e da rimettere nell'editor. */
export function htmlDaBlocchi(blocchi: Blocco[]): string {
  let h = '', lista: string | null = null, sezione = false
  for (const b of blocchi) {
    const l = b.tipo === 'ul' || b.tipo === 'ol' ? b.tipo : null
    if (lista && (l !== lista || !!b.colonne !== sezione)) { h += `</${lista}>`; lista = null }
    if (sezione && !b.colonne) { h += '</div>'; sezione = false }
    if (!sezione && b.colonne) { h += '<div data-colonne="2">'; sezione = true }
    if (l && !lista) { h += `<${l}>`; lista = l }
    const tag = l ? 'li' : b.tipo
    const stile = b.allineamento ? ` style="text-align:${CSS_ALLINEA[b.allineamento]}"` : ''
    const runs = b.runs.map((r) => { let t = esc(r.t).replace(/\n/g, '<br>'); if (r.u) t = `<u>${t}</u>`; if (r.i) t = `<em>${t}</em>`; if (r.b) t = `<strong>${t}</strong>`; return t }).join('')
    h += `<${tag}${stile}>${runs || '<br>'}</${tag}>`
  }
  return h + (lista ? `</${lista}>` : '') + (sezione ? '</div>' : '')
}
export const pulisciHtml = (html: string) => htmlDaBlocchi(blocchiDaHtml(html))

/** Testo semplice → blocchi (un paragrafo per ogni riga vuota). Serve ad Anonimizza per salvare il testo anonimizzato. */
export const blocchiDaTesto = (testo: string): Blocco[] => testo.replace(/\r/g, '').split(/\n{2,}/).map((p) => ({ tipo: 'p', runs: [{ t: p.replace(/\n+$/, '') }] }))

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
  { tipo: 'Incarico professionale', descrizione: 'Conferimento dell’incarico, compenso e trattamento dei dati', profili: ['avvocato', 'professionista'], corpo: () => corpo('#Conferimento di incarico professionale', 'Tra {{destinatario.nome}} (C.F. {{destinatario.cf}}), residente in {{destinatario.indirizzo}}, {{destinatario.cap_citta}}, di seguito «cliente», e {{studio.nome}} (C.F. {{studio.cf}} – P.IVA {{studio.piva}}), con sede in {{studio.indirizzo}}, {{studio.cap_citta}}, di seguito «professionista», si conviene quanto segue.', '#1. Oggetto dell’incarico', '{{pratica.titolo}}: …', '#2. Compenso, spese e tempi', 'Il compenso è determinato in € … oltre accessori di legge, secondo il preventivo allegato. Le spese anticipate sono rimborsate a parte. Tempi previsti: …', '#3. Obblighi delle parti', 'Il cliente fornisce informazioni e documenti completi e veritieri. Il professionista svolge l’incarico con diligenza e informa il cliente sull’andamento dell’attività.', '#4. Recesso', 'Ciascuna parte può recedere con comunicazione scritta; restano dovuti i compensi per l’attività svolta e le spese sostenute.', '#5. Trattamento dei dati personali', 'Il professionista è titolare del trattamento dei dati personali del cliente, trattati per eseguire l’incarico (art. 6, par. 1, lett. b, Regolamento UE 2016/679) e per adempiere agli obblighi di legge, anche fiscali e antiriciclaggio (art. 6, par. 1, lett. c). I dati sono conservati per la durata dell’incarico e per i termini di prescrizione e di legge successivi. Il cliente dichiara di aver ricevuto l’informativa ai sensi dell’art. 13 del Regolamento e può esercitare i diritti previsti dagli artt. 15-22 scrivendo a {{studio.email}}.', '#6. Copertura assicurativa', 'Il professionista dichiara gli estremi della polizza di responsabilità civile professionale: …', '', '{{luogo}}, {{oggi}}', '', 'Il cliente ______________________          Il professionista ______________________') },
  { tipo: 'Informativa privacy', descrizione: 'Informativa sul trattamento dei dati (art. 13 GDPR) per clienti e contatti', profili: ['avvocato', 'professionista', 'impresa'], corpo: () => corpo('#Informativa sul trattamento dei dati personali', 'ai sensi dell’art. 13 del Regolamento UE 2016/679 («GDPR»)', '', 'Gentile {{destinatario.nome}},', 'la presente informativa descrive come trattiamo i Suoi dati personali.', '#1. Titolare del trattamento', '{{studio.nome}}, {{studio.indirizzo}}, {{studio.cap_citta}} – C.F. {{studio.cf}}, P.IVA {{studio.piva}} – email {{studio.email}}, PEC {{studio.pec}}, telefono {{studio.telefono}}.', '#2. Dati trattati', 'Dati anagrafici e di contatto, dati fiscali e di pagamento, documenti e informazioni necessari per l’incarico; solo se indispensabili, categorie particolari di dati (art. 9) o dati giudiziari (art. 10), nei limiti consentiti dalla legge.', '#3. Finalità e basi giuridiche', '- esecuzione dell’incarico e delle misure precontrattuali richieste (art. 6, par. 1, lett. b);', '- adempimento di obblighi di legge, fiscali, contabili e, dove previsti, antiriciclaggio (art. 6, par. 1, lett. c);', '- tutela dei diritti del titolare in sede giudiziaria e gestione di eventuali contestazioni (art. 6, par. 1, lett. f).', '#4. Modalità e conservazione', 'I dati sono trattati con strumenti informatici e cartacei, con misure di sicurezza adeguate, e conservati per la durata del rapporto e successivamente per i termini di prescrizione e gli obblighi di legge (di norma 10 anni).', '#5. Destinatari', 'Collaboratori autorizzati e, quando necessario, commercialista, consulenti, autorità giudiziarie e amministrazioni, istituti bancari, fornitori di servizi informatici nominati responsabili del trattamento. I dati non sono diffusi né trasferiti fuori dallo Spazio economico europeo, salvo con le garanzie previste dal Regolamento.', '#6. Natura del conferimento', 'Il conferimento è necessario per svolgere l’incarico e adempiere agli obblighi di legge; in mancanza non è possibile dare seguito al rapporto.', '#7. Diritti dell’interessato', 'Può chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporsi al trattamento (artt. 15-22), scrivendo a {{studio.email}}. Ha inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).', '', '{{luogo}}, {{oggi}}', '', 'Per presa visione ______________________') },
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
    numeriPagina: true, mostraLuogoData: !['Procura alle liti', 'Incarico professionale', 'Verbale', 'Informativa privacy'].includes(tipo), aggiornato: new Date().toISOString(),
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

export interface Compilazione { valori: Record<string, string>; luogo?: string }
/** HTML A4 del documento: intestazione ripetuta in ogni pagina, piè di pagina fisso in fondo, luogo e data per le lettere. */
export function documentoHtml(m: ModelloDocumento, c: Compilazione, anteprima = false): string {
  const v = c.valori
  const righe = (r: RigaModello[]) => righeHtml(r.map((x) => ({ ...x, testo: compila(x.testo, v) })), m)
  const corpoHtml = compila(pulisciHtml(m.corpo), v, true)
  const luogoData = m.mostraLuogoData ? [c.luogo || v.luogo || m.luogo, v.oggi || dataLunga()].filter(Boolean).join(', ') : ''
  const footer = `<div class="piede">${footerImmagineHtml(m)}${righe(m.footer)}</div>`
  const haTesta = !!m.logo || !vuoto(m.intestazione)
  return `<!doctype html><html lang="it"><head><meta charset="utf-8">${m.numeriPagina && !anteprima ? '<meta name="tio-numeri-pagina" content="1">' : ''}<title>${esc(compila(m.nome, v))}</title><style>
  ${fontFaceCss({ ...m, pagamento: [] })}
  @page{size:A4;margin:16mm 20mm ${m.numeriPagina ? 18 : 14}mm}*{box-sizing:border-box}
  body{font:11pt/1.5 ${famigliaFont(m.fontDocumento, m.fontPersonali)};color:#14202e;margin:0;${anteprima ? 'padding:16mm 20mm 14mm;min-height:297mm;position:relative;' : ''}}
  .testa{padding-bottom:3.5mm;margin-bottom:7mm;border-bottom:1pt solid #9aa5b1}.luogo-data{text-align:right;margin:0 0 6mm}
  .corpo{text-align:${CSS_ALLINEA[m.allineamento || 'sinistra']};${m.allineamento === 'giustificato' ? 'hyphens:auto;' : ''}${m.colonne === 2 ? 'column-count:2;column-gap:9mm;' : ''}}.corpo h1,.corpo h2,.corpo h3{break-after:avoid}.corpo [data-colonne]{column-count:2;column-gap:9mm;margin:0 0 .55em}
  .corpo p{margin:0 0 .55em;orphans:3;widows:3}.corpo h1{font-size:18pt;margin:.6em 0 .35em}.corpo h2{font-size:13.5pt;margin:.9em 0 .3em;break-after:avoid}.corpo h3{font-size:12pt;margin:.8em 0 .3em;break-after:avoid}
  .corpo ul,.corpo ol{margin:0 0 .6em;padding-left:7mm}.corpo li{margin:0 0 .2em}mark{background:#fff3b0;color:inherit}
  .layout{width:100%;border-collapse:collapse}.layout>thead{display:table-header-group}.layout>tfoot{display:table-footer-group}.layout td{padding:0}.riserva{visibility:hidden}
  .piede{font-size:8pt;line-height:1.4;color:#536276;padding-top:4mm}
  footer{${anteprima ? 'position:absolute;left:20mm;right:20mm;bottom:12mm;' : 'position:fixed;left:0;right:0;bottom:0;'}}
  </style></head><body>
  ${anteprima ? '' : '<table class="layout"><thead><tr><td>'}${haTesta ? `<div class="testa">${logoHtml(m)}${righe(m.intestazione)}</div>` : ''}${anteprima ? '' : '</td></tr></thead><tbody><tr><td>'}
  ${luogoData ? `<p class="luogo-data">${esc(luogoData)}</p>` : ''}<div class="corpo">${corpoHtml}</div>
  ${anteprima ? '' : `</td></tr></tbody><tfoot><tr><td><div class="riserva" aria-hidden="true">${footer}</div></td></tr></tfoot></table>`}
  <footer>${footer}</footer></body></html>`
}

// ------------------------------------------------------------------ esportazione (Word, OpenDocument, RTF…)

/** Immagine del modello in PNG (Word e RTF accettano PNG e JPEG; SVG e WebP si convertono qui). */
async function png(src: string | null | undefined, altezza: number, allineamento: string) {
  if (!src) return null
  const img = await new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src })
  if (!img || !img.naturalWidth) return null
  const h = Math.max(16, Math.min(200, altezza)), w = Math.round(img.naturalWidth * h / img.naturalHeight)
  let dati = src
  if (!src.startsWith('data:image/png;base64,')) {
    const c = document.createElement('canvas'); c.width = Math.max(1, w * 2); c.height = h * 2
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); dati = c.toDataURL('image/png')
  }
  return { png: dati.slice('data:image/png;base64,'.length), larghezza: Math.min(w, 600), altezza: h, allineamento: allineamento === 'destra' ? 'destra' : allineamento === 'sinistra' ? 'sinistra' : 'centro' }
}

/** Struttura neutra che il processo principale trasforma in .docx, .odt, .rtf, .html, .md o .txt. */
export async function documentoEsportabile(m: ModelloDocumento, c: Compilazione) {
  const v = c.valori
  const righe = (r: RigaModello[]) => r.map((x) => ({ ...x, testo: compila(x.testo, v) })).filter((x) => x.testo.trim())
  const corpoBlocchi = blocchiDaHtml(compila(pulisciHtml(m.corpo), v, true).replace(/<mark>|<\/mark>/g, ''))
  const luogoData = m.mostraLuogoData ? [c.luogo || v.luogo || m.luogo, v.oggi || dataLunga()].filter(Boolean).join(', ') : ''
  const font = FONT_DOCUMENTO.find((f) => f.id === m.fontDocumento)?.nome || m.fontPersonali?.find((f) => f.id === m.fontDocumento)?.nome || 'Arial'
  return {
    titolo: compila(m.nome, v), font, numeriPagina: m.numeriPagina, allineamento: m.allineamento || 'sinistra', colonne: m.colonne === 2 ? 2 : 1,
    intestazione: righe(m.intestazione), footer: righe(m.footer),
    logo: await png(m.logo, m.logoAltezza, m.logoAllineamento),
    immagineFooter: await png(m.immagineFooter, m.immagineFooterAltezza ?? 36, m.immagineFooterAllineamento || 'centro'),
    corpo: [...(luogoData ? [{ tipo: 'p' as const, allineamento: 'destra' as const, runs: [{ t: luogoData }] }] : []), ...corpoBlocchi],
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
