import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { Btn, Input, Select, Tabs, useAction } from './ui'
import { calcolaParcella } from '../lib/calc'
import { PRATICANTE_RANGE, RIFERIMENTO_VARIAZIONE, riferimentoPraticante, SCAGLIONE_OLTRE_32M, SCAGLIONE_OLTRE_520K, ambitoDi, calcolaCompenso, conciliazioneSostituisceFase, costruisciDettaglio, descrizioneCompenso, opzioniPctPiuParti, riferimentoUlteriore, variazioniValide, ternaCalcolata, maxPctPiuParti, type Ambito, type CompensoInput, type DettaglioCalcolo, type Scelta, type Terna, type VarDef, type VarId, type Variazioni } from '../lib/compenso'
import { decimal, fmtNum, parseNumber } from '../lib/format'
import { righeProspetto } from '../lib/prospetto'
import type { VoceParcella } from '../types'

/**
 * Form del calcolo compensi: stessa impostazione del prospetto dei parametri ministeriali
 * (Tabelle, Competenza, Compenso tabellare/percentuale, Scaglione, Valore, fasi con Min/Med/Max e importo libero,
 * pannelli Aumenti / Riduzioni / Spese, spese generali, accessori IVA-CPA-ritenuta, "Nascondi tipo compenso").
 * Le tariffe sono lette dal sito (con cache e tabelle incluse in caso di assenza di rete).
 */

interface CompetenzaVoce { cod: number; nome: string; ambito: Ambito; anni: number[] }
interface Struttura {
  anno: number; competenza: number; fasi: { cod: string; nome: string }[]
  scaglioni: { id: number; label: string; calcolato: boolean }[]; senzaScaglioni?: boolean; variazione: [number, number]
  fonte: string; scaricato_il: string; online: boolean
}
interface Valori { valori: Record<string, Terna>; fonte: 'online' | 'cache' | 'incluse'; ts?: string; errore?: string | null; aggiornato?: boolean }

/** Stato serializzabile del form (salvato con la parcella per poterla riaprire identica). */
export interface CalcState {
  anno: 2022 | 2014; competenza: number; tipo: 'tabellare' | 'percentuale'; scaglione: number
  valore: string; metodo: 'F' | 'S'; pct: string
  fasi: Record<string, { attiva: boolean; scelta: Scelta; libero: string }>
  ulteriore: string; praticante: string; esito: boolean; esitoImp: string
  speseEsenti: string; trasferta: string; altre: string; sgOn: boolean; sgPct: string
  ivaOn: boolean; cpaOn: boolean; ritOn: boolean; nascondiTipo: boolean
  ulterioreOn?: boolean; praticanteOn?: boolean
  // aumenti e riduzioni del civile e del penale
  parti?: string; pctParti?: string
  variazioni?: Record<string, { on: boolean; pct: string; importo: string }>
}

export interface CalcRisultato {
  voci: VoceParcella[]
  aliquote: { sg_perc: number; cpa_perc: number; iva_perc: number; rit_perc: number }
  totale: ReturnType<typeof calcolaParcella>
  compenso: number
  state: CalcState
  dettaglio: DettaglioCalcolo
}

/** Riga etichetta + controllo del form (definita fuori dal componente: se fosse interna, a ogni lettera digitata i campi verrebbero ricreati e perderebbero il cursore). */
function Riga({ etichetta, spenta, children }: { etichetta: string; spenta?: boolean; children: React.ReactNode }) {
  return <div className={`srow ${spenta ? 'off' : ''}`}><span className="lbl">{etichetta}</span><div className="ctrl">{children}</div></div>
}

interface VarStato { on: boolean; pct: string; importo: string }
const FASE_NOME: Record<string, string> = { '40': 'fase decisionale', '20': 'fase introduttiva' }

