import { useCallback, useRef, useState, type DragEvent } from 'react'

/** Il trascinamento contiene file del computer (e non, ad esempio, una scheda interna dell'app)? */
export const haFile = (e: DragEvent | globalThis.DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')

/** Percorsi dei file (e delle cartelle) rilasciati dal sistema operativo. */
export function percorsiRilasciati(e: DragEvent | globalThis.DragEvent): string[] {
  const dt = e.dataTransfer; if (!dt) return []
  const veri = [...dt.files].map((f) => window.mngmnt.pathForFile(f)).filter(Boolean)
  if (veri.length) return veri
  // solo nelle prove automatiche: un trascinamento reale da Finder/Esplora risorse non può essere simulato
  if (window.mngmnt.test) { const t = dt.getData('text/x-mngmnt-test-path'); if (t) return t.split('|').filter(Boolean) }
  return []
}

/**
 * Zona in cui si possono rilasciare file «come allegati di una email». Restituisce le proprietà da mettere sull'elemento e `over`
 * (true mentre un file è sopra la zona). Ignora i trascinamenti interni e quelli sopra le finestre di dialogo.
 */
export function useZonaFile(onFile: (percorsi: string[]) => void, { disattivata = false, ignora = '' }: { disattivata?: boolean; ignora?: string } = {}) {
  const [over, setOver] = useState(false)
  const livello = useRef(0) // entrate - uscite: dragenter/dragleave scattano anche passando sugli elementi interni
  const utile = useCallback((e: DragEvent) => !disattivata && haFile(e) && !(e.target as HTMLElement)?.closest?.(ignora ? `.modal, ${ignora}` : '.modal'), [disattivata, ignora])
  const props = {
    onDragEnter: (e: DragEvent) => { if (!utile(e)) return; e.preventDefault(); livello.current++; setOver(true) },
    onDragOver: (e: DragEvent) => { if (!utile(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
    onDragLeave: (e: DragEvent) => { if (!utile(e)) return; livello.current = Math.max(0, livello.current - 1); if (!livello.current) setOver(false) },
    onDrop: (e: DragEvent) => {
      if (!utile(e)) return
      e.preventDefault(); e.stopPropagation(); livello.current = 0; setOver(false)
      const p = percorsiRilasciati(e); if (p.length) onFile(p)
    },
  }
  return { props, over }
}

/**
 * Elenco di pratiche in cui ogni elemento ha `data-pratica-id`: rilasciando file su un elemento, vengono collegati a quella pratica.
 * L'elemento sotto il puntatore si evidenzia (classe `drop-target`).
 */
export function useZonaPratiche(onFile: (praticaId: number, percorsi: string[]) => void) {
  const attuale = useRef<HTMLElement | null>(null)
  const evidenzia = (el: HTMLElement | null) => { if (attuale.current === el) return; attuale.current?.classList.remove('drop-target'); attuale.current = el; el?.classList.add('drop-target') }
  const trova = (e: DragEvent) => (e.target as HTMLElement)?.closest?.('[data-pratica-id]') as HTMLElement | null
  return {
    onDragOver: (e: DragEvent) => { if (!haFile(e)) return; const el = trova(e); if (el) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; evidenzia(el) } else evidenzia(null) },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) evidenzia(null) },
    onDrop: (e: DragEvent) => {
      if (!haFile(e)) return
      const el = trova(e); evidenzia(null); if (!el) return
      e.preventDefault(); e.stopPropagation()
      const p = percorsiRilasciati(e); if (p.length) onFile(Number(el.dataset.praticaId), p)
    },
  }
}
