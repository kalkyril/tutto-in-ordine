// Anonimizzazione reversibile dei dati personali, sul computer dell'utente.
//
// La rete di espressioni regolari e checksum (CF anche omocodico, IBAN con il formato di stampa a gruppi,
// partita IVA, carte con il Luhn e la scadenza attaccata, telefoni, targhe, URL, IP, codici degli atti) e
// la fusione dei candidati derivano da rizzo-pii di Simone Rizzo — Rizzo AI Academy (licenza MIT,
// https://github.com/Rizzo-AI-Academy/rizzo-pii). Il testo della licenza è in THIRD_PARTY_NOTICES.md.
//
// Rizzo PII affianca le regex con un modello linguistico da 0,3 miliardi di parametri. TIO non lo include
// (occuperebbe più di 1 GB) e lo sostituisce con ciò che un gestionale sa già: i nomi, i codici e i recapiti
// di clienti e controparti dell'archivio, le formule degli atti italiani («nato a… il…», «residente in…»,
// titoli come Avv. o Sig.ra), i nomi propri più diffusi e la propagazione di ogni nome trovato a tutte le
// sue occorrenze, anche col solo cognome.

export type Tag =
  | 'FULLNAME' | 'ORG' | 'CF' | 'PIVA' | 'IBAN' | 'CREDITCARDNUMBER' | 'EMAIL' | 'TELEPHONENUM'
  | 'STREET' | 'ZIPCODE' | 'CITY' | 'PROVINCE' | 'DATE' | 'TIME' | 'AGE' | 'AMOUNT' | 'TARGA'
  | 'ID_DOC' | 'DOCID' | 'CATASTO' | 'URL' | 'IPADDR'

export type Fonte = 'regex' | 'contesto' | 'archivio' | 'nomi' | 'manuale' | 'propagazione'

/** Etichette in italiano, nell'ordine in cui compaiono nella legenda. */
export const TAGS: { tag: Tag; nome: string; esempio: string }[] = [
  { tag: 'FULLNAME', nome: 'Nomi di persona', esempio: 'Mario Rossi' },
  { tag: 'ORG', nome: 'Società e studi', esempio: 'Edilnord S.r.l.' },
  { tag: 'CF', nome: 'Codici fiscali', esempio: 'RSSMRA85H12F205Y' },
  { tag: 'PIVA', nome: 'Partite IVA', esempio: '12345678903' },
  { tag: 'IBAN', nome: 'IBAN', esempio: 'IT60 X054 2811 1010 …' },
  { tag: 'CREDITCARDNUMBER', nome: 'Carte di pagamento', esempio: '4111 1111 1111 1111' },
  { tag: 'EMAIL', nome: 'Email e PEC', esempio: 'm.rossi@pec.it' },
  { tag: 'TELEPHONENUM', nome: 'Telefoni', esempio: '+39 333 1234567' },
  { tag: 'STREET', nome: 'Indirizzi', esempio: 'Via Garibaldi n. 10' },
  { tag: 'ZIPCODE', nome: 'CAP', esempio: '41121' },
  { tag: 'CITY', nome: 'Città di nascita e residenza', esempio: 'Modena' },
  { tag: 'PROVINCE', nome: 'Province', esempio: '(MO)' },
  { tag: 'DATE', nome: 'Date', esempio: '12/06/1985' },
  { tag: 'TIME', nome: 'Orari', esempio: 'ore 15:30' },
  { tag: 'AGE', nome: 'Età', esempio: 'di anni 45' },
  { tag: 'AMOUNT', nome: 'Importi', esempio: '€ 12.500,00' },
  { tag: 'TARGA', nome: 'Targhe', esempio: 'AB 123 CD' },
  { tag: 'ID_DOC', nome: 'Documenti d’identità', esempio: 'C.I. CA12345AB' },
  { tag: 'DOCID', nome: 'Numeri di atti e protocolli', esempio: 'R.G. 1234/2024' },
  { tag: 'CATASTO', nome: 'Dati catastali', esempio: 'foglio 12, particella 345' },
  { tag: 'URL', nome: 'Siti web', esempio: 'www.esempio.it' },
  { tag: 'IPADDR', nome: 'Indirizzi IP', esempio: '192.168.1.10' },
]
export const NOME_TAG = Object.fromEntries(TAGS.map((t) => [t.tag, t.nome])) as Record<Tag, string>

export interface Entita { tag: Tag; start: number; end: number; score: number; validata: boolean; fonte: Fonte; chiave?: string }
export interface Segmento { t: string; tag?: Tag; ph?: string; fonte?: Fonte; validata?: boolean; chiave?: string }
export interface Voce { testo: string; tag: Tag }
export interface Risultato {
  segmenti: Segmento[]
  testo: string
  mappa: Record<string, string>
  conteggi: Partial<Record<Tag, number>>
  entita: number
  uniche: number
}
export interface Opzioni {
  esclusi?: Iterable<Tag>
  /** voci note (archivio di TIO): sempre anonimizzate, in ogni forma in cui compaiono */
  archivio?: Voce[]
  /** aggiunte a mano dall'utente */
  manuali?: Voce[]
  /** valori che l'utente ha deciso di lasciare in chiaro (confronto senza maiuscole e spazi) */
  ignorati?: Iterable<string>
  /** false: anonimizzazione definitiva, senza dizionario di ripristino */
  reversibile?: boolean
}

// ------------------------------------------------------------------ checksum (da rizzo-pii)

export function ibanOk(s: string): boolean {
  const c = s.replace(/[\s.-]/g, '').toUpperCase()
  if (c.length < 15 || c.length > 34 || !/^[A-Z0-9]+$/.test(c)) return false
  const r = c.slice(4) + c.slice(0, 4)
  let resto = 0
  for (const ch of r) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of v) resto = (resto * 10 + Number(d)) % 97
  }
  return resto === 1
}

export function pivaOk(p: string): boolean {
  const d = p.replace(/\D/g, '')
  if (d.length !== 11) return false
  let t = 0
  for (let i = 0; i < 10; i++) {
    const c = Number(d[i])
    if (i % 2 === 0) t += c
    else { const x = c * 2; t += x > 9 ? x - 9 : x }
  }
  return (10 - (t % 10)) % 10 === Number(d[10])
}

const CF_DISPARI: Record<string, number> = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17,
  I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
}
export function cfOk(s: string): boolean {
  const c = s.trim().toUpperCase()
  if (!/^[A-Z0-9]{16}$/.test(c)) return false
  let t = 0
  for (let i = 0; i < 15; i++) {
    const ch = c[i]
    t += i % 2 === 0 ? CF_DISPARI[ch] : /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65
  }
  return String.fromCharCode(65 + (t % 26)) === c[15]
}

