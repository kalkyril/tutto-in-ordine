/** Numero all'italiana con separatore delle migliaia sempre presente (1.985,00), anche per i valori a 4 cifre. */
export function fmtNum(n: number, dec = 2): string {
  const v = Number(n) || 0
  const [int, frac] = Math.abs(v).toFixed(dec).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (v < 0 && Number(Math.abs(v).toFixed(dec)) !== 0 ? '−' : '') + grouped + (frac ? ',' + frac : '')
}
export const money = (n?: number | null) => fmtNum(Number(n) || 0) + '\u00a0€'
export const decimal = (n?: number | null) => fmtNum(Number(n) || 0)
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function parseNumber(s: string | number): number {
  if (typeof s === 'number') return s
  const t = String(s).trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h${m ? ' ' + String(m).padStart(2, '0') + 'm' : ''}` : `${m}m`
}

export function fmtBytes(b?: number): string {
  if (!b && b !== 0) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function normalizeUrl(u: string): string {
  const t = u.trim()
  if (!t) return t
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t
  return 'https://' + t
}
