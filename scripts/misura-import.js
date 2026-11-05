'use strict'
// Misura dell'importazione delle pratiche su un file vero (es. l'esportazione di Cliens Cube), in un archivio temporaneo:
// quante righe diventano pratiche e quante hanno cliente, controparte, RG, autorità e materia. Stampa solo numeri,
// mai nomi o contenuti, così il file del cliente resta privato. Il file non viene modificato.
//
// Uso: node scripts/misura-import.js /percorso/EXPORT_FASCICOLI.csv [--cliente seconda]
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const file = process.argv[2]
if (!file || !fs.existsSync(file)) { console.error('Uso: node scripts/misura-import.js <file.csv|file.xlsx> [--cliente seconda]'); process.exit(2) }
const i = process.argv.indexOf('--cliente'), cliente = i > 0 ? process.argv[i + 1] : 'prima'
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-misura-import-'))
const db = require('../electron/db')
db.open(tmp)
try {
  const imp = require('../electron/importer')
  const p = imp.proponi('pratiche', file)
  const t0 = Date.now()
  const e = imp.importa('pratiche', file, p.mappatura, { cliente })
  const ms = Date.now() - t0
  const pr = db.list('pratiche')
  const pct = (n) => `${n} (${pr.length ? (100 * n / pr.length).toFixed(1) : 0}%)`
  const conta = (f) => pr.filter(f).length
  console.log(`Righe nel file: ${p.righe}; colonne riconosciute: ${Object.keys(p.mappatura).join(', ')}`)
  console.log(`Pratiche create: ${pr.length} in ${ms} ms; errori: ${e.errori.length}; avvisi: ${e.avvisi.length}`)
  console.log(`  con cliente:     ${pct(conta((x) => x.cliente_id))}`)
  console.log(`  con controparte: ${pct(conta((x) => x.controparte_id))}`)
  console.log(`  con R.G.:        ${pct(conta((x) => x.rg))}`)
  console.log(`  con autorità:    ${pct(conta((x) => x.autorita))}`)
  console.log(`  con materia:     ${pct(conta((x) => x.tipo))}`)
  console.log(`  parti ricavate dall'intestazione: ${e.parti?.length ?? 0}; contatti in anagrafica: ${db.list('anagrafica').length}`)
  const rip = imp.importa('pratiche', file, p.mappatura, { cliente })
  console.log(`Seconda importazione dello stesso file: ${rip.creati} nuove (atteso 0), ${rip.esistenti} già presenti`)
  for (const [motivo, n] of Object.entries(e.errori.reduce((m, x) => { const k = x.motivo.replace(/"[^"]*"/g, '"…"'); m[k] = (m[k] || 0) + 1; return m }, {}))) console.log(`  errore ×${n}: ${motivo}`)
} finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }) }
