import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api } from '../api'

interface Props { children: ReactNode; /** true = intero schermo (errore grave), false = solo la pagina corrente (il menu resta utilizzabile) */ schermoIntero?: boolean }
interface State { errore: Error | null }

/** Un errore di disegno in una pagina non deve lasciare la finestra bianca: si mostra un messaggio chiaro e si può riprovare. I dati non vengono toccati. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { errore: null }
  static getDerivedStateFromError(errore: Error): State { return { errore } }
  componentDidCatch(errore: Error, info: ErrorInfo) {
    console.error('Errore di interfaccia:', errore, info.componentStack)
    api.registraErrore(`${errore.message} ${info.componentStack?.split('\n').slice(0, 4).join(' ') || ''}`).catch(() => {}) // nel registro locale, per la segnalazione
  }
  render() {
    const { errore } = this.state
    if (!errore) return this.props.children
    return (
      <div className={this.props.schermoIntero ? 'errore-schermo' : 'errore-pagina'} role="alert">
        <AlertTriangle size={30} aria-hidden />
        <h2>Qualcosa non ha funzionato</h2>
        <p className="muted">Si è verificato un problema nel mostrare questa schermata. I tuoi dati non sono stati toccati.</p>
        <div className="row">
          <button className="btn btn-primary btn-md" onClick={() => this.setState({ errore: null })}>Riprova</button>
          {this.props.schermoIntero && <button className="btn btn-soft btn-md" onClick={() => location.reload()}>Ricarica l’app</button>}
        </div>
        <details><summary>Dettagli tecnici</summary><pre>{errore.message}</pre></details>
      </div>
    )
  }
}
