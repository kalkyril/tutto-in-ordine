'use strict'
// Importazione guidata da file (CSV/Excel) e da cartelle di documenti. SOLA LETTURA sui file di origine: vengono solo letti e collegati,
// mai modificati, spostati o cancellati. Rilanciando l'importazione i dati già presenti non vengono duplicati.
const fs = require('node:fs')
const path = require('node:path')
const db = require('./db')
const docfile = require('./docfile')
const { leggiTabella } = require('./tabelle')
const crypto = require('node:crypto')
const { safeName } = require('./files')

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const pad = (n) => String(n).padStart(2, '0')

// ---------------- campi importabili e sinonimi delle intestazioni ----------------
const CAMPI = {
  anagrafica: [
    { k: 'denominazione', et: 'Nome / Ragione sociale', sin: ['denominazione', 'ragione sociale', 'nominativo', 'nome e cognome', 'cognome e nome', 'cognome nome', 'anagrafica', 'soggetto', 'nome completo', 'cliente', 'intestatario'] },
    { k: 'cognome', et: 'Cognome', sin: ['cognome'] }, { k: 'nome', et: 'Nome', sin: ['nome'] },
    { k: 'codice_fiscale', et: 'Codice fiscale', sin: ['codice fiscale', 'c f', 'cf', 'cod fiscale', 'cod fisc', 'codice fisc'] },
    { k: 'partita_iva', et: 'Partita IVA', sin: ['partita iva', 'p iva', 'piva', 'part iva', 'partita i v a'] },
    { k: 'email', et: 'Email', sin: ['email', 'e mail', 'mail', 'posta elettronica', 'indirizzo email'] },
    { k: 'pec', et: 'PEC', sin: ['pec', 'posta elettronica certificata', 'email pec', 'indirizzo pec'] },
    { k: 'telefono', et: 'Telefono', sin: ['telefono', 'tel', 'cellulare', 'cell', 'mobile', 'recapito telefonico', 'telefono cellulare', 'numero di telefono'] },
    { k: 'indirizzo', et: 'Indirizzo', sin: ['indirizzo', 'via', 'residenza', 'sede', 'indirizzo residenza'] },
    { k: 'cap', et: 'CAP', sin: ['cap', 'codice postale'] }, { k: 'citta', et: 'Città', sin: ['citta', 'comune', 'localita', 'citta residenza'] },
    { k: 'provincia', et: 'Provincia', sin: ['provincia', 'prov', 'pr', 'sigla provincia'] },
    { k: 'ruolo', et: 'Ruolo (cliente / controparte)', sin: ['ruolo', 'tipo anagrafica', 'categoria', 'qualifica', 'tipologia anagrafica'] },
    { k: 'note', et: 'Note', sin: ['note', 'annotazioni', 'osservazioni'] },
  ],
  pratiche: [
    { k: 'titolo', et: 'Oggetto / Titolo', obbl: true, sin: ['oggetto', 'titolo', 'descrizione', 'pratica', 'denominazione fascicolo', 'causa', 'nome fascicolo', 'oggetto pratica', 'oggetto fascicolo', 'descrizione pratica'] },
    { k: 'numero', et: 'Numero pratica', sin: ['numero', 'n pratica', 'n fascicolo', 'numero fascicolo', 'numero pratica', 'fascicolo', 'protocollo', 'codice', 'rif', 'num pratica', 'n'] },
    { k: 'cliente', et: 'Cliente', sin: ['cliente', 'assistito', 'committente', 'parte assistita', 'mandante'] },
    { k: 'controparte', et: 'Controparte', sin: ['controparte', 'avversario', 'parte avversa', 'convenuto', 'resistente'] },
    { k: 'tipo', et: 'Tipologia / Materia', sin: ['tipo', 'materia', 'tipologia', 'area', 'ramo', 'tipo pratica', 'tipologia pratica'] },
    { k: 'stato', et: 'Stato', sin: ['stato', 'status', 'situazione', 'stato pratica'] },
    { k: 'autorita', et: 'Autorità giudiziaria / Ente', sin: ['autorita', 'autorita giudiziaria', 'ufficio giudiziario', 'tribunale', 'organo giudicante', 'sede giudiziaria', 'ufficio', 'giudice ufficio'] },
    { k: 'rg', et: 'N. RG', sin: ['r g', 'rg', 'n r g', 'nrg', 'numero ruolo', 'n ruolo', 'ruolo generale', 'ruolo', 'numero rg', 'n rg'] },
    { k: 'giudice', et: 'Giudice / Sezione', sin: ['giudice', 'magistrato', 'sezione', 'giudice sezione'] },
    { k: 'valore', et: 'Valore', sin: ['valore', 'valore causa', 'valore della causa', 'valore pratica', 'importo'] },
    { k: 'data_apertura', et: 'Data apertura', sin: ['data apertura', 'aperto il', 'data', 'data inizio', 'data incarico', 'apertura', 'data conferimento'] },
    { k: 'descrizione', et: 'Note / Descrizione', sin: ['note', 'annotazioni', 'descrizione estesa', 'dettagli', 'osservazioni'] },
  ],
  scadenze: [
    { k: 'titolo', et: 'Titolo / Oggetto', obbl: true, sin: ['oggetto', 'titolo', 'descrizione', 'attivita', 'impegno', 'evento', 'scadenza', 'adempimento', 'udienza'] },
    { k: 'data', et: 'Data', obbl: true, sin: ['data', 'data udienza', 'data scadenza', 'giorno', 'il', 'quando', 'data impegno', 'data evento', 'data inizio', 'inizio'] },
    { k: 'ora', et: 'Ora', sin: ['ora', 'orario', 'alle', 'ora inizio', 'ora udienza'] },
    { k: 'tipo', et: 'Tipo (udienza, termine…)', sin: ['tipo', 'tipologia', 'categoria', 'tipo impegno', 'tipo evento'] },
    { k: 'pratica', et: 'Pratica (numero o titolo)', sin: ['pratica', 'fascicolo', 'n pratica', 'n fascicolo', 'numero pratica', 'numero fascicolo', 'rif pratica', 'causa', 'rif fascicolo'] },
    { k: 'luogo', et: 'Luogo / Aula', sin: ['luogo', 'aula', 'sede', 'ufficio', 'tribunale'] },
    { k: 'note', et: 'Note', sin: ['note', 'annotazioni', 'dettagli', 'osservazioni'] },
    { k: 'completata', et: 'Completata', sin: ['fatto', 'completata', 'evasa', 'evaso', 'completato', 'stato'] },
  ],
  parcelle: [
    { k: 'numero', et: 'Numero documento', sin: ['numero', 'n', 'n fattura', 'numero fattura', 'n documento', 'documento', 'num', 'numero documento'] },
    { k: 'data', et: 'Data', obbl: true, sin: ['data', 'data fattura', 'data documento', 'emessa il', 'data emissione'] },
    { k: 'cliente', et: 'Cliente', sin: ['cliente', 'intestatario', 'destinatario', 'denominazione'] },
    { k: 'oggetto', et: 'Oggetto / Causale', sin: ['oggetto', 'descrizione', 'causale', 'prestazione'] },
    { k: 'imponibile', et: 'Imponibile', sin: ['imponibile', 'totale imponibile'] },
    { k: 'iva', et: 'IVA (importo)', sin: ['iva', 'importo iva', 'totale iva'] },
    { k: 'totale', et: 'Totale documento', obbl: true, sin: ['totale', 'totale documento', 'importo', 'totale fattura', 'importo totale'] },
    { k: 'stato', et: 'Stato (pagata…)', sin: ['stato', 'pagata', 'pagamento', 'incassata', 'stato pagamento'] },
    { k: 'pratica', et: 'Pratica', sin: ['pratica', 'fascicolo', 'rif pratica'] },
  ],
}
const TIPI = Object.keys(CAMPI)

