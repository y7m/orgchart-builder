import { Component, type ErrorInfo, type ReactNode } from 'react';
import { resetAllData } from '../store/reset';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ padding: 40, fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '10vh auto' }}>
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p style={{ color: '#555' }}>{this.state.error.message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => window.location.reload()}>Reload</button>
          <button
            onClick={() => { resetAllData(); window.location.reload(); }}
            style={{ color: '#dc3545' }}
          >Reset data</button>
        </div>
      </div>
    );
  }
}
