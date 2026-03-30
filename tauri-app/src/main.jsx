/**
 * Application entry point — renders TaskOrchestrator with SQLite store (Tauri runtime).
 * Injects useTauriTaskStore via storeHook prop for dependency inversion.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import TaskOrchestrator from '@app'
import { useTauriTaskStore } from './useTauriTaskStore.js'

ReactDOM.createRoot(document.getElementById('root')).render(
  // Pass the Tauri store hook — TaskOrchestrator has no idea where data comes from.
  // To test with in-memory data instead, remove the storeHook prop.
  <TaskOrchestrator storeHook={useTauriTaskStore} />
)
