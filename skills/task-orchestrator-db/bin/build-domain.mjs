#!/usr/bin/env node
/**
 * Bundles the Task Orchestrator domain logic (shared/core) into dist/domain.mjs
 * using the repo's own esbuild. The CLI (to-db.mjs) imports this bundle so the
 * agent runs the SAME recurrence / spawn-id / completion logic as the app —
 * nothing is copied by hand, so the two cannot drift.
 *
 * dist/domain.manifest.json records every input file with its mtime; to-db.mjs
 * rebuilds automatically when any source file changes.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolvePaths, skillRoot } from '../lib/paths.mjs'

const { repoPath: repoRoot } = resolvePaths()
if (!repoRoot) {
  console.error(JSON.stringify({
    ok: false, code: 7,
    error: 'Task Orchestrator repo not found. If this skill is not inside the repo, set "repoPath" in config.local.json or the TO_REPO_PATH env var.',
  }))
  process.exit(7)
}

let esbuild
try {
  const requireFromRepo = createRequire(join(repoRoot, 'tauri-app', 'package.json'))
  esbuild = requireFromRepo('esbuild')
} catch (e) {
  console.error(JSON.stringify({
    ok: false, code: 7,
    error: `Cannot load esbuild from ${repoRoot}/tauri-app/node_modules — run "npm install" in tauri-app first. (${e.message})`,
  }))
  process.exit(7)
}

// Entry re-exports exactly what the CLI needs. Specifiers use ./shared/... and
// .js extensions — esbuild resolves .js -> .ts the same way vite does in-app.
const entry = `
export { nextDue, humanRecurrence } from './shared/core/recurrence.js'
export {
  spawnIdFor, buildNextOccurrence, handleTaskDone, handleTaskUndone,
  isTaskBlocked, computeNextCycleStatus, wouldCreateCycle, findRecurringDuplicates,
} from './shared/core/taskActions.js'
export { saveNotes } from './shared/core/saveNotes.js'
export { runLookupGc } from './shared/core/lookup.js'
export { localIsoDate, safeIsoDate, parseDateInput, ISO_DATE_RE } from './shared/core/date.js'
export { normalizeTaskRef, taskRefSuffix, formatTaskRef } from './shared/core/taskRef.js'
export { ulid } from './tauri-app/src/ulid.js'
export { MIGRATIONS_V1, VERSIONED_MIGRATIONS, LATEST_SCHEMA_VERSION } from './tauri-app/src/store/migrations.js'
`

const outDir = join(skillRoot, 'dist')
mkdirSync(outDir, { recursive: true })
const outfile = join(outDir, 'domain.mjs')

const result = esbuild.buildSync({
  stdin: { contents: entry, resolveDir: repoRoot, loader: 'ts', sourcefile: 'domain-entry.ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  metafile: true,
  logLevel: 'silent',
})

// Manifest: every bundled input with its mtime — the staleness check in to-db.mjs.
// Metafile input paths are relative to the CWD at build time — resolve them now.
const sources = {}
for (const input of Object.keys(result.metafile.inputs)) {
  if (input === 'domain-entry.ts') continue
  const abs = resolve(input)
  try { sources[abs] = statSync(abs).mtimeMs } catch { /* stdin pseudo-file */ }
}
writeFileSync(join(outDir, 'domain.manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), repoRoot, sources }, null, 2))

console.log(JSON.stringify({ ok: true, outfile, inputs: Object.keys(sources).length }))