/** Propone la mappatura colonne→campi in base al nome delle intestazioni. */
function proponiMappatura(tipo, intestazioni) {
  const campi = CAMPI[tipo]; if (!campi) throw new Error('Tipo di importazione sconosciuto')
  const h = intestazioni.map(norm), usate = new Set(), m = {}
  for (const c of campi) { // 1) corrispondenza esatta
    const i = h.findIndex((x, ix) => !usate.has(ix) && c.sin.includes(x))
    if (i >= 0) { m[c.k] = i; usate.add(i) }
  }
  for (const c of campi) { // 2) l'intestazione contiene una parola chiave del campo (solo sinonimi di almeno 4 lettere)
    if (m[c.k] !== undefined) continue
    const i = h.findIndex((x, ix) => !usate.has(ix) && c.sin.some((s) => s.length >= 4 && (` ${x} `).includes(` ${s} `)))
    if (i >= 0) { m[c.k] = i; usate.add(i) }
  }
  return m
}

// ---------------- conversione dei valori ----------------
function parseData(v) {
  const s = String(v ?? '').trim(); if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/)
  let a, me, g, h = null, mi = null
  if (m) { a = +m[1]; me = +m[2]; g = +m[3]; if (m[4] !== undefined) { h = +m[4]; mi = +m[5] } }
  else if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)(?:\s+(\d{1,2})[:.](\d{2}))?/))) { g = +m[1]; me = +m[2]; a = +m[3]; if (a < 100) a += a < 70 ? 2000 : 1900; if (m[4] !== undefined) { h = +m[4]; mi = +m[5] } }
  else if ((m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/))) { a = +m[1]; me = +m[2]; g = +m[3] }
  else return null
  const d = new Date(a, me - 1, g)
  if (d.getFullYear() !== a || d.getMonth() !== me - 1 || d.getDate() !== g || a < 1900 || a > 2200) return null
  return { data: `${a}-${pad(me)}-${pad(g)}`, ora: h !== null && h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null }
}
function parseOra(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2})[:.hH](\d{2})/)
  return m && +m[1] < 24 && +m[2] < 60 ? `${pad(+m[1])}:${m[2]}` : (/^\d{1,2}$/.test(String(v).trim()) && +v < 24 ? `${pad(+v)}:00` : null)
}
function parseNumero(v) {
  let s = String(v ?? '').replace(/[€\s ]/g, '').replace(/^\+/, ''); if (!s || s === '-') return null
  const neg = /^-/.test(s) || /^\(.*\)$/.test(s); s = s.replace(/[()-]/g, '')
  if (!/^[\d.,]+$/.test(s)) return NaN
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (s.includes(',')) s = s.replace(',', '.')
  else if ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '')
  const n = parseFloat(s); return Number.isFinite(n) ? (neg ? -n : n) : NaN
}
const vero = (v) => /^(si|sì|s|x|1|true|vero|yes|y|fatto|fatta|evasa|evaso|completata|completato|chiusa|chiuso|pagata|pagato|incassata|incassato)$/i.test(String(v ?? '').trim())
const nomeProprio = (s) => String(s ?? '').trim().replace(/\s+/g, ' ')
const normCF = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const SOCIETA = /\b(s\s?r\s?l|s\s?p\s?a|s\s?n\s?c|s\s?a\s?s|s\s?c|societa|ditta|studio|associati|onlus|ente|comune|condominio|fondazione|associazione|cooperativa|consorzio|banca|assicurazioni|unipersonale)\b/i

