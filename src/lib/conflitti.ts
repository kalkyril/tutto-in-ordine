import type { Anagrafica, Pratica } from '../types'

import { personeDi } from './persone'

const norm = (s?: string | null) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const cifre = (s?: string | null) => String(s ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase()
// stesso nome in qualunque ordine ("Mario Rossi" = "Rossi Mario") e senza forme societarie
const chiaveNome = (s?: string | null) => norm(s).replace(/\b(s r l|srl|s p a|spa|s a s|sas|s n c|snc)\b/g, '').split(' ').filter(Boolean).sort().join(' ')

function chiavi(a: Anagrafica): string[] {
  const keys = [`id:${a.id}`]
  const cf = cifre(a.codice_fiscale), iva = cifre(a.partita_iva), nome = chiaveNome(a.denominazione)
  if (cf) keys.push(`cf:${cf}`)
  if (iva) keys.push(`iva:${iva}`)
  if (nome.length >= 5) keys.push(`nome:${nome}`)
  return keys
}

export interface Conflitto { pratica: Pratica; ruoloAltrove: 'cliente' | 'controparte'; contatto: Anagrafica }

/** Indicizza anche le persone aggiuntive. Più parti dello stesso modulo condividono una sola lettura delle pratiche. */
export function indiceConflitti(pratiche: Pratica[], anagrafica: Map<number, Anagrafica>, escludiPraticaId?: number) {
  const indice = { cliente: new Map<string, Conflitto[]>(), controparte: new Map<string, Conflitto[]>() }
  for (const pratica of pratiche) {
    if (pratica.id === escludiPraticaId) continue
    for (const { contatto, ruolo } of personeDi(pratica, anagrafica)) {
      if (ruolo !== 'cliente' && ruolo !== 'controparte') continue
      const voce = { pratica, contatto, ruoloAltrove: ruolo }
      for (const k of chiavi(contatto)) {
        const lista = indice[ruolo].get(k)
        if (lista) lista.push(voce)
        else indice[ruolo].set(k, [voce])
      }
    }
  }
  return (persona: Anagrafica | undefined, comeRuolo: 'cliente' | 'controparte'): Conflitto[] => {
    if (!persona) return []
    const opposto = indice[comeRuolo === 'cliente' ? 'controparte' : 'cliente']
    const praticheTrovate = new Map<number, Conflitto>()
    for (const k of chiavi(persona)) {
      for (const c of opposto.get(k) || []) praticheTrovate.set(c.pratica.id, c)
    }
    return [...praticheTrovate.values()]
  }
}
