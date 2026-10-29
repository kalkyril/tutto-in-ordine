'use strict'
// Importa esclusivamente dati di un documento scelto dall'utente. Nessuna richiesta al sito,
// nessuna esecuzione di macro, script, collegamenti o XML esterno; nessuna scrittura nell'archivio.
const fs = require('node:fs'), path = require('node:path')
const { estraiFileAsync } = require('./doctext')
const MONEY = /(?:€\s*)?(-?(?:\d{1,3}(?:[. ]\d{3})+|\d+),\d{2})(?!\d)/g
const number = (s) => Number(s.replace(/[. \u00a0]/g, '').replace(',', '.'))
function interpreta(raw) {
  if (raw.length > 2 * 1024 * 1024) throw new Error('Documento troppo lungo')
  const text = raw.replace(/\u00a0/g, ' ').replace(/\r/g, ''), lines = text.split('\n').map(s => s.trim()).filter(Boolean)
  const rows = []
  for (let i = 0; i < lines.length; i++) {
    let matches = [...lines[i].matchAll(MONEY)]
    if (!matches.length && i + 1 < lines.length && /^€?\s*-?[\d. ]+,\d{2}$/.test(lines[i+1])) {
      matches = [...lines[++i].matchAll(MONEY)]
      rows.push({ label: lines[i-1], value: number(matches[0][1]) }); continue
    }
    if (matches.length === 1) {
      const label = lines[i].slice(0, matches[0].index).trim().replace(/[\t:]+$/, '')
      if (label) rows.push({ label, value: number(matches[0][1]) })
    }
  }
  const pick = (regex, required = false) => {
    const hits = rows.filter(r => regex.test(r.label))
    if (hits.length > 1) throw new Error('Più importi per la stessa voce: importa un solo documento e verifica il file')
    if (!hits.length && required) throw new Error('Importo dei compensi non riconosciuto: usa un PDF testuale o il file Word esportato')
    return hits[0]
  }
  // Preferisce il riepilogo, senza sommare nuovamente fasi, aumenti o subtotali.
  const comp = pick(/^(?:onorari|compensi|compenso totale|totale compensi|compenso al netto delle riduzioni)$/i) || pick(/^compenso tabellare(?: con aumenti.*)?$/i) || pick(/^compenso$/i, true)
  const exempt = pick(/^spese esenti(?:\b|\s)/i), taxable = pick(/^(?:spese imponibili|altre spese imponibili.*)$/i), travel = pick(/^spese di trasferta$/i)
  const sg = pick(/^spese generali\b/i), cpa = pick(/^(?:cassa avvocati|cpa|contributo (?:integrativo|previdenziale))\b/i), iva = pick(/^iva\b/i), rit = pick(/^(?:a dedurre )?ritenuta\b/i), bollo = pick(/^(?:imposta di bollo|bollo|addebito bollo)$/i)
  const pct = (r, key) => {
    if (!r || r.value === 0) return 0
    const match = r.label.match(/(\d+(?:[.,]\d+)?)\s*%/)
    if (!match) throw new Error(`Percentuale ${key} non riconosciuta: completa il documento manualmente`)
    const n = Number(match[1].replace(',', '.')); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Aliquota non valida')
    return n
  }
  const aliquote = { sg_perc: pct(sg, 'spese generali'), cpa_perc: pct(cpa, 'CPA'), iva_perc: pct(iva, 'IVA'), rit_perc: pct(rit, 'ritenuta') }
  const voci = [{ tipo: 'compenso', descrizione: 'Compenso importato dal documento', quantita: 1, importo: comp.value }]
  for (const [r, tipo] of [[taxable,'spesa_imponibile'], [travel,'spesa_imponibile'], [exempt,'spesa_esente']]) if (r) voci.push({ tipo, descrizione: r.label, quantita: 1, importo: r.value })
  if (voci.some(v => !Number.isFinite(v.importo) || v.importo < 0 || v.importo > 1e12)) throw new Error('Importo non valido')
  const net = pick(/^netto (?:a|da) pagare$/i) || pick(/^totale documento$/i) || pick(/^(?:ipotesi di compenso liquidabile|totale da corrispondere)$/i) // gestito sotto per il caso in cui compaiano entrambi
  if ([sg, cpa, iva, rit, bollo, net].some(r => r && (!Number.isFinite(r.value) || r.value < 0 || r.value > 1e12))) throw new Error('Importo non valido nel riepilogo')
  const acconti = rows.some(r => /accont|anticip[oi]|già (?:versato|pagato)/i.test(r.label))
  return { tipo: 'proforma', voci, aliquote, bollo: bollo?.value || 0, nettoOriginale: net?.value ?? null, avvisi: [...(acconti ? ['Il documento contiene acconti o anticipi: non vengono sottratti automaticamente. Verifica il netto nella bozza.'] : []), 'Verifica cliente, pratica, data e oggetto prima di salvare. Il numero sarà assegnato dalla serie pro forma di TIO.', 'Voci aggregate: il documento originale può contenere ulteriori dettagli non importati.'] }
}
async function leggi(file) {
  if (!['.pdf','.docx'].includes(path.extname(file).toLowerCase())) throw new Error('Scegli il PDF o il file Word (.docx) esportato')
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('Il documento supera il limite di 20 MB')
  const extracted = await estraiFileAsync(file, file, false)
  if (!extracted.text.trim()) throw new Error('Nessun testo leggibile: usa il file Word o un PDF testuale')
  return { ...interpreta(extracted.text), nomeFile: path.basename(file) }
}
module.exports = { interpreta, leggi }
