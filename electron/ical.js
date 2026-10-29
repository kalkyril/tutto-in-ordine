'use strict'
// Lettore di calendari iCalendar (.ics) — sola lettura. Gestisce righe ripiegate, testo con escape, date locali/UTC/con fuso,
// eventi "tutto il giorno", durata, stato annullato, ripetizioni (RRULE/EXDATE) e variazioni di singole occorrenze (RECURRENCE-ID).
// Tutte le date vengono convertite nell'ora locale del computer, nel formato usato dall'app (YYYY-MM-DD o YYYY-MM-DDTHH:mm).

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ymdhm = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

// nomi di fuso di Windows/Outlook → nomi IANA
const FUSI_WINDOWS = {
  'W. Europe Standard Time': 'Europe/Rome', 'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw', 'GMT Standard Time': 'Europe/London', 'UTC': 'UTC', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kiev', 'Eastern Standard Time': 'America/New_York', 'Pacific Standard Time': 'America/Los_Angeles',
}

function unfold(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n[ \t]|\n[ \t]|\r[ \t]/g, '').split(/\r\n|\n|\r/)
}

/** "NOME;PARAM=valore;PARAM2=\"v;2\":valore" → { name, params, value } */
function parseLine(line) {
  let i = 0, inQ = false
  for (; i < line.length; i++) { const c = line[i]; if (c === '"') inQ = !inQ; else if (c === ':' && !inQ) break }
  if (i >= line.length) return null
  const left = line.slice(0, i), value = line.slice(i + 1)
  const parts = []; let cur = '', q = false
  for (const c of left) { if (c === '"') { q = !q; cur += c } else if (c === ';' && !q) { parts.push(cur); cur = '' } else cur += c }
  parts.push(cur)
  const params = {}
  for (const p of parts.slice(1)) { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, '') }
  return { name: parts[0].toUpperCase(), params, value }
}

const unescapeText = (v) => String(v).replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c))

function tzOffsetMs(ts, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts
}
/** Istante (ms) di un orario "da muro" in un fuso IANA. */
function wallToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  let utc = guess - tzOffsetMs(guess, tz)
  utc = guess - tzOffsetMs(utc, tz)
  return utc
}

/** Valore iCal → { data:'YYYY-MM-DD', ora:'HH:mm'|null, tuttoIlGiorno } nell'ora locale del computer. */
function parseDate(value, params = {}) {
  const v = String(value).trim()
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return { data: `${m[1]}-${m[2]}-${m[3]}`, ora: null, tuttoIlGiorno: true }
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i)
  if (!m) return null
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)]
  let date
  if (m[7]) date = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  else if (params.TZID) {
    const tz = FUSI_WINDOWS[params.TZID] || params.TZID
    try { date = new Date(wallToUtc(y, mo, d, h, mi, s, tz)) } catch { date = new Date(y, mo - 1, d, h, mi, s) }
  } else date = new Date(y, mo - 1, d, h, mi, s) // "fluttuante": ora locale
  return { data: ymd(date), ora: `${pad(date.getHours())}:${pad(date.getMinutes())}`, tuttoIlGiorno: false }
}

function parseDuration(v) {
  const m = String(v).match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i)
  if (!m) return null
  const s = (+m[2] || 0) * 604800 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)
  return (m[1] === '-' ? -1 : 1) * s * 1000
}

function parseRrule(v) {
  const r = {}
  for (const part of String(v).split(';')) { const k = part.indexOf('='); if (k > 0) r[part.slice(0, k).toUpperCase()] = part.slice(k + 1) }
  return r
}

/** Estrae gli eventi (VEVENT) dal testo di un calendario. Lancia un errore se il testo non è un calendario completo. */
function parseCalendar(text) {
  const righe = unfold(text)
  if (!righe.some((l) => /^BEGIN:VCALENDAR/i.test(l))) throw new Error('Il file non è un calendario valido (manca BEGIN:VCALENDAR)')
  if (!righe.some((l) => /^END:VCALENDAR/i.test(l))) throw new Error('Il calendario è incompleto (manca END:VCALENDAR)')
  const eventi = []
  let cur = null, annidato = 0
  for (const riga of righe) {
    if (!riga) continue
    if (/^BEGIN:VEVENT/i.test(riga)) { cur = { exdates: [], props: {} }; annidato = 0; continue }
    if (!cur) continue
    if (/^END:VEVENT/i.test(riga)) { eventi.push(cur); cur = null; continue }
    if (/^BEGIN:/i.test(riga)) { annidato++; continue }      // VALARM e simili: ignorati
    if (/^END:/i.test(riga)) { annidato = Math.max(0, annidato - 1); continue }
    if (annidato > 0) continue
    const p = parseLine(riga); if (!p) continue
    switch (p.name) {
      case 'UID': cur.uid = p.value.trim(); break
      case 'SUMMARY': cur.titolo = unescapeText(p.value); break
      case 'DESCRIPTION': cur.descrizione = unescapeText(p.value); break
      case 'LOCATION': cur.luogo = unescapeText(p.value); break
      case 'STATUS': cur.stato = p.value.trim().toUpperCase(); break
      case 'DTSTART': cur.dtstart = parseDate(p.value, p.params); break
      case 'DTEND': cur.dtend = parseDate(p.value, p.params); break
      case 'DURATION': cur.durata = parseDuration(p.value); break
      case 'RRULE': cur.rrule = parseRrule(p.value); break
      case 'EXDATE': for (const x of p.value.split(',')) { const d = parseDate(x, p.params); if (d) cur.exdates.push(d) } break
      case 'RECURRENCE-ID': cur.recurrenceId = parseDate(p.value, p.params); break
      default: break
    }
  }
  return eventi.filter((e) => e.dtstart)
}

