import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileCode2, LayoutTemplate, Plus, Trash2, Undo2 } from 'lucide-react'
import { api } from '../api'
import { useData } from '../store'
import { Btn, Field, FormGrid, Input, Modal, Segmented, Select, Textarea, useAction, useFeedback } from './ui'
import { PraticaSelect } from './forms'
import { ModelloPdfEditor } from './ModelloPdfEditor'
import { FatturaElettronicaModal } from './FatturaElettronica'
import { modelloEffettivo } from '../lib/modello'
import { CompensoForm, type CalcRisultato, type CalcState } from './CompensoCalculator'
import { calcolaParcella } from '../lib/calc'
import { decimal, money, parseNumber } from '../lib/format'
import { todayStr } from '../lib/dates'
import { parcellaHtml } from '../lib/print'
import type { ModelloPdf, Parcella, VoceParcella } from '../types'

export const nomeDoc = (tipo: string, parcella: string) => (tipo === 'preventivo' ? 'Preventivo' : tipo === 'proforma' ? 'Nota pro forma' : tipo === 'nota_credito' ? 'Nota di credito' : parcella)

function leggiCalcolo(p?: Parcella): { state: CalcState | null; manuali: VoceParcella[] } {
  if (!p?.calcolo) return { state: null, manuali: [] }
  try { const j = JSON.parse(p.calcolo); return { state: j.state || null, manuali: Array.isArray(j.manuali) ? j.manuali : [] } } catch { return { state: null, manuali: [] } }
}

/**
 * Editor di parcelle, preventivi e note pro forma.
 * Per lo studio legale il compenso si calcola con le tabelle normative incluse (parametri forensi);
 * si possono comunque aggiungere voci manuali (ore, spese, importi liberi). Lo stato del calcolo viene salvato
 * con il documento, così riaprendolo si ritrova identico.
 */
