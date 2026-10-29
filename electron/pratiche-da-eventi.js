'use strict'
// Pratiche ricavate dagli eventi di un calendario collegato. Pensato per l'agenda di Cliens Cube / Cliens Più (udienze e scadenze
// legate a un fascicolo), ma senza dipendere da un formato preciso: dal titolo, dalla descrizione e dal luogo degli eventi si
// riconoscono intestazione («Rossi c/ Bianchi»), numero di ruolo, ufficio giudiziario e giudice. Gli eventi senza tracce di una
// pratica (appuntamenti personali, promemoria generici) restano fuori. Tutto avviene sul computer: il calendario resta in sola lettura.
const db = require('./db')

const senzaAccenti = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const spazi = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
/** Forma confrontabile di un'intestazione: «Rossi Mario c/ Bianchi S.p.A.» e «ROSSI MARIO contro BIANCHI SPA» coincidono. */
const normIntestazione = (s) => senzaAccenti(s).toLowerCase()
  .replace(/\s+(?:c\/|c\.|contro|vs\.?|v\.)\s+/g, ' c ')
  .replace(/\b(s)\.?\s?(r|p|n|a)\.?\s?(l|a|s)\.?(?=\s|$)/g, '$1$2$3')
  .replace(/[^a-z0-9]+/g, ' ').trim()
