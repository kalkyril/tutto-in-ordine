import type { Anagrafica, Calendario, EventoEsterno, Pratica, Scadenza, Settings, Todo } from '../types'
import { addDays, startOfWeek, ymd } from './dates'
import { esc } from './format'

export type Periodo = 'oggi' | 'domani' | 'settimana' | 'prossima'
export const ETICHETTA_PERIODO: Record<Periodo, string> = { oggi: 'Oggi', domani: 'Domani', settimana: 'Questa settimana', prossima: 'Settimana prossima' }

export function intervallo(p: Periodo, adesso = new Date()): { da: string; a: string } {
  const g = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate())
  if (p === 'oggi') return { da: ymd(g), a: ymd(g) }
  if (p === 'domani') return { da: ymd(addDays(g, 1)), a: ymd(addDays(g, 1)) }
  const lun = startOfWeek(p === 'prossima' ? addDays(g, 7) : g)
  return { da: ymd(lun), a: ymd(addDays(lun, 6)) }
}

export interface VoceAgenda { giorno: string; ora: string; tipo: string; titolo: string; luogo?: string; pratica?: string; dettagli?: string; fonte?: string; completata?: boolean }
export interface DatiAgenda { scadenze: Scadenza[]; todos: Todo[]; eventi: EventoEsterno[]; calendari: Calendario[]; praticaById: Map<number, Pratica>; anagraficaById: Map<number, Anagrafica> }

const TIPI: Record<string, string> = { scadenza: 'Scadenza', udienza: 'Udienza', appuntamento: 'Appuntamento', altro: 'Altro' }

export function raccogli(d: DatiAgenda, da: string, a: string, opz: { attivita?: boolean; completate?: boolean } = {}): VoceAgenda[] {
  const out: VoceAgenda[] = []
  const infoPratica = (id: number | null | undefined) => {
    const p = id ? d.praticaById.get(id) : null
    if (!p) return { pratica: undefined, dettagli: undefined }
    const cli = p.cliente_id ? d.anagraficaById.get(p.cliente_id)?.denominazione : '', ctr = p.controparte_id ? d.anagraficaById.get(p.controparte_id)?.denominazione : ''
    return {
      pratica: `${p.numero ? p.numero + ' · ' : ''}${p.titolo}`,
      dettagli: [p.autorita, p.rg && `RG ${p.rg}`, p.giudice, cli && `Cliente: ${cli}`, ctr && `Controparte: ${ctr}`].filter(Boolean).join(' — ') || undefined,
    }
  }
  const ora = (s: string, tutto: boolean) => (tutto || s.length <= 10 ? '' : s.slice(11, 16))
  for (const s of d.scadenze) {
    const g = s.data_ora.slice(0, 10); if (g < da || g > a) continue
    if (s.completata && !opz.completate) continue
    out.push({ giorno: g, ora: ora(s.data_ora, !!s.tutto_il_giorno), tipo: TIPI[s.tipo] || 'Scadenza', titolo: s.titolo, luogo: s.luogo || undefined, ...infoPratica(s.pratica_id), completata: !!s.completata })
  }
  const attivi = new Set(d.calendari.filter((c) => c.attivo).map((c) => c.id))
  for (const e of d.eventi) {
    const g = e.inizio.slice(0, 10); if (g < da || g > a || !attivi.has(e.calendario_id)) continue
    out.push({ giorno: g, ora: ora(e.inizio, !!e.tutto_il_giorno), tipo: 'Calendario', titolo: e.titolo, luogo: e.luogo || undefined, fonte: d.calendari.find((c) => c.id === e.calendario_id)?.nome, ...infoPratica(e.pratica_id) })
  }
  if (opz.attivita) for (const t of d.todos) {
    if (!t.scadenza || (t.completata && !opz.completate)) continue
    const g = t.scadenza.slice(0, 10); if (g < da || g > a) continue
    out.push({ giorno: g, ora: ora(t.scadenza, false), tipo: 'Compito', titolo: t.titolo, ...infoPratica(t.pratica_id), completata: !!t.completata })
  }
  return out.sort((x, y) => x.giorno.localeCompare(y.giorno) || (x.ora || '00:00').localeCompare(y.ora || '00:00') || x.titolo.localeCompare(y.titolo))
}

const GIORNO = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const MESE = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const dataLunga = (ymdStr: string) => { const [y, m, g] = ymdStr.split('-').map(Number); const d = new Date(y, m - 1, g); return `${GIORNO[d.getDay()]} ${g} ${MESE[m - 1]} ${y}` }

export function agendaHtml(titolo: string, da: string, a: string, voci: VoceAgenda[], s: Settings, generato = new Date()): string {
  const nome = s.studio?.intestazione || s.studio?.nome || 'TIO'
  const giorni: string[] = []; for (let d = new Date(da + 'T00:00:00'); ymd(d) <= a; d = addDays(d, 1)) giorni.push(ymd(d))
  const perGiorno = new Map<string, VoceAgenda[]>(); for (const v of voci) perGiorno.set(v.giorno, [...(perGiorno.get(v.giorno) || []), v])
  const periodo = da === a ? dataLunga(da) : `${dataLunga(da)} – ${dataLunga(a)}`
  const blocchi = giorni.filter((g) => da === a || perGiorno.has(g)).map((g) => {
    const lista = perGiorno.get(g) || []
    return `<section><h2>${esc(dataLunga(g))}</h2>${lista.length ? `<table><tbody>${lista.map((v) => `<tr class="${v.completata ? 'ok' : ''}"><td class="o">${esc(v.ora || 'tutto il giorno')}</td><td class="t"><b>${esc(v.tipo)}</b></td><td><b>${esc(v.titolo)}</b>${v.luogo ? `<br>${esc(v.luogo)}` : ''}${v.pratica ? `<br><span class="m">${esc(v.pratica)}</span>` : ''}${v.dettagli ? `<br><span class="m">${esc(v.dettagli)}</span>` : ''}${v.fonte ? `<br><span class="m">da ${esc(v.fonte)}</span>` : ''}</td><td class="c">☐</td></tr>`).join('')}</tbody></table>` : '<p class="m">Nessun impegno.</p>'}</section>`
  }).join('')
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title><style>
  @page{size:A4;margin:1.5cm}*{box-sizing:border-box}body{font:12px/1.4 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#111;margin:0}
  header{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px}h1{font-size:18px;margin:0}.m{color:#555;font-size:11px}
  h2{font-size:13px;text-transform:capitalize;margin:16px 0 4px;padding:4px 8px;background:#eceff3;border-radius:4px;break-after:avoid}
  table{width:100%;border-collapse:collapse}tr{break-inside:avoid}td{padding:6px 6px;border-bottom:1px solid #ddd;vertical-align:top}.o{width:92px;white-space:nowrap;font-variant-numeric:tabular-nums}.t{width:96px}.c{width:24px;text-align:center}tr.ok td{color:#777;text-decoration:line-through}
  footer{margin-top:18px;font-size:10px;color:#777;border-top:1px solid #ddd;padding-top:6px}
  </style></head><body><header><h1>${esc(titolo)}</h1><div class="m">${esc(nome)} — ${esc(periodo)}</div></header>${voci.length || da === a ? blocchi : '<p>Nessun impegno nel periodo.</p>'}<footer>Stampato il ${String(generato.getDate()).padStart(2, '0')}/${String(generato.getMonth() + 1).padStart(2, '0')}/${generato.getFullYear()} alle ${String(generato.getHours()).padStart(2, '0')}:${String(generato.getMinutes()).padStart(2, '0')} · ${voci.length} impegni</footer></body></html>`
}
