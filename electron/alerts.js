'use strict'
// Calcolo degli avvisi per scadenze, udienze e to-do. Nessuna dipendenza da Electron.
const db = require('./db')

const pad = (n) => String(n).padStart(2, '0')

function parseLocal(s, defaultHour = 9) {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] !== undefined ? +m[4] : defaultHour, m[5] !== undefined ? +m[5] : 0, 0, 0)
}

// sottrae minuti rispettando i giorni di calendario (cambio ora legale: "1 giorno prima" = stessa ora del giorno prima)
function minusMinutes(d, m) {
  if (m > 0 && m % 1440 === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate() - m / 1440, d.getHours(), d.getMinutes())
  return new Date(d.getTime() - m * 60000)
}

const ymdLocale = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function fmt(d, withTime = true) {
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date
}

// etichetta relativa calcolata sul tempo realmente rimasto (l'avviso può scattare in ritardo)
function labelWhen(event, now) {
  const diffMin = Math.round((event.getTime() - now.getTime()) / 60000)
  if (diffMin <= 0) return 'ora'
  if (diffMin < 60) return `tra ${diffMin} minut${diffMin === 1 ? 'o' : 'i'}`
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const e0 = new Date(event.getFullYear(), event.getMonth(), event.getDate()).getTime()
  const days = Math.round((e0 - d0) / 86400000)
  const hh = `${pad(event.getHours())}:${pad(event.getMinutes())}`
  if (days === 0) return diffMin < 180 ? `tra ${Math.round(diffMin / 60)} or${Math.round(diffMin / 60) === 1 ? 'a' : 'e'}` : `oggi alle ${hh}`
  if (days === 1) return `domani alle ${hh}`
  if (days < 7) return `tra ${days} giorni`
  return `il ${fmt(event, false)}`
}

const TIPO_LABEL = { scadenza: 'Scadenza', udienza: 'Udienza', appuntamento: 'Appuntamento', altro: 'Evento' }

/**
 * Restituisce gli avvisi da emettere "adesso" e li registra come emessi.
 * Gli avvisi di eventi già passati da oltre `graceHours` vengono marcati senza notifica.
 */
/**
 * Rate dei piani di pagamento ancora da incassare, con l'importo aperto: l'incassato del documento copre le rate in
 * ordine di data, come nello scadenzario. Gli archivi precedenti alla 1.0.4 non hanno la tabella: nessuna rata.
 */
function rateAperte(d) {
  let righe
  try {
    righe = d.prepare(`SELECT r.id, r.parcella_id, r.data, r.importo, p.numero, p.netto, p.incassato, p.pratica_id, a.denominazione AS cliente
      FROM rate_documento r JOIN parcelle p ON p.id = r.parcella_id LEFT JOIN anagrafica a ON a.id = p.cliente_id
      WHERE p.tipo = 'parcella' AND p.stato = 'emessa' ORDER BY r.parcella_id, r.data, r.id`).all()
  } catch { return [] }
  const perDoc = new Map(), out = []
  for (const r of righe) perDoc.set(r.parcella_id, [...(perDoc.get(r.parcella_id) || []), r])
  for (const elenco of perDoc.values()) {
    let copre = Math.round(Math.min(elenco[0].netto, Math.max(0, elenco[0].incassato || 0)) * 100)
    elenco.forEach((r, i) => { const c = Math.round(r.importo * 100), preso = Math.min(c, copre); copre -= preso; if (c > preso) out.push({ ...r, n: i + 1, di: elenco.length, aperto: (c - preso) / 100 }) })
  }
  return out
}

