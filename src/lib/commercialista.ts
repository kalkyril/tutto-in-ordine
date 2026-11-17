// Pacchetto per il commercialista (1.0.4): per un anno o un trimestre, un riepilogo da stampare e i file CSV che si
// aprono con Excel (separatore «;», virgola decimale, date gg/mm/aaaa), più l'elenco delle contabili da copiare.
// Logica pura: riceve i dati già letti e restituisce testi; il salvataggio lo fa il processo principale.
import type { Anagrafica, Parcella, Pratica, Settings } from '../types'
import type { CostoBase, FatturaServizio, Movimento } from './pagamenti'
import type { Conto, MovimentoConto, SaldoConto, StimaFiscale } from './budget'
import { fattureDoppie } from './pagamenti'
import { primaNotaCsv } from './report'

export type Periodo = 'anno' | 'T1' | 'T2' | 'T3' | 'T4'
export const NOMI_PERIODO: Record<Periodo, string> = { anno: 'Anno intero', T1: '1° trimestre', T2: '2° trimestre', T3: '3° trimestre', T4: '4° trimestre' }
/** Primo e ultimo giorno del periodo. */
export function intervallo(anno: number, p: Periodo): [string, string] {
  if (p === 'anno') return [`${anno}-01-01`, `${anno}-12-31`]
  const t = Number(p[1]), da = (t - 1) * 3 + 1, a = t * 3, fine = new Date(Date.UTC(anno, a, 0)).getUTCDate()
  return [`${anno}-${String(da).padStart(2, '0')}-01`, `${anno}-${String(a).padStart(2, '0')}-${fine}`]
}

