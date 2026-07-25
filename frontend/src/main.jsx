import React, { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught Mobile Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', background: '#020617', color: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#38bdf8', fontSize: '18px', fontWeight: 'bold' }}>FCT SDM Mobile Startup Alert</h2>
          <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '8px' }}>
            An unexpected error occurred during app startup:
          </p>
          <pre style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', fontSize: '11px', color: '#f43f5e', overflowX: 'auto', marginTop: '12px' }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '16px', padding: '10px 20px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}
          >
            Reload Mobile App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
)

