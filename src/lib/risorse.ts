// Logo, immagini e font dei modelli arrivano dal processo principale come riferimenti «tio-risorsa:<sha256>»
// (ogni file è salvato una volta sola). Qui si tengono in memoria e si rimettono al loro posto: i modelli che usano
// lo stesso logo condividono la stessa stringa, e nel salvataggio tornano riferimenti, così non viaggiano a ogni modifica.
const RIF = 'tio-risorsa:'
const dati = new Map<string, string>() // id → data URL
const ids = new Map<string, string>() // data URL → id (stessa stringa, ricerca immediata)

function riferimenti(v: unknown, out: Set<string>) {
  if (typeof v === 'string') { if (v.startsWith(RIF)) out.add(v.slice(RIF.length)) }
  else if (Array.isArray(v)) v.forEach((x) => riferimenti(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => riferimenti(x, out))
}

function sostituisci(v: unknown, f: (s: string) => string | null): unknown {
  if (typeof v === 'string') return f(v)
  if (Array.isArray(v)) return v.map((x) => sostituisci(x, f))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sostituisci(x, f)]))
  return v
}

/** Impostazioni con le risorse al loro posto; chiede al processo principale solo quelle non ancora in memoria. */
export async function espandi<T>(s: T, carica: (ids: string[]) => Promise<Record<string, string>>): Promise<T> {
  const servono = new Set<string>(); riferimenti(s, servono)
  const mancanti = [...servono].filter((id) => !dati.has(id))
  if (mancanti.length) for (const [id, d] of Object.entries(await carica(mancanti))) { dati.set(id, d); ids.set(d, id) }
  return sostituisci(s, (x) => (x.startsWith(RIF) ? dati.get(x.slice(RIF.length)) ?? null : x)) as T
}

/** Prima del salvataggio: le risorse già note tornano riferimenti (le nuove viaggiano intere una volta sola). */
export const comprimi = <T>(s: T): T => sostituisci(s, (x) => (x.length >= 512 && x.startsWith('data:') && ids.has(x) ? RIF + ids.get(x) : x)) as T
