import { StrictMode, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import './index.css'
import './styles/kdash.css'
import { App } from './App.tsx'
import { AuthGate } from './components/auth/AuthGate.tsx'

/**
 * Global error boundary — catches any unhandled React render errors and
 * shows a friendly recovery screen instead of a blank black page.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[App crash]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#020817',
          color: '#f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, sans-serif',
          padding: '2rem',
          textAlign: 'center',
          gap: '1rem'
        }}>
          <div style={{ fontSize: '2.5rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f87171' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8', maxWidth: '480px' }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              marginTop: '1rem',
              padding: '0.6rem 1.5rem',
              background: '#10b981',
              color: '#020817',
              border: 'none',
              borderRadius: '0.75rem',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Reuse one root when the dev server hot-reloads this file, instead of creating a second one on the same element
const holder = window as unknown as { __zaylowRoot?: Root }
const root = holder.__zaylowRoot ?? (holder.__zaylowRoot = createRoot(document.getElementById('root')!))
root.render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate><App /></AuthGate>
    </ErrorBoundary>
  </StrictMode>,
)

// Let phones install the site as an app (Android install prompt, iPhone Add to Home Screen)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* not fatal */ }); });
}
