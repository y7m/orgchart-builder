import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const queryParams = new URLSearchParams(window.location.search);
const dataParam = queryParams.get('data');

if (dataParam) {
  try {
    const decoded = decodeURIComponent(atob(dataParam));
    const payload = JSON.parse(decoded);
    if (payload.data) {
      localStorage.setItem('orgchart-data-storage', JSON.stringify({ state: payload.data, version: 0 }));
    }
    if (payload.theme) {
      localStorage.setItem('orgchart-theme-storage', JSON.stringify({ state: payload.theme, version: 0 }));
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (e) {
    console.error("Failed to parse data parameter", e);
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
