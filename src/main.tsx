import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from './api'
import App from './App'
import { DataProvider } from './store'
import { NavProvider } from './nav'
import { FeedbackProvider } from './components/ui'
import { LockGate } from './components/LockGate'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ClockProvider } from './lib/clock'
import './styles.css'
import './hig.css'
import './stile-dati.css'
import './strumenti.css'

// errori fuori dalle schermate (per esempio in un'operazione asincrona): nel registro locale, per un'eventuale segnalazione
window.addEventListener('error', (e) => { api.registraErrore(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`).catch(() => {}) })
window.addEventListener('unhandledrejection', (e) => { api.registraErrore(`promessa: ${e.reason?.message || e.reason}`).catch(() => {}) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary schermoIntero>
    <FeedbackProvider>
      <LockGate>
        <DataProvider>
          <NavProvider>
            <ClockProvider><App /></ClockProvider>
          </NavProvider>
        </DataProvider>
      </LockGate>
    </FeedbackProvider>
    </ErrorBoundary>
  </StrictMode>,
)