/** Riga di un aumento o di una riduzione del civile/penale (definita fuori dal componente per non perdere il cursore mentre si scrive). */
function RigaVariazione({ def, st, ambito, anno, importoPredef, onChange }: { def: VarDef; st: VarStato; ambito: Ambito; anno: number; importoPredef: number; onChange: (p: Partial<VarStato>) => void }) {
  const verbo = def.tipo === 'aumento' ? 'aumento del' : 'riduzione del'
  const pcts = def.range ? Array.from({ length: Math.floor((def.range.max - def.range.min) / def.range.step) + 1 }, (_, i) => def.range!.min + i * def.range!.step) : []
  const terzo = def.id === 'gp' && ambito === 'penale'
  return (
    <Riga etichetta={`${def.nome}:`} spenta={!st.on}>
      <label className="check"><input type="checkbox" checked={st.on} onChange={(e) => onChange({ on: e.target.checked, ...(e.target.checked && !st.pct && def.range ? { pct: String(def.range.max) } : {}) })} aria-label={def.nome} /> {verbo}</label>
      {def.range
        ? <Select value={st.pct || String(def.range.max)} onChange={(e) => onChange({ pct: e.target.value })} disabled={!st.on} style={{ maxWidth: 90 }} aria-label={`${def.nome}: percentuale`}>{pcts.map((n) => <option key={n} value={n}>{n}</option>)}</Select>
        : <b>{terzo ? '1/3' : def.fissa}</b>}
      {!terzo && ' %'} <span className="muted small">{RIFERIMENTO_VARIAZIONE[def.id](ambito)}</span>
      {def.fase && (
        <span className="var-su">
          <span className="muted small">calcolato su: €</span>
          <Input inputMode="decimal" value={st.importo !== '' ? st.importo : importoPredef ? decimal(importoPredef).replace(/,00$/, '') : ''} onChange={(e) => onChange({ importo: e.target.value })} disabled={!st.on} style={{ maxWidth: 110 }} aria-label={`${def.nome}: importo su cui calcolare`} />
          <span className="muted small">({FASE_NOME[def.fase] || 'fase'}){def.id === 'conciliazione' && conciliazioneSostituisceFase(anno) ? ': sostituisce la fase, che viene deselezionata' : ''}</span>
        </span>
      )}
    </Riga>
  )
}