function collectDueRows(now, graceHours) {
  const d = db.getDb()
  const settings = db.getSettings()
  const startHour = Number.isFinite(settings.ora_default_giornata) ? settings.ora_default_giornata : 9
  const fired = d.prepare('INSERT OR IGNORE INTO alert_fired(key) VALUES(?)')
  const isFired = d.prepare('SELECT 1 FROM alert_fired WHERE key = ?')
  const out = []

  const consider = (key, trigger, event, build) => {
    if (now < trigger) return
    if (isFired.get(key)) return
    fired.run(key)
    if (now.getTime() - event.getTime() > graceHours * 3600 * 1000) return // troppo vecchio: niente notifica
    out.push(build())
  }

  const scad = d.prepare(`SELECT s.*, p.titolo AS pratica_titolo, p.numero AS pratica_numero
    FROM scadenze s LEFT JOIN pratiche p ON p.id = s.pratica_id WHERE s.completata = 0`).all()
  for (const s of scad) {
    const event = parseLocal(s.data_ora, startHour)
    if (!event) continue
    let mins = []
    try { mins = JSON.parse(s.promemoria || '[]') } catch { mins = [] }
    for (const m of mins) {
      const trigger = minusMinutes(event, m)
      consider(`s:${s.id}:${m}:${s.data_ora}`, trigger, event, () => ({
        titolo: `${TIPO_LABEL[s.tipo] || 'Scadenza'} ${labelWhen(event, now)}: ${s.titolo}`,
        corpo: `${fmt(event, !s.tutto_il_giorno)}${s.luogo ? ' · ' + s.luogo : ''}${s.pratica_titolo ? '\n' + (s.pratica_numero ? s.pratica_numero + ' · ' : '') + s.pratica_titolo : ''}`,
        tipo: s.tipo, rif_tipo: 'scadenza', rif_id: s.id, pratica_id: s.pratica_id,
      }))
    }
  }

  // eventi dei calendari collegati (sola lettura): avvisi locali secondo i promemoria scelti per ciascun calendario
  const esterni = d.prepare(`SELECT e.*, c.nome AS cal_nome, c.promemoria AS cal_prom, p.titolo AS pratica_titolo FROM eventi_esterni e
    JOIN calendari c ON c.id = e.calendario_id AND c.attivo = 1 LEFT JOIN pratiche p ON p.id = e.pratica_id WHERE e.inizio >= ?`).all(ymdLocale(new Date(now.getTime() - graceHours * 3600 * 1000)))
  for (const e of esterni) {
    const event = parseLocal(e.inizio, startHour)
    if (!event) continue
    let mins = []
    try { mins = JSON.parse(e.cal_prom || '[]') } catch { mins = [] }
    for (const m of mins) {
      consider(`e:${e.id}:${m}:${e.inizio}`, minusMinutes(event, m), event, () => ({
        titolo: `${e.cal_nome}, ${labelWhen(event, now)}: ${e.titolo}`,
        corpo: `${fmt(event, !e.tutto_il_giorno)}${e.luogo ? ' · ' + e.luogo : ''}${e.pratica_titolo ? '\n' + e.pratica_titolo : ''}`,
        tipo: 'evento_esterno', rif_tipo: 'evento_esterno', rif_id: e.id, pratica_id: e.pratica_id,
      }))
    }
  }

  // 1.0.4: rate dei piani di pagamento ancora aperte, il giorno della rata
  for (const r of rateAperte(d)) {
    const event = parseLocal(r.data, startHour)
    if (!event) continue
    consider(`r:${r.id}:${r.data}`, event, event, () => ({
      titolo: `Rata da incassare ${ymdLocale(event) === ymdLocale(now) ? 'oggi' : 'del ' + fmt(event, false)}: documento n. ${r.numero}`,
      corpo: `Rata ${r.n} di ${r.di} · € ${r.aperto.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${r.cliente ? ' · ' + r.cliente : ''}`,
      tipo: 'rata', rif_tipo: 'rata', rif_id: r.parcella_id, pratica_id: r.pratica_id,
    }))
  }

  const todos = d.prepare(`SELECT t.*, p.titolo AS pratica_titolo FROM todos t
    LEFT JOIN pratiche p ON p.id = t.pratica_id
    WHERE t.completata = 0 AND t.scadenza IS NOT NULL AND t.promemoria_min IS NOT NULL`).all()
  for (const t of todos) {
    const event = parseLocal(t.scadenza, startHour)
    if (!event) continue
    const trigger = minusMinutes(event, t.promemoria_min)
    consider(`t:${t.id}:${t.promemoria_min}:${t.scadenza}`, trigger, event, () => ({
      titolo: `To-do ${labelWhen(event, now)}: ${t.titolo}`,
      corpo: `${fmt(event, t.scadenza.length > 10)}${t.pratica_titolo ? '\n' + t.pratica_titolo : ''}`,
      tipo: 'todo', rif_tipo: 'todo', rif_id: t.id, pratica_id: t.pratica_id,
    }))
  }

  // To-do/scadenze in ritardo: un solo avviso per elemento (al primo controllo dopo la scadenza)
  if (settings.avvisa_ritardi !== false) {
    for (const s of scad) {
      const event = parseLocal(s.data_ora, startHour)
      // un termine "tutto il giorno" è scaduto solo a fine giornata
      const lateAt = event && s.tutto_il_giorno ? new Date(event.getFullYear(), event.getMonth(), event.getDate(), 23, 59) : event
      if (!event || now <= lateAt) continue
      let mins = []
      try { mins = JSON.parse(s.promemoria || '[]') } catch { mins = [] }
      if (mins.includes(0)) continue // già notificata "alla scadenza"
      const key = `late:s:${s.id}:${s.data_ora}`
      if (isFired.get(key)) continue
      fired.run(key)
      if (now.getTime() - event.getTime() > graceHours * 3600 * 1000) continue
      out.push({
        titolo: `${TIPO_LABEL[s.tipo] || 'Scadenza'} scaduta: ${s.titolo}`,
        corpo: `${fmt(event, !s.tutto_il_giorno)}${s.pratica_titolo ? '\n' + s.pratica_titolo : ''}`,
        tipo: 'ritardo', rif_tipo: 'scadenza', rif_id: s.id, pratica_id: s.pratica_id,
      })
    }
  }
  return out
}