function statoPratica(testo, stati) {
  const t = norm(testo); const lista = stati?.length ? stati : [{ nome: 'Aperta' }, { nome: 'In corso' }, { nome: 'In attesa' }, { nome: 'Sospesa' }, { nome: 'Chiusa', chiusa: true }, { nome: 'Archiviata', chiusa: true }]
  if (!t) return lista[0].nome
  const esatto = lista.find((s) => norm(s.nome) === t); if (esatto) return esatto.nome
  const chiusa = lista.find((s) => s.chiusa)
  if (/(chius|archiv|conclus|definit|terminat)/.test(t)) return (lista.find((s) => /chius/i.test(s.nome) && s.chiusa) || chiusa || lista[0]).nome
  if (/(sosp|ferm)/.test(t)) return (lista.find((s) => /sosp/i.test(s.nome)) || lista[0]).nome
  if (/(attesa|pending|rinvi)/.test(t)) return (lista.find((s) => /attesa/i.test(s.nome)) || lista[0]).nome
  if (/(corso|attiv|aperta|aperto|istrutt)/.test(t)) return (lista.find((s) => /corso/i.test(s.nome)) || lista[0]).nome
  return lista[0].nome
}
function tipoScadenza(testo, titolo) {
  const t = norm(testo) + ' ' + norm(titolo)
  if (/udienza/.test(t)) return 'udienza'
  if (/(appunt|incontro|colloquio|riunione|consulenza|visita)/.test(t)) return 'appuntamento'
  return 'scadenza'
}
function ruolo(testo, predefinito) {
  const t = norm(testo)
  if (/contr|avvers|convenut|resistent/.test(t)) return 'controparte'
  if (/client|assistit|mandant|committent/.test(t)) return 'cliente'
  if (t) return 'altro'
  return predefinito || 'cliente'
}

