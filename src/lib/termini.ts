/**
 * Calcolo dei termini processuali: in avanti (dalla notifica o dalla pubblicazione) e a ritroso (dall'udienza).
 *
 * Regole applicate (verificate il 21/10/2026, da confermare sempre sul caso concreto):
 * - il giorno iniziale non si conta (art. 155, 1° comma c.p.c.); nel termine libero non si conta neppure l'ultimo;
 * - i termini a mesi o ad anni seguono il calendario comune (art. 155, 2° comma): stesso giorno del mese, o l'ultimo se manca;
 * - sospensione feriale (L. 742/1969): dal 1° al 31 agosto (dal 2015, D.L. 132/2014; prima fino al 15 settembre).
 *   Vale anche per i termini a ritroso (Cass. 12044/2010). Non vale per alcune materie (lavoro, cautelari, ecc.): si disattiva;
 * - in avanti: se l'ultimo giorno è festivo si proroga al primo giorno seguente non festivo (art. 155, 4° comma);
 *   il sabato si proroga al lunedì (5° comma) nel civile, amministrativo e tributario, non nel penale;
 * - a ritroso: festivo o sabato si anticipano al giorno utile precedente (Cass. 21335/2017 e 23634/2024);
 * - festività nazionali (L. 260/1949 e succ.), compreso il 4 ottobre dal 2026 (L. 151/2025). Il santo patrono non è considerato.
 */

export type Verso = 'avanti' | 'ritroso'
export type Unita = 'giorni' | 'mesi' | 'anni'
export type Rito = 'civile' | 'penale'

export interface TermineInput {
  data: string // AAAA-MM-GG
  verso: Verso
  quantita: number
  unita: Unita
  sospensione: boolean
  libero: boolean
  rito: Rito
}
export interface TermineRisultato { scadenza: string; passi: string[]; avvisi: string[] }

/* ---------- date senza fuso orario: un giorno è un intero (giorni dal 1970) ---------- */
const GIORNO = 86_400_000
const daIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / GIORNO }
const aIso = (g: number) => new Date(g * GIORNO).toISOString().slice(0, 10)
const parti = (g: number) => { const d = new Date(g * GIORNO); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() } }
const giorno = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / GIORNO

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
/** «martedì 15 settembre 2026» */
export const dataLunga = (iso: string) => { const p = parti(daIso(iso)); return `${GIORNI[p.dow]} ${p.d} ${MESI[p.m - 1]} ${p.y}` }
const lunga = (g: number) => dataLunga(aIso(g))
const breve = (g: number) => { const p = parti(g); return `${p.d} ${MESI[p.m - 1]} ${p.y}` }

/** Domenica di Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher). */
export function pasqua(y: number): number {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mese = Math.floor((h + l - 7 * m + 114) / 31), gg = ((h + l - 7 * m + 114) % 31) + 1
  return giorno(y, mese, gg)
}

/** Festività nazionali dell'anno: giorno → nome. */
export function festivita(y: number): Map<number, string> {
  const f = new Map<number, string>([
    [giorno(y, 1, 1), 'Capodanno'], [giorno(y, 1, 6), 'Epifania'], [giorno(y, 4, 25), 'Festa della Liberazione'],
    [giorno(y, 5, 1), 'Festa del Lavoro'], [giorno(y, 6, 2), 'Festa della Repubblica'], [giorno(y, 8, 15), 'Ferragosto'],
    [giorno(y, 11, 1), 'Ognissanti'], [giorno(y, 12, 8), 'Immacolata Concezione'], [giorno(y, 12, 25), 'Natale'], [giorno(y, 12, 26), 'Santo Stefano'],
  ])
  const p = pasqua(y)
  f.set(p, 'Pasqua'); f.set(p + 1, "Lunedì dell'Angelo")
  if (y >= 2026) f.set(giorno(y, 10, 4), "San Francesco d'Assisi")
  return f
}
const nomeFestivo = (g: number) => festivita(parti(g).y).get(g)

/** Motivo per cui il giorno non è utile per il termine, o null se è utile. */
function nonUtile(g: number, rito: Rito): string | null {
  const festa = nomeFestivo(g)
  if (festa) return `festivo (${festa})`
  const dow = parti(g).dow
  if (dow === 0) return 'domenica'
  if (dow === 6 && rito !== 'penale') return 'sabato'
  return null
}
/** Scadenze fiscali: sabato, domenica e festivi slittano al primo giorno lavorativo seguente (art. 7 DL 70/2011). */
export function primoLavorativo(iso: string): string {
  let g = daIso(iso)
  while (nonUtile(g, 'civile')) g++
  return aIso(g)
}

