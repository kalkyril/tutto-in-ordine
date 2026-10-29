'use strict'
// Adempimenti e versamenti fiscali che scadono di sabato o in un giorno festivo slittano al primo giorno
// lavorativo seguente (art. 7, c. 1, lett. h, DL 70/2011). Stesse festività nazionali di src/lib/termini.ts.
const GIORNO = 86_400_000
const giorno = (y, m, d) => Date.UTC(y, m - 1, d) / GIORNO
function pasqua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  return giorno(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1)
}
function festivi(y) {
  const f = new Set([[1, 1], [1, 6], [4, 25], [5, 1], [6, 2], [8, 15], [11, 1], [12, 8], [12, 25], [12, 26]].map(([m, d]) => giorno(y, m, d)))
  const p = pasqua(y); f.add(p); f.add(p + 1)
  if (y >= 2026) f.add(giorno(y, 10, 4))
  return f
}
/** «AAAA-MM-GG» → la stessa data se è lavorativa, altrimenti il primo giorno lavorativo seguente. */
function primoLavorativo(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  let g = giorno(y, m, d)
  for (;;) {
    const dt = new Date(g * GIORNO), dow = dt.getUTCDay()
    if (dow !== 0 && dow !== 6 && !festivi(dt.getUTCFullYear()).has(g)) return dt.toISOString().slice(0, 10)
    g++
  }
}
module.exports = { primoLavorativo }