export function luhnOk(s: string): boolean {
  const d = s.replace(/\D/g, '')
  if (d.length < 13 || d.length > 19) return false
  let tot = 0, alt = false
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i])
    if (alt) { n *= 2; if (n > 9) n -= 9 }
    tot += n; alt = !alt
  }
  return tot % 10 === 0
}

// ------------------------------------------------------------------ rete regex (da rizzo-pii)

type Validatore = ((s: string) => boolean) | null
// [tag, regex, validatore, strict]: strict scarta il candidato se il checksum fallisce
const RILEVATORI: [Tag, RegExp, Validatore, boolean][] = [
  ['EMAIL', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, null, true],
  ['CF', /\b[A-Za-z]{6}\d{2}[A-Za-z]\d{2}[A-Za-z]\d{3}[A-Za-z]\b/g, cfOk, false],
  // omocodia: le cifre diventano lettere (0→L … 9→V); la forma da sola è generica, quindi checksum obbligatorio
  ['CF', /\b[A-Za-z]{6}[\dLMNPQRSTUVlmnpqrstuv]{2}[A-Za-z][\dLMNPQRSTUVlmnpqrstuv]{2}[A-Za-z][\dLMNPQRSTUVlmnpqrstuv]{3}[A-Za-z]\b/g, cfOk, true],
  ['IBAN', /\b[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}\b/g, ibanOk, true],
  ['CREDITCARDNUMBER', /(?<!\d)\d(?:[ .-]?\d){12,18}(?!\d)/g, luhnOk, true],
  ['PIVA', /(?<!\d)\d{11}(?!\d)/g, pivaOk, true],
  ['TELEPHONENUM', /(?<![\w.])(?:\+39[\s.-]?)?(?:3\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}|0\d{1,3}[\s.-]?\d{5,8})(?!\w)/g, null, true],
  ['AMOUNT', /(?:€|EUR\b|euro\b)\s?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d{1,3}(?:\.\d{3})*,\d{2}\s?(?:€|EUR\b|euro\b)/gi, null, true],
  ['TARGA', /\b[A-Za-z]{2}[\s-]?\d{3}[\s-]?[A-Za-z]{2}\b/g, null, true],
  ['URL', /(?:https?|ftp):\/\/[^\s<>"']+|www\.[A-Za-z0-9\-._~%]+\.[A-Za-z]{2,}(?:\/[^\s<>"']*)?|\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+(?:it|com|net|org|eu|info|io|dev|app|gov|edu|cloud|online|site|blog)\b(?:\/[^\s<>"']*)?/gi, null, true],
  ['IPADDR', /\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?:\/(?:3[0-2]|[12]?\d))?(?:\s*-\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})?\b/g, null, true],
  // la sigla rende riconoscibile il numero dell'atto: senza, «1234/2024» potrebbe essere una frazione o un articolo
  ['DOCID', /\b(?:R\.?\s?G\.?\s*N\.?\s?R\.?|R\.?\s?G\.?(?=[\s\d])|RG|Prot\.?|protocollo|Rep\.?|repertorio|Racc\.?|raccolta|sentenza|decreto(?:\s+ingiuntivo)?|ordinanza|fattura|polizza|CIG|CUP|matricola)(?:\s*(?:n\.?|num\.?|nro\.?|numero)\s*°?)?\s*:?\s*\d{1,8}(?:[/-]\d{2,4})?\b/gi, null, true],
  ['DATE', /(?<!\d)(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}(?:\s+\d{1,2}[:.]\d{2})?(?!\d)/g, null, true],
]
// forma senza checksum: in fusione non prevale su un candidato più specifico
const REGEX_DEBOLI = new Set<Tag>(['DATE'])
const URL_CODA = '.,;:!?)]}»"\''

// ISO 13616: lunghezza dell'IBAN per paese, serve a capire dove finisce quando è stampato a gruppi
const IBAN_LEN: Record<string, number> = Object.fromEntries(('AD24 AE23 AL28 AT20 AZ28 BA20 BE16 BG22 BH22 BI27 BR29 BY28 CH21 CR22 CY28 CZ24 '
  + 'DE22 DJ27 DK18 DO28 EE20 EG29 ES24 FI18 FK18 FO18 FR27 GB22 GE22 GI23 GL18 GR27 GT28 HN28 HR21 HU28 IE22 IL23 IQ23 IS26 IT27 '
  + 'JO30 KW30 KZ20 LB28 LC32 LI21 LT20 LU20 LV21 LY25 MC27 MD24 ME22 MK19 MN20 MR27 MT31 MU30 NI28 NL18 NO15 OM23 PK24 PL28 PS29 '
  + 'PT25 QA29 RO24 RS22 RU33 SA24 SC31 SD18 SE24 SI19 SK24 SM27 SO23 ST25 SV28 TL23 TN24 TR26 UA29 VA22 VG24 XK20 YE30')
  .split(' ').map((c) => [c.slice(0, 2), Number(c.slice(2))]))
const alnumAscii = (c: string | undefined) => !!c && /^[A-Za-z0-9]$/.test(c)

/** IBAN scritto a gruppi («IT60 X054 2811 …»): si consumano esattamente i caratteri previsti per il paese. */
function rilevaIbanStampato(testo: string): Entita[] {
  const out: Entita[] = []
  for (const m of testo.matchAll(/(?<![A-Za-z0-9])[A-Za-z]{2}\d{2}/g)) {
    const n = IBAN_LEN[m[0].slice(0, 2).toUpperCase()]
    let i = m.index!
    if (!n) continue
    const start = i
    let chars = 0, sep = 0, run = 0, aCapo = 0, gruppi = false
    while (i < testo.length && chars < n) {
      const c = testo[i]
      if (alnumAscii(c)) { chars++; run++; sep = 0 }
      else if (sep < 3 && run <= 5 && (c === '.' || c === '-' || /\s/.test(c))) {
        sep++; run = 0; gruppi = true
        if (/\s/.test(c) && c !== ' ' && c !== '\t' && c !== ' ' && ++aCapo > 1) break
      } else break
      i++
    }
    if (chars < n || alnumAscii(testo[i])) continue
    if (gruppi) {
      const g = testo.slice(start, i).split(/[\s.-]+/).filter(Boolean)
      if (new Set(g.slice(0, -1).map((x) => x.length)).size > 1 || g[g.length - 1].length > g[0].length) continue
    }
    if (ibanOk(testo.slice(start, i))) out.push({ tag: 'IBAN', start, end: i, score: 1, validata: true, fonte: 'regex' })
  }
  return out
}