// ---------- ripetizioni ----------
const GIORNI = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const chiaveData = (d) => (d.tuttoIlGiorno ? d.data : `${d.data}T${d.ora}`)
const toLocal = (d) => { const [y, m, g] = d.data.split('-').map(Number); const [h, mi] = (d.ora || '00:00').split(':').map(Number); return new Date(y, m - 1, g, h, mi, 0, 0) }
const fromLocal = (dt, tutto) => ({ data: ymd(dt), ora: tutto ? null : `${pad(dt.getHours())}:${pad(dt.getMinutes())}`, tuttoIlGiorno: tutto })

function fineEvento(e) {
  const tutto = e.dtstart.tuttoIlGiorno
  const start = toLocal(e.dtstart)
  if (e.dtend) {
    const end = toLocal(e.dtend)
    if (tutto) { end.setDate(end.getDate() - 1); if (end < start) return fromLocal(start, true) } // DTEND dei giorni interi è esclusivo
    return fromLocal(end, tutto)
  }
  if (e.durata != null) return fromLocal(new Date(start.getTime() + e.durata - (tutto ? 86400000 : 0)), tutto)
  return fromLocal(start, tutto)
}

/** Tutte le occorrenze di un evento (anche ripetuto) comprese nella finestra [da, a]. Restituisce { chiave, inizio, fine, tutto }. */
function espandi(e, da, a, limite = 1000) {
  const tutto = e.dtstart.tuttoIlGiorno
  const start = toLocal(e.dtstart)
  const fineDef = fineEvento(e)
  const durataMs = toLocal(fineDef).getTime() - start.getTime()
  const inst = (dt) => {
    const ini = fromLocal(dt, tutto)
    const fin = fromLocal(new Date(dt.getTime() + durataMs), tutto)
    return { chiave: `${e.uid}|${e.rrule ? chiaveData(ini) : ''}`, inizio: chiaveData(ini), fine: chiaveData(fin), tutto, _dt: dt }
  }
  if (!e.rrule) { const i = inst(start); return i._dt >= da && i._dt <= a || toLocal(fineDef) >= da && i._dt <= a ? [i] : [] }
  const r = e.rrule
  const freq = r.FREQ, intervallo = Math.max(1, parseInt(r.INTERVAL || '1', 10)), count = r.COUNT ? parseInt(r.COUNT, 10) : Infinity
  let until = null
  if (r.UNTIL) { const u = parseDate(r.UNTIL.length === 8 ? r.UNTIL : r.UNTIL, {}); if (u) { until = toLocal(u); if (u.tuttoIlGiorno) until.setHours(23, 59, 59) } }
  const esclusi = new Set(e.exdates.map(chiaveData))
  const byday = r.BYDAY ? r.BYDAY.split(',').map((x) => { const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/); return m ? { n: m[1] ? parseInt(m[1], 10) : 0, g: GIORNI.indexOf(m[2]) } : null }).filter(Boolean) : []
  const bymd = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : []
  const bymo = r.BYMONTH ? r.BYMONTH.split(',').map(Number) : []
  const out = []
  let prodotte = 0
  const aggiungi = (dt) => {
    if (dt < start) return true
    if (until && dt > until) return false
    if (prodotte >= count) return false
    prodotte++
    if (esclusi.has(chiaveData(fromLocal(dt, tutto)))) return true
    if (dt >= da && dt <= a) out.push(inst(dt))
    return dt <= a && out.length < limite
  }
  const conOra = (d) => { const x = new Date(d); x.setHours(start.getHours(), start.getMinutes(), 0, 0); return x }
  const nthDelMese = (anno, mese, g, n) => {
    if (n > 0) { const primo = new Date(anno, mese, 1); const off = (g - primo.getDay() + 7) % 7; const d = 1 + off + (n - 1) * 7; const x = new Date(anno, mese, d); return x.getMonth() === mese ? x : null }
    const ultimo = new Date(anno, mese + 1, 0); const off = (ultimo.getDay() - g + 7) % 7; const d = ultimo.getDate() - off + (n + 1) * 7; const x = new Date(anno, mese, d); return x.getMonth() === mese ? x : null
  }
  const FINE = new Date(a.getTime() + 86400000)
  if (freq === 'DAILY') {
    for (let k = 0; ; k++) { const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k * intervallo); if (conOra(d) > FINE) break; if (bymo.length && !bymo.includes(d.getMonth() + 1)) continue; if (!aggiungi(conOra(d))) break }
  } else if (freq === 'WEEKLY') {
    const giorni = byday.length ? byday.map((b) => b.g) : [start.getDay()]
    const lunedi0 = new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() + 6) % 7))
    for (let w = 0; ; w++) {
      const base = new Date(lunedi0.getFullYear(), lunedi0.getMonth(), lunedi0.getDate() + w * 7 * intervallo)
      if (conOra(base) > FINE) break
      let stop = false
      for (const g of [...giorni].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7))) {
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + ((g + 6) % 7))
        if (!aggiungi(conOra(d))) { stop = true; break }
      }
      if (stop) break
    }
  } else if (freq === 'MONTHLY') {
    for (let k = 0; ; k++) {
      const primo = new Date(start.getFullYear(), start.getMonth() + k * intervallo, 1)
      if (primo > FINE) break
      let giorniMese = []
      if (byday.length) giorniMese = byday.flatMap((b) => { if (b.n) { const x = nthDelMese(primo.getFullYear(), primo.getMonth(), b.g, b.n); return x ? [x] : [] } const ris = []; for (let d = 1; d <= 31; d++) { const x = new Date(primo.getFullYear(), primo.getMonth(), d); if (x.getMonth() === primo.getMonth() && x.getDay() === b.g) ris.push(x) } return ris })
      else if (bymd.length) giorniMese = bymd.map((d) => (d > 0 ? new Date(primo.getFullYear(), primo.getMonth(), d) : new Date(primo.getFullYear(), primo.getMonth() + 1, d + 1))).filter((x) => x.getMonth() === primo.getMonth())
      else { const x = new Date(primo.getFullYear(), primo.getMonth(), start.getDate()); if (x.getMonth() === primo.getMonth()) giorniMese = [x] }
      giorniMese.sort((x, y) => x - y)
      let stop = false
      for (const d of giorniMese) if (!aggiungi(conOra(d))) { stop = true; break }
      if (stop) break
    }
  } else if (freq === 'YEARLY') {
    for (let k = 0; ; k++) {
      const anno = start.getFullYear() + k * intervallo
      if (new Date(anno, 0, 1) > FINE) break
      const mesi = bymo.length ? bymo.map((m) => m - 1) : [start.getMonth()]
      let stop = false
      for (const mese of mesi) {
        let giorni
        if (byday.length) giorni = byday.map((b) => nthDelMese(anno, mese, b.g, b.n || 1)).filter(Boolean)
        else giorni = [new Date(anno, mese, bymd.length ? bymd[0] : start.getDate())].filter((x) => x.getMonth() === mese)
        for (const d of giorni) if (!aggiungi(conOra(d))) { stop = true; break }
        if (stop) break
      }
      if (stop) break
    }
  } else { const i = inst(start); if (i._dt >= da && i._dt <= a) out.push(i) } // frequenza non gestita: solo la prima occorrenza
  return out
}

