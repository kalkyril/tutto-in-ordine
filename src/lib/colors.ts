/** Luminanza relativa WCAG di un colore [r,g,b]. */
export function luminanza(c: number[]): number {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
/** Rapporto di contrasto WCAG tra due colori [r,g,b] (minimo 4,5 per il testo normale). */
export function contrasto(a: number[], b: number[]): number {
  const [x, y] = [luminanza(a), luminanza(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Colore del testo (bianco o quasi nero) più leggibile sopra uno sfondo esadecimale. */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const bg = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return contrasto(bg, [255, 255, 255]) >= contrasto(bg, [11, 16, 32]) ? '#ffffff' : '#0b1020'
}

/** Versione trasparente di un colore per sfondi tenui. */
export function tint(hex: string, alpha = 0.14): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return `rgba(100,116,139,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
