import { useMemo, useState } from 'react'
import { FolderOpen, Package } from 'lucide-react'
import { api } from '../../api'
import { useData } from '../../store'
import { Btn, Segmented, useAction } from '../ui'
import { NOMI_PERIODO, pacchettoCommercialista, type Periodo } from '../../lib/commercialista'
import type { ContestoBudget } from './contesto'

const PERIODI: Periodo[] = ['anno', 'T1', 'T2', 'T3', 'T4']

/**
 * Pacchetto per il commercialista: una cartella con il riepilogo in PDF, l'elenco dei documenti emessi, degli incassi,
 * delle uscite, delle fatture ricevute e dei conti in CSV (si aprono con Excel o Numbers) e le contabili dei pagamenti.
 */
export function Commercialista({ c }: { c: ContestoBudget }) {
  const { settings, parcelle, anagraficaById, praticaById } = useData()
  const run = useAction()
  const anni = useMemo(() => [...new Set([c.anno, c.anno - 1, ...parcelle.map((p) => Number(String(p.data).slice(0, 4))), ...c.b.fatture.map((f) => Number(f.data.slice(0, 4)))])].filter((a) => a > 1990 && a <= c.anno).sort((a, b) => b - a), [parcelle, c.b.fatture, c.anno])
  const [anno, setAnno] = useState(() => c.anno - (new Date().getMonth() < 4 ? 1 : 0))
  const [periodo, setPeriodo] = useState<Periodo>('anno')
  const [fatto, setFatto] = useState<{ cartella: string; contabili: number } | null>(null)
  const t = c.tasseDi(anno)
  const pacchetto = useMemo(() => pacchettoCommercialista({ anno, periodo, settings, parcelle, costi: c.g.costi, fatture: c.b.fatture, movimenti: c.tutti.filter((x) => !x.previsto), conti: c.b.conti, manuali: c.b.movimenti, saldi: c.saldi, anagraficaById, praticaById, stima: t.stima }),
    [anno, periodo, settings, parcelle, c.g.costi, c.b.fatture, c.tutti, c.b.conti, c.b.movimenti, c.saldi, anagraficaById, praticaById, t.stima])
  const n = pacchetto.conteggi
  const prepara = async () => { const r = await run(() => api.budgetPacchetto({ nome: pacchetto.nome, file: pacchetto.file, riepilogo: pacchetto.riepilogo, contabili: pacchetto.contabili }), 'Pacchetto pronto'); if (r) setFatto(r) }
  const voci = [
    ['Documenti emessi', n.emessi], ['Incassi', n.incassi], ['Uscite pagate', n.uscite], ['Fatture ricevute dal servizio', n.ricevute], ['Contabili allegate', n.contabili],
  ] as const
  return <div className="budget">
    <div className="toolbar">
      <select value={anno} onChange={(e) => { setAnno(Number(e.target.value)); setFatto(null) }} aria-label="Anno">{anni.map((a) => <option key={a}>{a}</option>)}</select>
      <Segmented<Periodo> value={periodo} onChange={(p) => { setPeriodo(p); setFatto(null) }} options={PERIODI.map((p) => ({ id: p, label: p === 'anno' ? 'Anno' : p }))} />
    </div>
    <section className="card pad budget-scheda" aria-labelledby="titolo-pacchetto">
      <h2 id="titolo-pacchetto"><Package size={16} aria-hidden /> Pacchetto {NOMI_PERIODO[periodo].toLowerCase()} {anno}</h2>
      <dl className="pacchetto-conteggi">{voci.map(([v, k]) => <div key={v}><dt>{v}</dt><dd>{k}</dd></div>)}</dl>
      <p className="muted small">Nella cartella: Riepilogo.pdf, un file CSV per ogni elenco (si apre con Excel, Numbers o LibreOffice){periodo === 'anno' ? ', la prima nota dell’anno' : ''}, i saldi e i movimenti dei conti e le contabili dei pagamenti. Le fatture XML restano nel servizio di fatturazione, che il commercialista di solito consulta già.</p>
      <div className="row pacchetto-azioni">
        <Btn variant="primary" onClick={prepara}><Package size={15} /> Prepara il pacchetto…</Btn>
        {fatto && <Btn onClick={() => api.budgetApriCartella(fatto.cartella)}><FolderOpen size={15} /> Apri la cartella</Btn>}
      </div>
      {fatto && <p className="small" role="status">Pacchetto salvato in {fatto.cartella}{fatto.contabili ? `, con ${fatto.contabili} ${fatto.contabili === 1 ? 'contabile' : 'contabili'}` : ''}. Puoi comprimerlo e mandarlo per email o metterlo in una cartella condivisa.</p>}
    </section>
    <section className="card pad budget-scheda" aria-labelledby="titolo-prima">
      <h2 id="titolo-prima">Prima di mandarlo</h2>
      <ul className="lista-semplice">
        <li>Segna come incassati i documenti pagati e come pagate le spese: il pacchetto usa le date di incasso e pagamento.</li>
        <li>Allega le contabili alle spese in Pagamenti: finiscono nella cartella con un nome che dice data, fornitore e importo.</li>
        <li>Rileggi le fatture del servizio, così le ricevute dell’ultimo periodo ci sono tutte.</li>
      </ul>
    </section>
  </div>
}