/** Eventi del calendario → elenco di occorrenze pronte da salvare, con variazioni e annullamenti già applicati. */
function occorrenze(testo, da, a) {
  const eventi = parseCalendar(testo)
  const principali = eventi.filter((e) => !e.recurrenceId)
  const variazioni = eventi.filter((e) => e.recurrenceId)
  const risultato = new Map()
  const meta = (e) => ({ titolo: (e.titolo || '(senza titolo)').trim(), descrizione: e.descrizione || '', luogo: e.luogo || '' })
  for (const e of principali) {
    if (!e.uid) e.uid = `senza-uid-${e.titolo || ''}-${chiaveData(e.dtstart)}`
    for (const o of espandi(e, da, a)) {
      if (e.stato === 'CANCELLED') continue
      risultato.set(o.chiave, { chiave: o.chiave, ...meta(e), inizio: o.inizio, fine: o.fine, tutto_il_giorno: o.tutto ? 1 : 0 })
    }
  }
  for (const v of variazioni) {                                // singola occorrenza spostata o annullata
    const chiaveOrig = `${v.uid}|${chiaveData(v.recurrenceId)}`
    risultato.delete(chiaveOrig)
    if (v.stato === 'CANCELLED') continue
    const tutto = v.dtstart.tuttoIlGiorno; const f = fineEvento(v)
    const ini = chiaveData(v.dtstart)
    if (toLocal(v.dtstart) >= da && toLocal(v.dtstart) <= a) risultato.set(chiaveOrig, { chiave: chiaveOrig, ...meta(v), inizio: ini, fine: chiaveData(f), tutto_il_giorno: tutto ? 1 : 0 })
  }
  return [...risultato.values()].sort((x, y) => x.inizio.localeCompare(y.inizio))
}

module.exports = { parseCalendar, occorrenze, espandi, parseDate, parseLine, unfold, wallToUtc, ymd, ymdhm }
