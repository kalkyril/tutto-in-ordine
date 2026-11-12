// Sottocartelle dei documenti di una pratica: i file collegati stanno nella cartella della pratica (o in quella di Cliens)
// e nelle loro sottocartelle; qui si ricava l'albero dai percorsi, per sfogliarlo come nel Finder o in Esplora risorse.
const norma = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

/** Cartella del file rispetto alla prima radice che lo contiene («Atti/Notifiche»); '' se sta nella radice o fuori da tutte. */
export function sottocartella(percorso: string | null | undefined, radici: (string | null | undefined)[]): string {
  if (!percorso) return ''
  const file = norma(percorso), dir = file.slice(0, Math.max(0, file.lastIndexOf('/')))
  for (const r of radici) {
    if (!r) continue
    const radice = norma(r)
    // maiuscole e minuscole non contano: i dischi di Windows e macOS non le distinguono
    if (dir.toLowerCase() === radice.toLowerCase()) return ''
    if (dir.toLowerCase().startsWith(radice.toLowerCase() + '/')) return dir.slice(radice.length + 1)
  }
  return ''
}

export interface Sottocartella { nome: string; percorso: string; file: number }
/** Cosa c'è nella cartella `corrente` ('' = radice): le sottocartelle dirette (con quanti file contengono in tutto) e i file. `vuote`: tutte le cartelle sul disco. */
export function contenutoCartella<T>(voci: { voce: T; cartella: string }[], corrente: string, vuote: string[] = []): { cartelle: Sottocartella[]; file: T[] } {
  const qui = corrente.toLowerCase(), sotto = new Map<string, Sottocartella>(), file: T[] = []
  for (const { voce, cartella } of voci) {
    const c = cartella.toLowerCase()
    if (c === qui) { file.push(voce); continue }
    if (qui && !c.startsWith(qui + '/')) continue
    const nome = cartella.slice(qui ? corrente.length + 1 : 0).split('/')[0]
    const k = nome.toLowerCase(), x = sotto.get(k)
    if (x) x.file++; else sotto.set(k, { nome, percorso: corrente ? `${corrente}/${nome}` : nome, file: 1 })
  }
  // cartelle presenti sul disco senza file collegati: compaiono lo stesso, con zero file
  for (const cartella of vuote) {
    const c = cartella.toLowerCase()
    if (c === qui || (qui && !c.startsWith(qui + '/'))) continue
    const nome = cartella.slice(qui ? corrente.length + 1 : 0).split('/')[0], k = nome.toLowerCase()
    if (nome && !sotto.has(k)) sotto.set(k, { nome, percorso: corrente ? `${corrente}/${nome}` : nome, file: 0 })
  }
  return { cartelle: [...sotto.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true })), file }
}