/** Periodo di sospensione feriale dell'anno, estremi compresi. */
export function periodoFeriale(y: number): [number, number] {
  return [giorno(y, 8, 1), y >= 2015 ? giorno(y, 8, 31) : giorno(y, 9, 15)]
}
const sospeso = (g: number) => { const [a, b] = periodoFeriale(parti(g).y); return g >= a && g <= b }
const fineFeriale = (y: number) => periodoFeriale(y)[1]
const testoFeriale = (y: number) => (y >= 2015 ? `1–31 agosto ${y}` : `1 agosto – 15 settembre ${y}`)

/** Aggiunge (o toglie) mesi secondo il calendario comune: stesso giorno, o l'ultimo del mese se manca. */
function spostaMesi(g: number, mesi: number): number {
  const p = parti(g)
  const tot = p.y * 12 + (p.m - 1) + mesi
  const y = Math.floor(tot / 12), m = (tot % 12) + 1
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return giorno(y, m, Math.min(p.d, ultimo))
}

/** Giorni di sospensione compresi tra due date (estremi compresi, a < b). */
function giorniSospesi(a: number, b: number): number {
  let n = 0
  for (let y = parti(a).y; y <= parti(b).y; y++) {
    const [s, e] = periodoFeriale(y)
    const da = Math.max(s, a), a2 = Math.min(e, b)
    if (a2 >= da) n += a2 - da + 1
  }
  return n
}

export function calcolaTermine(i: TermineInput): TermineRisultato {
  const passi: string[] = [], avvisi: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.data) || !(i.quantita > 0)) return { scadenza: '', passi, avvisi }
  const avanti = i.verso === 'avanti', dir = avanti ? 1 : -1
  const start = daIso(i.data)
  const unita = i.quantita === 1 ? { giorni: 'giorno', mesi: 'mese', anni: 'anno' }[i.unita] : i.unita
  passi.push(`${avanti ? 'Data di partenza' : "Data dell'udienza"}: ${lunga(start)} (non si conta).`)

  let fine: number
  if (i.unita === 'giorni') {
    const n = i.quantita + (i.libero ? 1 : 0)
    let g = start, contati = 0, saltati = 0
    while (contati < n) { g += dir; if (i.sospensione && sospeso(g)) { saltati++; continue } contati++ }
    fine = g
    const esclusi = saltati ? `, esclusi i ${saltati} giorni di sospensione feriale${feriePassate(Math.min(start, fine), Math.max(start, fine))}` : ''
    passi.push(`${i.quantita} ${unita} ${avanti ? 'in avanti' : 'a ritroso'}${esclusi}${i.libero ? ', termine libero (non si conta neppure l\'ultimo giorno)' : ''}: ${lunga(fine)}.`)
  } else {
    const mesi = i.quantita * (i.unita === 'anni' ? 12 : 1)
    let base = start
    if (i.sospensione && sospeso(start)) {
      const y = parti(start).y
      base = avanti ? fineFeriale(y) : periodoFeriale(y)[0]
      passi.push(`La data cade nella sospensione feriale (${testoFeriale(y)}): il conteggio parte ${avanti ? 'dalla fine' : "dall'inizio"} del periodo.`)
    }
    fine = spostaMesi(base, dir * mesi)
    passi.push(`${i.quantita} ${unita} ${avanti ? 'in avanti' : 'a ritroso'} secondo il calendario: ${lunga(fine)}.`)
    if (i.sospensione) {
      // i giorni sospesi compresi nel periodo allungano il termine; l'allungamento può incontrare un altro agosto
      let da = avanti ? base + 1 : fine, a = avanti ? fine : base - 1, totale = 0
      for (let k = 0; k < 10; k++) {
        const n = giorniSospesi(Math.min(da, a), Math.max(da, a))
        if (!n) break
        totale += n
        const prima = fine
        fine += dir * n
        if (avanti) { da = prima + 1; a = fine } else { da = fine; a = prima - 1 }
      }
      if (totale) passi.push(`Aggiunti ${totale} giorni di sospensione feriale${feriePassate(Math.min(start, fine), Math.max(start, fine))}: ${lunga(fine)}.`)
    }
    if (i.libero) { fine += dir; passi.push(`Termine libero: non si conta neppure l'ultimo giorno, ${lunga(fine)}.`) }
  }

  // ultimo giorno non utile: in avanti si proroga, a ritroso si anticipa
  const primo = fine
  for (let k = 0; k < 15; k++) {
    const motivo = nonUtile(fine, i.rito)
    if (!motivo) break
    if (fine === primo) passi.push(`Il ${breve(fine)} ${motivo === 'sabato' || motivo === 'domenica' ? `cade di ${motivo}` : `è ${motivo}`}: ${avanti ? 'si proroga al primo giorno utile successivo' : 'si anticipa al giorno utile precedente'}${avanti && motivo === 'sabato' ? " (art. 155, 5° comma c.p.c.)" : avanti ? ' (art. 155, 4° comma c.p.c.)' : ' (Cass. 21335/2017)'}.`)
    fine += dir
  }
  if (fine !== primo) passi.push(`Ultimo giorno utile: ${lunga(fine)}.`)
  if (i.sospensione && sospeso(fine)) avvisi.push('La scadenza cade nel periodo di sospensione feriale: verifica il caso concreto.')
  if (i.rito === 'penale' && parti(fine).dow === 6) avvisi.push('Nel penale il sabato non proroga il termine (art. 172 c.p.p.).')
  return { scadenza: aIso(fine), passi, avvisi }
}

