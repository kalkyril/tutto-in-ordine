import type { Anagrafica, Recapiti, Recapito } from '../types'

/** Etichette proposte per i telefoni; «Personalizzato» lascia scrivere un nome a piacere. */
export const ETICHETTE_TELEFONO = ['Cellulare', 'Fisso', 'Ufficio', 'WhatsApp']
export const ETICHETTE_EMAIL = ['Personale', 'Lavoro', 'Amministrazione']
/** Titoli proposti per le persone fisiche: il campo è libero, si può scrivere anche altro. */
export const TITOLI_PERSONA = ['Avv.', 'Ing.', 'Arch.', 'Dott.', 'Dott.ssa', 'Geom.', 'Rag.', 'Prof.', 'Prof.ssa', 'Notaio', 'Sig.', 'Sig.ra']

const pulisci = (l: unknown): Recapito[] => (Array.isArray(l) ? l : [])
  .filter((r): r is Recapito => !!r && typeof r === 'object' && typeof (r as Recapito).valore === 'string')
  .map((r) => ({ etichetta: String(r.etichetta || '').trim().slice(0, 40), valore: r.valore.trim().slice(0, 200) }))

/**
 * Tutti i telefoni e le email del contatto. Per compatibilità il primo telefono e la prima email restano anche nei campi
 * `telefono` ed `email` (ricerca, documenti, importazione, versioni precedenti): se `recapiti` manca si parte da quelli.
 */
export function leggiRecapiti(a: Partial<Anagrafica> | null | undefined): Recapiti {
  let r: Partial<Recapiti> = {}
  try { r = a?.recapiti ? JSON.parse(a.recapiti) : {} } catch { r = {} }
  const telefoni = pulisci(r.telefoni), email = pulisci(r.email)
  // il campo principale modificato altrove (importazione, versione precedente) vince sulla prima voce salvata
  if (a?.telefono && telefoni[0]?.valore !== a.telefono) telefoni.unshift({ etichetta: telefoni.length ? 'Telefono' : 'Cellulare', valore: a.telefono })
  if (a?.email && email[0]?.valore !== a.email) email.unshift({ etichetta: email.length ? 'Email' : 'Personale', valore: a.email })
  return { telefoni, email }
}

/** Campi da salvare: elenco completo in `recapiti`, il primo valore di ciascun tipo nei campi storici. */
export function scriviRecapiti(r: Recapiti): Pick<Anagrafica, 'recapiti' | 'telefono' | 'email'> {
  const telefoni = pulisci(r.telefoni).filter((x) => x.valore), email = pulisci(r.email).filter((x) => x.valore)
  return { recapiti: telefoni.length || email.length ? JSON.stringify({ telefoni, email }) : null, telefono: telefoni[0]?.valore || '', email: email[0]?.valore || '' }
}

/** Nome con il titolo davanti («Ing. Mario Rossi»), solo per le persone fisiche. */
export const nomeConTitolo = (a: Partial<Anagrafica> | null | undefined) => a ? [a.tipo !== 'azienda' ? a.titolo?.trim() : '', a.denominazione].filter(Boolean).join(' ') : ''

/** Ruoli in rubrica: lo studio legale ha clienti e controparti; professionisti e ditte clienti, fornitori e collaboratori. */
export function ruoliAnagrafica(profilo: string | undefined, L: { cliente: string; controparte: string }) {
  return profilo === 'ditta'
    ? [{ id: 'cliente', label: 'Cliente' }, { id: 'fornitore', label: 'Fornitore' }, { id: 'collaboratore', label: 'Collaboratore' }, { id: 'altro', label: 'Altro' }] as const
    : [{ id: 'cliente', label: L.cliente }, { id: 'controparte', label: L.controparte }, { id: 'altro', label: 'Altro' }] as const
}
/** Nome del ruolo; per le ditte una vecchia «controparte» è un fornitore o altro. */
export const nomeRuolo = (ruolo: string, profilo: string | undefined, L: { cliente: string; controparte: string }) =>
  ruolo === 'cliente' ? L.cliente : ruolo === 'controparte' ? (profilo === 'ditta' ? 'Fornitore / Altro' : L.controparte) : ruolo === 'fornitore' ? 'Fornitore' : ruolo === 'collaboratore' ? 'Collaboratore' : 'Altro'
