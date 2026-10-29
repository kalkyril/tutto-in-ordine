import type { Settings } from '../types'
import { COLORE_BRAND_PREDEFINITO, NOME_APP } from './defaults'
import { contrasto, textOn } from './colors'

/** Nome mostrato nell'interfaccia: quello dello studio o della ditta, altrimenti il nome dell'app. */
export const nomeAttivita = (s: Settings) => (s.studio?.nome || '').trim() || NOME_APP

const rgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: number[]) => '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
const mix = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * Adatta il colore scelto dall'utente perché resti leggibile (contrasto WCAG ≥ 4,5:1) come testo, su pulsanti e su sfondi tenui:
 * nel tema chiaro lo scurisce se serve, nel tema scuro lo schiarisce.
 */
export function coloreLeggibile(base: number[], scuro: boolean): number[] {
  const bianco = [255, 255, 255], nero = [0, 0, 0]
  if (!scuro) {
    for (let t = 0; t <= 0.9; t += 0.03) {
      const c = mix(base, nero, t)
      const tenue = mix(bianco, c, 0.1)
      if (contrasto(c, bianco) >= 4.6 && contrasto(c, [244, 245, 247]) >= 4.55 && contrasto(c, tenue) >= 4.55) return c
    }
    return mix(base, nero, 0.9)
  }
  const superficie = [34, 37, 45]
  for (let t = 0.2; t <= 0.9; t += 0.03) {
    const c = mix(base, bianco, t)
    if (contrasto(c, mix(superficie, c, 0.2)) >= 4.6) return c
  }
  return mix(base, bianco, 0.9)
}

/** Applica il colore principale scelto dall'utente alle variabili CSS dell'interfaccia (tema chiaro o scuro). */
export function applicaBrand(colore: string, scuro: boolean) {
  const root = document.documentElement
  const base = rgb(colore) || rgb(COLORE_BRAND_PREDEFINITO)!
  const bianco = [255, 255, 255], nero = [0, 0, 0]
  const accent = coloreLeggibile(base, scuro)
  const hover = scuro ? mix(accent, bianco, 0.2) : mix(accent, nero, 0.15)
  const set = (k: string, v: string) => root.style.setProperty(k, v)
  set('--accent', toHex(accent))
  set('--accent-hover', toHex(hover))
  set('--accent-soft', `rgba(${accent.map(Math.round).join(',')},${scuro ? 0.2 : 0.1})`)
  set('--accent-text', textOn(toHex(accent)))
  set('--sidebar-accent', toHex(mix(base, bianco, 0.45)))
}