/** « (1–31 agosto 2026)» o più anni. */
function feriePassate(a: number, b: number): string {
  const anni: string[] = []
  for (let y = parti(a).y; y <= parti(b).y; y++) { const [s, e] = periodoFeriale(y); if (e >= a && s <= b) anni.push(testoFeriale(y)) }
  return anni.length ? ` (${anni.join('; ')})` : ''
}

/* ---------- termini più usati (civile): compilano il calcolo, restano modificabili ---------- */
export interface Preset { id: string; nome: string; rif: string; verso: Verso; quantita: number; unita: Unita; libero?: boolean; senzaSospensione?: boolean; titolo: string }
export const PRESET: Preset[] = [
  { id: 'appello-breve', nome: 'Appello, termine breve', rif: 'art. 325 c.p.c.', verso: 'avanti', quantita: 30, unita: 'giorni', titolo: 'Termine per l\'appello (breve)' },
  { id: 'appello-lungo', nome: 'Appello, termine lungo', rif: 'art. 327 c.p.c.', verso: 'avanti', quantita: 6, unita: 'mesi', titolo: 'Termine per l\'appello (lungo)' },
  { id: 'cassazione-breve', nome: 'Ricorso per cassazione, termine breve', rif: 'art. 325 c.p.c.', verso: 'avanti', quantita: 60, unita: 'giorni', titolo: 'Termine per il ricorso per cassazione (breve)' },
  { id: 'cassazione-lungo', nome: 'Ricorso per cassazione, termine lungo', rif: 'art. 327 c.p.c.', verso: 'avanti', quantita: 6, unita: 'mesi', titolo: 'Termine per il ricorso per cassazione (lungo)' },
  { id: 'opposizione-di', nome: 'Opposizione a decreto ingiuntivo', rif: 'art. 641 c.p.c.', verso: 'avanti', quantita: 40, unita: 'giorni', titolo: 'Termine per l\'opposizione a decreto ingiuntivo' },
  { id: 'reclamo-cautelare', nome: 'Reclamo cautelare', rif: 'art. 669-terdecies c.p.c.', verso: 'avanti', quantita: 15, unita: 'giorni', senzaSospensione: true, titolo: 'Termine per il reclamo cautelare' },
  { id: 'citazione', nome: 'Notifica della citazione (termine libero)', rif: 'art. 163-bis c.p.c.', verso: 'ritroso', quantita: 120, unita: 'giorni', libero: true, titolo: 'Ultimo giorno per notificare la citazione' },
  { id: 'costituzione-convenuto', nome: 'Costituzione del convenuto', rif: 'art. 166 c.p.c.', verso: 'ritroso', quantita: 70, unita: 'giorni', titolo: 'Termine per la costituzione del convenuto' },
  { id: 'memoria-1', nome: 'Prima memoria integrativa', rif: 'art. 171-ter, n. 1 c.p.c.', verso: 'ritroso', quantita: 40, unita: 'giorni', titolo: 'Prima memoria integrativa (art. 171-ter)' },
  { id: 'memoria-2', nome: 'Seconda memoria integrativa', rif: 'art. 171-ter, n. 2 c.p.c.', verso: 'ritroso', quantita: 20, unita: 'giorni', titolo: 'Seconda memoria integrativa (art. 171-ter)' },
  { id: 'memoria-3', nome: 'Terza memoria integrativa', rif: 'art. 171-ter, n. 3 c.p.c.', verso: 'ritroso', quantita: 10, unita: 'giorni', titolo: 'Terza memoria integrativa (art. 171-ter)' },
]
