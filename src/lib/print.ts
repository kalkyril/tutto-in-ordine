import type { Anagrafica, Labels, ModelloPdf, Parcella, RigaModello, Settings, VoceParcella } from '../types'
import { modelloEffettivo } from './modello'
import { calcolaParcella } from './calc'
import { type DettaglioCalcolo } from './compenso'
import { esc, decimal, money, fmtNum } from './format'
import { fmtDate } from './dates'
import { famigliaFont, fontFaceCss } from './font-documento'

/** HTML autonomo (CSS inline) della parcella/preventivo, da convertire in PDF dal processo principale. */
export function parcellaHtml(p: Parcella, voci: VoceParcella[], cliente: Anagrafica | null | undefined, s: Settings, L: Labels, praticaLabel?: string): string {
  if (p.tipo === 'proforma') return notaProFormaHtml(p, voci, cliente, s)
  const st = s.studio
  const titolo = p.tipo === 'preventivo' ? 'Preventivo' : p.tipo === 'nota_credito' ? 'Nota di credito' : s.profilo === 'avvocato' ? 'Parcella / Nota spese' : L.parcella
  const sec = (tipo: VoceParcella['tipo']) => voci.filter((v) => v.tipo === tipo)
  const rows = (list: VoceParcella[]) => list.map((v) => `<tr><td>${esc(v.descrizione)}</td><td class="n">${decimal(v.quantita)}</td><td class="n">${money(v.importo)}</td><td class="n">${money((v.quantita || 0) * (v.importo || 0))}</td></tr>`).join('')
  const block = (label: string, list: VoceParcella[]) => list.length ? `<tr class="sec"><td colspan="4">${label}</td></tr>${rows(list)}` : ''
  const line = (l: string, v: number, bold = false) => v || bold ? `<tr class="${bold ? 'tot' : ''}"><td>${l}</td><td class="n">${money(v)}</td></tr>` : ''
  const cliAddr = cliente ? [cliente.indirizzo, [cliente.cap, cliente.citta, cliente.provincia ? '(' + cliente.provincia + ')' : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)} ${esc(p.numero)}</title><style>
  @page{size:A4;margin:1.6cm}
  *{box-sizing:border-box} body{font:12px/1.45 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#111;margin:0}
  header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:18px}
  h1{font-size:20px;margin:0 0 2px} .muted{color:#555} .box{border:1px solid #ccc;border-radius:6px;padding:10px 12px;min-width:240px}
  table{width:100%;border-collapse:collapse;margin-top:6px} th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;text-align:left;color:#555;border-bottom:1px solid #999;padding:6px 4px}
  td{padding:5px 4px;border-bottom:1px solid #eee;vertical-align:top} .n{text-align:right;white-space:nowrap} th.n{text-align:right}
  .sec td{background:#f3f4f6;font-weight:600;font-size:11px} .totals{width:55%;margin-left:auto;margin-top:14px} .totals td{border:0;padding:3px 4px} .tot td{border-top:1.5px solid #111;font-weight:700;font-size:13px}
  .foot{margin-top:28px;font-size:11px;color:#444;border-top:1px solid #ddd;padding-top:10px;white-space:pre-wrap}
  </style></head><body>
  <header><div><h1>${esc(st.intestazione || st.nome || 'Studio')}</h1><div class="muted">${[st.indirizzo, st.cap_citta].filter(Boolean).map(esc).join(' — ')}<br>${[st.cf && 'C.F. ' + st.cf, st.piva && 'P.IVA ' + st.piva].filter(Boolean).map(esc).join(' · ')}<br>${[st.telefono, st.email, st.pec && 'PEC ' + st.pec].filter(Boolean).map(esc).join(' · ')}</div></div>
  <div class="box"><b>${esc(titolo)} n. ${esc(p.numero)}</b><br>del ${fmtDate(p.data)}${cliente ? `<br><br><b>${esc(cliente.denominazione)}</b><br>${esc(cliAddr)}<br>${[cliente.codice_fiscale && 'C.F. ' + cliente.codice_fiscale, cliente.partita_iva && 'P.IVA ' + cliente.partita_iva].filter(Boolean).map(esc).join(' · ')}` : ''}</div></header>
  ${p.oggetto || praticaLabel ? `<p><b>Oggetto:</b> ${esc(p.oggetto || '')}${praticaLabel ? `<br><span class="muted">${esc(L.pratica)}: ${esc(praticaLabel)}</span>` : ''}</p>` : ''}
  <table><thead><tr><th>Descrizione</th><th class="n">Q.tà</th><th class="n">Importo unit.</th><th class="n">Totale</th></tr></thead><tbody>
  ${block(s.profilo === 'avvocato' ? 'Compensi professionali' : 'Prestazioni e forniture', sec('compenso'))}${block('Spese imponibili', sec('spesa_imponibile'))}${block('Spese anticipate esenti IVA (art. 15 DPR 633/72)', sec('spesa_esente'))}</tbody></table>
  <table class="totals"><tbody>
  ${line('Compensi', p.compensi)}${p.sg_perc ? line(`Spese generali ${decimal(p.sg_perc)}%`, p.spese_generali) : ''}${p.cpa_perc ? line(`${esc(p.contributo_nome || 'CPA')} ${decimal(p.cpa_perc)}%`, p.cpa) : ''}
  ${line('Imponibile IVA', p.imponibile)}${p.iva_perc ? line(`IVA ${decimal(p.iva_perc)}%`, p.iva) : '<tr><td colspan="2" class="muted" style="font-size:10px">IVA non applicata nel prospetto: verificare il regime fiscale</td></tr>'}
  ${line('Spese esenti art. 15', p.spese_esenti)}${line('Imposta di bollo', p.bollo)}${line('Totale documento', p.totale, true)}
  ${p.tipo === 'preventivo' && p.validita ? `<tr><td>Valido fino al</td><td>${esc(fmtDate(p.validita))}</td></tr>` : ''}${p.rit_perc ? line(`Ritenuta d'acconto ${decimal(p.rit_perc)}%`, -p.ritenuta) + line('Netto a pagare', p.netto, true) : ''}
  </tbody></table>
  ${p.note ? `<div class="foot">${esc(p.note)}</div>` : ''}${st.iban ? `<div class="foot">Coordinate bancarie: ${esc(st.iban)}</div>` : ''}
  <p class="muted" style="font-size:10px;margin-top:18px">Documento operativo. Il PDF non viene trasmesso al Sistema di Interscambio e non sostituisce gli adempimenti di fatturazione elettronica e conservazione.</p><div class="foot" style="text-align:center">${righeHtml(modelloEffettivo(s).footer)}</div>
  </body></html>`
}

const eur2 = (n: number) => fmtNum(n)
const DIM: Record<string, string> = { grande: '18pt', media: '13pt', normale: '10pt', piccola: '9pt' }
const ALLIN: Record<string, string> = { sinistra: 'left', centro: 'center', destra: 'right' }

/** Righe personalizzabili (intestazione, coordinate di pagamento, piè di pagina) → HTML. */
export function righeHtml(righe: RigaModello[], modello?: ModelloPdf): string {
  return righe.filter((r) => r.testo.trim()).map((r) =>
    `<div style="text-align:${ALLIN[r.allineamento] || 'left'};font-size:${DIM[r.dimensione] || DIM.normale};${r.font ? `font-family:${esc(famigliaFont(r.font, modello?.fontPersonali))};` : ''}font-weight:${r.grassetto ? 700 : 400};font-style:${r.corsivo ? 'italic' : 'normal'};line-height:1.3;min-height:1em">${esc(r.testo)}</div>`).join('')
}
const LOGO_VALIDO = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/
const altezzaImmagine = (n: unknown, fallback: number, max: number) => Math.min(max, Math.max(16, Number(n) || fallback))
export function logoHtml(m: ModelloPdf): string {
  return immagineModelloHtml(m.logo, m.logoAltezza, m.logoAllineamento, 60, 140)
}
function immagineModelloHtml(src: string | null | undefined, height: unknown, align: string | undefined, fallback: number, max: number): string {
  return typeof src === 'string' && src.length < 4 * 1024 * 1024 && LOGO_VALIDO.test(src) ? `<div class="document-image" style="text-align:${ALLIN[align || 'centro'] || 'center'};margin-bottom:4pt"><img src="${src}" style="height:${altezzaImmagine(height, fallback, max)}px;max-width:100%;object-fit:contain" alt=""></div>` : ''
}
export function footerImmagineHtml(m: ModelloPdf): string {
  return immagineModelloHtml(m.immagineFooter, m.immagineFooterAltezza, m.immagineFooterAllineamento, 36, 64)
}

export function leggiDettaglio(p: { calcolo?: string | null }): DettaglioCalcolo | null {
  if (!p.calcolo) return null
  try { return JSON.parse(p.calcolo).dettaglio || null } catch { return null }
}

/** Modello autonomo TIO: dati economici e riferimenti scelti dal professionista. */
export function notaProFormaHtml(p: Parcella, voci: VoceParcella[], cliente: Anagrafica | null | undefined, s: Settings, anteprima = false): string {
  const m = modelloEffettivo(s), d = leggiDettaglio(p)
  const footerImage = footerImmagineHtml(m)
  const footerContent = `<div class="footer-content">${footerImage}${righeHtml(m.footer, m)}</div>`
  const footerRighe = m.footer.filter(r => r.testo.trim()).reduce((h, r) => h + ({ grande: 24, media: 17.34, normale: 13.34, piccola: 12 }[r.dimensione] || 13.34) * 1.3 * Math.max(1, Math.ceil(r.testo.length / 85)), 0)
  const margineInferiore = Math.max(32, Math.ceil((footerRighe + (footerImage ? altezzaImmagine(m.immagineFooterAltezza, 36, 64) + 6 : 0)) * 25.4 / 96 + 18))
  const euro = (value: number) => `€ ${eur2(value)}`
  const row = (label: string, value: number, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td><td class="amount">${euro(value)}</td></tr>`
  const address = cliente ? [cliente.denominazione, cliente.indirizzo, [cliente.cap, cliente.citta, cliente.provincia].filter(Boolean).join(' ')].filter(Boolean) : []
  const details = voci.map(v => row(v.descrizione + (v.quantita !== 1 ? ` (${decimal(v.quantita)} × ${euro(v.importo)})` : ''), (v.quantita || 0) * (v.importo || 0))).join('')
  const phases = d ? `<div class="calculation"><h2>Dettaglio del compenso</h2><p>${esc(d.tabelle)} · ${esc(d.competenza)}${d.valoreAffare ? ' · ' + esc(d.valoreAffare) : ''}</p><table><tbody>${d.fasi.map(f => row(f.nome + (d.nascondiTipo ? '' : ` (${f.tipo})`), f.importo)).join('')}${d.aumentoUlteriore ? row('Valutazione aggiuntiva', d.aumentoUlteriore) : ''}${(d.aumenti || (d.aumentoEsito ? [{ importo: d.aumentoEsito }] : [])).map((x, i) => row(`Maggiorazione ${i + 1}`, x.importo)).join('')}${(d.riduzioni || (d.riduzionePraticante ? [{ importo: d.riduzionePraticante }] : [])).map((x, i) => row(`Riduzione ${i + 1}`, -x.importo)).join('')}</tbody></table></div>` : ''
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Nota pro forma ${esc(p.numero)}</title><style>
  ${fontFaceCss(m)}
  @page{size:A4;margin:20mm 20mm 12mm} *{box-sizing:border-box}
  body{font:10pt/1.4 ${famigliaFont(m.fontDocumento, m.fontPersonali)};color:#172536;margin:0;${anteprima ? `position:relative;min-height:297mm;padding:20mm 20mm ${margineInferiore}mm;` : ''}}
  header{padding-bottom:4mm;border-bottom:2pt solid #24483e} .document-title{font-size:22pt;letter-spacing:.01em;margin:6mm 0 2mm;color:#24483e}
  .meta{font-size:9pt;color:#536276;margin-bottom:2mm}.recipient{margin:2mm 0 4mm;padding:0}.recipient div{min-height:4.5mm}
  h2{font-size:11pt;margin:5mm 0 2mm}table{width:100%;border-collapse:collapse;margin:2mm 0 4mm}thead{display:table-header-group}
  th{text-align:left;font-size:8pt;color:#536276;text-transform:uppercase;border-bottom:1pt solid #acbcb7;padding:2mm 0}
  td{padding:1.3mm 0;border-bottom:.5pt solid #e2e8e5;vertical-align:top}tr{break-inside:avoid}.amount{text-align:right;white-space:nowrap;width:34mm;padding-left:4mm}
  .totals{break-inside:avoid}.summary .net td{font-size:16pt;font-weight:700;border-top:2pt solid #24483e;border-bottom:0;color:#24483e;padding-top:2.5mm}
  .calculation{font-size:9pt;color:#536276}.calculation p{margin:1mm 0}.note{white-space:pre-wrap}.legal{font-size:8pt;color:#536276;margin:3mm 0}
  .document-layout{margin:0;border:0}.document-layout>tbody>tr{break-inside:auto}.document-layout>tbody>tr>td{padding:0;border:0}.document-layout>tfoot{display:table-footer-group}.document-layout>tfoot td{padding:6mm 0 0;border:0}.footer-reserve{visibility:hidden}.footer-content{font-size:8pt;line-height:1.4;color:#536276}
  footer{font-size:8pt;color:#536276;${anteprima ? 'position:absolute;left:20mm;right:20mm;bottom:12mm;' : 'position:fixed;left:0;right:0;bottom:0;'}}
  </style></head><body>${anteprima ? '' : '<table class="document-layout"><tbody><tr><td>'}<header>${logoHtml(m)}${righeHtml(m.intestazione, m)}</header>
  <h1 class="document-title">NOTA PRO FORMA</h1><div class="meta">N. ${esc(p.numero)} · ${fmtDate(p.data)}${m.mostraLuogoData && m.luogo ? ' · ' + esc(m.luogo) : ''}</div>
  ${address.length ? `<div class="recipient"><b>Destinatario</b>${address.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
  ${p.oggetto ? `<p><b>Oggetto:</b> ${esc(p.oggetto).replace(/\n/g, '<br>')}</p>` : ''}
  <table><thead><tr><th>Prestazione / spesa</th><th class="amount">Importo</th></tr></thead><tbody>${details}</tbody></table>
  ${phases}<div class="totals"><h2>Riepilogo degli importi</h2><table class="summary"><tbody>
  ${row('Compensi', p.compensi)}${p.spese_generali ? row(`Spese generali ${decimal(p.sg_perc)}%`, p.spese_generali) : ''}
  ${p.cpa ? row(`${p.contributo_nome || 'Contributo previdenziale'} ${decimal(p.cpa_perc)}%`, p.cpa) : ''}${row('Imponibile', p.imponibile)}
  ${p.iva ? row(`IVA ${decimal(p.iva_perc)}%`, p.iva) : ''}${p.spese_esenti ? row('Anticipazioni escluse art. 15', p.spese_esenti) : ''}
  ${p.bollo ? row('Bollo addebitato', p.bollo) : ''}${row('Totale', p.totale)}${p.ritenuta ? row(`Ritenuta d’acconto ${decimal(p.rit_perc)}%`, -p.ritenuta) : ''}${row('Netto da pagare', p.netto, 'net')}
  </tbody></table></div><p class="legal">Documento di richiesta del compenso. Non costituisce fattura elettronica e non viene trasmesso al Sistema di Interscambio.</p>
  ${m.pagamento.length ? `<div>${righeHtml(m.pagamento, m)}</div>` : ''}${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
  ${anteprima ? '' : `</td></tr></tbody><tfoot><tr><td><div class="footer-reserve" aria-hidden="true">${footerContent}</div></td></tr></tfoot></table>`}
  <footer>${footerContent}</footer></body></html>`
}

/** Documento di esempio per l'anteprima nell'editor del modello PDF. */
export function esempioNotaHtml(s: Settings, anteprima = true): string {
  const voci: VoceParcella[] = [{ tipo: 'compenso', descrizione: 'Compenso', quantita: 1, importo: 1985 }, { tipo: 'spesa_esente', descrizione: 'Contributo unificato', quantita: 1, importo: 100 }]
  const t = calcolaParcella(voci, { sg: 15, cpa: 4, iva: 22, rit: 20, bollo: 0 })
  const d: DettaglioCalcolo = { tabelle: '2022 (D.M. n. 147 del 13/08/2022)', competenza: 'assistenza stragiudiziale', valoreAffare: 'da € 5.201 a € 26.000', fasi: [{ nome: 'Compenso', tipo: 'valore medio', importo: 1985 }], base: 1985, ulteriorePct: 0, aumentoUlteriore: 0, baseUlteriore: 1985, esitoPct: 30, esitoBase: 0, aumentoEsito: 0, maggiorato: 1985, praticantePct: 0, riduzionePraticante: 0, compenso: 1985, nascondiTipo: false, nVociCalcolate: 1, trasferta: 0, altre: 0 }
  const p = { id: 0, anno: 2026, progressivo: 1, numero: 'PF 1/2026', pratica_id: null, cliente_id: null, tipo: 'proforma', data: new Date().toISOString().slice(0, 10), oggetto: '', stato: 'bozza', sg_perc: 15, cpa_perc: 4, iva_perc: 22, rit_perc: 20, ...t, calcolo: JSON.stringify({ dettaglio: { ...d, nVociCalcolate: 1 } }) } as unknown as Parcella
  const cli = { id: 0, tipo: 'persona', ruolo: 'cliente', denominazione: 'Mario Rossi', indirizzo: 'Via Garibaldi n. 10', cap: '41100', citta: 'Modena', provincia: 'MO', created_at: '' } as Anagrafica
  return notaProFormaHtml(p, voci, cli, s, anteprima)
}
