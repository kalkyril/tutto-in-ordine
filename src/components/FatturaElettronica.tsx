import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileCode2, Info } from 'lucide-react'
import { api, type OpzioniFatturaXml } from '../api'
import { useData } from '../store'
import { Btn, Field, FormGrid, Input, Modal, Select, useAction, useFeedback } from './ui'
import { money } from '../lib/format'
import type { Parcella } from '../types'

type Liste = Awaited<ReturnType<typeof api.opzioniFatturaXml>>

/** Divide «Mario Rossi» in nome e cognome: la proposta si corregge nella finestra. */
const dividi = (n: string) => { const p = n.trim().split(/\s+/); return p.length > 1 ? { nome: p[0], cognome: p.slice(1).join(' ') } : { nome: '', cognome: n.trim() } }

/** Fattura elettronica: controlla i dati, chiede quelli mancanti e salva il file XML da caricare sul proprio canale verso lo SdI. */
export function FatturaElettronicaModal({ parcella, onClose }: { parcella: Parcella; onClose: () => void }) {
  const { settings, anagraficaById } = useData()
  const run = useAction()
  const { toast } = useFeedback()
  const cliente = parcella.cliente_id ? anagraficaById.get(parcella.cliente_id) : null
  const salvate = (settings.fatturapa || {}) as OpzioniFatturaXml
  const sdi = ((settings.fatturapa_destinatari || {}) as Record<string, { codice?: string; pec?: string }>)[String(parcella.cliente_id)] || {}
  const [liste, setListe] = useState<Liste | null>(null)
  const [o, setO] = useState<OpzioniFatturaXml>(() => ({
    tipoDocumento: salvate.tipoDocumento || 'TD01',
    regime: salvate.regime || (parcella.iva_perc ? 'RF01' : 'RF19'),
    tipoCassa: salvate.tipoCassa || (settings.profilo === 'avvocato' ? 'TC01' : 'TC22'),
    natura: salvate.natura || 'N2.2',
    tipoRitenuta: salvate.tipoRitenuta || 'RT01',
    codiceDestinatario: sdi.codice || '',
    pecDestinatario: sdi.pec ?? cliente?.pec ?? '',
    cessionario: cliente?.tipo === 'persona' ? dividi(cliente.denominazione) : undefined,
  }))
  const set = (p: Partial<OpzioniFatturaXml>) => setO((x) => ({ ...x, ...p }))
  const [verifica, setVerifica] = useState<{ errori: string[]; avvisi: string[]; nomeFile: string } | null>(null)
  useEffect(() => { api.opzioniFatturaXml().then(setListe).catch(() => {}) }, [])
  useEffect(() => { const t = setTimeout(() => { api.verificaFatturaXml(parcella.id, o).then(setVerifica).catch((e) => setVerifica({ errori: [String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')], avvisi: [], nomeFile: '' })) }, 200); return () => clearTimeout(t) }, [o, parcella.id])
  const opzioni = (r?: Record<string, string>) => Object.entries(r || {}).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)
  const ordinati = useMemo(() => liste, [liste])
  const salva = async () => {
    // le scelte valgono anche per le prossime fatture; codice e PEC restano associati al cliente
    await api.setSettings({ fatturapa: { tipoDocumento: o.tipoDocumento, regime: o.regime, tipoCassa: o.tipoCassa, natura: o.natura, tipoRitenuta: o.tipoRitenuta }, ...(parcella.cliente_id && { fatturapa_destinatari: { ...(settings.fatturapa_destinatari || {}), [parcella.cliente_id]: { codice: (o.codiceDestinatario || '').toUpperCase(), pec: o.pecDestinatario } } }) })
    const r = await run(() => api.salvaFatturaXml(parcella.id, o))
    if (r) { toast(r.avvisi.length ? `File salvato. ${r.avvisi[0]}` : 'Fattura elettronica salvata: caricala sul tuo canale verso lo SdI'); onClose() }
  }
  const ok = verifica && !verifica.errori.length
  return (
    <Modal title={`Fattura elettronica ${parcella.numero}`} subtitle="File XML FatturaPA da caricare su Fatture e Corrispettivi, sul servizio del tuo intermediario o da consegnare al commercialista" width={760} onClose={onClose} protectChanges={false}
      footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" disabled={!ok} onClick={salva}><FileCode2 size={15} /> Salva XML…</Btn></>}>
      <div className="fattura-xml">
        <p className="fattura-xml-nota"><Info size={15} aria-hidden /> TIO prepara il file e lo controlla con le regole dello schema ufficiale; non lo invia allo SdI. Le ricevute (consegna o scarto) arrivano sul canale che usi per caricarlo.</p>
        <FormGrid>
          <Field label="Tipo di documento">{parcella.tipo === 'nota_credito' ? <Select value="TD04" disabled><option value="TD04">TD04 · Nota di credito</option></Select> : <Select value={o.tipoDocumento} onChange={(e) => set({ tipoDocumento: e.target.value })}>{opzioni(Object.fromEntries(Object.entries(ordinati?.tipiDocumento || {}).filter(([k]) => k !== 'TD04')))}</Select>}</Field>
          <Field label="Regime fiscale"><Select value={o.regime} onChange={(e) => set({ regime: e.target.value })}>{opzioni(ordinati?.regimi)}</Select></Field>
          {parcella.cpa > 0 && <Field label={`Cassa del ${parcella.contributo_nome || 'contributo'}`} span={2}><Select value={o.tipoCassa} onChange={(e) => set({ tipoCassa: e.target.value })}>{opzioni(ordinati?.casse)}</Select></Field>}
          {!parcella.iva_perc && <Field label="Natura dell’operazione senza IVA" span={2}><Select value={o.natura} onChange={(e) => set({ natura: e.target.value })}>{opzioni(ordinati?.nature)}</Select></Field>}
          {parcella.rit_perc > 0 && <Field label="Ritenuta d’acconto"><Select value={o.tipoRitenuta} onChange={(e) => set({ tipoRitenuta: e.target.value })}><option value="RT01">RT01 · persone fisiche</option><option value="RT02">RT02 · persone giuridiche</option></Select></Field>}
        </FormGrid>
        <fieldset className="fattura-xml-gruppo"><legend>Destinatario: {cliente?.denominazione || 'nessun cliente'}</legend>
          <FormGrid>
            <Field label="Codice destinatario" hint="7 caratteri; vuoto = 0000000 (privati e chi riceve via PEC)"><Input value={o.codiceDestinatario} maxLength={7} onChange={(e) => set({ codiceDestinatario: e.target.value.toUpperCase() })} placeholder="0000000" /></Field>
            <Field label="PEC del destinatario"><Input type="email" value={o.pecDestinatario} onChange={(e) => set({ pecDestinatario: e.target.value })} /></Field>
            {o.cessionario && <><Field label="Nome"><Input value={o.cessionario.nome || ''} onChange={(e) => set({ cessionario: { ...o.cessionario, nome: e.target.value } })} /></Field><Field label="Cognome"><Input value={o.cessionario.cognome || ''} onChange={(e) => set({ cessionario: { ...o.cessionario, cognome: e.target.value } })} /></Field></>}
          </FormGrid>
        </fieldset>
        <div className="fattura-xml-esito" role="status" aria-live="polite">
          {!verifica && <p className="muted">Controllo dei dati…</p>}
          {verifica?.errori.map((e) => <p key={e} className="esito err"><AlertTriangle size={15} aria-hidden /><span>{e}</span></p>)}
          {verifica?.avvisi.map((e) => <p key={e} className="esito avviso"><AlertTriangle size={15} aria-hidden /><span>{e}</span></p>)}
          {ok && <p className="esito ok"><CheckCircle2 size={15} aria-hidden /><span>Dati completi. Imponibile {money(parcella.imponibile)} · IVA {money(parcella.iva)} · totale {money(parcella.totale)} · da pagare {money(parcella.netto)}. File: <code>{verifica!.nomeFile}</code></span></p>}
        </div>
      </div>
    </Modal>
  )
}
