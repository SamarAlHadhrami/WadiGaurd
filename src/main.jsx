import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ===== APP ENTRY =====
// React bootstrap file and service worker registration.

// ---------------------------------------------
// BLOCK: React root mount
// PURPOSE: Mounts the App component into the HTML
// root container
// ---------------------------------------------
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// ---------------------------------------------
// BLOCK: Service worker registration
// PURPOSE: Registers the PWA service worker after
// the page finishes loading
// ---------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error)
    })
  })
}
