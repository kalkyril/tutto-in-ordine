import { useData } from '../store'
import { useEditors } from '../components/editors'
import { PageHeader } from '../components/ui'
import { LinkTiles } from '../components/LinkTiles'

export default function Collegamenti() {
  const { link } = useData()
  const ed = useEditors()
  const globali = link.filter((l) => !l.pratica_id)
  const dedicati = link.filter((l) => l.pratica_id)
  return (
    <div className="page">
      <PageHeader title="Collegamenti" subtitle="I tuoi siti e portali, sempre a portata di clic" />
      <LinkTiles links={globali} onAdd={() => ed.open({ kind: 'link' })} onEdit={(l) => ed.open({ kind: 'link', item: l })} />
      {dedicati.length > 0 && (
        <section className="block">
          <h2 className="sub-title">Collegati a pratiche</h2>
          <LinkTiles links={dedicati} onAdd={() => ed.open({ kind: 'link' })} onEdit={(l) => ed.open({ kind: 'link', item: l })} />
        </section>
      )}
      {ed.element}
    </div>
  )
}
