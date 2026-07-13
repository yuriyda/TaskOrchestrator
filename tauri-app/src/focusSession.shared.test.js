// Re-exports shared/core/focusSession.test.js so the vitest globber in
// tauri-app picks it up. Tests live in shared/ because the focus session
// state machine is storage-agnostic (pure wall-clock transitions).
import '../../shared/core/focusSession.test.js'
