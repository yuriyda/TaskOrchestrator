#!/usr/bin/env node
/**
 * Self-test for the task-orchestrator-db skill.
 *
 * Builds a fresh fixture database in a temp dir using the repo's OWN schema
 * migrations (bundled into dist/domain.mjs), then exercises every CLI command
 * against it: CRUD, recurrence spawning, dependency activation, batching,
 * idempotency, rollback, invariants. No real user data is involved.
 *
 * Run it after changing the skill or after the app's schema/domain changes:
 *   node bin/selftest.mjs
 * Exit 0 = all checks passed.
 *
 * Note: mutating calls pass --force-app-open because the fixture DB is not the
 * file the running app uses — the guard is still exercised (it fires, and the
 * flag overrides it), just not allowed to block the suite.
 */
import { spawnSync } from 'node:child_process'
import { rmSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { skillRoot } from '../lib/paths.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const CLI = join(here, 'to-db.mjs')

// ── Ensure the domain bundle exists (migrations live in it) ────────────────
{
  const r = spawnSync(process.execPath, [join(here, 'build-domain.mjs')], { encoding: 'utf8' })
  if (r.status !== 0) { console.error('bundle build failed:', r.stderr || r.stdout); process.exit(7) }
}
const domain = await import(pathToFileURL(join(skillRoot, 'dist', 'domain.mjs')).href)

// ── Fixture DB from the repo's own migrations ──────────────────────────────
const workDir = mkdtempSync(join(tmpdir(), 'to-selftest-'))
const TEST_DB = join(workDir, 'tasks.db')
{
  const db = new DatabaseSync(TEST_DB)
  db.exec('PRAGMA journal_mode = WAL')
  for (const sql of domain.MIGRATIONS_V1) db.exec(sql)
  for (let v = 2; v <= domain.LATEST_SCHEMA_VERSION; v++) {
    for (const sql of domain.VERSIONED_MIGRATIONS[v] || []) {
      try { db.exec(sql) } catch (e) { if (!/duplicate|already exists/.test(e.message)) throw e }
    }
  }
  const appDevice = domain.ulid()
  db.prepare("INSERT OR REPLACE INTO meta VALUES ('schema_version', ?)").run(String(domain.LATEST_SCHEMA_VERSION))
  db.prepare("INSERT OR REPLACE INTO meta VALUES ('device_id', ?)").run(appDevice)
  db.prepare('INSERT OR IGNORE INTO vector_clock (device_id, counter) VALUES (?, 1)').run(appDevice)
  db.close()
}

// ── Harness ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0
const failures = []
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS ${name}`) }
  else { failed++; failures.push(name); console.log(`FAIL ${name}${detail ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`) }
}
const MUTATING = new Set(['add', 'update', 'complete', 'reopen', 'delete', 'restore', 'batch', 'rollback', 'set-status'])
function run(args, { expectFail } = {}) {
  const full = MUTATING.has(args[0]) ? [...args, '--force-app-open'] : args
  const r = spawnSync(process.execPath, [CLI, ...full], {
    encoding: 'utf8', env: { ...process.env, TO_DB_PATH: TEST_DB },
  })
  let json = null
  try { json = JSON.parse(r.stdout) } catch {}
  if (!expectFail && (r.status !== 0 || !json?.ok)) {
    console.log(`  [cmd] ${args.join(' ')}\n  [exit ${r.status}] ${(r.stdout || '').slice(0, 600)}`)
  }
  return { code: r.status, json }
}
const dbq = (sql, ...p) => {
  const db = new DatabaseSync(TEST_DB, { readOnly: true })
  const rows = db.prepare(sql).all(...p)
  db.close()
  return rows
}

// ── 1. status / verify on the fresh fixture ────────────────────────────────
let r = run(['status'])
check('status ok + expected schema', r.json?.ok && r.json.schemaOk === true)
r = run(['verify'])
check('fresh fixture has zero invariant issues', r.json?.ok && r.json.errors.length === 0 && r.json.warnings.length === 0, r.json)

// ── 2. add ─────────────────────────────────────────────────────────────────
r = run(['add', '--json', JSON.stringify({
  title: 'AGENT-TEST alpha', status: 'active', priority: 2, list: 'AgentTestList',
  due: '2030-01-10', recurrence: 'daily', tags: ['agent-test'], notes: [{ content: 'test note one' }],
})])
const alphaId = r.json?.results?.[0]?.id
check('add alpha ok', r.json?.ok && !!alphaId, r.json)
check('add returns rollbackHint', !!r.json?.rollbackHint)

r = run(['get', alphaId])
check('get alpha fields', r.json?.task?.title === 'AGENT-TEST alpha' && r.json.task.priority === 2 &&
  r.json.task.list === 'AgentTestList' && r.json.task.due === '2030-01-10' && r.json.task.recurrence === 'daily')
check('get alpha note saved', r.json?.task?.notes?.length === 1 && r.json.task.notes[0].content === 'test note one')
check('lookup list upserted', dbq('SELECT name FROM lists WHERE name=?', 'AgentTestList').length === 1)
const agentDid = dbq('SELECT device_id FROM tasks WHERE id=?', alphaId)[0]?.device_id
check('agent device id stamped', !!agentDid && agentDid.length === 26)
check('agent registered in vector_clock', dbq('SELECT counter FROM vector_clock WHERE device_id=?', agentDid).length === 1)
check('lamport discipline (vc >= max row lamport)',
  dbq('SELECT MAX(counter) m FROM vector_clock')[0].m >= dbq('SELECT MAX(lamport_ts) m FROM tasks')[0].m)
check('sync_log insert entry written', dbq("SELECT id FROM sync_log WHERE entity='tasks' AND entity_id=? AND action='insert'", alphaId).length === 1)

// ── 3. update + validation ─────────────────────────────────────────────────
r = run(['update', alphaId, '--json', JSON.stringify({ priority: 1, estimate: '30 min', tags: ['agent-test', 'x'] })])
check('update ok', r.json?.ok)
r = run(['get', alphaId])
check('update applied', r.json?.task?.priority === 1 && r.json.task.estimate === '30 min' && r.json.task.tags.includes('x'))

r = run(['update', alphaId, '--json', '{"status":"weird"}'], { expectFail: true })
check('invalid status rejected (exit 2)', r.code === 2)
r = run(['update', alphaId, '--json', '{"due":"tomorrow"}'], { expectFail: true })
check('non-ISO due rejected', r.code === 2)
r = run(['update', alphaId, '--json', '{"nope":1}'], { expectFail: true })
check('unknown field rejected', r.code === 2)
r = run(['update', alphaId, '--json', '{"recurrence":"every 2 weeks"}'], { expectFail: true })
check('bad recurrence rejected', r.code === 2)

// ── 4. complete recurring -> deterministic spawn ───────────────────────────
r = run(['complete', alphaId])
const spawnInfo = r.json?.results?.[0]?.spawnedNext
check('complete ok + spawned', r.json?.ok && !!spawnInfo, r.json)
check('spawn id is deterministic spawnIdFor(parent)', spawnInfo?.id === domain.spawnIdFor(alphaId))
check('spawn due = nextDue(daily)', spawnInfo?.due === domain.nextDue(null, 'daily'))
let rows = dbq('SELECT status, completed_at FROM tasks WHERE id=?', alphaId)
check('parent done with completed_at', rows[0].status === 'done' && !!rows[0].completed_at)
rows = dbq('SELECT status, deleted_at, recurrence FROM tasks WHERE id=?', spawnInfo.id)
check('spawn row active + recurring', rows[0]?.status === 'active' && !rows[0].deleted_at && rows[0].recurrence === 'daily')
check('sync_log has spawn insert', dbq("SELECT id FROM sync_log WHERE entity='tasks' AND entity_id=? AND action='insert'", spawnInfo.id).length === 1)

const completedAt1 = dbq('SELECT completed_at FROM tasks WHERE id=?', alphaId)[0].completed_at
r = run(['complete', alphaId])
check('re-complete is guarded (no new spawn)', r.json?.ok && !r.json.results[0].spawnedNext)
check('completed_at preserved on re-complete', dbq('SELECT completed_at FROM tasks WHERE id=?', alphaId)[0].completed_at === completedAt1)

// ── 5. reopen -> untouched spawn removed ───────────────────────────────────
r = run(['reopen', alphaId])
check('reopen ok + spawn removed', r.json?.ok && r.json.results[0].removedUntouchedSpawn === spawnInfo.id, r.json)
rows = dbq('SELECT status, completed_at FROM tasks WHERE id=?', alphaId)
check('parent active again, completed_at cleared', rows[0].status === 'active' && rows[0].completed_at === null)
rows = dbq('SELECT deleted_at FROM tasks WHERE id=?', spawnInfo.id)
check('spawn soft-deleted (tombstone, not hard delete)', rows.length === 1 && !!rows[0].deleted_at)

// ── 6. dependencies: blocked + activation + cycles ─────────────────────────
r = run(['add', '--title', 'AGENT-TEST blocker', '--status', 'active'])
const blockerId = r.json?.results?.[0]?.id
r = run(['add', '--json', JSON.stringify({ title: 'AGENT-TEST dependent', status: 'inbox', dependsOn: [blockerId] })])
const depId = r.json?.results?.[0]?.id
check('add with dependsOn ok', !!blockerId && !!depId)

r = run(['complete', depId], { expectFail: true })
check('completing blocked task refused with blocker list', r.code === 2 && r.json?.error?.includes(blockerId))
r = run(['complete', depId, '--skip-blocked'])
check('--skip-blocked skips with warning', r.json?.ok && r.json.results[0].skipped === 'blocked')

r = run(['complete', blockerId])
const activated = r.json?.results?.[0]?.activatedDependents
check('completing blocker activates dependent', Array.isArray(activated) && activated.some(a => a.id === depId), r.json)
check('dependent is now active', dbq('SELECT status FROM tasks WHERE id=?', depId)[0].status === 'active')

r = run(['update', blockerId, '--json', JSON.stringify({ dependsOn: [depId] })], { expectFail: true })
check('dependency cycle rejected', r.code === 2 && /cycle/i.test(r.json?.error || ''))

// ── 7. delete / restore ────────────────────────────────────────────────────
r = run(['delete', depId])
check('soft delete ok', r.json?.ok && dbq('SELECT deleted_at FROM tasks WHERE id=?', depId)[0].deleted_at !== null)
check('delete sync_log entry', dbq("SELECT id FROM sync_log WHERE entity='tasks' AND entity_id=? AND action='delete'", depId).length >= 1)
r = run(['restore', depId])
check('restore ok', r.json?.ok && dbq('SELECT deleted_at FROM tasks WHERE id=?', depId)[0].deleted_at === null)

// ── 8. batch + dry-run + idempotency + atomicity ───────────────────────────
const batchFile = join(workDir, 'batch.json')
writeFileSync(batchFile, JSON.stringify({
  batchId: 'selftest-batch-001',
  ops: [
    { action: 'add', task: { title: 'AGENT-TEST batch-A', status: 'inbox', tags: ['agent-test'] } },
    { action: 'update', id: alphaId, changes: { priority: 3 } },
  ],
}))
const aliveBefore = dbq('SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL')[0].c
r = run(['batch', '--file', batchFile, '--dry-run'])
check('batch dry-run ok', r.json?.ok && r.json.dryRun === true && r.json.results.length === 2)
check('dry-run left DB unchanged', dbq('SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL')[0].c === aliveBefore &&
  dbq('SELECT priority FROM tasks WHERE id=?', alphaId)[0].priority === 1)

r = run(['batch', '--file', batchFile])
const batchOpId = r.json?.opId
const batchAId = r.json?.results?.find(x => x.action === 'add')?.id
check('batch applied', r.json?.ok && !!batchAId && dbq('SELECT priority FROM tasks WHERE id=?', alphaId)[0].priority === 3)
r = run(['batch', '--file', batchFile])
check('same batch-id is idempotent (not applied twice)', r.json?.ok && r.json.idempotent === true)
check('idempotent run created no duplicate', dbq("SELECT COUNT(*) c FROM tasks WHERE title='AGENT-TEST batch-A'")[0].c === 1)

const badBatch = join(workDir, 'batch-bad.json')
writeFileSync(badBatch, JSON.stringify([
  { action: 'update', id: alphaId, changes: { priority: 4 } },
  { action: 'update', id: 'NOPE-DOES-NOT-EXIST', changes: { priority: 1 } },
]))
r = run(['batch', '--file', badBatch], { expectFail: true })
check('failing batch is atomic (all-or-nothing)', r.code === 2 && dbq('SELECT priority FROM tasks WHERE id=?', alphaId)[0].priority === 3)

// ── 9. rollback ────────────────────────────────────────────────────────────
r = run(['rollback', '--op', batchOpId])
check('rollback of batch ok', r.json?.ok, r.json)
check('rollback restored alpha priority 1', dbq('SELECT priority FROM tasks WHERE id=?', alphaId)[0].priority === 1)
rows = dbq('SELECT deleted_at FROM tasks WHERE id=?', batchAId)
check('rollback soft-deleted the batch-created task', rows.length === 1 && rows[0].deleted_at !== null)
check('rollback advanced lamport (sync-safe)', dbq('SELECT lamport_ts FROM tasks WHERE id=?', alphaId)[0].lamport_ts ===
  dbq('SELECT MAX(counter) m FROM vector_clock')[0].m)
r = run(['rollback', '--op', batchOpId], { expectFail: true })
check('double rollback refused', r.code === 2 && /already rolled back/.test(r.json?.error || ''))

r = run(['update', alphaId, '--json', '{"priority":2}'])
const opX = r.json?.opId
r = run(['update', alphaId, '--json', '{"priority":4}'])
r = run(['rollback', '--op', opX], { expectFail: true })
check('rollback conflict detected (row changed after op)', r.code === 6, r.json)

// ── 10. journal & backups ──────────────────────────────────────────────────
r = run(['journal', '--limit', '50'])
check('journal lists ops', r.json?.ok && r.json.entries.length >= 8)
r = run(['backups'])
check('backups exist (one per mutation)', r.json?.ok && r.json.backups.length >= 5)

// ── 11. final verify: nothing broken ───────────────────────────────────────
r = run(['verify'])
check('no invariant errors after all ops', r.json?.ok && r.json.errors.length === 0, r.json)
const appDev = dbq("SELECT value FROM meta WHERE key='device_id'")[0].value
check('app device_id untouched and distinct from agent', appDev && appDev !== agentDid)

// ── Cleanup: fixture dir + this fixture's journal file ─────────────────────
rmSync(workDir, { recursive: true, force: true })
const dbKey = createHash('sha1').update(TEST_DB.toLowerCase().replace(/\\/g, '/')).digest('hex').slice(0, 12)
rmSync(join(skillRoot, 'journal', `ops-${dbKey}.jsonl`), { force: true })

console.log(`\n${passed} passed, ${failed} failed${failed ? ' — ' + failures.join(', ') : ''}`)
process.exit(failed ? 1 : 0)