// ---------------- importazione ----------------
/**
 * Elabora (e, se `scrivi`, salva) le righe di una tabella.
 * mappatura: { campo: indiceColonna }. opzioni: { aggiorna, creaClienti, ruoloPredefinito }.
 * Restituisce conteggi, avvisi, errori per riga e un campione di righe elaborate.
 */
function elabora(tipo, tabella, mappatura, opzioni = {}, scrivi = false) {
  const campi = CAMPI[tipo]; if (!campi) throw new Error('Tipo di importazione sconosciuto')
  for (const c of campi.filter((x) => x.obbl)) {
    const mancaDen = tipo === 'anagrafica' && mappatura.cognome !== undefined
    if (mappatura[c.k] === undefined && !mancaDen) throw new Error(`Associa una colonna al campo "${c.et}"`)
  }
  if (tipo === 'anagrafica' && mappatura.denominazione === undefined && mappatura.cognome === undefined && mappatura.nome === undefined) throw new Error('Associa una colonna al nome o alla ragione sociale')
  const get = (riga, k) => (mappatura[k] === undefined || mappatura[k] === null ? '' : String(riga[mappatura[k]] ?? '').trim())
  const impostazioni = db.getSettings()
  const esito = { totale: tabella.righe.length, creati: 0, aggiornati: 0, esistenti: 0, errori: [], avvisi: [], campione: [], creatiClienti: 0 }
  const ESEMPI = 12
  const nota = (n, stato, dati, msg) => { if (esito.campione.length < ESEMPI) esito.campione.push({ riga: n, stato, dati, messaggio: msg || '' }) }
  const err = (n, msg) => { if (esito.errori.length < 500) esito.errori.push({ riga: n, motivo: msg }); nota(n, 'errore', {}, msg) }
  const avviso = (n, msg) => { if (esito.avvisi.length < 200) esito.avvisi.push({ riga: n, motivo: msg }) }

  const esegui = () => {
    // indici dei dati esistenti per riconoscere i doppioni
    const anag = db.list('anagrafica')
    const perCF = new Map(), perIva = new Map(), perMail = new Map(), perNome = new Map()
    const indicizza = (a) => { if (normCF(a.codice_fiscale)) perCF.set(normCF(a.codice_fiscale), a); if (normCF(a.partita_iva)) perIva.set(normCF(a.partita_iva), a); if (a.email) perMail.set(a.email.toLowerCase(), a); perNome.set(norm(a.denominazione), a) }
    anag.forEach(indicizza)
    const trovaAnag = (d) => (normCF(d.codice_fiscale) && perCF.get(normCF(d.codice_fiscale))) || (normCF(d.partita_iva) && perIva.get(normCF(d.partita_iva))) || (d.email && perMail.get(d.email.toLowerCase())) || perNome.get(norm(d.denominazione)) || null
    let fittizio = -1
    const creaAnag = (dati, n) => {
      const r = scrivi ? db.save('anagrafica', dati) : { ...dati, id: fittizio-- }
      indicizza(r); esito.creatiClienti++; return r
    }
    const clientePerNome = (nome, ruoloCrea, n) => {
      const nm = nomeProprio(nome); if (!nm) return null
      const e = perNome.get(norm(nm)); if (e) return e
      if (opzioni.creaClienti === false) { avviso(n, `"${nm}" non è in anagrafica: collegamento non creato`); return null }
      return creaAnag({ denominazione: nm, ruolo: ruoloCrea, tipo: SOCIETA.test(norm(nm)) ? 'azienda' : 'persona' }, n)
    }
    const pratiche = db.list('pratiche')
    const praticaPerNumero = new Map(pratiche.filter((p) => p.numero).map((p) => [norm(p.numero), p]))
    const praticaPerTitolo = new Map(pratiche.map((p) => [norm(p.titolo), p]))
    const trovaPratica = (rif) => { const k = norm(rif); return k ? praticaPerNumero.get(k) || praticaPerTitolo.get(k) || null : null }

    tabella.righe.forEach((riga, i) => {
      const n = i + 2 // numero di riga nel foglio (1 = intestazione)
      try {
        if (tipo === 'anagrafica') {
          let den = nomeProprio(get(riga, 'denominazione'))
          if (!den && (get(riga, 'cognome') || get(riga, 'nome'))) den = nomeProprio(`${get(riga, 'cognome')} ${get(riga, 'nome')}`)
          if (!den) return err(n, 'Nome o ragione sociale mancante')
          const dati = { denominazione: den, codice_fiscale: normCF(get(riga, 'codice_fiscale')) || null, partita_iva: normCF(get(riga, 'partita_iva')) || null, email: get(riga, 'email') || null, pec: get(riga, 'pec') || null, telefono: get(riga, 'telefono') || null, indirizzo: get(riga, 'indirizzo') || null, cap: get(riga, 'cap') || null, citta: get(riga, 'citta') || null, provincia: get(riga, 'provincia').toUpperCase().slice(0, 2) || null, note: get(riga, 'note') || null, ruolo: ruolo(get(riga, 'ruolo'), opzioni.ruoloPredefinito) }
          dati.tipo = (dati.partita_iva && !dati.codice_fiscale) || /^\d{11}$/.test(dati.codice_fiscale || '') || SOCIETA.test(norm(den)) ? 'azienda' : 'persona'
          if (dati.email && !/^\S+@\S+\.\S+$/.test(dati.email)) { avviso(n, `Email non valida ignorata: ${dati.email}`); dati.email = null }
          const e = trovaAnag(dati)
          if (e) {
            if (opzioni.aggiorna) { const patch = {}; for (const [k, v] of Object.entries(dati)) if (v && k !== 'denominazione' && k !== 'ruolo' && k !== 'tipo' && e[k] !== v) patch[k] = v; if (Object.keys(patch).length) { if (scrivi) db.save('anagrafica', { id: e.id, ...patch }); Object.assign(e, patch); esito.aggiornati++; return nota(n, 'aggiornato', dati) } }
            esito.esistenti++; return nota(n, 'esistente', dati, 'già presente')
          }
          if (scrivi) indicizza(db.save('anagrafica', dati)); else indicizza({ ...dati, id: fittizio-- })
          esito.creati++; nota(n, 'nuovo', dati)
        } else if (tipo === 'pratiche') {
          const titolo = nomeProprio(get(riga, 'titolo'))
          if (!titolo) return err(n, 'Oggetto/titolo mancante')
          const numero = nomeProprio(get(riga, 'numero')) || null
          let apertura = null
          if (get(riga, 'data_apertura')) { const d = parseData(get(riga, 'data_apertura')); if (!d) avviso(n, `Data di apertura non riconosciuta: "${get(riga, 'data_apertura')}"`); else apertura = d.data }
          const valore = get(riga, 'valore') ? parseNumero(get(riga, 'valore')) : null
          if (Number.isNaN(valore)) avviso(n, `Valore non riconosciuto: "${get(riga, 'valore')}"`)
          const cli = clientePerNome(get(riga, 'cliente'), 'cliente', n), ctr = clientePerNome(get(riga, 'controparte'), 'controparte', n)
          const esistente = (numero && praticaPerNumero.get(norm(numero))) || (!numero && praticaPerTitolo.get(norm(titolo))) || null
          const dati = { numero, titolo, cliente_id: cli?.id ?? null, controparte_id: ctr?.id ?? null, tipo: get(riga, 'tipo') || null, stato: statoPratica(get(riga, 'stato'), impostazioni.stati_pratica), autorita: get(riga, 'autorita') || null, giudice: get(riga, 'giudice') || null, rg: get(riga, 'rg') || null, valore: Number.isFinite(valore) ? valore : null, data_apertura: apertura, descrizione: get(riga, 'descrizione') || null }
          if (esistente) {
            if (opzioni.aggiorna) { const patch = {}; for (const [k, v] of Object.entries(dati)) if (v !== null && v !== '' && esistente[k] !== v && k !== 'numero') patch[k] = v; if (Object.keys(patch).length) { if (scrivi) db.save('pratiche', { id: esistente.id, ...patch }); Object.assign(esistente, patch); esito.aggiornati++; return nota(n, 'aggiornato', dati) } }
            esito.esistenti++; return nota(n, 'esistente', dati, 'già presente')
          }
          const colori = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']
          const salvata = scrivi ? db.save('pratiche', { ...dati, numero: numero || db.nextPraticaNumero(), colore: colori[Math.floor(Math.random() * colori.length)] }) : { ...dati, id: fittizio-- }
          if (salvata.numero) praticaPerNumero.set(norm(salvata.numero), salvata); praticaPerTitolo.set(norm(titolo), salvata)
          esito.creati++; nota(n, 'nuovo', dati)
        } else if (tipo === 'scadenze') {
          const titolo = nomeProprio(get(riga, 'titolo')); if (!titolo) return err(n, 'Titolo mancante')
          const d = parseData(get(riga, 'data')); if (!d) return err(n, `Data non riconosciuta: "${get(riga, 'data')}"`)
          const ora = parseOra(get(riga, 'ora')) || d.ora
          const dataOra = ora ? `${d.data}T${ora}` : d.data
          const pr = get(riga, 'pratica') ? trovaPratica(get(riga, 'pratica')) : null
          if (get(riga, 'pratica') && !pr) avviso(n, `Pratica "${get(riga, 'pratica')}" non trovata: scadenza importata senza collegamento`)
          const chiave = `${pr?.id ?? ''}|${norm(titolo)}|${dataOra}`
          if (!esito._chiavi) esito._chiavi = new Set(db.list('scadenze').map((s) => `${s.pratica_id ?? ''}|${norm(s.titolo)}|${s.data_ora}`))
          if (esito._chiavi.has(chiave)) { esito.esistenti++; return nota(n, 'esistente', { titolo, data_ora: dataOra }, 'già presente') }
          esito._chiavi.add(chiave)
          const futura = (dataOra.length > 10 ? new Date(dataOra) : new Date(`${dataOra}T23:59`)) > new Date()
          const dati = { pratica_id: pr && pr.id > 0 ? pr.id : null, titolo, tipo: tipoScadenza(get(riga, 'tipo'), titolo), data_ora: dataOra, tutto_il_giorno: ora ? 0 : 1, luogo: get(riga, 'luogo') || null, note: get(riga, 'note') || null, completata: vero(get(riga, 'completata')) ? 1 : 0, promemoria: futura ? (impostazioni.promemoria_default || [1440, 60]) : [] }
          if (scrivi) db.save('scadenze', dati)
          esito.creati++; nota(n, 'nuovo', { titolo, data_ora: dataOra })
        } else if (tipo === 'parcelle') {
          const d = parseData(get(riga, 'data')); if (!d) return err(n, `Data non riconosciuta: "${get(riga, 'data')}"`)
          const totale = parseNumero(get(riga, 'totale')); if (totale === null || Number.isNaN(totale)) return err(n, `Totale non riconosciuto: "${get(riga, 'totale')}"`)
          let imponibile = get(riga, 'imponibile') ? parseNumero(get(riga, 'imponibile')) : null, iva = get(riga, 'iva') ? parseNumero(get(riga, 'iva')) : null
          if (Number.isNaN(imponibile)) imponibile = null; if (Number.isNaN(iva)) iva = null
          if (imponibile === null) imponibile = iva !== null ? Math.round((totale - iva) * 100) / 100 : totale
          if (iva === null) iva = Math.round((totale - imponibile) * 100) / 100
          if (Math.abs(imponibile + iva - totale) > 0.02 && get(riga, 'imponibile') && get(riga, 'iva')) avviso(n, `Imponibile + IVA (${(imponibile + iva).toFixed(2)}) non coincide con il totale (${totale.toFixed(2)})`)
          const anno = +d.data.slice(0, 4); const prog = parseInt(String(get(riga, 'numero')).match(/\d+/)?.[0] || '', 10)
          if (!esito._parc) esito._parc = new Set(db.list('parcelle').map((p) => `${p.anno}|${p.progressivo}|${p.tipo === 'proforma' ? 'pf' : ''}`))
          if (Number.isInteger(prog) && esito._parc.has(`${anno}|${prog}|`)) { esito.esistenti++; return nota(n, 'esistente', { numero: `${prog}/${anno}` }, 'già presente') }
          const cli = clientePerNome(get(riga, 'cliente'), 'cliente', n)
          const pr = get(riga, 'pratica') ? trovaPratica(get(riga, 'pratica')) : null
          const stato = /(pagat|incass|saldat)/i.test(get(riga, 'stato')) || vero(get(riga, 'stato')) ? 'pagata' : 'emessa'
          if (Number.isInteger(prog)) esito._parc.add(`${anno}|${prog}|`)
          const dati = { anno, progressivo: Number.isInteger(prog) ? prog : undefined, numero: Number.isInteger(prog) ? `${prog}/${anno}` : undefined, tipo: 'parcella', data: d.data, oggetto: get(riga, 'oggetto') || null, stato, data_pagamento: stato === 'pagata' ? d.data : null, cliente_id: cli?.id > 0 ? cli.id : null, pratica_id: pr?.id > 0 ? pr.id : null, iva_perc: imponibile ? Math.round((iva / imponibile) * 10000) / 100 : 0, compensi: imponibile, imponibile, iva, totale, netto: totale, note: 'Importata da archivio precedente: importi complessivi.', voci: [{ tipo: 'compenso', descrizione: get(riga, 'oggetto') || 'Importo da archivio precedente', quantita: 1, importo: imponibile }] }
          if (scrivi) db.saveParcella(dati)
          esito.creati++; nota(n, 'nuovo', { numero: dati.numero || '(automatico)', totale })
        }
      } catch (e) { err(n, e.message) }
    })
  }
  if (scrivi) db.transaction(esegui); else esegui()
  delete esito._chiavi; delete esito._parc
  return esito
}

