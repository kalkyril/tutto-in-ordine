'use strict'
const fs = require('node:fs')
const path = require('node:path')

function id(value) {
  if (!(typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))) throw new Error('Identificativo non valido')
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Identificativo non valido')
  return n
}

// I documenti interni non possono attraversare collegamenti simbolici.
function inside(base, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || path.isAbsolute(relative)) throw new Error('Percorso non valido')
  const root = path.resolve(base), target = path.resolve(root, relative)
  const rel = path.relative(root, target)
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('Percorso non valido')
  let current = root
  for (const part of ['', ...rel.split(path.sep)]) {
    current = path.join(current, part)
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Collegamento simbolico non consentito nei documenti interni') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return target
}

function date(value, key) {
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) throw new Error(`Data non valida: ${key}`)
  const [y, mo, d] = m.slice(1, 4).map(Number), check = new Date(Date.UTC(y, mo - 1, d))
  if (y < 1000 || check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || Number(m[4] || 0) > 23 || Number(m[5] || 0) > 59 || Number(m[6] || 0) > 59) throw new Error(`Data non valida: ${key}`)
}

function record(table, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Dati non validi')
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === '') continue
    if (key === 'id' || key.endsWith('_id')) id(value)
    if (['data', 'data_ora', 'data_apertura', 'data_chiusura', 'data_pagamento', 'scadenza_pagamento', 'scadenza', 'inizio', 'fine', 'validita', 'consegna'].includes(key)) date(value, key)
    if (['budget_ore', 'budget_importo'].includes(key) && (!Number.isFinite(Number(value)) || Number(value)<0)) throw new Error('Budget non valido')
    if (['minuti', 'tariffa_oraria', 'importo', 'quantita', 'valore', 'sg_perc', 'cpa_perc', 'iva_perc', 'rit_perc', 'bollo', 'compensi', 'spese_generali', 'cpa', 'imponibile', 'iva', 'spese_esenti', 'ritenuta', 'totale', 'netto', 'incassato', 'dimensione', 'promemoria_min'].includes(key)) {
      if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`Il campo ${key} deve essere un numero non negativo`)
    }
    if (key === 'anno' && (!Number.isInteger(Number(value)) || Number(value) < 1000 || Number(value) > 9999)) throw new Error('Anno non valido')
    if (key === 'progressivo') id(value)
    if (['promemoria', 'calcolo'].includes(key)) { try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; if (key === 'promemoria' && (!Array.isArray(parsed) || parsed.some((x) => !Number.isFinite(x) || x < 0 || x > 525600))) throw new Error() } catch { throw new Error(`Formato non valido: ${key}`) } }
  }
  if (table === 'parcelle' && obj.tipo && !['parcella', 'preventivo', 'proforma', 'nota_credito'].includes(obj.tipo)) throw new Error('Tipo di documento non valido')
  if (table === 'parcelle' && obj.esito_preventivo && !['da_inviare','inviato','accettato','rifiutato'].includes(obj.esito_preventivo)) throw new Error('Esito del preventivo non valido')
}

module.exports = { id, inside, date, record }
