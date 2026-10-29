import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useData } from '../store'
import { useNav } from '../nav'
import { Btn, Field, FormGrid, Input, Modal, Select, Textarea, useAction, useFeedback } from './ui'
import { PraticaSelect } from './forms'
import { ScadenzeFiscaliModal } from './ScadenzeFiscali'
import { usePagination } from './Pagination'
import { fmtDate, todayStr } from '../lib/dates'
import { primoLavorativo } from '../lib/termini'
import { money, parseNumber } from '../lib/format'
import type { Ora, Parcella, Spesa } from '../types'

interface Pagamento { id: number; parcella_id: number; data: string | null; importo: number; metodo: string; note: string }
export interface Costo { id: number; pratica_id: number | null; fornitore_id: number | null; data: string; descrizione: string; categoria: string; importo: number; scadenza: string | null; pagata: number; recuperabile: number }
interface Ricorrenza { id: number; pratica_id: number | null; titolo: string; frequenza: string; prossima: string; attiva: number; lavorativo?: number }
interface Gestione { pagamenti: Pagamento[]; costi: Costo[]; ricorrenze: Ricorrenza[] }
export function useGestione() {
  const [dati, setDati] = useState<Gestione>({ pagamenti: [], costi: [], ricorrenze: [] })
  const [errore, setErrore] = useState('')
  useEffect(() => {
    let attivo=true, ticket=0
    const load=async()=>{const n=++ticket;try {const r=await api.gestione('leggi');if(attivo&&ticket===n){setDati(r);setErrore('')}} catch(e:any){if(attivo&&ticket===n)setErrore(e.message)}}
    load();const off=window.mngmnt.on('data-changed',load)
    return()=>{attivo=false;ticket++;off()}
  },[])
  return { ...dati, errore }
}
const csvCell=(x:unknown)=>{let s=String(x??'').replace(/[\r\n]/g,' ').trim();if(/^[=+@\-\t]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
export type AreaGestione='preventivi'|'pagamenti'|'costi'|'ricorrenze'

export function GestioneAttivita({ area, apri }: { area: AreaGestione; apri: (p:Parcella)=>void }) {
  const d=useGestione(), {parcelle,praticaById,anagraficaById,settings}=useData(), {go}=useNav(), run=useAction(), {confirm}=useFeedback()
  const elenco=area==='preventivi'?parcelle.filter(p=>p.tipo==='preventivo'):area==='pagamenti'?d.pagamenti:area==='costi'?d.costi:d.ricorrenze
  const {visible,controls}=usePagination<any>(elenco,area)
  const [form,setForm]=useState<{tipo:'pagamenti'|'costi'|'ricorrenze';dati:any}|null>(null)
  const [fiscali,setFiscali]=useState(false)
  const esegui=async(azione:string,dati:any)=>run(()=>api.gestione(azione,dati))
  const elimina=async(azione:string,id:number)=>{if(await confirm({title:'Eliminare la registrazione?',text:azione==='eliminaPagamento'?'Il residuo del documento sarà ricalcolato.':'La registrazione verrà eliminata. I documenti esterni non vengono modificati.',ok:'Elimina',danger:true}))await esegui(azione,{id})}
  const esporta=()=>{
    const rows:any[][]=area==='pagamenti'?d.pagamenti.map(x=>[x.data,parcelle.find(p=>p.id===x.parcella_id)?.numero,x.importo.toFixed(2).replace('.',','),x.metodo,x.note]):area==='costi'?d.costi.map(x=>[x.data,x.descrizione,x.importo.toFixed(2).replace('.',','),anagraficaById.get(x.fornitore_id||0)?.denominazione,x.categoria,x.scadenza,x.pagata?'Pagato':'Da pagare',x.recuperabile?'Recuperabile':'Interno',praticaById.get(x.pratica_id||0)?.titolo]):[]
    const header=area==='pagamenti'?['Data','Documento','Importo','Metodo','Note']:['Data','Descrizione','Importo','Fornitore','Categoria','Scadenza','Stato','Rimborso','Lavoro']
    run(()=>api.salvaTesto(`${area}.csv`,'\uFEFF'+[header,...rows].map(r=>r.map(csvCell).join(';')).join('\r\n')),'CSV salvato')
  }
  return <section className="card pad business-panel">
    {d.errore&&<p role="alert" className="stato-err">{d.errore}</p>}
    <header className="card-head"><h2>{area==='preventivi'?'Preventivi e lavori':area==='pagamenti'?'Registro dei pagamenti':area==='costi'?'Costi e fornitori':'Attività ricorrenti'}</h2><div className="row wrap">
      {(area==='pagamenti'||area==='costi')&&<Btn size="sm" onClick={esporta}>Esporta CSV</Btn>}
      {area!=='preventivi'&&<Btn variant="primary" size="sm" onClick={()=>setForm({tipo:area,dati:{}})}>{area==='pagamenti'?'Registra pagamento':area==='costi'?'Nuovo costo':'Nuova ricorrenza'}</Btn>}
      {area==='ricorrenze'&&<Btn size="sm" onClick={()=>setFiscali(true)} title="IVA, F24, imposte e contributi già pronti per il tuo profilo">Scadenze fiscali…</Btn>}
      {area==='ricorrenze'&&<Btn size="sm" onClick={()=>run(()=>api.gestione('genera'),'Attività in scadenza generate')}>Genera le attività in scadenza</Btn>}
    </div></header>
    {area==='preventivi'&&<><p className="muted small">Accetta il preventivo, avvia il lavoro e prepara il documento di vendita. La conversione crea una bozza con numerazione propria e conserva il preventivo originale.</p>
      <div className="table-wrap"><table className="table"><thead><tr><th>Preventivo</th><th>Cliente / oggetto</th><th>Valido fino</th><th>Esito</th><th>Lavoro</th><th>Azioni</th></tr></thead><tbody>{visible.map(p=><tr key={p.id}><td>{p.numero}</td><td>{anagraficaById.get(p.cliente_id||0)?.denominazione}<br/>{p.oggetto}</td><td>{p.validita?fmtDate(p.validita):'—'}{p.validita&&p.validita<todayStr()&&p.esito_preventivo!=='accettato'&&<small className="late-text"> · Scaduto</small>}</td><td>{{da_inviare:'Da inviare',inviato:'Inviato',accettato:'Accettato',rifiutato:'Rifiutato'}[p.esito_preventivo||'da_inviare']}</td><td>{p.pratica_id?praticaById.get(p.pratica_id)?.titolo:'—'}</td><td><div className="row wrap"><Btn size="sm" onClick={()=>apri(p)}>Apri</Btn>{p.esito_preventivo==='accettato'&&p.stato!=='annullata'&&<><Btn size="sm" onClick={async()=>{const r=await esegui('avvia',{id:p.id});if(r)go({page:'pratica',id:r.id})}}>{p.pratica_id?'Apri lavoro':'Avvia lavoro'}</Btn><Btn size="sm" disabled={!p.pratica_id} onClick={async()=>{const r=await esegui('converti',{id:p.id});if(r)apri(r)}}>Prepara documento</Btn></>}</div></td></tr>)}</tbody></table></div>
      {!parcelle.some(p=>p.tipo==='preventivo')&&<p className="muted pad">Crea il primo preventivo con «Nuovo documento».</p>}</>}
    {area==='pagamenti'&&<><p className="muted small">Le registrazioni aggiornano il residuo. Gli importi cumulativi precedenti vengono conservati quando aggiungi il primo pagamento dettagliato.</p><div className="table-wrap"><table className="table"><thead><tr><th>Data</th><th>Documento</th><th>Cliente</th><th>Importo</th><th>Metodo / note</th><th>Azioni</th></tr></thead><tbody>{visible.map(x=>{const p=parcelle.find(p=>p.id===x.parcella_id);return <tr key={x.id}><td>{x.data?fmtDate(x.data):'Data non specificata'}</td><td>{p?.numero}</td><td>{anagraficaById.get(p?.cliente_id||0)?.denominazione}</td><td>{money(x.importo)}</td><td>{x.metodo}<br/>{x.note}</td><td><Btn size="sm" variant="ghost" onClick={()=>elimina('eliminaPagamento',x.id)}>Elimina</Btn></td></tr>})}</tbody></table></div>{!d.pagamenti.length&&<p className="muted pad">Nessun pagamento dettagliato registrato.</p>}</>}
    {area==='costi'&&<><p className="muted small">Costi generali o del singolo lavoro, con fornitore e scadenza. Per evitare duplicazioni, non registrare qui una spesa già inserita fra le spese anticipate. «Recuperabile» indica un rimborso previsto, senza aggiungerlo automaticamente ai documenti.</p><p>Da pagare: <b>{money(d.costi.filter(x=>!x.pagata).reduce((s,x)=>s+x.importo,0))}</b> · Costi registrati: <b>{money(d.costi.reduce((s,x)=>s+x.importo,0))}</b></p><div className="table-wrap"><table className="table"><thead><tr><th>Data / costo</th><th>Fornitore</th><th>{settings.etichette.pratica}</th><th>Importo</th><th>Scadenza</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>{visible.map(x=><tr key={x.id}><td>{fmtDate(x.data)}<br/>{x.descrizione}<small className="muted"> · {x.categoria}{x.recuperabile?' · Recuperabile':''}</small></td><td>{anagraficaById.get(x.fornitore_id||0)?.denominazione||'—'}</td><td>{praticaById.get(x.pratica_id||0)?.titolo||'Generale'}</td><td>{money(x.importo)}</td><td>{x.scadenza?fmtDate(x.scadenza):'—'}</td><td>{x.pagata?'Pagato':'Da pagare'}</td><td><div className="row wrap"><Btn size="sm" onClick={()=>setForm({tipo:'costi',dati:x})}>Modifica</Btn><Btn size="sm" variant="ghost" onClick={()=>elimina('eliminaCosto',x.id)}>Elimina</Btn></div></td></tr>)}</tbody></table></div>{!d.costi.length&&<p className="muted pad">Nessun costo registrato. I fornitori si aggiungono dall'anagrafica.</p>}</>}
    {area==='ricorrenze'&&<><p className="muted small">TIO crea un compito alla prossima scadenza, anche dopo una ripresa. Dopo una lunga pausa crea una sola attività arretrata e passa alla prima data futura. L'app deve essere avviata per generare compiti e avvisi.</p><div className="table-wrap"><table className="table"><thead><tr><th>Attività</th><th>{settings.etichette.pratica}</th><th>Frequenza</th><th>Prossima data</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>{visible.map(x=><tr key={x.id}><td>{x.titolo}</td><td>{praticaById.get(x.pratica_id||0)?.titolo||'Generale'}</td><td>{x.frequenza}</td><td>{x.lavorativo&&primoLavorativo(x.prossima)!==x.prossima?<>{fmtDate(primoLavorativo(x.prossima))} <span className="muted small">(slitta dal {fmtDate(x.prossima)})</span></>:fmtDate(x.prossima)}</td><td>{x.attiva?'Attiva':'In pausa'}</td><td><div className="row wrap"><Btn size="sm" onClick={()=>setForm({tipo:'ricorrenze',dati:x})}>Modifica</Btn><Btn size="sm" variant="ghost" onClick={()=>elimina('eliminaRicorrenza',x.id)}>Elimina</Btn></div></td></tr>)}</tbody></table></div>{!d.ricorrenze.length&&<p className="muted pad">Nessuna attività ricorrente configurata.</p>}</>}
    {controls}
    {form&&<GestioneForm tipo={form.tipo} iniziale={form.dati} onClose={()=>setForm(null)}/>}
    {fiscali&&<ScadenzeFiscaliModal esistenti={d.ricorrenze.map(r=>r.titolo)} onClose={()=>setFiscali(false)}/>}
  </section>
}

/** Categorie dei costi e delle voci da pagare, con quelle tipiche dello studio legale; un valore già salvato resta tra le scelte. */
export const categorieCosto=(avvocato:boolean,attuale?:string)=>{const c=['Prestazioni e consulenze',...(avvocato?['Domiciliazioni e sostituzioni','Consulenti tecnici (CTP)']:[]),'Spese extra','Materiali','Servizi','Software','Utenze','Affitto','Trasferte','Imposte e contributi','Altro'];return attuale&&!c.includes(attuale)?[...c,attuale]:c}

export function GestioneForm({tipo,iniziale,onClose,titolo}:{tipo:'pagamenti'|'costi'|'ricorrenze';iniziale:any;onClose:()=>void;titolo?:string}) {
  const {parcelle,anagrafica,settings}=useData(),run=useAction(),busy=useRef(false),[salvando,setSalvando]=useState(false)
  const [f,setF]=useState<any>({data:todayStr(),prossima:todayStr(),frequenza:'mensile',categoria:'Altro',metodo:'Bonifico',importo:'',attiva:1,richiesta:crypto.randomUUID(),...iniziale})
  const set=(k:string,v:any)=>setF((p:any)=>({...p,[k]:v}))
  const save=async()=>{if(busy.current)return;busy.current=true;setSalvando(true);try{const r=await run(()=>api.gestione(tipo==='pagamenti'?'pagamento':tipo==='costi'?'costo':'ricorrenza',{...f,importo:tipo==='ricorrenze'?undefined:parseNumber(String(f.importo))}),'Registrazione salvata');if(r!==undefined&&r!==null)onClose()}finally{busy.current=false;setSalvando(false)}}
  const p=parcelle.find(p=>p.id===Number(f.parcella_id))
  return <Modal title={titolo||(tipo==='pagamenti'?'Registra pagamento':tipo==='costi'?'Costo dell’attività':'Attività ricorrente')} width={620} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="primary" disabled={salvando} onClick={save}>{salvando?'Salvataggio…':'Salva'}</Btn></>}><FormGrid>
    {tipo==='pagamenti'?<><Field label="Documento emesso *" span={2}><Select value={f.parcella_id||''} onChange={e=>set('parcella_id',Number(e.target.value))}><option value="">Scegli documento</option>{parcelle.filter(p=>p.tipo==='parcella'&&p.stato==='emessa').map(p=><option key={p.id} value={p.id}>{p.numero} · {anagrafica.find(a=>a.id===p.cliente_id)?.denominazione} · residuo {money(p.netto-(p.incassato||0))}</option>)}</Select></Field>{p&&<p className="muted small" style={{gridColumn:'1 / -1'}}>Residuo: {money(p.netto-(p.incassato||0))}</p>}</>:<Field label={tipo==='costi'?'Descrizione *':'Attività *'} span={2}><Input value={tipo==='costi'?f.descrizione||'':f.titolo||''} onChange={e=>set(tipo==='costi'?'descrizione':'titolo',e.target.value)} /></Field>}
    {tipo!=='ricorrenze'&&<><Field label="Data *"><Input type="date" value={f.data} onChange={e=>set('data',e.target.value)}/></Field><Field label="Importo (€) *"><Input inputMode="decimal" value={f.importo} onChange={e=>set('importo',e.target.value)}/></Field></>}
    {tipo==='pagamenti'&&<><Field label="Metodo"><Select value={f.metodo} onChange={e=>set('metodo',e.target.value)}>{['Bonifico','Carta','Contanti','Assegno','Altro'].map(x=><option key={x}>{x}</option>)}</Select></Field><Field label="Note"><Textarea value={f.note||''} onChange={e=>set('note',e.target.value)}/></Field></>}
    {tipo!=='pagamenti'&&<Field label={settings.etichette.pratica+' (facoltativo)'} span={2}><PraticaSelect value={f.pratica_id||null} onChange={id=>set('pratica_id',id)}/></Field>}
    {tipo==='costi'&&<><Field label="Fornitore o professionista"><Select value={f.fornitore_id||''} onChange={e=>set('fornitore_id',e.target.value?Number(e.target.value):null)}><option value="">Non specificato</option>{anagrafica.map(a=><option key={a.id} value={a.id}>{a.denominazione}</option>)}</Select></Field><Field label="Categoria"><Select value={f.categoria} onChange={e=>set('categoria',e.target.value)}>{categorieCosto(settings.profilo==='avvocato',f.categoria).map(x=><option key={x}>{x}</option>)}</Select></Field><Field label="Da pagare entro"><Input type="date" value={f.scadenza||''} onChange={e=>set('scadenza',e.target.value||null)}/></Field><Field label="Pagamento"><label className="check"><input type="checkbox" checked={!!f.pagata} onChange={e=>set('pagata',e.target.checked?1:0)}/> Già pagato</label></Field><Field label="Rimborso"><label className="check"><input type="checkbox" checked={!!f.recuperabile} onChange={e=>set('recuperabile',e.target.checked?1:0)}/> Recuperabile dal cliente</label></Field></>}
    {tipo==='ricorrenze'&&<><Field label="Prossima scadenza *"><Input type="date" value={f.prossima} onChange={e=>set('prossima',e.target.value)}/></Field><Field label="Frequenza"><Select value={f.frequenza} onChange={e=>set('frequenza',e.target.value)}><option value="settimanale">Settimanale</option><option value="mensile">Mensile</option><option value="annuale">Annuale</option></Select></Field><Field label="Stato"><label className="check"><input type="checkbox" checked={!!f.attiva} onChange={e=>set('attiva',e.target.checked?1:0)}/> Attiva</label></Field><Field label="Sabati e festivi"><label className="check"><input type="checkbox" checked={!!f.lavorativo} onChange={e=>set('lavorativo',e.target.checked?1:0)}/> Sposta al primo giorno lavorativo</label></Field></>}
  </FormGrid></Modal>
}

export function BudgetLavoro({praticaId,ore,spese}:{praticaId:number;ore:Ora[];spese:Spesa[]}) {
  const {praticaById}=useData(),d=useGestione(),run=useAction(),p=praticaById.get(praticaId),[edit,setEdit]=useState(false)
  const [f,setF]=useState<any>({})
  if(!p)return null
  const oreTotali=ore.reduce((s,o)=>s+o.minuti/60,0),valoreOre=ore.reduce((s,o)=>s+o.minuti/60*o.tariffa_oraria,0),costi=spese.reduce((s,x)=>s+x.importo,0)+d.costi.filter(c=>c.pratica_id===praticaId).reduce((s,c)=>s+c.importo,0)
  return <section className="card pad"><header className="card-head"><h2>Budget e consegna</h2><Btn size="sm" onClick={()=>{setF({budget_ore:p.budget_ore??'',budget_importo:p.budget_importo??'',consegna:p.consegna||''});setEdit(true)}}>Modifica budget</Btn></header><p>Ore registrate: <b>{oreTotali.toLocaleString('it-IT',{maximumFractionDigits:2})}</b>{p.budget_ore!=null&&<> / previste <b>{p.budget_ore}</b>{oreTotali>p.budget_ore&&<strong className="late-text"> · Budget ore superato</strong>}</>} · Costi registrati: <b>{money(costi)}</b></p><p>Importo concordato (imponibile): <b>{p.budget_importo==null?'Non impostato':money(p.budget_importo)}</b>{p.budget_importo!=null&&<> · Residuo dopo costi e valore delle ore: <b>{money(p.budget_importo-costi-valoreOre)}</b></>}</p><p className="muted small">Il residuo è una stima operativa, non l'utile fiscale. Consegna: {p.consegna?fmtDate(p.consegna):'non impostata'}.</p>{d.errore&&<p role="alert">{d.errore}</p>}
    {edit&&<Modal title="Budget del lavoro" onClose={()=>setEdit(false)} footer={<><Btn variant="ghost" onClick={()=>setEdit(false)}>Annulla</Btn><Btn variant="primary" onClick={async()=>{const r=await run(()=>api.save('pratiche',{id:praticaId,budget_ore:f.budget_ore===''?null:parseNumber(String(f.budget_ore)),budget_importo:f.budget_importo===''?null:parseNumber(String(f.budget_importo)),consegna:f.consegna||null}),'Budget salvato');if(r)setEdit(false)}}>Salva</Btn></>}><FormGrid><Field label="Ore previste"><Input inputMode="decimal" value={f.budget_ore} onChange={e=>setF({...f,budget_ore:e.target.value})}/></Field><Field label="Importo concordato (€), imponibile"><Input inputMode="decimal" value={f.budget_importo} onChange={e=>setF({...f,budget_importo:e.target.value})}/></Field><Field label="Consegna"><Input type="date" value={f.consegna} onChange={e=>setF({...f,consegna:e.target.value})}/></Field></FormGrid></Modal>}
  </section>
}