function anteprima(tipo, file, mappatura, opzioni) { return elabora(tipo, leggiTabella(file), mappatura, opzioni, false) }
function importa(tipo, file, mappatura, opzioni) { return elabora(tipo, leggiTabella(file), mappatura, opzioni, true) }
function proponi(tipo, file) {
  const t = leggiTabella(file)
  return { intestazioni: t.intestazioni, righe: t.righe.length, esempio: t.righe.slice(0, 4), delimitatore: t.delimitatore, foglio: t.foglio, mappatura: proponiMappatura(tipo, t.intestazioni), campi: CAMPI[tipo].map(({ k, et, obbl }) => ({ k, et, obbl: !!obbl })) }
}

// ---------------- modelli CSV da compilare (agenda cartacea, vecchi archivi) ----------------
const MODELLI = {
  anagrafica: [['Nome / Ragione sociale', 'Codice fiscale', 'Partita IVA', 'Email', 'Telefono', 'Indirizzo', 'CAP', 'Città', 'Provincia', 'Ruolo', 'Note'], ['Mario Rossi', 'RSSMRA80A01F257X', '', 'mario@esempio.it', '333 1234567', 'Via Roma 1', '41121', 'Modena', 'MO', 'Cliente', '']],
  pratiche: [['Numero', 'Oggetto', 'Cliente', 'Controparte', 'Tipologia', 'Stato', 'Autorità', 'N. RG', 'Giudice', 'Valore', 'Data apertura', 'Note'], ['2026/001', 'Risarcimento danni', 'Mario Rossi', 'Bianchi Srl', 'Civile', 'In corso', 'Tribunale di Modena', '1234/2026', 'Dott.ssa Verdi', '10000,00', '12/01/2026', '']],
  scadenze: [['Data', 'Ora', 'Oggetto', 'Tipo', 'Pratica', 'Luogo', 'Note'], ['15/11/2026', '09:30', 'Udienza di comparizione', 'Udienza', '2026/001', 'Aula 3', '']],
  parcelle: [['Numero', 'Data', 'Cliente', 'Oggetto', 'Imponibile', 'IVA', 'Totale', 'Stato'], ['12', '10/03/2026', 'Mario Rossi', 'Assistenza stragiudiziale', '1000,00', '220,00', '1220,00', 'Pagata']],
}
function modelloCsv(tipo) {
  const righe = MODELLI[tipo]; if (!righe) throw new Error('Tipo sconosciuto')
  const cella = (c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
  return '﻿' + righe.map((r) => r.map(cella).join(';')).join('\r\n') + '\r\n'
}

// ---------------- cartelle di documenti ----------------
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
// nome senza il suffisso " (2)" aggiunto quando due file hanno lo stesso nome: serve a riconoscere un file già importato
const baseNome = (nome) => nome.replace(/ \(\d+\)(?=\.[^.]*$|$)/, '')
const IGNORATI = /^(\.DS_Store|Thumbs\.db|desktop\.ini|~\$.*|.*\.tmp|\..*)$/i
function filesDi(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORATI.test(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) filesDi(p, base, acc)
    else if (e.isFile()) { try { acc.push({ percorso: p, relativo: path.relative(base, p), byte: fs.statSync(p).size }) } catch { /* illeggibile */ } }
  }
  return acc
}

