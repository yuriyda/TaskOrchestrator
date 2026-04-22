// Re-exports shared/core/saveNotes.test.js so the vitest globber in
// tauri-app picks it up. Tests live in shared/ because the logic is
// storage-agnostic and will be re-run against the PWA (IDB) adapter once
// phase 2 extraction lands.
import '../../shared/core/saveNotes.test.js'
