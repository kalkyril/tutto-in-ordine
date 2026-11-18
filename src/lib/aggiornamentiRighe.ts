type Riga = { id: number; denominazione?: string }

// null indica l'intera tabella. Due notifiche ravvicinate si uniscono anche se una lettura è in corso.
export function accodaRighe(coda: Map<string, Set<number> | null>, tabella: string, ids?: number[]) {
  if (!ids) coda.set(tabella, null)
  else if (coda.get(tabella) !== null) {
    const insieme = coda.get(tabella) || new Set<number>()
    for (const id of ids) insieme.add(id)
    coda.set(tabella, insieme)
  }
}

// Ordinamento SQLite NOCASE (solo ASCII), con id come spareggio.
const nome = (r: Riga) => (r.denominazione || '').replace(/[A-Z]/g, c => c.toLowerCase())
function confronta(a: Riga, b: Riga) {
  const x = [...nome(a)], y = [...nome(b)]
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!
    if (d) return d
  }
  return x.length - y.length || a.id - b.id
}

export function applicaRighe(tabella: string, prima: Riga[], ids: Set<number>, nuove: Riga[]) {
  const ordine = tabella === 'anagrafica' ? confronta : (a: Riga, b: Riga) => b.id - a.id
  const inserite = [...nuove].sort(ordine), risultato: Riga[] = []
  let i = 0
  for (const r of inserite) {
    // Trova la posizione senza confrontare migliaia di denominazioni per un solo contatto modificato.
    let lo = i, hi = prima.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (ordine(prima[mid], r) < 0) lo = mid + 1
      else hi = mid
    }
    while (i < lo) {
      const vecchia = prima[i++]
      if (!ids.has(vecchia.id)) risultato.push(vecchia)
    }
    risultato.push(r)
  }
  for (; i < prima.length; i++) if (!ids.has(prima[i].id)) risultato.push(prima[i])
  return risultato
}
