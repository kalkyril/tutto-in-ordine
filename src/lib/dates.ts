const pad = (n: number) => String(n).padStart(2, '0')

export const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
export const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
export const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const ymdhm = (d: Date) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
export const todayStr = () => ymd(new Date())

/** Parsa 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm' come ora locale. */
export function parse(s?: string | null, defaultHour = 9): Date | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] !== undefined ? +m[4] : defaultHour, m[5] !== undefined ? +m[5] : 0)
}

export const hasTime = (s?: string | null) => !!s && s.length > 10

export function fmtDate(s?: string | null): string {
  const d = parse(s)
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ''
}
export function fmtTime(s?: string | null): string {
  const d = parse(s)
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
}
export function fmtDateTime(s?: string | null, allDay = false): string {
  if (!s) return ''
  return allDay || !hasTime(s) ? fmtDate(s) : `${fmtDate(s)} ${fmtTime(s)}`
}
export function fmtLong(d: Date): string {
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`
}

export function dayDiff(a: Date, b: Date): number {
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((x - y) / 86400000)
}

/** Descrizione relativa: "oggi", "domani", "tra 3 giorni", "2 giorni fa". */
export function relative(s?: string | null, now = new Date()): { text: string; tone: 'late' | 'today' | 'soon' | 'later' } {
  const d = parse(s)
  if (!d) return { text: '', tone: 'later' }
  const n = dayDiff(d, now)
  if (n < 0) return { text: n === -1 ? 'ieri' : `${-n} giorni fa`, tone: 'late' }
  if (n === 0) return { text: 'oggi', tone: 'today' }
  if (n === 1) return { text: 'domani', tone: 'soon' }
  if (n <= 7) return { text: `tra ${n} giorni`, tone: 'soon' }
  return { text: `tra ${n} giorni`, tone: 'later' }
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())
}
export function startOfWeek(d: Date): Date {
  const wd = (d.getDay() + 6) % 7 // lunedì = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - wd)
}
export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Il datetime di un evento "tutto il giorno" viene salvato come YYYY-MM-DDT00:00. */
export function eventDate(s: { data_ora: string }): string { return s.data_ora.slice(0, 10) }

/** Una scadenza è in ritardo se l'ora è passata (o, per quelle "tutto il giorno", se il giorno è passato). */
export function isLate(s: { data_ora: string; tutto_il_giorno?: number }, now = Date.now()): boolean {
  if (s.tutto_il_giorno || !hasTime(s.data_ora)) return s.data_ora.slice(0, 10) < ymd(new Date(now))
  const d = parse(s.data_ora)
  return !!d && d.getTime() < now
}
