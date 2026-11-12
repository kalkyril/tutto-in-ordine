// Persone di una pratica o commessa: cliente e controparte principali (colonne storiche) più tutte le altre
// (altri clienti, controparti, fornitori, collaboratori), e il ruolo ricoperto da chi usa TIO.
import type { Anagrafica, PersonaPratica, Pratica, RuoloPersona } from '../types'

const RUOLI: RuoloPersona[] = ['cliente', 'controparte', 'fornitore', 'collaboratore', 'altro']
/** Ruoli proposti per chi usa TIO: il campo è libero, si può scrivere anche altro. */
export const RUOLI_PROFESSIONISTA = {
  avvocato: ['Difensore', 'Codifensore', 'Domiciliatario', 'Consulente', 'Arbitro', 'Mediatore', 'Curatore', 'Delegato alla vendita', 'Amministratore di sostegno'],
  ditta: ['Incaricato', 'Consulente', 'Progettista', 'Direttore dei lavori', 'Collaudatore', 'CTU', 'CTP', 'Appaltatore', 'Subappaltatore', 'Fornitore'],
}

/** Le persone in più della pratica, senza doppioni e senza voci rovinate. */
export function leggiPersone(p: Pick<Pratica, 'persone'> | null | undefined): PersonaPratica[] {
  let l: unknown
  try { l = p?.persone ? JSON.parse(p.persone) : [] } catch { l = [] }
  const visti = new Set<string>()
  return (Array.isArray(l) ? l : []).filter((x): x is PersonaPratica => !!x && Number.isSafeInteger(x.id) && x.id > 0 && RUOLI.includes(x.ruolo) && !visti.has(`${x.id}-${x.ruolo}`) && !!visti.add(`${x.id}-${x.ruolo}`))
}
/** Valore da salvare nella colonna `persone` (null se non ce ne sono). */
export const scriviPersone = (l: PersonaPratica[]): string | null => { const pulite = leggiPersone({ persone: JSON.stringify(l) }); return pulite.length ? JSON.stringify(pulite) : null }

/** Tutte le persone della pratica con il loro ruolo: prima cliente e controparte principali, poi le altre. */
export function personeDi(p: Pratica, anagrafica: Map<number, Anagrafica>): { contatto: Anagrafica; ruolo: RuoloPersona; principale: boolean }[] {
  const out: { contatto: Anagrafica; ruolo: RuoloPersona; principale: boolean }[] = []
  const metti = (id: number | null | undefined, ruolo: RuoloPersona, principale: boolean) => { const contatto = id ? anagrafica.get(id) : undefined; if (contatto && !out.some((x) => x.contatto.id === contatto.id && x.ruolo === ruolo)) out.push({ contatto, ruolo, principale }) }
  metti(p.cliente_id, 'cliente', true); metti(p.controparte_id, 'controparte', true)
  for (const x of leggiPersone(p)) metti(x.id, x.ruolo, false)
  return out
}
/** Ruoli che il contatto ha nella pratica (vuoto se non c'entra). */
export const ruoliIn = (p: Pratica, contattoId: number): RuoloPersona[] => [
  ...(p.cliente_id === contattoId ? ['cliente' as const] : []), ...(p.controparte_id === contattoId ? ['controparte' as const] : []),
  ...leggiPersone(p).filter((x) => x.id === contattoId).map((x) => x.ruolo),
].filter((r, i, a) => a.indexOf(r) === i)