const normRg = (s) => String(s ?? '').replace(/\s+/g, '').replace(/^0+/, '')
const normUfficio = (s) => senzaAccenti(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const compatibili = (a, b) => (!a.rg || !b.rg || normRg(a.rg) === normRg(b.rg)) && (!a.autorita || !b.autorita || normUfficio(a.autorita) === normUfficio(b.autorita))

// etichette che un gestionale scrive nella descrizione dell'evento («Ruolo: 1234/2025», «Curia: Tribunale di Modena»…)
const ETICHETTE = [
  ['titolo', /^(intestazione|fascicolo|pratica|causa|procedimento|parti)$/],
  ['rg', /^(ruolo|ruolo generale|r ?g|n ?r ?g|numero di ruolo|numero ruolo|n ruolo|rg n)$/],
  ['autorita', /^(curia|ufficio|ufficio giudiziario|autorita|autorita giudiziaria|tribunale|sede|foro)$/],
  ['giudice', /^(istruttore|giudice|giudice istruttore|g ?i|magistrato|relatore)$/],
  ['numero', /^(numero|numero pratica|n pratica|codice|codice pratica|n fascicolo|numero fascicolo)$/],
  ['oggetto', /^(oggetto|materia)$/],
]
const chiaveEtichetta = (e) => senzaAccenti(e).toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim()

const RE_RG = /\b(?:n\.?\s*)?(?:r\.?\s?g\.?|ruolo(?:\s+generale)?)(?:\s*n\.?|\s*n°)?\s*[:.°]?\s*(\d{1,7}\s*\/\s*\d{2,4})\b/i
const UFFICI = "tribunale(?: per i minorenni| di sorveglianza)?|corte d['’]\\s?appello|corte di appello|corte (?:suprema )?di cassazione|giudice di pace|t\\.?\\s?a\\.?\\s?r\\.?(?=\\s|$)|consiglio di stato|corte di giustizia tributaria(?: di (?:primo|secondo) grado)?|commissione tributaria(?: provinciale| regionale)?|corte dei conti"
const RE_UFFICIO = new RegExp(`\\b(${UFFICI})(?:\\s+(?:di|del|della|dell['’])\\s*([A-ZÀ-Ú][\\wÀ-ú'’]+(?:\\s+[A-ZÀ-Ú][\\wÀ-ú'’]+){0,2}))?`, 'i')
// intestazione con le parti: due nomi che iniziano con la maiuscola, separati da c/ c. contro vs
const RE_PARTI = /([A-ZÀ-Ú][^\n|–—:;]*?\S)\s+(?:c\/|c\.|contro|vs\.?|v\.)\s+([A-ZÀ-Ú][^\n|–—:;(]*?)(?=\s*(?:[-–—|(;]|\bR\.?\s?G\b|\bruolo\b|\bn\.?\s*r\.?\s?g|$))/
// tipo di impegno in testa al titolo: «Udienza - …», «Scadenza: …», «Udienza di prima comparizione – …»
const RE_TIPO = /^\s*(?:\[[^\]]*\]\s*)?(?:udienza|ud\.|scadenza|termine|promemoria|appuntamento|deposito|notifica|memoria)(?:\s+(?:di|del|della|per|ex)\s+[^:\-–—|]{1,60}?)?\s*(?:[:\-–—|]\s*|\s+(?=[A-ZÀ-Ú]))/i

function canonicoUfficio(testo) {
  const m = RE_UFFICIO.exec(testo || '')
  if (!m) return ''
  let nome = spazi(m[1]).replace(/^t\.?\s?a\.?\s?r\.?$/i, 'T.A.R.').replace(/^corte d['’]\s?appello$/i, "Corte d'Appello")
  nome = nome.charAt(0).toUpperCase() + nome.slice(1)
  return m[2] ? `${nome} di ${spazi(m[2])}` : nome
}

/** Dati di pratica riconosciuti in un evento, oppure null se l'evento non sembra legato a una pratica. */
function analizzaEvento(ev) {
  const titolo = spazi(ev.titolo), luogo = spazi(ev.luogo), descr = String(ev.descrizione || '')
  const campi = {}
  for (const riga of descr.split(/\r?\n|\s\|\s/)) {
    const m = /^\s*([A-Za-zÀ-ú .°]{1,32}?)\s*[:=]\s*(.+?)\s*$/.exec(riga)
    if (!m) continue
    const k = chiaveEtichetta(m[1]), voce = ETICHETTE.find(([, re]) => re.test(k))
    if (voce && !campi[voce[0]]) campi[voce[0]] = spazi(m[2])
  }
  const tutto = [titolo, descr, luogo].join('\n')
  const rgMatch = campi.rg ? /(\d{1,7}\s*\/\s*\d{2,4})/.exec(campi.rg) : RE_RG.exec(tutto)
  const rg = rgMatch ? normRg(rgMatch[1]) : ''
  const autorita = canonicoUfficio(campi.autorita) || campi.autorita || canonicoUfficio(luogo) || canonicoUfficio(titolo) || canonicoUfficio(descr)

  let intestazione = campi.titolo || ''
  if (!intestazione) {
    // dal titolo si tolgono tipo di impegno, numero di ruolo e ufficio: quello che resta è di solito l'intestazione del fascicolo
    const pulito = spazi(titolo.replace(RE_TIPO, '').replace(RE_RG, ' ').replace(RE_UFFICIO, ' ').replace(/\(\s*\)/g, ' ').replace(/^[\s\-–—|:,]+|[\s\-–—|:,]+$/g, ''))
    // le parti si cercano nel pezzo del titolo che le contiene («Scadenza memoria 171-ter - Verdi c/ Neri»: solo «Verdi c/ Neri»)
    const pezzi = [...pulito.split(/\s+[-–—|]\s+|:\s+/), ...descr.split(/\r?\n/)]
    const parti = pezzi.map((p) => RE_PARTI.exec(spazi(p))).find(Boolean)
    if (parti) intestazione = `${spazi(parti[1])} c/ ${spazi(parti[2])}`
    else if (rg && pulito) intestazione = pulito
  }
  intestazione = spazi(intestazione.replace(/[\s\-–—|:,]+$/, ''))
  if (!intestazione && !rg) return null
  return {
    intestazione: intestazione || `Procedimento R.G. ${rg}`,
    rg, autorita,
    giudice: campi.giudice || '',
    numero: campi.numero || '',
    oggetto: campi.oggetto || '',
  }
}

/** Raggruppa gli eventi per pratica: stesso numero di ruolo, oppure stessa intestazione. */
function raggruppa(eventi) {
  const gruppi = new Map(), nonRiconosciuti = []
  const aggiungi = (chiave, dati, ev) => {
    let g = gruppi.get(chiave)
    if (!g) { g = { chiave, ...dati, eventi: [] }; gruppi.set(chiave, g) }
    for (const k of ['rg', 'autorita', 'giudice', 'numero', 'oggetto']) if (!g[k] && dati[k]) g[k] = dati[k]
    if (g.intestazione.startsWith('Procedimento R.G.') && !dati.intestazione.startsWith('Procedimento R.G.')) g.intestazione = dati.intestazione
    g.eventi.push(ev)
    return g
  }
  const analizzati = eventi.map((ev) => ({ ev, dati: analizzaEvento(ev) }))
  // Il R.G. è locale all'ufficio: 12/2026 a Modena non è 12/2026 a Bologna.
  for (const { ev, dati } of analizzati.filter((x) => x.dati?.rg && x.dati.autorita)) {
    aggiungi(`rg:${dati.rg}:uff:${normUfficio(dati.autorita)}`, dati, ev)
  }
  for (const { ev, dati } of analizzati.filter((x) => x.dati?.rg && !x.dati.autorita)) {
    const candidati = [...gruppi.values()].filter(g => g.rg === dati.rg)
    const perTitolo = candidati.filter(g => normIntestazione(g.intestazione) === normIntestazione(dati.intestazione))
    const generico = s => s.startsWith('Procedimento R.G.')
    const g = perTitolo.length === 1 ? perTitolo[0] : candidati.length === 1 && (generico(dati.intestazione) || generico(candidati[0].intestazione)) ? candidati[0] : null
    aggiungi(g?.chiave || `rg:${dati.rg}${candidati.length ? ':tit:' + normIntestazione(dati.intestazione) : ''}`, dati, ev)
  }
  for (const { ev, dati } of analizzati.filter((x) => !x.dati?.rg)) {
    if (!dati) { nonRiconosciuti.push(ev); continue }
    const n = normIntestazione(dati.intestazione)
    const candidati = [...gruppi.values()].filter(g => normIntestazione(g.intestazione) === n && compatibili(g, dati))
    aggiungi(candidati.length === 1 ? candidati[0].chiave : `tit:${n}${dati.autorita ? ':uff:' + normUfficio(dati.autorita) : ''}`, dati, ev)
  }
  return { gruppi: [...gruppi.values()], nonRiconosciuti }
}

const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Anteprima: pratiche riconosciute nel calendario, ciascuna già in TIO, nuova o scartata in passato. Non modifica nulla. */
function anteprima(calendarioId) {
  const cal = db.get('calendari', calendarioId)
  if (!cal) throw new Error('Calendario non trovato')
  const eventi = db.list('eventi_esterni', { calendario_id: calendarioId }, 'inizio ASC')
  const { gruppi, nonRiconosciuti } = raggruppa(eventi)
  const mappa = new Map(db.getDb().prepare('SELECT chiave, pratica_id FROM pratiche_da_calendario WHERE calendario_id = ?').all(calendarioId).map((r) => [r.chiave, r.pratica_id]))
  const pratiche = db.list('pratiche')
  const unica = (lista) => lista.length === 1 ? lista[0] : null
  const daOggi = oggi()
  const elenco = gruppi.map((g) => {
    let pratica = null, stato = 'nuova'
    // Recupera le scelte delle build precedenti solo quando l'ufficio non le rende ambigue.
    const vecchiaChiave = g.rg ? `rg:${g.rg}` : `tit:${normIntestazione(g.intestazione)}`
    const vecchia = pratiche.find(p => p.id === mappa.get(vecchiaChiave))
    const unSoloGruppo = gruppi.filter(x => g.rg ? x.rg === g.rg : normIntestazione(x.intestazione) === normIntestazione(g.intestazione)).length === 1
    const vecchiaCompatibile = vecchia ? compatibili(g, vecchia) && (unSoloGruppo || !!vecchia.autorita) : unSoloGruppo
    const chiaveSalvata = mappa.has(g.chiave) ? g.chiave : mappa.has(vecchiaChiave) && vecchiaCompatibile ? vecchiaChiave : null
    if (chiaveSalvata) { pratica = pratiche.find((p) => p.id === mappa.get(chiaveSalvata)) || null; stato = pratica ? 'esistente' : 'scartata' }
    else {
      const candidatiRg = g.rg ? pratiche.filter(p => p.rg && normRg(p.rg) === g.rg && compatibili(g, p)) : []
      const ufficioEsatto = g.autorita ? candidatiRg.filter(p => normUfficio(p.autorita) === normUfficio(g.autorita)) : []
      const candidatiTitolo = pratiche.filter(p => normIntestazione(p.titolo) === normIntestazione(g.intestazione) && compatibili(g, p))
      pratica = unica(ufficioEsatto.length ? ufficioEsatto : candidatiRg) || unica(candidatiTitolo)
      if (pratica) stato = 'esistente'
    }
    const prossimo = g.eventi.find((e) => e.inizio.slice(0, 10) >= daOggi) || null
    return {
      chiave: g.chiave, intestazione: g.intestazione, rg: g.rg, autorita: g.autorita, giudice: g.giudice, numero: g.numero,
      eventi: g.eventi.length, prossimo: prossimo ? { titolo: prossimo.titolo, inizio: prossimo.inizio } : null,
      stato, pratica: pratica ? { id: pratica.id, titolo: pratica.titolo, numero: pratica.numero } : null,
    }
  }).sort((a, b) => (a.prossimo?.inizio || '9999').localeCompare(b.prossimo?.inizio || '9999') || a.intestazione.localeCompare(b.intestazione))
  return { calendario: { id: cal.id, nome: cal.nome, crea_pratiche: !!cal.crea_pratiche }, primaVolta: mappa.size === 0, pratiche: elenco, nonRiconosciuti: nonRiconosciuti.length, esempiNonRiconosciuti: nonRiconosciuti.slice(0, 5).map((e) => e.titolo) }
}

/**
 * Applica le scelte: `scelte[chiave] = true` crea (o collega a quella esistente), `false` scarta per sempre questo gruppo.
 * Senza `scelte` (aggiornamento automatico) si creano solo le pratiche nuove mai viste; quelle scartate restano scartate.
 * Delle pratiche già esistenti si riempiono solo i campi vuoti; gli eventi già collegati a mano non vengono spostati.
 */
function applica(calendarioId, scelte = null) {
  const prev = anteprima(calendarioId)
  const eventi = db.list('eventi_esterni', { calendario_id: calendarioId })
  const { gruppi } = raggruppa(eventi)
  const perChiave = new Map(gruppi.map((g) => [g.chiave, g]))
  const conn = db.getDb()
  const mappa = conn.prepare('INSERT INTO pratiche_da_calendario(calendario_id, chiave, pratica_id) VALUES(?,?,?) ON CONFLICT(calendario_id, chiave) DO UPDATE SET pratica_id = excluded.pratica_id')
  const collega = conn.prepare('UPDATE eventi_esterni SET pratica_id = ? WHERE id = ? AND pratica_id IS NULL')
  const esito = { create: [], collegate: [], scartate: 0, eventi: 0 }
  db.transaction(() => {
    for (const voce of prev.pratiche) {
      const g = perChiave.get(voce.chiave); if (!g) continue
      const vuole = scelte ? scelte[voce.chiave] : voce.stato !== 'scartata'
      if (vuole === undefined) continue
      if (!vuole) { mappa.run(calendarioId, voce.chiave, null); esito.scartate++; continue }
      if (voce.stato === 'scartata' && !scelte) continue
      let praticaId = voce.pratica?.id
      if (praticaId) {
        const p = db.get('pratiche', praticaId), patch = {}
        for (const [campo, valore] of [['rg', g.rg], ['autorita', g.autorita], ['giudice', g.giudice]]) if (valore && !p[campo]) patch[campo] = valore
        if (Object.keys(patch).length) db.save('pratiche', { id: praticaId, ...patch })
        const giaAbbinata = conn.prepare('SELECT pratica_id FROM pratiche_da_calendario WHERE calendario_id = ? AND chiave = ?').get(calendarioId, voce.chiave)?.pratica_id === praticaId
        if (!giaAbbinata) esito.collegate.push(p.titolo)
      } else {
        const cal = db.get('calendari', calendarioId)
        const nuova = db.save('pratiche', {
          numero: db.nextPraticaNumero(), titolo: g.intestazione, rg: g.rg || null, autorita: g.autorita || null, giudice: g.giudice || null,
          stato: 'Aperta', data_apertura: oggi(),
          descrizione: [`Creata dagli eventi del calendario «${cal?.nome || ''}».`, g.numero ? `Numero nel gestionale di origine: ${g.numero}.` : '', g.oggetto ? `Oggetto: ${g.oggetto}.` : ''].filter(Boolean).join(' '),
        })
        praticaId = nuova.id; esito.create.push(g.intestazione)
      }
      mappa.run(calendarioId, voce.chiave, praticaId)
      for (const ev of g.eventi) esito.eventi += collega.run(praticaId, ev.id).changes
    }
  })
  return esito
}

/** Dopo ogni aggiornamento di un calendario con «crea pratiche» attivo: crea le pratiche nuove e collega gli eventi. */
function applicaAutomatico(calendarioId) {
  const cal = db.get('calendari', calendarioId)
  if (!cal?.crea_pratiche) return null
  return applica(calendarioId)
}

module.exports = { analizzaEvento, raggruppa, anteprima, applica, applicaAutomatico, normIntestazione }