// Registra gli avvisi in un'unica transazione: evita migliaia di commit sul disco.
function collectDue(now = new Date(), graceHours = 24) { return db.transaction(() => collectDueRows(now, graceHours)) }

/** Riepilogo giornaliero: una volta al giorno al primo avvio/controllo. */
function dailyDigest(now = new Date()) {
  const d = db.getDb()
  const settings = db.getSettings()
  if (settings.riepilogo_giornaliero === false) return null
  const key = `digest:${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  if (d.prepare('SELECT 1 FROM alert_fired WHERE key = ?').get(key)) return null
  d.prepare('INSERT OR IGNORE INTO alert_fired(key) VALUES(?)').run(key)
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const in7 = new Date(now.getTime() + 7 * 86400000)
  const lim = `${in7.getFullYear()}-${pad(in7.getMonth() + 1)}-${pad(in7.getDate())}T23:59`
  const nowStr = `${today}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  const oggi = d.prepare("SELECT COUNT(*) c FROM scadenze WHERE completata = 0 AND substr(data_ora,1,10) = ?").get(today).c
  const settimana = d.prepare('SELECT COUNT(*) c FROM scadenze WHERE completata = 0 AND data_ora > ? AND data_ora <= ? AND substr(data_ora,1,10) <> ?').get(nowStr, lim, today).c
  const ritardo = d.prepare("SELECT COUNT(*) c FROM scadenze WHERE completata = 0 AND data_ora < ? AND substr(data_ora,1,10) < ?").get(nowStr, today).c
  const todoOggi = d.prepare("SELECT COUNT(*) c FROM todos WHERE completata = 0 AND scadenza IS NOT NULL AND substr(scadenza,1,10) <= ?").get(today).c
  // 1.0.4: rate dei piani di pagamento che scadono oggi (documenti ancora da saldare)
  const rateOggi = rateAperte(d).filter((r) => r.data === today).length
  if (!oggi && !settimana && !ritardo && !todoOggi && !rateOggi) return null
  const parti = []
  if (oggi) parti.push(`${oggi} scadenz${oggi === 1 ? 'a' : 'e'} oggi`)
  if (ritardo) parti.push(`${ritardo} in ritardo`)
  if (todoOggi) parti.push(`${todoOggi} to-do da fare`)
  if (rateOggi) parti.push(`${rateOggi} rat${rateOggi === 1 ? 'a' : 'e'} da incassare`)
  if (settimana) parti.push(`${settimana} nei prossimi 7 giorni`)
  return { titolo: 'Riepilogo di oggi', corpo: parti.join(' · '), tipo: 'riepilogo', rif_tipo: null, rif_id: null, pratica_id: null }
}

function pushNotifiche(items) {
  const d = db.getDb()
  const ins = d.prepare('INSERT INTO notifiche(titolo,corpo,tipo,rif_tipo,rif_id,pratica_id) VALUES(?,?,?,?,?,?)')
  return items.map((n) => {
    const r = ins.run(n.titolo, n.corpo || null, n.tipo, n.rif_tipo || null, n.rif_id || null, n.pratica_id || null)
    return { ...n, id: Number(r.lastInsertRowid) }
  })
}

module.exports = { collectDue, dailyDigest, pushNotifiche, parseLocal, rateAperte }