const cella = (x: unknown) => { let s = String(x ?? '').replace(/[\r\n]+/g, ' ').trim(); if (/^[=+@\-\t]/.test(s) && !/^-?\d/.test(s)) s = "'" + s; return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const csv = (righe: unknown[][]) => '﻿' + righe.map((r) => r.map(cella).join(';')).join('\r\n') + '\r\n'
const n = (x: number) => (Math.round((x || 0) * 100) / 100).toFixed(2).replace('.', ',')
const d = (s?: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '')
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const euro = (x: number) => (Math.round((x || 0) * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const tondo = (x: number) => Math.round(x * 100) / 100

export interface DatiPacchetto {
  anno: number; periodo: Periodo; settings: Settings
  parcelle: Parcella[]; costi: (CostoBase & { contabile?: string | null; recuperabile?: number })[]; fatture: FatturaServizio[]
  movimenti: Movimento[]; conti: Conto[]; manuali: MovimentoConto[]; saldi: SaldoConto[]
  anagraficaById: Map<number, Anagrafica>; praticaById: Map<number, Pratica>; stima?: StimaFiscale | null
}
export interface Pacchetto { nome: string; file: { nome: string; testo: string }[]; riepilogo: string; contabili: { file: string; nome: string }[]; conteggi: Record<string, number> }

export function pacchettoCommercialista(x: DatiPacchetto): Pacchetto {
  const [da, a] = intervallo(x.anno, x.periodo), dentro = (s?: string | null) => !!s && s.slice(0, 10) >= da && s.slice(0, 10) <= a
  const st = x.settings.studio, chi = (id?: number | null) => (id ? x.anagraficaById.get(id) : undefined)
  const nomeConto = (id?: number | null) => x.conti.find((c) => c.id === id)?.nome || x.conti.find((c) => c.predefinito)?.nome || ''
  const doppie = fattureDoppie(x.fatture, x.parcelle)

  // documenti emessi: quelli di TIO e quelli del servizio di fatturazione (senza doppioni)
  const emessiTio = x.parcelle.filter((p) => (p.tipo === 'parcella' || p.tipo === 'nota_credito') && p.stato !== 'bozza' && p.stato !== 'annullata' && dentro(p.data))
  const emessiServ = x.fatture.filter((f) => f.verso === 'emessa' && !f.nascosta && !doppie.has(f.id) && dentro(f.data))
  const docEmessi = csv([
    ['Data', 'Numero', 'Tipo', 'Cliente', 'Partita IVA', 'Codice fiscale', 'Imponibile', 'Cassa', 'IVA', 'Ritenuta', 'Bollo', 'Totale', 'Netto a pagare', 'Incassato', 'Stato', 'Fonte'],
    ...emessiTio.map((p) => { const c = chi(p.cliente_id); return [d(p.data), p.numero, p.tipo === 'nota_credito' ? 'Nota di credito' : 'Fattura', c?.denominazione, c?.partita_iva, c?.codice_fiscale, n(p.imponibile - (p.cpa || 0)), n(p.cpa || 0), n(p.iva), n(p.ritenuta), n(p.bollo), n(p.totale), n(p.netto), n(p.stato === 'pagata' ? p.netto : p.incassato || 0), p.stato, 'TIO'] }),
    ...emessiServ.map((f) => [d(f.data), f.numero, f.tipo === 'TD04' ? 'Nota di credito' : 'Fattura', f.controparte, f.piva, f.cf, n(f.imponibile - (f.cassa || 0)), n(f.cassa || 0), n(f.iva), n(f.ritenuta), n(f.bollo), n(f.totale), n(f.netto), n(f.regolata_il ? f.netto : 0), f.regolata_il ? 'incassata' : 'da incassare', 'Servizio di fatturazione']),
  ])
  const incassi = x.movimenti.filter((m) => m.stato === 'incassate' && dentro(m.data))
  const fileIncassi = csv([['Data', 'Documento', 'Cliente', 'Importo', 'Conto'], ...incassi.map((m) => [d(m.data), m.descrizione, m.parcella ? chi(m.parcella.cliente_id)?.denominazione : m.fattura?.controparte, n(m.importo), nomeConto(m.conto_id)])])

  // uscite annotate in TIO: pagate nel periodo, oppure con scadenza nel periodo e ancora da pagare
  const uscite = x.costi.filter((c) => (c.pagata ? dentro(c.pagata_il || c.scadenza || c.data) : dentro(c.scadenza || c.data)))
  const contabileDi = (c: { contabile?: string | null }) => { try { const j = JSON.parse(c.contabile || 'null'); return j && typeof j.file === 'string' ? j as { file: string; nome: string } : null } catch { return null } }
  const fileUscite = csv([['Data', 'Descrizione', 'Categoria', 'Fornitore', 'Partita IVA', 'Importo', 'Stato', 'Pagata il', 'Conto', 'Contabile', 'Lavoro', 'Da riaddebitare'],
    ...uscite.map((c) => { const f = chi(c.fornitore_id); return [d(c.data), c.descrizione, c.categoria, f?.denominazione, f?.partita_iva, n(c.importo), c.pagata ? 'pagata' : 'da pagare', d(c.pagata ? c.pagata_il || c.scadenza || c.data : null), c.pagata ? nomeConto(c.conto_id) : '', contabileDi(c)?.nome || '', c.pratica_id ? x.praticaById.get(c.pratica_id)?.titolo : '', c.recuperabile ? 'sì' : ''] })])
  const ricevute = x.fatture.filter((f) => f.verso === 'ricevuta' && !f.nascosta && dentro(f.data))
  const fileRicevute = csv([['Data', 'Numero', 'Fornitore', 'Partita IVA', 'Codice fiscale', 'Imponibile', 'IVA', 'Ritenuta', 'Totale', 'Netto a pagare', 'Pagata il', 'Conto', 'Categoria', 'File'],
    ...ricevute.map((f) => [d(f.data), f.numero, f.controparte, f.piva, f.cf, n(f.imponibile), n(f.iva), n(f.ritenuta), n(f.totale), n(f.netto), d(f.regolata_il), f.regolata_il ? nomeConto(f.conto_id) : '', f.categoria || '', f.file])])
  const manuali = x.manuali.filter((m) => dentro(m.data))
  const fileConti = csv([['Data', 'Conto', 'Descrizione', 'Categoria', 'Importo', 'Verso il conto'], ...manuali.map((m) => [d(m.data), nomeConto(m.conto_id), m.descrizione, m.categoria, n(m.verso_conto_id ? -Math.abs(m.importo) : m.importo), m.verso_conto_id ? nomeConto(m.verso_conto_id) : ''])])
  const fileSaldi = csv([['Conto', 'Tipo', 'IBAN', `Saldo al ${d(a)}`], ...x.saldi.map((s) => [s.conto.nome, s.conto.tipo, s.conto.iban, n(s.saldo)])])
  const nomeDoc = x.settings.profilo === 'avvocato' ? 'Parcella' : 'Fattura'

  const file = [
    { nome: 'Documenti emessi.csv', testo: docEmessi }, { nome: 'Incassi.csv', testo: fileIncassi }, { nome: 'Uscite.csv', testo: fileUscite },
    ...(ricevute.length ? [{ nome: 'Fatture ricevute.csv', testo: fileRicevute }] : []),
    ...(x.conti.length ? [{ nome: 'Saldi dei conti.csv', testo: fileSaldi }, ...(manuali.length ? [{ nome: 'Movimenti dei conti.csv', testo: fileConti }] : [])] : []),
    ...(x.periodo === 'anno' ? [{ nome: 'Prima nota.csv', testo: primaNotaCsv(x.parcelle, x.anagraficaById, x.praticaById, x.anno, nomeDoc) }] : []),
  ]
  const contabili = uscite.filter((c) => c.pagata).map((c) => { const k = contabileDi(c); return k ? { file: k.file, nome: `${(c.pagata_il || c.data).slice(0, 10)} ${c.descrizione}`.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 90) + (k.nome.match(/\.[a-z0-9]{2,5}$/i)?.[0] || '') } : null }).filter((v): v is { file: string; nome: string } => !!v)

  // ---- riepilogo stampabile
  const somma = <T,>(l: T[], f: (v: T) => number) => tondo(l.reduce((s, v) => s + f(v), 0))
  const totEmessi = { imponibile: somma(emessiTio, (p) => p.imponibile) + somma(emessiServ, (f) => f.imponibile), iva: somma(emessiTio, (p) => p.iva) + somma(emessiServ, (f) => f.iva), ritenute: somma(emessiTio, (p) => p.ritenuta) + somma(emessiServ, (f) => f.ritenuta), n: emessiTio.length + emessiServ.length }
  const perCategoria = new Map<string, { pagato: number; daPagare: number }>()
  for (const c of uscite) { const r = perCategoria.get(c.categoria) || { pagato: 0, daPagare: 0 }; if (c.pagata) r.pagato += c.importo; else r.daPagare += c.importo; perCategoria.set(c.categoria, r) }
  const tabella = (intest: string[], righe: string[][], numeri: number[] = []) => `<table><thead><tr>${intest.map((h, i) => `<th${numeri.includes(i) ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${righe.map((r) => `<tr>${r.map((c, i) => `<td${numeri.includes(i) ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  const titolo = `${NOMI_PERIODO[x.periodo]} ${x.anno}`
  const riepilogo = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Riepilogo ${esc(titolo)}</title><style>
  @page{size:A4;margin:16mm 16mm 18mm}body{font:10pt/1.45 Helvetica,Arial,sans-serif;color:#14202e;margin:0}
  h1{font-size:18pt;margin:0 0 2mm}h2{font-size:12pt;margin:7mm 0 2mm;padding-bottom:1mm;border-bottom:.6pt solid #9aa5b1}
  .sotto{color:#536276;margin:0 0 5mm}table{width:100%;border-collapse:collapse;margin:0 0 2mm}th,td{text-align:left;padding:1.2mm 1.6mm;border-bottom:.4pt solid #d6dbe1;vertical-align:top}
  th{font-size:8.5pt;color:#536276;font-weight:600}.n{text-align:right;white-space:nowrap}.nota{font-size:8.5pt;color:#536276;margin-top:6mm}</style></head><body>
  <h1>Riepilogo ${esc(titolo)}</h1><p class="sotto">${esc(st.intestazione || st.nome || '')}${st.piva ? ` · P.IVA ${esc(st.piva)}` : ''}${st.cf ? ` · C.F. ${esc(st.cf)}` : ''} · dal ${d(da)} al ${d(a)} · preparato con TIO il ${d(new Date().toISOString())}</p>
  <h2>Documenti emessi</h2>${tabella(['', 'Importo'], [['Numero di documenti', String(totEmessi.n)], ['Imponibile (cassa compresa)', euro(totEmessi.imponibile)], ['IVA', euro(totEmessi.iva)], ['Ritenute d’acconto subite', euro(totEmessi.ritenute)], ['Incassato nel periodo', euro(somma(incassi, (m) => m.importo))]], [1])}
  <h2>Uscite per categoria</h2>${tabella(['Categoria', 'Pagato', 'Da pagare'], [...perCategoria].sort((p, q) => q[1].pagato - p[1].pagato).map(([k, v]) => [k, euro(v.pagato), euro(v.daPagare)]), [1, 2])}
  ${ricevute.length ? `<h2>Fatture ricevute (dal servizio di fatturazione)</h2>${tabella(['', 'Importo'], [['Numero di fatture', String(ricevute.length)], ['Imponibile', euro(somma(ricevute, (f) => f.imponibile))], ['IVA', euro(somma(ricevute, (f) => f.iva))]], [1])}` : ''}
  ${x.saldi.length ? `<h2>Saldi dei conti al ${d(a)}</h2>${tabella(['Conto', 'IBAN', 'Saldo'], x.saldi.map((s) => [s.conto.nome, s.conto.iban || '', euro(s.saldo)]), [2])}` : ''}
  ${x.stima ? `<h2>Tasse e contributi stimati (${x.stima.regime === 'forfettario' ? 'regime forfettario' : 'regime ordinario'}, anno ${x.anno})</h2>${tabella(['Voce', 'Importo'], [...x.stima.righe.map((r) => [r.voce, euro(r.importo)]), ['Totale stimato', euro(x.stima.totale)], ['Già pagati nell’anno', euro(x.stima.giaPagato)]], [1])}` : ''}
  <p class="nota">I dati vengono da TIO: documenti emessi e incassi registrati, uscite annotate${x.fatture.length ? ', fatture lette dai file del servizio di fatturazione (in sola lettura)' : ''}. Le stime fiscali sono indicative e vanno verificate. File allegati: ${file.map((f) => esc(f.nome)).join(', ')}${contabili.length ? `, cartella Contabili (${contabili.length})` : ''}.</p>
  </body></html>`
  return { nome: `TIO per il commercialista - ${titolo}`, file, riepilogo, contabili, conteggi: { emessi: totEmessi.n, incassi: incassi.length, uscite: uscite.length, ricevute: ricevute.length, contabili: contabili.length } }
}