export function ParcellaEditor({ parcella, preset, onClose }: { parcella?: Parcella; preset?: any; onClose: () => void }) {
  const { settings, anagrafica, anagraficaById, praticaById } = useData()
  const run = useAction()
  const { confirm, toast } = useFeedback()
  const L = settings.etichette
  const al = settings.aliquote
  const forense = settings.profilo === 'avvocato'
  const saved = useMemo(() => leggiCalcolo(parcella), [parcella])

  const [f, setF] = useState<any>(() => parcella ? { ...parcella } : {
    tipo: preset?.tipo || 'parcella', data: todayStr(), stato: 'bozza', sg_perc: preset?.aliquote?.sg_perc ?? al.sg, cpa_perc: preset?.aliquote?.cpa_perc ?? al.cpa, iva_perc: preset?.aliquote?.iva_perc ?? al.iva, rit_perc: preset?.aliquote?.rit_perc ?? al.rit, bollo: preset?.bollo ?? al.bollo, incassato: 0, scadenza_pagamento: null,
    pratica_id: preset?.pratica_id ?? null, cliente_id: preset?.cliente_id ?? null, importazione: preset?.importazione || null, oggetto: preset?.oggetto || '', note: preset?.note || '', contributo_nome: forense ? 'CPA' : settings.contributo_nome || 'Contributo previdenziale', contributo_ritenuta: forense ? 0 : settings.contributo_ritenuta ? 1 : 0, esito_preventivo: 'da_inviare', validita: null,
  })
  // voci manuali (con il calcolo attivo) oppure tutte le voci (calcolo spento)
  const [voci, setVoci] = useState<VoceParcella[]>(preset?.voci || saved.manuali)
  const [vociPronte, setVociPronte] = useState(!parcella || !!parcella.calcolo)
  const [ore, setOre] = useState<number[]>(preset?.importa_ore || [])
  const [spese, setSpese] = useState<number[]>(preset?.importa_spese || [])
  const [numero, setNumero] = useState(parcella?.numero || '')
  const [usaCalcolo, setUsaCalcolo] = useState<boolean>(forense && (parcella ? !!parcella.calcolo : !(preset?.voci?.length)))
  const [calcRes, setCalcRes] = useState<CalcRisultato | null>(null)
  const [modello, setModello] = useState<ModelloPdf | null>(null) // editor di intestazione/piè di pagina aperto
  const calcStato = useRef<CalcState | null>(saved.state)

  useEffect(() => {
    if (!parcella) return
    api.getParcella(parcella.id).then((p: Parcella) => { if (!p.calcolo) setVoci(p.voci || []); setVociPronte(true) })
    Promise.all([api.list('ore', { parcella_id: parcella.id }), api.list('spese', { parcella_id: parcella.id })]).then(([o, s]) => { setOre(o.map((x: any) => x.id)); setSpese(s.map((x: any) => x.id)) })
  }, [parcella])
  useEffect(() => {
    let active = true
    if (!parcella || f.tipo !== parcella.tipo) api.nextParcella(parcella?.anno || new Date().getFullYear(), f.tipo).then((n: any) => { if (active) setNumero(n.numero) })
    else setNumero(parcella.numero)
    return () => { active = false }
  }, [parcella, f.tipo])

  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  const upd = (i: number, patch: Partial<VoceParcella>) => setVoci((v) => v.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const cliente = f.cliente_id ? anagraficaById.get(f.cliente_id) : null

  const modoCalcolo = usaCalcolo && !!calcRes
  const vociFinali = modoCalcolo ? [...calcRes!.voci, ...voci] : voci
  const aliquote = modoCalcolo ? calcRes!.aliquote : { sg_perc: +f.sg_perc || 0, cpa_perc: +f.cpa_perc || 0, iva_perc: +f.iva_perc || 0, rit_perc: +f.rit_perc || 0 }
  const tot = useMemo(
    () => modoCalcolo ? calcRes!.totale : calcolaParcella(voci, { sg: +f.sg_perc || 0, cpa: +f.cpa_perc || 0, iva: +f.iva_perc || 0, rit: +f.rit_perc || 0, bollo: +f.bollo || 0, contributo_ritenuta: !!f.contributo_ritenuta }),
    [modoCalcolo, calcRes, voci, f.sg_perc, f.cpa_perc, f.iva_perc, f.rit_perc, f.bollo, f.contributo_ritenuta])

  const importazione = useMemo(() => { try { return f.importazione ? JSON.parse(f.importazione) : null } catch { return null } }, [f.importazione])
  const [verificato, setVerificato] = useState(!!importazione?.verificato)
  const revision = JSON.stringify([f.tipo, f.data, f.cliente_id, f.pratica_id, f.oggetto, aliquote, tot, vociFinali.map(v => [v.tipo, v.descrizione, v.quantita, v.importo])])
  const previousRevision = useRef<string | null>(null)
  useEffect(() => {
    if (!vociPronte) return
    if (previousRevision.current !== null && previousRevision.current !== revision) setVerificato(false)
    previousRevision.current = revision
  }, [revision, vociPronte])
  const needsReview = !!importazione && !verificato
  const payload = () => ({
    ...f, ...aliquote, ...tot, verificaImportazione: importazione ? verificato : undefined, voci: vociFinali, importa_ore: ore, importa_spese: spese,
    calcolo: modoCalcolo ? JSON.stringify({ state: calcRes!.state, manuali: voci, dettaglio: calcRes!.dettaglio }) : null,
    data_pagamento: f.stato === 'pagata' ? f.data_pagamento || todayStr() : null,
  })
  // nel calcolo IVA e CPA partono spente (come sul calcolatore di AvvocatoAndreani): prima di emettere un documento
  // o di salvarne il PDF senza accessori si chiede conferma, perché di solito è una dimenticanza
  const accessoriMancanti = () => {
    if (!modoCalcolo || !calcRes) return ''
    return [!calcRes.state.cpaOn && 'la Cassa Avvocati (CPA)', !calcRes.state.ivaOn && "l'IVA"].filter(Boolean).join(' né ')
  }
  const confermaAccessori = async (ok: string) => {
    const m = accessoriMancanti()
    return !m || confirm({ title: 'Mancano IVA o CPA', text: `Il calcolo non comprende ${m}. Se servono, premi «Includi accessori» nel calcolo; altrimenti prosegui così (ad esempio in regime forfettario).`, ok })
  }
  const salva = (): Promise<Parcella | undefined> => run(() => api.saveParcella(payload()), 'Salvato')
  const save = async (): Promise<Parcella | undefined> => {
    if ((f.stato === 'emessa' || f.stato === 'pagata') && !(await confermaAccessori('Emetti senza accessori'))) return undefined
    return salva()
  }
  const nomeFile = (numero: string) => `${nomeDoc(f.tipo, L.parcella).replace(/ /g, '-')}-${numero.replace(/[\/ ]/g, '-')}`
  const html = (s: Parcella) => parcellaHtml({ ...s, ...aliquote, ...tot } as Parcella, vociFinali, cliente, settings, L, f.pratica_id ? praticaById.get(f.pratica_id)?.titolo : undefined)
  // con una pratica la finestra di salvataggio si apre nella cartella locale della pratica e il PDF resta collegato ai suoi documenti
  const pdf = async () => {
    if (!(await confermaAccessori('Salva il PDF senza accessori'))) return
    const s = await salva(); if (!s) return
    const r = await run(() => api.printPdf(html(s), nomeFile(s.numero), f.pratica_id), f.pratica_id ? 'PDF salvato nella cartella della pratica' : undefined)
    if (r) onClose()
  }
  // fattura elettronica: prima si salva, così il file nasce dai dati confermati
  const [xml, setXml] = useState<Parcella | null>(null)
  const fatturaXml = async () => { const s = await save(); if (s) setXml(s) }
  const notaCredito = async () => {
    if (!parcella || !(await confirm({ title: `Stornare la fattura ${parcella.numero}?`, text: 'Viene creata una nota di credito con le stesse voci e gli stessi importi. La fattura resta nell’archivio come «stornata» e non è più da incassare. Puoi poi preparare il PDF o l’XML della nota.', ok: 'Crea la nota di credito' }))) return
    const nc = await run(() => api.notaCredito(parcella.id))
    if (nc) { toast(`Creata la nota di credito ${nc.numero}`); onClose() }
  }
  const del = async () => {
    if (!parcella) return
    if (await confirm({ title: 'Eliminare il documento?', text: `${parcella.numero} verrà eliminato. Le ore e le spese collegate torneranno da fatturare.`, ok: 'Elimina', danger: true })) {
      if (await run(() => api.remove('parcelle', parcella.id))) onClose()
    }
  }

  const tabellaVoci = (
    <>
      <table className="table compact voci">
        <thead><tr><th>Tipo</th><th>Descrizione</th><th style={{ width: 80 }}>Q.tà</th><th style={{ width: 110 }}>Importo (€)</th><th style={{ width: 100 }} className="n">Totale</th><th style={{ width: 34 }} /></tr></thead>
        <tbody>
          {voci.map((v, i) => (
            <tr key={i}>
              <td><select value={v.tipo} onChange={(e) => upd(i, { tipo: e.target.value as any })} aria-label="Tipo voce"><option value="compenso">Compenso</option><option value="spesa_imponibile">Spesa imponibile</option><option value="spesa_esente">Spesa esente</option></select></td>
              <td><input value={v.descrizione} onChange={(e) => upd(i, { descrizione: e.target.value })} aria-label="Descrizione" /></td>
              <td><input inputMode="decimal" defaultValue={decimal(v.quantita)} key={'q' + i + voci.length} onBlur={(e) => upd(i, { quantita: parseNumber(e.target.value) })} aria-label="Quantità" /></td>
              <td><input inputMode="decimal" defaultValue={v.importo ? decimal(v.importo) : ''} key={'i' + i + voci.length} placeholder="0,00" onBlur={(e) => upd(i, { importo: parseNumber(e.target.value) })} aria-label="Importo" /></td>
              <td className="n nowrap">{money((v.quantita || 0) * (v.importo || 0))}</td>
              <td><button className="icon-btn" aria-label="Rimuovi voce" onClick={() => setVoci((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 8 }}>
        <Btn size="sm" onClick={() => setVoci((v) => [...v, { tipo: 'compenso', descrizione: '', quantita: 1, importo: 0 }])}><Plus size={14} /> Aggiungi voce</Btn>
        <SpesaExtra avvocato={settings.profilo === 'avvocato'} onAdd={(v) => setVoci((x) => [...x, v])} />
      </div>
    </>
  )

  return (
    <Modal title={parcella ? `${nomeDoc(f.tipo, L.parcella)} ${numero}` : `Nuov${f.tipo === 'preventivo' ? 'o preventivo' : f.tipo === 'proforma' ? 'a nota pro forma' : 'a ' + L.parcella.toLowerCase()}`}
      subtitle={!parcella && numero ? `Numero ${numero}` : undefined} onClose={onClose} width={usaCalcolo ? 1240 : 860}
      footer={<>
        {parcella && <Btn variant="danger" onClick={del} aria-label="Elimina il documento" title="Elimina il documento" style={{ marginRight: 'auto' }}><Trash2 size={15} /></Btn>}
        <Btn variant="ghost" onClick={onClose}>Chiudi</Btn>
        {f.tipo === 'proforma' && <Btn variant="ghost" onClick={() => setModello(modelloEffettivo(settings))} title="Modifica intestazione, coordinate di pagamento e piè di pagina del PDF"><LayoutTemplate size={15} /> Intestazione e piè di pagina</Btn>}
        <Btn disabled={needsReview} onClick={pdf} title={f.pratica_id ? 'Si apre nella cartella locale della pratica; il PDF compare anche tra i documenti della pratica (nessuna seconda copia)' : 'Scegli la cartella del computer in cui salvare il PDF'}><Download size={15} /> {f.pratica_id ? 'Salva PDF nella cartella della pratica…' : 'Salva PDF…'}</Btn>
        {f.tipo === 'parcella' && parcella && (parcella.stato === 'emessa' || parcella.stato === 'pagata') && <Btn variant="ghost" onClick={notaCredito} title="Storna per intero questa fattura con una nota di credito (TD04)"><Undo2 size={15} /> Nota di credito</Btn>}
        {(f.tipo === 'parcella' || f.tipo === 'nota_credito') && <Btn disabled={needsReview} onClick={fatturaXml} title="File XML FatturaPA da caricare sul tuo canale verso lo SdI (TIO non lo invia)"><FileCode2 size={15} /> Fattura elettronica</Btn>}
        <Btn variant="primary" onClick={async () => { if (await save()) onClose() }}>Salva</Btn>
      </>}>
      {importazione && <section className="card pad" aria-label="Verifica dei dati importati">
        <p role="status" className={needsReview ? 'doc-avviso' : 'muted'}><b>{needsReview ? 'Importazione da verificare' : 'Dati importati verificati'}</b><br />Netto originale: {importazione.nettoOriginale === null ? 'non disponibile' : money(importazione.nettoOriginale)} · Netto attuale: {money(tot.netto)}
          {importazione.nettoOriginale !== null && Math.abs(importazione.nettoOriginale - tot.netto) > 0.02 && <><br />I totali differiscono: controlla anche bollo, acconti e voci non riconosciute.</>}</p>
        <label className="check big"><input type="checkbox" checked={verificato} onChange={e => setVerificato(e.target.checked)} /> Ho verificato voci, aliquote, differenze e destinatario confrontandoli con il documento originale.</label>
        {needsReview && <p className="muted small">Puoi conservare la bozza. Per generare il PDF o emettere il documento occorre confermare la verifica. Una modifica ai dati richiederà una nuova verifica.</p>}
      </section>}
      <div className={usaCalcolo ? 'parc-layout con-calcolo' : 'parc-layout'}>
      <div className="parc-doc">
      <FormGrid cols={usaCalcolo ? 2 : 3}>
        {f.tipo === 'nota_credito' ? <Field label="Documento" span={usaCalcolo ? 2 : undefined} hint="Storno di una fattura: voci e importi restano quelli della fattura."><p className="nota-credito-tipo"><b>Nota di credito</b></p></Field>
          : <Field label="Documento" span={usaCalcolo ? 2 : undefined} hint={parcella ? parcella.stato !== 'bozza' || (parcella.incassato || 0) > 0 ? 'Per un tipo diverso crea un nuovo documento.' : 'Cambiando tipo verrà assegnato un numero della nuova serie al salvataggio.' : undefined}><Segmented disabled={!!parcella && (parcella.stato !== 'bozza' || (parcella.incassato || 0) > 0)} value={f.tipo} onChange={(v) => set('tipo', v)} options={[{ id: 'parcella', label: L.parcella }, { id: 'preventivo', label: 'Preventivo' }, { id: 'proforma', label: 'Nota pro forma' }]} /></Field>}
        <Field label="Data"><Input type="date" value={f.data} onChange={(e) => set('data', e.target.value)} /></Field>
        <Field label="Stato"><Select value={f.stato} onChange={(e) => set('stato', e.target.value)}>{f.incassi_dettagliati
          ? <>{parcella?.stato === 'annullata' ? <option value="emessa">Ripristina (dal registro dei pagamenti)</option> : <option value={parcella?.stato}>{parcella?.stato === 'pagata' ? 'Pagata' : 'Emessa'} (dal registro dei pagamenti)</option>}<option value="annullata">Annullata</option></>
          : <><option value="bozza">Bozza</option><option value="emessa">Emessa</option><option value="pagata">Pagata</option><option value="annullata">Annullata</option>{f.stato === 'stornata' && <option value="stornata">Stornata (nota di credito)</option>}</>}</Select></Field>
        {f.tipo === 'preventivo' && <><Field label="Valido fino al"><Input type="date" value={f.validita || ''} onChange={e=>set('validita',e.target.value||null)} /></Field><Field label="Esito preventivo"><Select value={f.esito_preventivo || 'da_inviare'} onChange={e=>set('esito_preventivo',e.target.value)}><option value="da_inviare">Da inviare</option><option value="inviato">Inviato</option><option value="accettato">Accettato</option><option value="rifiutato">Rifiutato</option></Select></Field></>}
        <Field label={L.cliente} span={usaCalcolo ? 2 : undefined}><Select value={f.cliente_id ?? ''} onChange={(e) => set('cliente_id', e.target.value ? Number(e.target.value) : null)}><option value="">—</option>{anagrafica.filter((a) => a.ruolo !== 'controparte').map((a) => <option key={a.id} value={a.id}>{a.denominazione}</option>)}</Select></Field>
        <Field label={L.pratica} span={usaCalcolo ? 2 : undefined}><PraticaSelect value={f.pratica_id} onChange={(v) => { set('pratica_id', v); const p = v ? praticaById.get(v) : null; if (p?.cliente_id && !f.cliente_id) set('cliente_id', p.cliente_id) }} /></Field>
        {f.stato === 'pagata' && <Field label="Data pagamento"><Input type="date" value={f.data_pagamento || todayStr()} onChange={(e) => set('data_pagamento', e.target.value)} /></Field>}
        {f.tipo === 'parcella' && <><Field label="Scadenza pagamento"><Input type="date" value={f.scadenza_pagamento || ''} onChange={(e) => set('scadenza_pagamento', e.target.value || null)} /></Field><Field label={usaCalcolo ? 'Incassato (€)' : 'Incassi / acconti ricevuti (€)'} hint={usaCalcolo ? undefined : 'Importo cumulativo già ricevuto, da zero al netto del documento'}><Input inputMode="decimal" title="Importo cumulativo già ricevuto, da zero al netto del documento" value={f.stato === 'pagata' ? tot.netto : f.incassato || 0} disabled={f.stato === 'pagata' || !!f.incassi_dettagliati} onChange={(e) => set('incassato', parseNumber(e.target.value))} /></Field></>}
        <Field label="Oggetto (facoltativo)" span={usaCalcolo ? 2 : 3}><Input value={f.oggetto || ''} onChange={(e) => set('oggetto', e.target.value)} placeholder={forense ? "Es. Assistenza stragiudiziale" : "Es. Progettazione, consulenza o manutenzione"} /></Field>
      </FormGrid>
      {usaCalcolo && <div style={{ marginTop: 12 }}><Field label="Note / condizioni"><Textarea rows={2} value={f.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="Es. Pagamento entro 30 giorni." /></Field></div>}
      </div>

      {forense && (
        <label className="check parc-calcola" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={usaCalcolo} onChange={(e) => setUsaCalcolo(e.target.checked)} /> <b>Calcola il compenso con i parametri forensi</b> <span className="muted small">(tabelle ministeriali incluse)</span>
        </label>
      )}

      {usaCalcolo ? (
        <>
          <section className="card-section calc">
            <CompensoForm initial={calcStato.current} extraVoci={voci} onResult={(r) => { calcStato.current = r.state; setCalcRes(r) }} />
          </section>
          <section className="card-section altre">
            <header><h3>Altre voci (ore, spese, importi liberi)</h3></header>
            {voci.length > 0 ? tabellaVoci : (
              <div className="row"><span className="muted small">Nessuna voce aggiuntiva.</span>
                <Btn size="sm" onClick={() => setVoci((v) => [...v, { tipo: 'compenso', descrizione: '', quantita: 1, importo: 0 }])}><Plus size={14} /> Aggiungi voce</Btn>
                <SpesaExtra avvocato={settings.profilo === 'avvocato'} onAdd={(v) => setVoci((x) => [...x, v])} /></div>
            )}
          </section>
        </>
      ) : (
        <>
          <h3 className="sub-title" style={{ marginTop: 14 }}>Voci</h3>
          {tabellaVoci}
          <div className="parc-bottom">
            <div>
              <h3 className="sub-title">Aliquote</h3>
              <div className="aliq">
                {forense && <label>Spese generali %<input inputMode="decimal" value={f.sg_perc} onChange={(e) => set('sg_perc', parseNumber(e.target.value))} /></label>}
                <label>{forense ? 'CPA' : f.contributo_nome || 'Contributo'} %<input inputMode="decimal" value={f.cpa_perc} onChange={(e) => set('cpa_perc', parseNumber(e.target.value))} /></label>
                <label>IVA %<input inputMode="decimal" value={f.iva_perc} onChange={(e) => set('iva_perc', parseNumber(e.target.value))} /></label>
                <label>Ritenuta %<input inputMode="decimal" value={f.rit_perc} onChange={(e) => set('rit_perc', parseNumber(e.target.value))} /></label>
              </div>
              <Field label="Bollo (€)" hint="Applicato dal calcolo senza IVA oltre la soglia prevista; verifica il tuo regime."><Input inputMode="decimal" value={f.bollo || 0} onChange={e => set('bollo', parseNumber(e.target.value))} /></Field>
              <Field label="Note / condizioni"><Textarea rows={3} value={f.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="Es. Pagamento entro 30 giorni. IBAN…" /></Field>
            </div>
            <table className="totals-table">
              <tbody>
                <tr><td>Compensi</td><td>{money(tot.compensi)}</td></tr>
                {+f.sg_perc > 0 && <tr><td>Spese generali {decimal(f.sg_perc)}%</td><td>{money(tot.spese_generali)}</td></tr>}
                {+f.cpa_perc > 0 && <tr><td>{f.contributo_nome || 'CPA'} {decimal(f.cpa_perc)}%</td><td>{money(tot.cpa)}</td></tr>}
                <tr><td>Imponibile</td><td>{money(tot.imponibile)}</td></tr>
                <tr><td>IVA {decimal(f.iva_perc)}%</td><td>{money(tot.iva)}</td></tr>
                {tot.spese_esenti > 0 && <tr><td>Spese esenti art. 15</td><td>{money(tot.spese_esenti)}</td></tr>}
                {tot.bollo > 0 && <tr><td>Bollo</td><td>{money(tot.bollo)}</td></tr>}
                <tr className="grand"><td>Totale</td><td>{money(tot.totale)}</td></tr>
                {+f.rit_perc > 0 && <><tr><td>Ritenuta {decimal(f.rit_perc)}%</td><td>−{money(tot.ritenuta)}</td></tr><tr className="grand"><td>Netto a pagare</td><td>{money(tot.netto)}</td></tr></>}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>
      {xml && <FatturaElettronicaModal parcella={xml} onClose={() => setXml(null)} />}
      {modello && (
        <Modal title="Intestazione e piè di pagina" subtitle="Valgono per tutte le note pro forma" width={1060} onClose={() => setModello(null)}
          footer={<><Btn variant="ghost" onClick={() => setModello(null)}>Annulla</Btn><Btn variant="primary" onClick={async () => { if (await run(() => api.setSettings({ modello_pdf: modello }), 'Modello salvato')) setModello(null) }}>Salva modello</Btn></>}>
          <ModelloPdfEditor settings={settings} value={modello} onChange={setModello} />
        </Modal>
      )}
    </Modal>
  )
}

/** Spese extra già classificate: quelle anticipate in nome e per conto del cliente restano fuori dall'IVA (art. 15 DPR 633/1972,
 *  con il documento intestato al cliente); i rimborsi delle spese sostenute per il lavoro sono imponibili come il compenso. */
const SPESE_EXTRA = (avvocato: boolean): { gruppo: string; tipo: VoceParcella['tipo']; voci: [string, number][] }[] => [
  { gruppo: 'Anticipate per conto del cliente · senza IVA (art. 15)', tipo: 'spesa_esente', voci: avvocato
    ? [['Contributo unificato', 0], ['Anticipazioni forfettarie (marca da 27 €)', 27], ['Marca da bollo', 16], ['Diritti di copia', 0], ['Notifiche', 0], ['Spese postali e raccomandate', 0], ['Visure e certificati', 0], ['Registrazione atti', 0]]
    : [['Marca da bollo', 16], ['Diritti e tasse per conto del cliente', 0], ['Visure e certificati', 0], ['Diritti di segreteria e pratiche', 0], ['Spese postali e raccomandate', 0]] },
  { gruppo: 'Rimborsi di spese sostenute · con IVA', tipo: 'spesa_imponibile', voci: avvocato
    ? [['Carburante', 0], ['Trasferta (rimborso chilometrico)', 0], ['Pedaggi e parcheggi', 0], ['Treno, aereo e trasporti', 0], ['Vitto e alloggio', 0], ['Domiciliazione', 0]]
    : [['Carburante', 0], ['Trasferta (rimborso chilometrico)', 0], ['Pedaggi e parcheggi', 0], ['Vitto e alloggio', 0], ['Materiali', 0], ['Noleggio attrezzature', 0], ['Spedizione e trasporto', 0], ['Smaltimento', 0]] },
]
function SpesaExtra({ avvocato, onAdd }: { avvocato: boolean; onAdd: (v: VoceParcella) => void }) {
  const gruppi = SPESE_EXTRA(avvocato)
  return (
    <select className="spesa-extra" value="" aria-label="Aggiungi una spesa extra" title="Marche da bollo, carburante, trasferte e altre spese: già impostate con o senza IVA"
      onChange={(e) => { const [g, i] = e.target.value.split(':').map(Number); if (Number.isNaN(i)) { onAdd({ tipo: g === 1 ? 'spesa_imponibile' : 'spesa_esente', descrizione: '', quantita: 1, importo: 0 }); return } const x = gruppi[g]; onAdd({ tipo: x.tipo, descrizione: x.voci[i][0], quantita: 1, importo: x.voci[i][1] }) }}>
      <option value="" disabled>+ Spesa extra…</option>
      {gruppi.map((x, g) => <optgroup key={g} label={x.gruppo}>
        {x.voci.map(([nome, importo], i) => <option key={i} value={`${g}:${i}`}>{nome}{importo ? ` (${importo.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €)` : ''}</option>)}
        <option value={`${g}:x`}>Altra spesa {x.tipo === 'spesa_esente' ? 'senza IVA' : 'con IVA'}…</option>
      </optgroup>)}
    </select>
  )
}