/** La scadenza attaccata alla carta («4111 1111 1111 1111 12/26») farebbe fallire il Luhn: si riprova senza. */
function cartaSenzaScadenza(testo: string, start: number, end: number): [number, boolean] {
  const s = testo.slice(start, end)
  const cifre = [...s].flatMap((c, i) => (/\d/.test(c) ? [i] : []))
  for (const n of [19, 18, 17, 16, 15, 14, 13]) {
    const coda = cifre.length - n
    if (coda <= 0 || coda > 4) continue
    const taglio = cifre[n - 1] + 1
    const resto = s.slice(taglio).replace(/\D/g, '')
    if (' .-'.includes(s[taglio]) && resto.length >= 2 && Number(resto.slice(0, 2)) >= 1 && Number(resto.slice(0, 2)) <= 12 && luhnOk(s.slice(0, taglio))) return [start + taglio, true]
  }
  return [end, false]
}

export function rilevaRegex(testo: string): Entita[] {
  const out = rilevaIbanStampato(testo)
  for (const [tag, re, valida, strict] of RILEVATORI) {
    re.lastIndex = 0
    for (const m of testo.matchAll(re)) {
      let start = m.index!, end = start + m[0].length
      if (tag === 'URL') { while (end > start && URL_CODA.includes(testo[end - 1])) end--; if (end <= start) continue }
      let ok = valida ? valida(m[0]) : false
      if (!ok && tag === 'CREDITCARDNUMBER') [end, ok] = cartaSenzaScadenza(testo, start, end)
      if (valida && strict && !ok) continue
      out.push({ tag, start, end, score: ok ? 1 : 0.9, validata: ok, fonte: 'regex' })
    }
  }
  return out
}

// ------------------------------------------------------------------ contesto degli atti italiani (TIO)

const MAIUSC = 'A-ZÀ-ÖØ-Ý'
const MINUSC = 'a-zß-öø-ÿ'
// una parola di nome: «Rossi», «D'Amico», «ROSSI», «De» dentro un cognome composto
const PAROLA = `(?:[${MAIUSC}][${MINUSC}]+(?:['’][${MAIUSC}][${MINUSC}]+)?|[${MAIUSC}]{2,}(?:['’][${MAIUSC}]+)?)`
const PARTICELLA = `(?:De|Di|Del|Della|Dei|Da|Dal|Dalla|La|Lo|Li|Van|Von|D['’])`
const NOME = `${PAROLA}(?:\\s+(?:${PARTICELLA}\\s*)?${PAROLA}){0,3}`
// parole con l'iniziale maiuscola che non sono nomi: aprono frasi e titoli degli atti
const NON_NOMI = new Set(('Il La Lo Le Gli I Un Una Uno Con Per Del Della Dei Delle Nel Nella Sul Sulla Al Alla Ai Alle Dal Dalla Da In Di Che Se Ma E Ed O '
  + 'Tribunale Corte Giudice Procura Repubblica Ufficio Ministero Comune Regione Provincia Stato Cassazione Appello Tar Consiglio Agenzia Entrate '
  + 'Oggetto Spett Spettabile Egregio Gentile Gent Caro Cara Premesso Considerato Ritenuto Visto Vista Visti PQM Firma Data Luogo Pagina Allegato Allegati '
  + 'Ricorso Atto Citazione Comparsa Memoria Sentenza Decreto Ordinanza Verbale Udienza Contratto Procura Mandato Diffida Lettera Preventivo Fattura '
  + 'Euro Iva IVA Cap CAP Via Viale Piazza Corso Largo Tel Fax Email Mail PEC Cod Codice Fiscale Partita Nato Nata Residente Domiciliato Domiciliata '
  + 'Lunedì Martedì Mercoledì Giovedì Venerdì Sabato Domenica Gennaio Febbraio Marzo Aprile Maggio Giugno Luglio Agosto Settembre Ottobre Novembre Dicembre '
  + 'Avv Avvocato Dott Dottor Dottoressa Sig Signor Signora Sigra Ing Arch Geom Rag Prof Notaio Studio Legale Società Srl Spa Snc Sas Ditta '
  + 'Foro Ordine Collegio Camera Sezione Cancelleria Ricorrente Resistente Attore Attrice Convenuto Convenuta Parte Parti Cliente Controparte Sottoscritto Sottoscritta Imputato Imputata Teste Testimone '
  + 'Totale Importo Compenso Spese Onorari Netto Saldo Acconto Nota Note Articolo Art Legge Codice Civile Penale Dlgs DPR Gazzetta Ufficiale Italia Italiana').split(' '))
