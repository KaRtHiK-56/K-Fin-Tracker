// src/components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40, 
          textAlign: 'center', 
          background: 'var(--bg-primary)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 400 }}>
            The stocks page encountered an error. This is usually caused by corrupted data.
          </p>
          <button 
            onClick={() => {
              localStorage.clear()
              window.location.reload()
            }}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              background: 'var(--brand)',
              color: '#fff',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            Clear Data & Reload
          </button>
          <details style={{ marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
            <summary style={{ cursor: 'pointer', marginBottom: 8 }}>Error Details</summary>
            <pre style={{ 
              textAlign: 'left', 
              padding: 12, 
              background: 'var(--bg-tertiary)', 
              borderRadius: 8,
              overflow: 'auto',
              maxWidth: 500,
            }}>
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      )
    }

    return this.props.children
  }
}
