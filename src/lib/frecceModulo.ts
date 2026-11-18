import type { KeyboardEvent } from 'react'

export const aiutoFrecce = 'Usa ↑ e ↓ per cambiare campo. Negli elenchi, nelle date e nelle note usa Alt + ↑ o ↓.'

export function navigaConFrecce(e: KeyboardEvent<HTMLFormElement>) {
  const verticale = e.key === 'ArrowDown' || e.key === 'ArrowUp'
  const avanti = e.key === 'ArrowDown' || e.key === 'ArrowRight'
  if (!verticale && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  if (e.defaultPrevented || e.nativeEvent.isComposing || e.shiftKey || e.ctrlKey || e.metaKey) return
  const campo = e.target
  if (!(campo instanceof HTMLElement) || campo.closest('form') !== e.currentTarget) return
  if (e.altKey && !verticale) return
  if (!e.altKey) {
    if (campo instanceof HTMLInputElement) {
      if (!['text', 'tel', 'email', 'search', 'url'].includes(campo.type) || (verticale && campo.list)) return
      if (!verticale && campo.value) {
        // Nel testo si passa al campo vicino solo oltre il primo o l'ultimo carattere.
        if (campo.selectionStart !== campo.selectionEnd || campo.selectionStart !== (avanti ? campo.value.length : 0)) return
      }
    } else if (!(campo instanceof HTMLButtonElement)) return
  }
  const selettore = 'input:not([type=hidden]), select, textarea, button[aria-pressed=true], button[aria-checked=true]'
  const campi = [...e.currentTarget.querySelectorAll<HTMLElement>(selettore)]
  if (!avanti) campi.reverse()
  const direzione = avanti ? Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING
  const prossimo = campi.find(el => (campo.compareDocumentPosition(el) & direzione)
    && !el.matches(':disabled, [tabindex="-1"]') && !el.closest('[hidden], [inert]') && el.getClientRects().length)
  if (prossimo) {
    e.preventDefault()
    prossimo.focus()
  }
}
