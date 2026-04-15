/**
 * @file PWA entry point — mobile-first task manager.
 * Uses MobileApp layout with IndexedDB-backed browserStore.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import MobileApp from './MobileApp'
import { useBrowserTaskStore } from './store/browserStore'

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/to/sw.js').catch(() => {})
}

function App() {
  const store = useBrowserTaskStore()
  if (!store.ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-gray-400 text-sm">
        Loading...
      </div>
    )
  }
  return <MobileApp store={store} />
}

createRoot(document.getElementById('root')).render(<App />)
