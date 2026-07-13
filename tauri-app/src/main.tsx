/**
 * Application entry point — renders TaskOrchestrator with SQLite store (Tauri runtime).
 * Injects useTauriTaskStore via storeHook prop for dependency inversion.
 *
 * The same bundle serves two windows: the main app and the Focus Bar
 * (label 'focusbar', opened with '#focusbar' in the URL). The bar renders a
 * thin event-driven client and never touches the database directly.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import './app.css'
import TaskOrchestrator from '@app'
import { useTauriTaskStore } from './useTauriTaskStore'
import FocusBar from './ui/FocusBar'

const isFocusBar = window.location.hash.replace(/^#\/?/, '') === 'focusbar'

ReactDOM.createRoot(document.getElementById('root')).render(
  isFocusBar ? (
    <FocusBar />
  ) : (
    // Pass the Tauri store hook — TaskOrchestrator has no idea where data comes from.
    // To test with in-memory data instead, remove the storeHook prop.
    <TaskOrchestrator storeHook={useTauriTaskStore} />
  )
)
