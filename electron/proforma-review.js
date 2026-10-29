'use strict'
// Stato di revisione persistente, separato dal contenuto che sarà stampato nel PDF.
function read(value) {
  if (!value) return null
  const data = typeof value === 'string' ? JSON.parse(value) : value
  if (data.version !== 1 || (data.nettoOriginale !== null && (!Number.isFinite(data.nettoOriginale) || data.nettoOriginale < 0))) throw new Error('Dati di verifica dell’importazione non validi')
  return { version: 1, nettoOriginale: data.nettoOriginale, verificato: data.verificato === true, verificatoIl: data.verificatoIl || null }
}
const keys = ['tipo', 'data', 'cliente_id', 'pratica_id', 'oggetto', 'sg_perc', 'cpa_perc', 'iva_perc', 'rit_perc', 'bollo', 'compensi', 'spese_generali', 'cpa', 'imponibile', 'iva', 'spese_esenti', 'ritenuta', 'totale', 'netto', 'calcolo']
function signature(p) {
  return JSON.stringify([keys.map(k => p[k] ?? null), (p.voci || []).map(v => [v.tipo, v.descrizione, Number(v.quantita), Number(v.importo)])])
}
function update(head, previous, voci, confirmed) {
  const original = read(previous?.importazione) || read(head.importazione)
  if (!original) return null
  const same = previous && signature(previous) === signature({ ...previous, ...head, voci })
  const verified = confirmed === true || (confirmed !== false && same && original.verificato)
  if (!verified && (head.stato || previous?.stato || 'bozza') !== 'bozza') throw new Error('Verifica i dati importati prima di emettere il documento; puoi salvarlo come bozza')
  return JSON.stringify({ ...original, verificato: !!verified, verificatoIl: verified ? confirmed === true ? new Date().toISOString() : original.verificatoIl : null })
}
module.exports = { read, signature, update }
