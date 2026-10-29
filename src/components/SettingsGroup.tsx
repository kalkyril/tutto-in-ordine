import { useId, type ReactNode } from 'react'

/** Gruppi e righe per le preferenze: etichette a sinistra, controlli a destra. */
export function SettingsGroup({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const id = useId()
  return <section className="settings-section" aria-labelledby={id}>
    <h2 id={id} className="settings-section-title">{title}</h2>
    <div className="settings-group">{children}</div>
    {footer && <div className="settings-footnote">{footer}</div>}
  </section>
}

export function SettingsRow({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return <div className="settings-row">
    <div className="settings-row-copy"><div className="settings-row-title">{title}</div>{description && <div className="settings-row-description">{description}</div>}</div>
    {children && <div className="settings-row-control">{children}</div>}
  </div>
}

export function SettingsToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId()
  return <label className="settings-row settings-toggle-row">
    <span className="settings-row-copy"><span id={id} className="settings-row-title">{title}</span><span id={id + '-description'} className="settings-row-description">{description}</span></span>
    <input className="settings-switch" type="checkbox" role="switch" aria-labelledby={id} aria-describedby={id + '-description'} checked={checked} onChange={e => onChange(e.target.checked)} />
  </label>
}
