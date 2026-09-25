import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import type { IPublicClientApplication } from '@azure/msal-browser'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { bootDataSources } from './datasource/controller'
import { readEntraConfig } from './auth/config'
import { createMsalInstance } from './auth/msal'

const MSAL_INIT_TIMEOUT_MS = 5000

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('MSAL init timed out')), ms))])

async function start() {
  const config = readEntraConfig()
  let msal: IPublicClientApplication | null = null
  if (config) {
    // Local only (no network). Future Teams/NAA factory is also async, hence awaited here.
    try { msal = await withTimeout(createMsalInstance(config), MSAL_INIT_TIMEOUT_MS) }
    catch (e) { console.warn('Entra sign-in unavailable', e) }
  }

  const app: ReactNode = <ErrorBoundary><App /></ErrorBoundary>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {msal ? <MsalProvider instance={msal}>{app}</MsalProvider> : app}
    </StrictMode>,
  )

  // Silent sign-in + load if configured. Never blocks the UI; failures show the banner.
  void bootDataSources({ config, instance: msal ?? undefined })
}

void start()