/** Per ogni sottocartella propone la pratica corrispondente (per numero o titolo nel nome della cartella). */
function anteprimaCartella(dir) {
  if (!fs.statSync(dir).isDirectory()) throw new Error('Seleziona una cartella')
  const pratiche = db.list('pratiche')
  const sub = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !IGNORATI.test(e.name))
  const radice = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && !IGNORATI.test(e.name)).length
  const cartelle = sub.map((e) => {
    const files = filesDi(path.join(dir, e.name)); const n = norm(e.name)
    const pr = pratiche.find((p) => p.numero && (n === norm(p.numero) || n.startsWith(norm(p.numero) + ' '))) || pratiche.find((p) => norm(p.titolo) === n) || pratiche.find((p) => p.numero && n.includes(norm(p.numero))) || null
    const gia = pr ? new Set(db.list('documenti', { pratica_id: pr.id }).map((d) => `${baseNome(d.nome)}|${d.dimensione}`)) : new Set()
    return { nome: e.name, file: files.length, byte: files.reduce((s, f) => s + f.byte, 0), pratica: pr ? { id: pr.id, numero: pr.numero, titolo: pr.titolo } : null, giaPresenti: files.filter((f) => gia.has(`${baseNome(safeName(path.basename(f.percorso)))}|${f.byte}`)).length }
  })
  return { cartelle, fileInRadice: radice }
}

