'use strict'
// Esportazione iCalendar (.ics) di scadenze, udienze e to-do con scadenza.
const db = require('./db')
const { parseLocal } = require('./alerts')

const pad = (n) => String(n).padStart(2, '0')
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const dt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
const dOnly = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')

// righe lunghe max 75 ottetti (RFC 5545)
function fold(line) {
  const out = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const b = Buffer.byteLength(ch)
    if (bytes + b > 74) { out.push(cur); cur = ' ' + ch; bytes = 1 + b } else { cur += ch; bytes += b }
  }
  out.push(cur)
  return out.join('\r\n')
}

function build(praticaId) {
  const d = db.getDb()
  const where = praticaId ? 'WHERE s.pratica_id = ?' : ''
  const args = praticaId ? [praticaId] : []
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TIO//IT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:TIO']
  const startHour = 9
  for (const s of d.prepare(`SELECT s.*, p.titolo AS pt FROM scadenze s LEFT JOIN pratiche p ON p.id = s.pratica_id ${where}`).all(...args)) {
    const start = parseLocal(s.data_ora, startHour)
    if (!start) continue
    lines.push('BEGIN:VEVENT', `UID:scadenza-${s.id}@mngmnt`, `DTSTAMP:${stamp()}`)
    if (s.tutto_il_giorno) {
      const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
      lines.push(`DTSTART;VALUE=DATE:${dOnly(start)}`, `DTEND;VALUE=DATE:${dOnly(next)}`)
    } else {
      lines.push(`DTSTART:${dt(start)}`, `DTEND:${dt(new Date(start.getTime() + 3600000))}`)
    }
    lines.push(`SUMMARY:${esc(s.titolo)}`)
    if (s.luogo) lines.push(`LOCATION:${esc(s.luogo)}`)
    const desc = [s.pt ? `Pratica: ${s.pt}` : '', s.note || ''].filter(Boolean).join('\n')
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`)
    let mins = []
    try { mins = JSON.parse(s.promemoria || '[]') } catch { mins = [] }
    for (const m of mins) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(s.titolo)}`, `TRIGGER:-PT${Math.max(0, m)}M`, 'END:VALARM')
    lines.push('END:VEVENT')
  }
  const tw = praticaId ? 'AND t.pratica_id = ?' : ''
  for (const t of d.prepare(`SELECT t.*, p.titolo AS pt FROM todos t LEFT JOIN pratiche p ON p.id = t.pratica_id WHERE t.scadenza IS NOT NULL AND t.completata = 0 ${tw}`).all(...args)) {
    const start = parseLocal(t.scadenza, startHour)
    if (!start) continue
    lines.push('BEGIN:VEVENT', `UID:todo-${t.id}@mngmnt`, `DTSTAMP:${stamp()}`)
    if (t.scadenza.length <= 10) {
      const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
      lines.push(`DTSTART;VALUE=DATE:${dOnly(start)}`, `DTEND;VALUE=DATE:${dOnly(next)}`)
    } else {
      lines.push(`DTSTART:${dt(start)}`, `DTEND:${dt(new Date(start.getTime() + 1800000))}`)
    }
    lines.push(`SUMMARY:${esc('To-do: ' + t.titolo)}`)
    if (t.pt) lines.push(`DESCRIPTION:${esc('Pratica: ' + t.pt)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

module.exports = { build }