function useDebounced<T>(v: T, ms = 450): T {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

export function CompensoForm({ initial, extraVoci = [], onResult }: { initial?: CalcState | null; extraVoci?: VoceParcella[]; onResult: (r: CalcRisultato) => void }) {
  const { settings } = useData()
  const run = useAction()
  const al = settings.aliquote
  const init = initial
  const [anno, setAnno] = useState<2022 | 2014>(init?.anno ?? 2022)
  const [competenza, setCompetenza] = useState<number>(init?.competenza ?? 360)
  const [competenze, setCompetenze] = useState<CompetenzaVoce[]>([])
  const [tipo, setTipo] = useState<'tabellare' | 'percentuale'>(init?.tipo ?? 'tabellare')
  const [scaglione, setScaglione] = useState(init?.scaglione ?? 30)
  const [valore, setValore] = useState(init?.valore ?? '')
  const [metodo, setMetodo] = useState<'F' | 'S'>(init?.metodo ?? 'F')
  const [pct, setPct] = useState(init?.pct ?? '')
  const [fasiSt, setFasiSt] = useState<CalcState['fasi']>(init?.fasi ?? {})
  const [ulteriore, setUlteriore] = useState(init?.ulteriore ?? '')
  const [ulterioreOn, setUlterioreOn] = useState(init?.ulterioreOn ?? parseNumber(init?.ulteriore ?? '') > 0)
  const [praticante, setPraticante] = useState(init?.praticante && init.praticante !== '0' ? init.praticante : '50')
  const [praticanteOn, setPraticanteOn] = useState(init?.praticanteOn ?? (!!init?.praticante && init.praticante !== '0'))
  const [esito, setEsito] = useState(init?.esito ?? false)
  const [esitoImp, setEsitoImp] = useState(init?.esitoImp ?? '')
  const [speseEsenti, setSpeseEsenti] = useState(init?.speseEsenti ?? '')
  const [trasferta, setTrasferta] = useState(init?.trasferta ?? '')
  const [altre, setAltre] = useState(init?.altre ?? '')
  const [sgOn, setSgOn] = useState(init?.sgOn ?? true)
  const [sgPct, setSgPct] = useState(init?.sgPct ?? String(al.sg || 15).replace('.', ','))
  // come sul calcolatore di avvocatoandreani.it: accessori e ritenuta partono spenti (si attivano con «Includi accessori»);
  // un documento già salvato riprende la scelta fatta allora
  const [ivaOn, setIvaOn] = useState(init?.ivaOn ?? false)
  const [cpaOn, setCpaOn] = useState(init?.cpaOn ?? false)
  const [ritOn, setRitOn] = useState(init?.ritOn ?? false)
  const [nascondiTipo, setNascondiTipo] = useState(init?.nascondiTipo ?? false)
  const [parti, setParti] = useState(init?.parti ?? '1')
  const [pctParti, setPctParti] = useState(init?.pctParti ?? '0')
  const [varSt, setVarSt] = useState<Record<string, VarStato>>(init?.variazioni ?? {})
  const [pannello, setPannello] = useState<'aumenti' | 'riduzioni' | 'spese'>('aumenti')

  const [struttura, setStruttura] = useState<Struttura | null>(null)
  const [vals, setVals] = useState<Valori | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const valoreN = parseNumber(valore)
  const valoreD = useDebounced(valoreN)

  // elenco di tutte le competenze dei calcolatori del sito (stragiudiziale, civile, penale)
  useEffect(() => { api.tariffeCompetenze().then(setCompetenze).catch(() => setCompetenze([])) }, [])
  const ambito = ambitoDi(competenza)

  // scaglioni e fasi per anno e competenza
  useEffect(() => {
    let off = false
    setStruttura(null); setVals(null); setErrore(null)
    api.tariffeStruttura(anno, competenza).then((s: Struttura) => {
      if (off) return
      setStruttura(s)
      setScaglione((cur) => (!s.scaglioni.length || s.scaglioni.some((x) => x.id === cur) ? cur : s.scaglioni.some((x) => x.id === 30) ? 30 : s.scaglioni[0].id))
    }).catch((e: any) => !off && setErrore(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    return () => { off = true }
  }, [anno, competenza])

  const senzaScaglioni = !!struttura?.senzaScaglioni // penale: importi fissi per fase
  const sel = struttura?.scaglioni.find((s) => s.id === scaglione)
  const calcolatoLocale = tipo === 'tabellare' && anno === 2022 && competenza === 360 && scaglione === SCAGLIONE_OLTRE_520K
  const serveValore = tipo === 'percentuale' || !!sel?.calcolato
  const daSito = tipo === 'tabellare' && !calcolatoLocale && (!!sel || senzaScaglioni)

  // tariffe dello scaglione: sito → cache → tabelle incluse
  useEffect(() => {
    if (!daSito || (!sel && !senzaScaglioni)) { setVals(null); return }
    if (sel?.calcolato && scaglione === SCAGLIONE_OLTRE_32M && valoreD <= 32_000_000) { setVals(null); setErrore(null); return }
    let off = false
    setLoading(true); setErrore(null)
    api.tariffeValori({ anno, competenza, scaglione: senzaScaglioni ? 0 : scaglione, valore: sel?.calcolato ? valoreD : 0 })
      .then((v: Valori) => { if (!off) setVals(v) })
      .catch((e: any) => { if (!off) { setVals(null); setErrore(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) } })
      .finally(() => !off && setLoading(false))
    return () => { off = true }
  }, [daSito, sel?.id, sel?.calcolato, senzaScaglioni, anno, competenza, scaglione, valoreD])

  const variazione = (struttura?.variazione || (anno === 2022 ? [50, 50] : [50, 80])) as [number, number]
  const pctN = parseNumber(pct)

  const fasiDef = useMemo(() => {
    if (!struttura) return [] as { cod: string; nome: string; terna: Terna }[]
    if (tipo === 'percentuale' || calcolatoLocale) {
      const { terna } = ternaCalcolata({ tipo, scaglione, valore: valoreN, metodo, pct: pctN, variazione, competenza, anno })
      return [{ cod: '99', nome: 'Compenso', terna }]
    }
    return struttura.fasi.map((f) => ({ cod: f.cod, nome: f.nome, terna: (vals?.valori?.[f.cod] || [0, 0, 0]) as Terna }))
  }, [struttura, tipo, calcolatoLocale, scaglione, valoreN, metodo, pctN, variazione[0], variazione[1], competenza, anno, vals])

  const multiFase = fasiDef.length > 1
  const defsAum = useMemo(() => variazioniValide(ambito, anno, competenza, 'aumento'), [ambito, anno, competenza])
  const defsRid = useMemo(() => variazioniValide(ambito, anno, competenza, 'riduzione'), [ambito, anno, competenza])
  const valoreFase = (cod: string) => {
    const f = fasiDef.find((x) => x.cod === cod); if (!f) return 0
    const st = fasiSt[cod] || { attiva: true, scelta: 2 as Scelta, libero: '' }
    return st.scelta === 'libero' ? parseNumber(st.libero) : f.terna[(st.scelta as number) - 1] || 0
  }
  const variazioni: Variazioni = useMemo(() => {
    const v: Variazioni = {}
    const n = Number(parti) || 1
    if (defsAum.some((d) => d.id === 'piuParti') && n > 1) v.piuParti = { pct: Number(pctParti) || 0 }
    for (const d of [...defsAum, ...defsRid]) {
      const st = varSt[d.id]
      if (d.id === 'piuParti' || !st?.on) continue
      v[d.id as VarId] = { pct: d.fissa ?? (parseNumber(st.pct) || d.range?.max || 0), importo: d.fase ? (st.importo !== '' ? parseNumber(st.importo) : valoreFase(d.fase)) : undefined }
    }
    return v
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defsAum, defsRid, varSt, parti, pctParti, fasiDef, fasiSt])

  const input: CompensoInput = useMemo(() => ({
    anno, competenza, competenzaNome: competenze.find((c) => c.cod === competenza)?.nome, variazioni, tipo, scaglione, valore: valoreN, metodo, pct: pctN, variazione,
    fasi: fasiDef.map((f) => {
      const st = fasiSt[f.cod] || { attiva: true, scelta: 2 as Scelta, libero: '' }
      return { cod: f.cod, nome: f.nome, attiva: st.attiva, scelta: st.scelta, libero: parseNumber(st.libero), terna: f.terna }
    }),
    ulteriorePct: ulterioreOn ? parseNumber(ulteriore) : 0, esitoPositivo: esito, esitoImporto: parseNumber(esitoImp), praticantePct: praticanteOn ? parseNumber(praticante) : 0,
    speseEsenti: parseNumber(speseEsenti), speseTrasferta: parseNumber(trasferta), speseAltre: parseNumber(altre), sgOn, sgPct: parseNumber(sgPct),
  }), [anno, competenza, competenze, variazioni, tipo, scaglione, valoreN, metodo, pctN, variazione[0], variazione[1], fasiDef, fasiSt, ulteriore, ulterioreOn, esito, esitoImp, praticante, praticanteOn, speseEsenti, trasferta, altre, sgOn, sgPct])

  const r = useMemo(() => calcolaCompenso(input), [input])
  const aliq = { sg: sgOn ? parseNumber(sgPct) : 0, cpa: cpaOn ? al.cpa : 0, iva: ivaOn ? al.iva : 0, rit: ritOn ? al.rit : 0, bollo: 0 } // il prospetto dei parametri ministeriali non applica il bollo

  const voci: VoceParcella[] = useMemo(() => {
    const v: VoceParcella[] = []
    if (r.compenso > 0) v.push({ tipo: 'compenso', descrizione: descrizioneCompenso(input, tipo === 'tabellare' ? sel?.label || '' : '', nascondiTipo), quantita: 1, importo: r.compenso })
    if (input.speseTrasferta) v.push({ tipo: 'spesa_imponibile', descrizione: 'Spese di trasferta (art. 27 DM 55/2014)', quantita: 1, importo: input.speseTrasferta })
    if (input.speseAltre) v.push({ tipo: 'spesa_imponibile', descrizione: 'Altre spese imponibili', quantita: 1, importo: input.speseAltre })
    if (input.speseEsenti) v.push({ tipo: 'spesa_esente', descrizione: 'Spese anticipate (art. 15 DPR 633/72)', quantita: 1, importo: input.speseEsenti })
    return v
  }, [r.compenso, input, tipo, sel?.label, nascondiTipo])

  const tutte = useMemo(() => [...voci, ...extraVoci], [voci, extraVoci])
  const tot = useMemo(() => calcolaParcella(tutte, aliq), [tutte, aliq.sg, aliq.cpa, aliq.iva, aliq.rit, aliq.bollo])

  const state: CalcState = useMemo(() => ({
    anno, competenza, tipo, scaglione, valore, metodo, pct, fasi: fasiSt, ulteriore, praticante, esito, esitoImp,
    speseEsenti, trasferta, altre, sgOn, sgPct, ivaOn, cpaOn, ritOn, nascondiTipo, ulterioreOn, praticanteOn, parti, pctParti, variazioni: varSt,
  }), [anno, competenza, tipo, scaglione, valore, metodo, pct, fasiSt, ulteriore, ulterioreOn, praticante, praticanteOn, esito, esitoImp, speseEsenti, trasferta, altre, sgOn, sgPct, ivaOn, cpaOn, ritOn, nascondiTipo, parti, pctParti, varSt])

  const dettaglio = useMemo(() => costruisciDettaglio(input, r, tipo === 'tabellare' ? sel?.label || '' : '', nascondiTipo, voci.length), [input, r, tipo, sel?.label, nascondiTipo, voci.length])
  // comunica il risultato al contenitore (solo se cambia davvero)
  const last = useRef('')
  useEffect(() => {
    const out: CalcRisultato = { voci, aliquote: { sg_perc: aliq.sg, cpa_perc: aliq.cpa, iva_perc: aliq.iva, rit_perc: aliq.rit }, totale: tot, compenso: r.compenso, state, dettaglio }
    const key = JSON.stringify(out)
    if (key !== last.current) { last.current = key; onResult(out) }
  })

  const setFase = (cod: string, patch: Partial<{ attiva: boolean; scelta: Scelta; libero: string }>) =>
    setFasiSt((s) => ({ ...s, [cod]: { ...(s[cod] || { attiva: true, scelta: 2 as Scelta, libero: '' }), ...patch } }))

  const tutteAttive = fasiDef.length > 0 && fasiDef.every((f) => (fasiSt[f.cod]?.attiva ?? true))
  const setTutteAttive = (v: boolean) => setFasiSt((st) => Object.fromEntries(fasiDef.map((f) => [f.cod, { ...(st[f.cod] || { attiva: true, scelta: 2 as Scelta, libero: '' }), attiva: v }])))
  const setTutteScelta = (k: Scelta) => setFasiSt((st) => Object.fromEntries(fasiDef.map((f) => [f.cod, { ...(st[f.cod] || { attiva: true, scelta: 2 as Scelta, libero: '' }), scelta: k, attiva: true }])))
  const sceltaComune = fasiDef.length > 1 && fasiDef.every((f) => (fasiSt[f.cod]?.scelta ?? 2) === (fasiSt[fasiDef[0].cod]?.scelta ?? 2)) ? (fasiSt[fasiDef[0].cod]?.scelta ?? 2) : null
  const setVar = (id: string, patch: Partial<VarStato>) => {
    setVarSt((m) => ({ ...m, [id]: { ...(m[id] || { on: false, pct: '', importo: '' }), ...patch } }))
    // dal 2022 la conciliazione sostituisce la fase decisionale: come nel sito, la fase si deseleziona (e si riattiva se l'aumento viene tolto)
    if (id === 'conciliazione' && patch.on !== undefined && conciliazioneSostituisceFase(anno) && fasiDef.some((f) => f.cod === '40')) setFase('40', { attiva: !patch.on })
  }
  const cambiaParti = (n: string) => { setParti(n); setPctParti(String(maxPctPiuParti(Number(n)))) }
  const cambiaCompetenza = (c: number) => { setCompetenza(c); if (c !== 360) setTipo('tabellare'); setVarSt({}); setParti('1'); setPctParti('0'); setFasiSt({}) }
  const cambiaAnno = (a: 2022 | 2014) => {
    setAnno(a); setVarSt({})
    const voce = competenze.find((x) => x.cod === competenza)
    if (voce && !voce.anni.includes(a)) cambiaCompetenza(360) // competenza prevista solo in un'altra annualità
  }
  // la percentuale per il praticante segue i valori ammessi dal calcolatore (nel civile di 5 in 5)
  const rangePrat = PRATICANTE_RANGE(ambito)
  useEffect(() => { const v = Number(praticante) || 50; const ok = v >= rangePrat.min && v <= rangePrat.max && (v - rangePrat.min) % rangePrat.step === 0; if (!ok) setPraticante(String(Math.min(rangePrat.max, Math.max(rangePrat.min, Math.round(v / rangePrat.step) * rangePrat.step)))) }, [rangePrat.min, rangePrat.step, rangePrat.max, praticante])
  const accessoriAttivi = ivaOn || cpaOn
  const toggleAccessori = () => { const v = !accessoriAttivi; setIvaOn(v); setCpaOn(v) }

  const fonteBadge = () => {
    if (!struttura) return null
    if (!daSito) return <span className="src-badge ok"><CheckCircle2 size={14} /> Calcolo locale con le formule dei parametri forensi</span>
    if (loading) return <span className="src-badge">Caricamento parametri locali…</span>
    if (!vals) return null
    return <span className="src-badge"><CheckCircle2 size={14} /> Tabelle normative incluse · {anno} · verifica il decreto per il caso concreto</span>
  }
  const manca = daSito && !vals && !loading

  const righePF = useMemo(() => righeProspetto({ ...tot, sg_perc: aliq.sg, cpa_perc: aliq.cpa, iva_perc: aliq.iva, rit_perc: aliq.rit }, dettaglio, extraVoci), [tot, aliq.sg, aliq.cpa, aliq.iva, aliq.rit, dettaglio, extraVoci])

  // L'impostazione ricalca quella del prospetto dei parametri ministeriali (stesse righe, etichette e ordine), con grafica dell'app e calcolo in tempo reale.
  return (
    <div className="calc-grid">
      <div className="calc-form site-form">
        <Riga etichetta="Tabelle:">
          <Select value={anno} onChange={(e) => cambiaAnno(Number(e.target.value) as 2022 | 2014)} aria-label="Tabelle"><option value={2022}>2022 · DM 147/2022</option><option value={2014}>2014 · edizione originaria</option></Select>
        </Riga>
        <Riga etichetta="Competenza:">
          <Select value={competenza} onChange={(e) => cambiaCompetenza(Number(e.target.value))} aria-label="Competenza">
            {competenze.length ? (['stragiudiziale', 'civile', 'penale'] as Ambito[]).map((am) => (
              <optgroup key={am} label={am === 'stragiudiziale' ? 'Stragiudiziale' : am === 'civile' ? 'Giudiziale civile' : 'Giudiziale penale'}>
                {competenze.filter((c) => c.ambito === am).map((c) => <option key={c.cod} value={c.cod} disabled={!c.anni.includes(anno)}>{c.nome}{c.anni.includes(anno) ? '' : ' (solo tabelle 2022)'}</option>)}
              </optgroup>
            )) : <><option value={360}>Assistenza stragiudiziale</option><option value={380}>Mediazione e Negoziazione assistita</option></>}
          </Select>
        </Riga>
        {competenza === 360 && (
          <Riga etichetta="Compenso:">
            <label className="check"><input type="radio" name="tipo-compenso" checked={tipo === 'tabellare'} onChange={() => setTipo('tabellare')} /> Tabellare</label>
            <label className="check"><input type="radio" name="tipo-compenso" checked={tipo === 'percentuale'} onChange={() => setTipo('percentuale')} /> In Percentuale</label>
          </Riga>
        )}
        {tipo === 'tabellare' && !senzaScaglioni && (
          <Riga etichetta="Scaglione:">
            <Select value={scaglione} onChange={(e) => setScaglione(Number(e.target.value))} disabled={!struttura} aria-label="Scaglione">
              {struttura?.scaglioni.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Riga>
        )}
        {!senzaScaglioni && <Riga etichetta="Valore €" spenta={!serveValore}>
          <Input inputMode="decimal" value={valore} onChange={(e) => setValore(e.target.value)} disabled={!serveValore} placeholder="0,00" style={{ maxWidth: 190 }} aria-label="Valore dell'affare" />
          {!serveValore && <span className="muted small">non necessario per questo scaglione</span>}
        </Riga>}
        {calcolatoLocale && (
          <Riga etichetta="Metodo di calcolo:">
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value as 'F' | 'S')} aria-label="Metodo di calcolo"><option value="F">percentuale 'secca'</option><option value="S">a scaglioni</option></Select>
          </Riga>
        )}
        {tipo === 'percentuale' && (
          <Riga etichetta="Percentuale:">
            <Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Es. 2" style={{ maxWidth: 90 }} aria-label="Percentuale" /> % <span className="muted small">( sul valore dell'affare — massimo 5% )</span>
          </Riga>
        )}

        <div className="fasi fasi-site">
          <div className="fase-head">
            <label className="check">{multiFase ? <>FASI <input type="checkbox" checked={tutteAttive} onChange={(e) => setTutteAttive(e.target.checked)} aria-label="Tutte le fasi" /></> : null}</label>
            {[1, 2, 3].map((k) => (
              <span key={k} className="fh-col">{['Min', 'Med', 'Max'][k - 1]}{multiFase && <input type="radio" name="vsel-all" checked={sceltaComune === k} onChange={() => setTutteScelta(k as Scelta)} aria-label={`Tutte le fasi: ${['minimo', 'medio', 'massimo'][k - 1]}`} />}</span>
            ))}
            <span>Compenso</span>
          </div>
          {fasiDef.map((f) => {
            const st = fasiSt[f.cod] || { attiva: true, scelta: 2 as Scelta, libero: '' }
            const shown = st.scelta === 'libero' ? st.libero : decimal(f.terna[(st.scelta as number) - 1] || 0).replace(/,00$/, '')
            return (
              <div key={f.cod} className={`fase-row ${st.attiva ? '' : 'off'}`}>
                <label className="check">{multiFase || f.cod !== '99' ? f.nome : 'Compenso'} <input type="checkbox" checked={st.attiva} onChange={(e) => setFase(f.cod, { attiva: e.target.checked })} /></label>
                {[1, 2, 3].map((k) => (
                  <label key={k} className={`vsel ${st.scelta === k ? 'on' : ''}`}>
                    {`€ ${fmtNum(f.terna[k - 1] || 0).replace(/,00$/, '')}`}
                    <input type="radio" name={`v-${f.cod}`} checked={st.scelta === k} onChange={() => setFase(f.cod, { scelta: k as Scelta, attiva: true })} disabled={!st.attiva} />
                  </label>
                ))}
                <span className="fase-euro">€ <input className="fase-in" inputMode="decimal" value={shown} disabled={!st.attiva} aria-label={`Compenso ${f.nome}`} onChange={(e) => setFase(f.cod, { scelta: 'libero', libero: e.target.value })} /></span>
              </div>
            )
          })}
          {multiFase && <div className="fase-tot"><span>Totale:</span><b>€ {fmtNum(r.base)}</b></div>}
          {!fasiDef.length && <p className="muted small pad">Caricamento tariffe…</p>}
        </div>
        <div className="calc-src">{fonteBadge()}</div>
        {errore && <div className="src-badge err"><AlertTriangle size={14} /> {errore}</div>}
        {manca && !errore && scaglione === SCAGLIONE_OLTRE_32M && <p className="muted small">Inserisci il valore dell'affare (oltre 32.000.000 €) per ottenere la tariffa.</p>}

        <Tabs tabs={[{ id: 'aumenti', label: 'Aumenti' }, { id: 'riduzioni', label: 'Riduzioni' }, { id: 'spese', label: 'Spese' }]} value={pannello} onChange={setPannello} />
        {pannello === 'aumenti' && (
          <>
            {competenza === 380 && (
              <Riga etichetta="Esito positivo:" spenta={!esito}>
                <label className="check"><input type="checkbox" checked={esito} onChange={(e) => setEsito(e.target.checked)} /> aumento del 30 %</label><span className="muted small">art. 20, comma 1 bis — calcolato su: €</span>
                <Input inputMode="decimal" value={esitoImp} onChange={(e) => setEsitoImp(e.target.value)} disabled={!esito} style={{ maxWidth: 120 }} aria-label="Importo su cui calcolare l'esito positivo" /><span className="muted small">(attiv. + negoz.)</span>
              </Riga>
            )}
            {defsAum.some((d) => d.id === 'piuParti') && (
              <Riga etichetta="Numero parti:" spenta={(Number(parti) || 1) < 2}>
                <Select value={parti} onChange={(e) => cambiaParti(e.target.value)} style={{ maxWidth: 80 }} aria-label="Numero di parti">{Array.from({ length: 30 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</Select>
                <span className="muted small">aumento del:</span>
                <Select value={pctParti} onChange={(e) => setPctParti(e.target.value)} disabled={(Number(parti) || 1) < 2} style={{ maxWidth: 90 }} aria-label="Percentuale di aumento per più parti">{opzioniPctPiuParti(Number(parti) || 1).map((n) => <option key={n} value={n}>{n}</option>)}</Select> %
                <span className="muted small">{RIFERIMENTO_VARIAZIONE.piuParti(ambito)}</span>
              </Riga>
            )}
            <Riga etichetta="Ulteriore valutazione:" spenta={!ulterioreOn}>
              <label className="check"><input type="checkbox" checked={ulterioreOn} onChange={(e) => { setUlterioreOn(e.target.checked); if (e.target.checked && !ulteriore) setUlteriore('10') }} /> aumento del</label>
              <Input inputMode="decimal" value={ulteriore} onChange={(e) => setUlteriore(e.target.value)} disabled={!ulterioreOn} style={{ maxWidth: 80 }} aria-label="Percentuale di aumento" /> % <span className="muted small">{riferimentoUlteriore(ambito)}</span>
            </Riga>
            {defsAum.filter((d) => d.id !== 'piuParti').map((d) => (
              <RigaVariazione key={d.id} def={d} ambito={ambito} anno={anno} st={varSt[d.id] || { on: false, pct: '', importo: '' }} importoPredef={d.fase ? valoreFase(d.fase) : 0} onChange={(p) => setVar(d.id, p)} />
            ))}
          </>
        )}
        {pannello === 'riduzioni' && (
          <>
            {defsRid.map((d) => (
              <RigaVariazione key={d.id} def={d} ambito={ambito} anno={anno} st={varSt[d.id] || { on: false, pct: '', importo: '' }} importoPredef={0} onChange={(p) => setVar(d.id, p)} />
            ))}
            <Riga etichetta="Praticante abilitato:" spenta={!praticanteOn}>
              <label className="check"><input type="checkbox" checked={praticanteOn} onChange={(e) => setPraticanteOn(e.target.checked)} /> riduzione del</label>
              <Select value={praticante} onChange={(e) => setPraticante(e.target.value)} disabled={!praticanteOn} style={{ maxWidth: 90 }} aria-label="Percentuale di riduzione">{Array.from({ length: Math.floor((rangePrat.max - rangePrat.min) / rangePrat.step) + 1 }, (_, i) => rangePrat.min + i * rangePrat.step).map((n) => <option key={n} value={n}>{n}</option>)}</Select> % <span className="muted small">{riferimentoPraticante(ambito)}</span>
            </Riga>
          </>
        )}
        {pannello === 'spese' && (
          <>
            <Riga etichetta="Spese esenti €"><Input inputMode="decimal" value={speseEsenti} onChange={(e) => setSpeseEsenti(e.target.value)} placeholder="0,00" style={{ maxWidth: 150 }} aria-label="Spese esenti" /><span className="muted small">art. 15, DPR 633/72</span></Riga>
            <Riga etichetta="Spese di trasferta €"><Input inputMode="decimal" value={trasferta} onChange={(e) => setTrasferta(e.target.value)} placeholder="0,00" style={{ maxWidth: 150 }} aria-label="Spese di trasferta" /><span className="muted small">art. 27</span></Riga>
            <Riga etichetta="Altre spese imponibili €"><Input inputMode="decimal" value={altre} onChange={(e) => setAltre(e.target.value)} placeholder="0,00" style={{ maxWidth: 150 }} aria-label="Altre spese imponibili" /><span className="muted small">(non relative a trasferte)</span></Riga>
            <Riga etichetta="Spese generali:" spenta={!sgOn}>
              <label className="check"><input type="checkbox" checked={sgOn} onChange={(e) => setSgOn(e.target.checked)} aria-label="Includi spese generali" /></label>
              <Input inputMode="decimal" value={sgPct} onChange={(e) => setSgPct(e.target.value)} disabled={!sgOn} style={{ maxWidth: 80 }} aria-label="Percentuale spese generali" /> % <span className="muted small">art. 2</span>
            </Riga>
          </>
        )}

        <div className="calc-acc">
          <Btn size="sm" onClick={toggleAccessori}>{accessoriAttivi ? 'Escludi accessori' : 'Includi accessori'}</Btn>
          <label className="check"><input type="checkbox" checked={ivaOn} disabled={!accessoriAttivi} onChange={(e) => setIvaOn(e.target.checked)} /> IVA {decimal(al.iva).replace(',00', '')}%</label>
          <label className="check"><input type="checkbox" checked={cpaOn} disabled={!accessoriAttivi} onChange={(e) => setCpaOn(e.target.checked)} /> CPA {decimal(al.cpa).replace(',00', '')}%</label>
          <label className="check"><input type="checkbox" checked={ritOn} onChange={(e) => setRitOn(e.target.checked)} /> Rit. acc. {decimal(al.rit).replace(',00', '')}%</label>
          <label className="check"><input type="checkbox" checked={nascondiTipo} onChange={(e) => setNascondiTipo(e.target.checked)} /> Nascondi tipo compenso</label>
          <Btn size="sm" variant="ghost" onClick={() => run(() => api.apriCalcolatoreOnline())} title="Apre il calcolatore nel browser"><ExternalLink size={14} /> Calcolatore online</Btn>
        </div>
      </div>

      <aside className="calc-result prospetto">
        <h3>PROSPETTO FINALE</h3>
        <table><tbody>
          {righePF.map((x, i) => x.stile === 'sep' ? <tr key={i} className="sep"><td colSpan={2} /></tr> : (
            <tr key={i} className={x.stile}><td>{x.label}</td><td>{x.valore}</td></tr>
          ))}
        </tbody></table>
        <p className="muted small" style={{ marginTop: 10 }}>Il prospetto si aggiorna mentre compili. Risultato indicativo: verifica sempre con il testo del decreto e con il tuo commercialista. Parametri dalle tabelle ministeriali incluse.</p>
      </aside>
    </div>
  )
}