/** Collega i file delle sottocartelle alle pratiche (nessuna copia: restano nella cartella d'origine, mai spostati né modificati). scelte: { nomeCartella: idPratica | 'nuova' | 'salta' }. */
function importaCartella(dir, scelte = {}, opzioni = {}) {
  const esito = { pratiche: 0, createPratiche: 0, collegati: 0, saltati: 0, errori: [] }
  const ant = anteprimaCartella(dir)
  for (const c of ant.cartelle) {
    let scelta = scelte[c.nome]; if (scelta === undefined) scelta = c.pratica ? c.pratica.id : (opzioni.creaMancanti === false ? 'salta' : 'nuova')
    if (scelta === 'salta' || !c.file) continue
    let praticaId = scelta
    if (scelta === 'nuova') { const p = db.save('pratiche', { numero: db.nextPraticaNumero(), titolo: c.nome, stato: db.getSettings().stati_pratica?.[0]?.nome || 'Aperta', colore: '#3b82f6' }); praticaId = p.id; esito.createPratiche++ }
    esito.pratiche++
    try {
      const r = docfile.collegaCartella(praticaId, path.join(dir, c.nome))
      esito.collegati += r.collegati; esito.saltati += r.gia
    } catch (e) { esito.errori.push({ file: c.nome, motivo: e.message }) }
  }
  return esito
}

module.exports = { CAMPI, TIPI, proponiMappatura, proponi, anteprima, importa, elabora, parseData, parseNumero, parseOra, modelloCsv, anteprimaCartella, importaCartella, statoPratica }
