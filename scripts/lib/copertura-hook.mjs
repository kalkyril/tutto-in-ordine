// Caricato da scripts/copertura.js in ogni processo Node delle prove (NODE_OPTIONS=--import): durante la misura della
// copertura le prove che compilano src/lib con Vite ricevono un `build` che aggiunge le mappe dei sorgenti, così le righe
// eseguite nei file temporanei si riportano ai file .ts originali. Le prove non cambiano e senza misura questo file non si carica.
import module from 'node:module'

const involucro = new URL('./vite-con-mappe.mjs', import.meta.url).href
if (typeof module.registerHooks === 'function') {
  module.registerHooks({
    resolve(specificatore, contesto, prossimo) {
      if (specificatore === 'vite' && contesto.parentURL !== involucro) return { url: involucro, format: 'module', shortCircuit: true }
      return prossimo(specificatore, contesto)
    },
  })
}