const parolaNome = (w: string) => !NON_NOMI.has(w.replace(/['’.]/g, '')) && !NON_NOMI.has(w.charAt(0) + w.slice(1).toLowerCase())

// i nomi propri più diffusi in Italia (ISTAT): un nome seguito da una parola maiuscola è quasi sempre una persona
const NOMI_PROPRI = new Set(('Mario Giuseppe Giovanni Antonio Luigi Francesco Angelo Vincenzo Pietro Salvatore Carlo Franco Domenico Bruno Paolo Michele Giorgio Aldo '
  + 'Sergio Luciano Roberto Stefano Andrea Marco Alessandro Matteo Lorenzo Leonardo Gabriele Riccardo Davide Federico Simone Luca Giacomo Tommaso '
  + 'Edoardo Filippo Emanuele Daniele Fabio Massimo Maurizio Claudio Enrico Alberto Gianluca Gianni Giancarlo Gianfranco Massimiliano Alessio Nicola '
  + 'Cristian Christian Diego Emilio Enzo Ettore Fabrizio Flavio Gino Guido Ivan Jacopo Manuel Marcello Mattia Mauro Mirko Nicolò Niccolò Omar Raffaele '
  + 'Renato Renzo Rocco Samuele Sandro Silvio Umberto Valerio Vittorio Walter Alfredo Arturo Cesare Dario Elia Ernesto Fausto Gabriel Gregorio Ignazio '
  + 'Lino Lucio Marino Nello Orazio Osvaldo Pasquale Piero Pierluigi Pierpaolo Rino Romano Rosario Ruggero Severino Tiziano Ugo Valentino Vito Gaetano Carmine Ciro Gennaro Biagio Calogero Corrado Cosimo Saverio '
  + 'Maria Anna Giuseppina Rosa Angela Giovanna Teresa Lucia Carmela Caterina Francesca Antonietta Carla Elena Concetta Rita Margherita Franca Paola '
  + 'Sofia Giulia Aurora Alice Ginevra Emma Giorgia Greta Beatrice Anna Chiara Martina Sara Elisa Federica Silvia Valentina Alessandra Laura Barbara '
  + 'Cristina Daniela Elisabetta Emanuela Erica Erika Fabiana Gabriella Giada Ilaria Irene Lisa Lorena Luisa Manuela Marta Michela Monica Nadia Noemi '
  + 'Patrizia Raffaella Roberta Sabrina Serena Simona Stefania Tiziana Veronica Vittoria Viola Arianna Camilla Bianca Matilde Ludovica Rebecca Nicole '
  + 'Adele Agnese Alba Alessia Amalia Angelica Annalisa Antonella Assunta Benedetta Bruna Carolina Cecilia Claudia Clara Debora Denise Diana Donatella '
  + 'Eleonora Enrica Ester Eva Fiorella Flavia Gemma Gianna Gloria Grazia Ines Ivana Jessica Letizia Liliana Linda Lucrezia Maddalena Marina Marisa '
  + 'Ezio Ottavio Ottavia Adriano Adriana Alberto Alfonso Amedeo Amerigo Annibale Antonino Aurelio Bartolomeo Benedetto Bernardo Camillo Carmelo Celestino Ciro Clemente Costantino Damiano Danilo Dino Domenica Donato Duilio Egidio Elio Eligio Elvio Emiliano Ennio Eraldo Ermanno Eugenio Ezequiele Fedele Felice Ferdinando Ferruccio Filiberto Fiorenzo Franco Fulvio Gerardo Germano Giacinto Gianmarco Gianpaolo Giampiero Gigi Gilberto Giordano Giosuè Girolamo Giuliano Giulio Graziano Guglielmo Igor Italo Leandro Lelio Leone Leopoldo Livio Loris Luciano Ludovico Manfredi Marcello Mariano Martino Mattia Mirco Moreno Natale Nazzareno Nevio Nino Olindo Oreste Orlando Ottaviano Palmiro Patrizio Pio Primo Quirino Raimondo Remo Riccardo Rinaldo Roberto Rodolfo Rolando Romeo Romolo Rubens Sabatino Santo Sebastiano Secondo Settimio Silvano Siro Stelio Taddeo Teodoro Tito Tullio Ubaldo Uberto Ulisse Valter Vasco Venanzio Vinicio Virgilio Zeno Ada Agata Agostina Albina Alda Alessia Alma Amelia Angiola Annamaria Annunziata Antonia Arabella Aurelia Bettina Brigida Camelia Candida Carlotta Carmen Catia Celeste Clelia Clotilde Concetta Cinzia Costanza Dalila Delia Desirée Dina Dora Edda Elda Elisa Elvira Emilia Enza Ermelinda Ersilia Eugenia Fabiola Fernanda Filomena Fiorenza Flora Fortunata Fulvia Gabriela Gaia Gelsomina Giacomina Gilda Gina Giuliana Giulietta Graziella Iolanda Isabella Ida Immacolata Ines Iris Isa Lea Leila Lia Licia Lidia Lina Livia Loredana Lucia Luciana Lucilla Luigia Maila Mara Marcella Mariangela Marianna Mariagrazia Mariarosa Marilena Marina Matilde Melissa Milena Mina Mirta Nadia Natalia Natalina Nerina Nives Norma Olga Olimpia Ombretta Orietta Ottavia Palma Pia Pierina Priscilla Regina Rina Romina Rosalba Rosaria Rosella Rosetta Rosina Sabina Samanta Samantha Santina Selene Sibilla Silvana Simonetta Sveva Teodora Tina Tiziana Ursula Valeria Vanda Vania Velia Vincenza Viviana Zaira Zita '
  + 'Mirella Miriam Nicoletta Ornella Pamela Piera Rachele Renata Rossana Rossella Sandra Sonia Stella Susanna Tania Vanessa Vera Virginia Wanda Ilenia Lara Paolo').split(' '))

// titoli e ruoli che precedono un nome di persona
const TITOLO = String.raw`(?:sig(?:\.|nor|nora|\.ra|\.na)?|sigg\.|dott(?:\.|or|ore|oressa|\.ssa)?|dr\.?|avv(?:\.|\.to|ocato|ocatessa|ocata)?|ing(?:\.|egnere)?|arch(?:\.|itetto)?|geom(?:\.|etra)?|rag(?:\.|ioniere)?|prof(?:\.|essore|essoressa|\.ssa)?|p\.\s?i\.|per\.\s?ind\.|notaio|on\.|giudice|g\.i\.|g\.o\.p\.|consigliere|ctu|c\.t\.u\.|teste|testimone|perito|il\s+sottoscritto|la\s+sottoscritta|io\s+sottoscritt[oa]|sottoscritt[oa])`
// il titolo si riconosce senza badare alle maiuscole, il nome che segue no: «dott. Rossi», non «dott. vista»
const RE_TITOLO = new RegExp(String.raw`(?<![\p{L}])(?i:${TITOLO})\s+(${NOME})`, 'gu')
// «Mario Rossi, nato a», «ROSSI MARIO (C.F. …», «Rossi Mario, residente in»
const RE_PRIMA_DI = new RegExp(String.raw`(${NOME})(?=\s*,?\s*(?:\(?\s*(?:c\.?\s?f\.?|cod(?:ice|\.)\s+fisc(?:ale|\.)?)|nat[oa]\s+(?:a|il|in)\b|resident[ei]\b|domiciliat[oa]\b|c\.f\.))`, 'gu')
const RE_LUOGO = new RegExp(String.raw`\b(?:nat[oa]|resident[ei]|domiciliat[oa]|elettivamente\s+domiciliat[oa]|con\s+sede(?:\s+legale)?|sit[oa]|ubicat[oa])\s+(?:a|in|ad)\s+((?:[${MAIUSC}][${MINUSC}'’]+|[${MAIUSC}]{2,})(?:[\s-](?:sul|sulla|di|del|della|in|al|San|Santa|S\.|[${MAIUSC}][${MINUSC}'’]+|[${MAIUSC}]{2,})){0,3})(?:\s*\(([A-Z]{2})\))?`, 'gu')
const RE_CAP_CITTA = new RegExp(String.raw`(?<!\d)(\d{5})\s*[-–]?\s*((?:[${MAIUSC}][${MINUSC}'’]+|[${MAIUSC}]{2,})(?:[\s-](?:sul|sulla|di|del|della|San|Santa|[${MAIUSC}][${MINUSC}'’]+|[${MAIUSC}]{2,})){0,3})(?:\s*\(([A-Z]{2})\))?`, 'gu')
const RE_VIA = new RegExp(String.raw`(?<![\p{L}])(?i:via|viale|v\.le|piazza|p\.zza|p\.za|piazzale|p\.le|corso|c\.so|largo|vicolo|vico|strada|contrada|c\.da|località|loc\.|borgo|lungomare|lungotevere|galleria|salita|traversa|frazione|fraz\.)\s+(?:(?:dei|degli|delle|del|della|dello|di|de|da|al|alla|alle|ai|San|Santa|Sant['’]|S\.|[${MAIUSC}0-9][\p{L}0-9'’.]*)\s*){0,6}?(?:[${MAIUSC}0-9][\p{L}0-9'’.]*)(?:\s*,?\s*(?:n\.?\s*°?|nr\.?|num\.?|civ\.?|civico)?\s*\d+[A-Za-z]?(?:\/\s?[A-Za-z0-9]+)?)?`, 'gu')
const RE_ORG = new RegExp(String.raw`((?:(?:[${MAIUSC}0-9][\p{L}0-9&'’.-]*|&|e|di|del|della|dei|delle|de)\s+){0,5}[${MAIUSC}0-9][\p{L}0-9&'’.-]*)\s*,?\s*(?:S\.?\s?r\.?\s?l\.?(?:\s?s\.?)?(?:\s+unipersonale)?|S\.?\s?p\.?\s?A\.?|S\.?\s?n\.?\s?c\.?|S\.?\s?a\.?\s?s\.?|S\.?\s?s\.?|S\.?\s?c\.?\s?a\.?\s?r\.?\s?l\.?|soc\.?\s*coop\.?(?:\s+a\s+r\.?\s?l\.?)?|società\s+cooperativa|onlus|o\.n\.l\.u\.s\.|ETS|APS)(?![\p{L}])`, 'gu')
const RE_ORG_PREFISSO = new RegExp(String.raw`(?<![\p{L}])(?:Studio\s+(?:Legale|Notarile|Associato|Tecnico|Commerciale)|Banca|Ditta|Impresa|Associazione|Fondazione|Cooperativa|Società|Agenzia\s+(?:Immobiliare|Viaggi))\s+(?:(?:${PARTICELLA}\s*)?${PAROLA}|&)(?:\s+(?:(?:${PARTICELLA}\s*)?${PAROLA}|&|e)){0,4}`, 'gu')
const RE_ETA = /\b(?:di|dell['’]età\s+di|età(?:\s+di)?|anni|età:)\s*(\d{1,3})\s*(?:anni)?\b|\b(\d{1,3})\s*(?:-?\s*enne|anni\s+compiuti)\b/giu
const RE_ETA_DI_ANNI = /\bdi\s+anni\s+(\d{1,3})\b/giu
const RE_ORA = /\b(?:ore|alle|dalle|dalle\s+ore|alle\s+ore|h\.?)\s*((?:[01]?\d|2[0-3])[:.][0-5]\d)\b/giu
const MESI = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre'
const RE_DATA_TESTO = new RegExp(String.raw`\b(?:[1-9]|[12]\d|3[01])(?:°|º)?\s+(?:${MESI})\s+(?:19|20)\d{2}\b`, 'giu')
const RE_ID_DOC = new RegExp(String.raw`(?i:carta\s+d['’]\s?identit[àa]|c\.\s?i\.|c\.i\.e\.|passaporto|patente(?:\s+di\s+guida)?|tessera\s+sanitaria|permesso\s+di\s+soggiorno|documento(?:\s+di\s+riconoscimento)?)\s*(?i:(?:n\.|n°|nr\.?|num\.?|numero)\s*)?:?\s*([A-Z]{1,3}\s?\d{4,8}\s?[A-Z]{0,2}|\d{6,10}[A-Z]?|(?=[A-Z]*\d)[A-Z0-9]{8,10})\b`, 'gu')
const RE_CATASTO = /\b(?:foglio|fg\.?)\s*(?:n\.?\s*)?\d+\s*,?\s*(?:(?:particella|particelle|mappale|mappali|map\.?|part\.?|p\.lla|p\.lle|num\.?)\s*(?:n\.?\s*)?\d+(?:\s*(?:e|,)\s*\d+)*)\s*,?\s*(?:(?:subalterno|subalterni|sub\.?)\s*(?:n\.?\s*)?\d+(?:\s*(?:e|,)\s*\d+)*)?/giu

/** Candidati riconosciuti dalle formule ricorrenti di atti, lettere e contratti italiani. */
export function rilevaContesto(testo: string): Entita[] {
  const out: Entita[] = []
  const add = (tag: Tag, start: number, end: number, score = 0.85, fonte: Fonte = 'contesto') => { if (end > start) out.push({ tag, start, end, score, validata: false, fonte }) }
  // il nome resta dentro la span solo dalla prima parola che è davvero un nome
  const nome = (m: RegExpMatchArray, gruppo: number, score: number) => {
    const v = m[gruppo]; if (!v) return
    let s = m.index! + m[0].lastIndexOf(v)
    const parole = v.split(/\s+/)
    let i = 0
    while (i < parole.length && !parolaNome(parole[i])) { s += parole[i].length; while (/\s/.test(testo[s] || '')) s++; i++ }
    // dal primo nome fino alla prima parola che non lo è: «Bianchi del Foro» si ferma a «Bianchi»
    const fine = parole.slice(i).findIndex((w) => !parolaNome(w) && !new RegExp(`^${PARTICELLA}$`, 'u').test(w))
    let resto = fine < 0 ? parole.slice(i) : parole.slice(i, i + fine)
    while (resto.length && !parolaNome(resto[resto.length - 1])) resto = resto.slice(0, -1)
    // la span copre esattamente il testo originale, con gli stessi spazi e a capo
    if (resto.length) add('FULLNAME', s, trovaFine(testo, s, resto.length), score)
  }
  for (const m of testo.matchAll(RE_TITOLO)) nome(m, 1, 0.9)
  for (const m of testo.matchAll(RE_PRIMA_DI)) nome(m, 1, 0.8)
  // nome proprio comune + parola maiuscola, in entrambi gli ordini
  for (const m of testo.matchAll(new RegExp(String.raw`(?<![\p{L}])(${PAROLA})\s+(${PAROLA})(?:\s+(${PAROLA}))?`, 'gu'))) {
    const [a, b, c] = [m[1], m[2], m[3]]
    const cap = (w: string) => w.charAt(0) + w.slice(1).toLowerCase()
    const primo = NOMI_PROPRI.has(cap(a)), secondo = NOMI_PROPRI.has(cap(b))
    // «Risponde Giulia Bianchi»: con un nome proprio al secondo posto seguito da un cognome, la parola prima non fa parte del nome
    if (!primo && secondo && c && parolaNome(c) && !/^[A-ZÀ-Ý]{2,}$/.test(a)) {
      const s = m.index! + m[0].indexOf(b, a.length)
      let e = s + b.length + m[0].slice(m[0].indexOf(b, a.length) + b.length).indexOf(c) + c.length
      while (e > s && /\s/.test(testo[e - 1])) e--
      add('FULLNAME', s, e, 0.75, 'nomi')
      continue
    }
    if ((primo && parolaNome(b)) || (secondo && parolaNome(a))) {
      const s = m.index!
      let e = s + m[0].length
      if (c && !(parolaNome(c) && (NOMI_PROPRI.has(cap(c)) || /^[A-ZÀ-Ý]{2,}$/.test(c) === /^[A-ZÀ-Ý]{2,}$/.test(b)))) e = s + m[0].lastIndexOf(c)
      while (e > s && /\s/.test(testo[e - 1])) e--
      if (parolaNome(a) || primo) add('FULLNAME', s, e, 0.75, 'nomi')
    }
  }
  for (const m of testo.matchAll(RE_LUOGO)) {
    const v = m[1]; const s = m.index! + m[0].indexOf(v, m[0].search(/\s(?:a|in|ad)\s/) + 1)
    if (!parolaNome(v.split(/\s/)[0]) && !/^(?:Via|Viale|Piazza|Corso)$/.test(v.split(/\s/)[0])) continue
    if (/^(?:Via|Viale|Piazza|Corso|Largo|Vicolo|Strada|Località)\b/.test(v)) continue
    add('CITY', s, s + v.length, 0.85)
    if (m[2]) { const p = m.index! + m[0].lastIndexOf('(' + m[2]); add('PROVINCE', p + 1, p + 3, 0.85) }
  }
  for (const m of testo.matchAll(RE_CAP_CITTA)) {
    const s = m.index!
    add('ZIPCODE', s, s + 5, 0.85)
    const c = s + m[0].indexOf(m[2], 5)
    if (parolaNome(m[2].split(/\s/)[0]) || /^[A-Z]{2,}/.test(m[2])) add('CITY', c, c + m[2].length, 0.8)
    if (m[3]) { const p = s + m[0].lastIndexOf('(' + m[3]); add('PROVINCE', p + 1, p + 3, 0.85) }
  }
  for (const m of testo.matchAll(RE_VIA)) {
    // «via email», «in via preliminare»: dopo il tipo di strada serve una parola maiuscola o un numero
    const dopo = m[0].replace(/^\S+\s+/, '')
    if (!/^[\p{Lu}0-9]/u.test(dopo) || /^(?:PEC|SMS|E-?mail|Email)\b/i.test(dopo)) continue
    add('STREET', m.index!, m.index! + m[0].trimEnd().replace(/[,.]$/, '').length, 0.85)
  }
  for (const m of testo.matchAll(RE_ORG)) {
    const v = m[0]; let s = m.index!
    // l'inizio della ragione sociale: la prima parola maiuscola dopo eventuali parole comuni
    const parole = m[1].split(/\s+/)
    let k = 0
    while (k < parole.length - 1 && (!/^[\p{Lu}0-9&]/u.test(parole[k]) || NON_NOMI.has(parole[k]))) { s += parole[k].length; while (/\s/.test(testo[s] || '')) s++; k++ }
    add('ORG', s, m.index! + v.length, 0.85)
  }
  for (const m of testo.matchAll(RE_ORG_PREFISSO)) add('ORG', m.index!, m.index! + m[0].length, 0.8)
  for (const m of testo.matchAll(RE_ETA_DI_ANNI)) add('AGE', m.index!, m.index! + m[0].length, 0.85)
  for (const m of testo.matchAll(RE_ETA)) {
    if (/^di\s/i.test(m[0]) && !/anni/i.test(m[0])) continue // «di 5» da solo non è un'età
    if (/^anni\s/i.test(m[0])) continue
    add('AGE', m.index!, m.index! + m[0].length, 0.8)
  }
  for (const m of testo.matchAll(RE_ORA)) { const s = m.index! + m[0].lastIndexOf(m[1]); add('TIME', s, s + m[1].length, 0.85) }
  for (const m of testo.matchAll(RE_DATA_TESTO)) add('DATE', m.index!, m.index! + m[0].length, 0.85)
  for (const m of testo.matchAll(RE_ID_DOC)) { const s = m.index! + m[0].lastIndexOf(m[1]); add('ID_DOC', s, s + m[1].length, 0.9) }
  for (const m of testo.matchAll(RE_CATASTO)) if (/(?:particell|mappal|map|part|p\.ll|num)/i.test(m[0])) add('CATASTO', m.index!, m.index! + m[0].trimEnd().replace(/[,]$/, '').length, 0.9)
  return out
}

/** Fine della span che copre `n` parole a partire da `s`, mantenendo gli spazi originali. */
function trovaFine(testo: string, s: number, n: number): number {
  let i = s
  for (let k = 0; k < n; k++) {
    while (i < testo.length && /\s/.test(testo[i])) i++
    while (i < testo.length && !/\s/.test(testo[i])) i++
  }
  while (i > s && /[,;:.)]/.test(testo[i - 1]) && !/^[A-Z]\.$/.test(testo.slice(i - 2, i))) i--
  return i
}

// ------------------------------------------------------------------ voci note: archivio e aggiunte manuali

const normalizza = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('it')
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Forme in cui una voce nota può comparire: spazi e a capo liberi; per IBAN, carte, telefoni e codici anche i separatori. */
function reVoce(v: Voce): RegExp | null {
  const t = v.testo.trim()
  if (t.length < 3) return null
  const flessibile = ['IBAN', 'CREDITCARDNUMBER', 'TELEPHONENUM', 'PIVA', 'CF'].includes(v.tag)
  const corpo = flessibile
    ? [...t.replace(/[\s.-]/g, '')].map(escRe).join(String.raw`[\s.-]?`)
    : t.split(/\s+/).map(escRe).join(String.raw`\s+`)
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${corpo}(?![\p{L}\p{N}])`, 'giu')
}

function rilevaVoci(testo: string, voci: Voce[], fonte: Fonte, score: number): Entita[] {
  const out: Entita[] = []
  for (const v of voci) {
    const re = reVoce(v); if (!re) continue
    const chiave = `${v.tag}:${normalizza(v.testo)}`
    for (const m of testo.matchAll(re)) out.push({ tag: v.tag, start: m.index!, end: m.index! + m[0].length, score, validata: true, fonte, chiave })
  }
  return out
}

/** Per ogni persona trovata: le altre occorrenze del nome completo, il solo cognome e l'ordine «Cognome Nome». */
function propaga(testo: string, scelte: Entita[]): Entita[] {
  const out: Entita[] = []
  const viste = new Set<string>()
  for (const e of scelte) {
    if (e.tag !== 'FULLNAME' && e.tag !== 'ORG') continue
    const valore = testo.slice(e.start, e.end).replace(/\s+/g, ' ').trim()
    const chiave = e.chiave || `${e.tag}:${normalizza(valore)}`
    if (viste.has(chiave)) continue
    viste.add(chiave)
    const forme = [valore]
    if (e.tag === 'FULLNAME') {
      const parole = valore.split(' ').filter((w) => parolaNome(w))
      if (parole.length >= 2) {
        forme.push([...parole.slice(1), parole[0]].join(' '), [parole[parole.length - 1], ...parole.slice(0, -1)].join(' '))
        // il solo cognome, se è una parola distintiva e non un nome proprio comune
        const cognome = parole.find((w, i) => i > 0 && w.length >= 4 && !NOMI_PROPRI.has(w.charAt(0) + w.slice(1).toLowerCase()))
          ?? (parole.length === 2 && !NOMI_PROPRI.has(parole[0]) && parole[0].length >= 4 ? parole[0] : undefined)
        if (cognome) forme.push(cognome)
      }
    }
    for (const f of new Set(forme)) {
      const re = new RegExp(String.raw`(?<![\p{L}\p{N}])${f.split(' ').map(escRe).join(String.raw`\s+`)}(?![\p{L}\p{N}])`, 'gu')
      for (const m of testo.matchAll(re)) {
        // il cognome da solo vale solo con l'iniziale maiuscola: «Rossi», non «rossi»
        if (f !== valore && !/^\p{Lu}/u.test(m[0])) continue
        out.push({ tag: e.tag, start: m.index!, end: m.index! + m[0].length, score: 0.7, validata: false, fonte: 'propagazione', chiave })
      }
    }
  }
  return out
}

// ------------------------------------------------------------------ fusione (da rizzo-pii) e risultato

const priorita: Record<Fonte, number> = { manuale: 5, archivio: 4, regex: 3, contesto: 2, nomi: 1, propagazione: 0 }
const interna = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c)

/** Scelta greedy senza sovrapposizioni: checksum valido, fonte, punteggio, lunghezza. Poi allineamento alle parole. */
function fondi(tutti: Entita[], testo: string): Entita[] {
  // un candidato contenuto in uno più ampio della stessa categoria cede il posto: «R.G. 987/2026» copre anche la sigla
  const fine: Partial<Record<Tag, number>> = {}
  const cand = [...tutti].sort((a, b) => a.start - b.start || b.end - a.end).filter((e) => {
    if ((fine[e.tag] ?? -1) >= e.end) return false
    fine[e.tag] = Math.max(fine[e.tag] ?? -1, e.end); return true
  })
  const ordine = cand.sort((a, b) =>
    Number(b.validata) - Number(a.validata)
    || (priorita[b.fonte] - (REGEX_DEBOLI.has(b.tag) && b.fonte === 'regex' ? 2 : 0)) - (priorita[a.fonte] - (REGEX_DEBOLI.has(a.tag) && a.fonte === 'regex' ? 2 : 0))
    || b.score - a.score || (b.end - b.start) - (a.end - a.start))
  const tenute: Entita[] = []
  for (const e of ordine) {
    let lo = 0, hi = tenute.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tenute[mid].start <= e.start) lo = mid + 1; else hi = mid }
    if ((lo && tenute[lo - 1].end > e.start) || (lo < tenute.length && tenute[lo].start < e.end)) continue
    tenute.splice(lo, 0, { ...e })
  }
  for (const e of tenute) {
    while (e.start < e.end && /\s/.test(testo[e.start])) e.start++
    while (e.end > e.start && /\s/.test(testo[e.end - 1])) e.end--
    // una parola tagliata a metà lascerebbe in chiaro un pezzo ricostruibile: nel dubbio si maschera di più
    while (e.start > 0 && interna(testo[e.start - 1]) && interna(testo[e.start])) e.start--
    while (e.end < testo.length && interna(testo[e.end]) && interna(testo[e.end - 1])) e.end++
  }
  const ok = tenute.filter((e) => e.end > e.start).sort((a, b) => a.start - b.start || b.end - a.end)
  const unite: Entita[] = []
  for (const e of ok) {
    const u = unite[unite.length - 1]
    if (u && e.start < u.end) { u.end = Math.max(u.end, e.end); continue }
    if (u && e.start === u.end && e.tag === u.tag) { u.end = e.end; continue }
    unite.push(e)
  }
  return unite
}

/** Trova i dati personali e prepara il testo anonimizzato con segnaposto reversibili ([FULLNAME_1], [CF_1]…). */
export function anonimizza(testo: string, o: Opzioni = {}): Risultato {
  const esclusi = new Set(o.esclusi || [])
  const ignorati = new Set([...(o.ignorati || [])].map(normalizza))
  const reversibile = o.reversibile !== false
  const manuali = rilevaVoci(testo, o.manuali || [], 'manuale', 1)
  const base = [...manuali, ...rilevaVoci(testo, o.archivio || [], 'archivio', 1), ...rilevaRegex(testo), ...rilevaContesto(testo)]
  const valido = (e: Entita) => !esclusi.has(e.tag) && !ignorati.has(normalizza(testo.slice(e.start, e.end)))
  const primo = fondi(base.filter(valido), testo)
  const tutte = fondi([...base, ...propaga(testo, primo)].filter(valido), testo)

  // la stessa persona ha un solo segnaposto: «Mario Rossi», «ROSSI MARIO», «sig. Rossi»
  const parole = (v: string) => normalizza(v).split(' ').filter((w) => w.length > 1)
  const persona = (v: string) => 'FULLNAME:' + [...parole(v)].sort().join(' ')
  const alias = new Map<string, string | null>()
  for (const e of tutte) {
    if (e.tag !== 'FULLNAME') continue
    const p = parole(testo.slice(e.start, e.end)); if (p.length < 2) continue
    for (const w of p) if (w.length >= 4 && !NOMI_PROPRI.has(w.charAt(0).toUpperCase() + w.slice(1))) alias.set(w, alias.has(w) && alias.get(w) !== persona(testo.slice(e.start, e.end)) ? null : persona(testo.slice(e.start, e.end)))
  }
  const chiaveDi = (e: Entita, valore: string) => {
    if (e.tag !== 'FULLNAME' || (e.fonte === 'manuale' && !e.chiave)) return e.chiave && e.fonte !== 'manuale' ? e.chiave : `${e.tag}:${normalizza(valore)}`
    const p = parole(valore)
    return p.length === 1 && alias.get(p[0]) ? alias.get(p[0])! : persona(valore)
  }
  // stesso valore (o stessa persona) → stesso segnaposto
  const contatori: Partial<Record<Tag, number>> = {}, visti = new Map<string, string>(), mappa: Record<string, string> = {}
  const conteggi: Partial<Record<Tag, number>> = {}
  const segmenti: Segmento[] = []
  const anon: string[] = []
  let pos = 0
  for (const e of tutte) {
    const valore = testo.slice(e.start, e.end)
    const chiave = chiaveDi(e, valore)
    let ph = visti.get(chiave)
    if (!ph) {
      contatori[e.tag] = (contatori[e.tag] || 0) + 1
      ph = `[${e.tag}_${contatori[e.tag]}]`
      visti.set(chiave, ph)
      if (reversibile) mappa[ph] = valore.replace(/\s+/g, ' ')
    }
    if (e.start > pos) { segmenti.push({ t: testo.slice(pos, e.start) }); anon.push(testo.slice(pos, e.start)) }
    segmenti.push({ t: valore, tag: e.tag, ph, fonte: e.fonte, validata: e.validata, chiave })
    anon.push(ph)
    conteggi[e.tag] = (conteggi[e.tag] || 0) + 1
    pos = e.end
  }
  if (pos < testo.length) { segmenti.push({ t: testo.slice(pos) }); anon.push(testo.slice(pos)) }
  return { segmenti, testo: anon.join(''), mappa, conteggi, entita: tutte.length, uniche: visti.size }
}

/** Rimette i valori originali al posto dei segnaposto, anche se l'IA li ha riscritti senza parentesi o con spazi. */
export function ripristina(testo: string, mappa: Record<string, string>): { testo: string; sostituiti: number; mancanti: string[] } {
  let sostituiti = 0
  const usati = new Set<string>()
  const out = testo.replace(/\[\s*([A-Z_]+?)_(\d+)\s*\]|(?<![\w[])([A-Z][A-Z_]*?)_(\d+)(?![\w\]])/g, (tutto, t1, n1, t2, n2) => {
    const ph = `[${t1 || t2}_${n1 || n2}]`
    if (!(ph in mappa)) return tutto
    sostituiti++; usati.add(ph)
    return mappa[ph]
  })
  return { testo: out, sostituiti, mancanti: Object.keys(mappa).filter((k) => !usati.has(k)) }
}

/** Istruzioni da anteporre al testo quando lo si incolla in un assistente di intelligenza artificiale. */
export const ISTRUZIONI_IA = 'Nel testo che segue i dati personali sono stati sostituiti da segnaposto tra parentesi quadre, come [FULLNAME_1] o [CF_1]. '
  + 'Quando rispondi riporta i segnaposto esattamente come sono scritti, senza tradurli, modificarli o inventare i valori: li ripristinerò io sul mio computer.\n\n'

/** Voci note ricavate dall'archivio: clienti, controparti, pratiche e, se richiesto, lo studio. */
export function vociArchivio(d: {
  anagrafica: { tipo?: string | null; denominazione?: string | null; codice_fiscale?: string | null; partita_iva?: string | null; email?: string | null; pec?: string | null; telefono?: string | null; indirizzo?: string | null; citta?: string | null; cap?: string | null }[]
  pratiche: { rg?: string | null; giudice?: string | null }[]
  studio?: Record<string, any> | null
}): Voce[] {
  const v: Voce[] = []
  const add = (testo: string | null | undefined, tag: Tag) => { const t = (testo || '').trim(); if (t.length >= 3) v.push({ testo: t, tag }) }
  const persona = (nome: string | null | undefined, azienda: boolean) => {
    const n = (nome || '').trim(); if (!n) return
    add(n, azienda ? 'ORG' : 'FULLNAME')
  }
  for (const a of d.anagrafica) {
    persona(a.denominazione, a.tipo === 'azienda')
    add(a.codice_fiscale, 'CF'); add(a.partita_iva, 'PIVA'); add(a.email, 'EMAIL'); add(a.pec, 'EMAIL'); add(a.telefono, 'TELEPHONENUM'); add(a.indirizzo, 'STREET')
  }
  for (const p of d.pratiche) { add(p.rg, 'DOCID'); persona((p.giudice || '').replace(/^(?:dott\.?(?:ssa)?|dr\.?|giudice)\s+/i, ''), false) }
  if (d.studio) {
    const s = d.studio
    persona(s.nome, /\b(?:studio|associat|società|s\.?\s?r\.?\s?l|s\.?\s?p\.?\s?a|s\.?\s?n\.?\s?c|s\.?\s?a\.?\s?s|ditta|impresa)\b/i.test(s.nome || '')); add(s.titolare, 'FULLNAME'); add(s.cf, 'CF'); add(s.piva, 'PIVA'); add(s.email, 'EMAIL'); add(s.pec, 'EMAIL'); add(s.telefono, 'TELEPHONENUM'); add(s.indirizzo, 'STREET'); add(s.iban, 'IBAN')
  }
  // più lunghe prima: «Mario Rossi S.r.l.» prevale su «Mario Rossi»
  return v.sort((a, b) => b.testo.length - a.testo.length)
}

/**
 * Segnaposto coerenti su più documenti (Anonimizza in blocco): la stessa persona o lo stesso codice ha lo stesso segnaposto in
 * tutti i file della pratica, e una sola chiave di ripristino vale per tutti.
 */
export class Uniformatore {
  private contatori: Partial<Record<Tag, number>> = {}
  private chiavi = new Map<string, string>()
  mappa: Record<string, string> = {}
  applica(r: Risultato): Risultato {
    const conteggi: Partial<Record<Tag, number>> = {}
    const segmenti = r.segmenti.map((s) => {
      if (!s.tag) return s
      const chiave = s.chiave || `${s.tag}:${normalizza(s.t)}`
      let ph = this.chiavi.get(chiave)
      if (!ph) {
        this.contatori[s.tag] = (this.contatori[s.tag] || 0) + 1
        ph = `[${s.tag}_${this.contatori[s.tag]}]`
        this.chiavi.set(chiave, ph)
        if (s.ph && s.ph in r.mappa) this.mappa[ph] = r.mappa[s.ph]
      }
      conteggi[s.tag] = (conteggi[s.tag] || 0) + 1
      return { ...s, ph }
    })
    const mappa = Object.fromEntries(segmenti.filter((s) => s.tag && s.ph && s.ph in this.mappa).map((s) => [s.ph!, this.mappa[s.ph!]]))
    return { ...r, segmenti, testo: segmenti.map((s) => (s.tag ? s.ph : s.t)).join(''), mappa, conteggi }
  }
}
