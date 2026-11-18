'use strict'
const { attoriPerPratica } = require('./data/limiti.json')

function ruoliPerContatto(p) {
  const ruoli = new Map()
  function aggiungi(id, ruolo) {
    const n = Number(id)
    if (!Number.isSafeInteger(n) || n <= 0) return
    if (!ruoli.has(n)) ruoli.set(n, new Set())
    ruoli.get(n).add(ruolo)
  }
  aggiungi(p?.cliente_id, 'cliente principale')
  aggiungi(p?.controparte_id, 'controparte principale')
  let altre
  try { altre = JSON.parse(p?.persone || '[]') } catch { altre = [] }
  for (const x of Array.isArray(altre) ? altre : []) {
    if (!x || (x.ruolo === 'cliente' && x.id === p.cliente_id) || (x.ruolo === 'controparte' && x.id === p.controparte_id)) continue
    aggiungi(x.id, x.ruolo)
  }
  return ruoli
}

function variazioniAttori(prima, dopo) {
  const a = ruoliPerContatto(prima), b = ruoliPerContatto(dopo)
  if (b.size > attoriPerPratica && [...b.keys()].some(id => !a.has(id))) {
    throw new Error(`Sono ammessi al massimo ${attoriPerPratica} contatti distinti per pratica. Riduci i contatti prima di aggiungerne altri.`)
  }
  const cambi = []
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const da = [...(a.get(id) || [])].sort().join(', '), aRuolo = [...(b.get(id) || [])].sort().join(', ')
    if (da !== aRuolo) cambi.push({ id, da, a: aRuolo })
  }
  return cambi
}

module.exports = { variazioniAttori }
