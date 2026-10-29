import type { Anagrafica, Pratica } from '../types'

const norm = (s?: string | null) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const cifre = (s?: string | null) => String(s ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase()
// stesso nome in qualunque ordine ("Mario Rossi" = "Rossi Mario") e senza forme societarie
const chiaveNome = (s?: string | null) => norm(s).replace(/\b(s r l|srl|s p a|spa|s a s|sas|s n c|snc)\b/g, '').split(' ').filter(Boolean).sort().join(' ')

/** Stessa persona/società? Stesso record, stesso codice fiscale o partita IVA, oppure stesso nome (anche con ordine invertito). */
export function stessaPersona(a: Anagrafica, b: Anagrafica): boolean {
  if (a.id === b.id) return true
  if (a.codice_fiscale && b.codice_fiscale && cifre(a.codice_fiscale) === cifre(b.codice_fiscale)) return true
  if (a.partita_iva && b.partita_iva && cifre(a.partita_iva) === cifre(b.partita_iva)) return true
  const ka = chiaveNome(a.denominazione)
  return ka.length >= 5 && ka === chiaveNome(b.denominazione)
}

export interface Conflitto { pratica: Pratica; ruoloAltrove: 'cliente' | 'controparte'; contatto: Anagrafica }

/**
 * Possibili conflitti di interesse: la persona compare, in un'altra pratica, nel ruolo opposto
 * (cliente qui e controparte altrove, o viceversa). `escludiPraticaId` = pratica che si sta modificando.
 */
export function conflittiPer(persona: Anagrafica | undefined | null, comeRuolo: 'cliente' | 'controparte', pratiche: Pratica[], anagrafica: Map<number, Anagrafica>, escludiPraticaId?: number | null): Conflitto[] {
  if (!persona) return []
  const opposto = comeRuolo === 'cliente' ? 'controparte' : 'cliente'
  const campo = opposto === 'cliente' ? 'cliente_id' : 'controparte_id'
  const out: Conflitto[] = []
  for (const p of pratiche) {
    if (p.id === escludiPraticaId) continue
    const id = p[campo]; if (!id) continue
    const altro = anagrafica.get(id)
    if (altro && stessaPersona(persona, altro)) out.push({ pratica: p, ruoloAltrove: opposto, contatto: altro })
  }
  return out
}
