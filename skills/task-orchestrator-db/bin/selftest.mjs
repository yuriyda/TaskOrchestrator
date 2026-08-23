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
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { buildFixture, writeRegistryRow } from '../lib/fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const CLI = join(here, 'to-db.mjs')

const fixture = await buildFixture()
const { workDir, dbPath: TEST_DB, domain } = fixture

// ── Harness ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0
const failures = []
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS ${name}`) }
  else { failed++; failures.push(name); console.log(`FAIL ${name}${detail ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`) }
}
const MUTATING = new Set(['add', 'update', 'complete', 'reopen', 'delete', 'restore', 'batch', 'rollback', 'set-status'])
function run(args, { expectFail, env = {}, noForce } = {}) {
  const full = MUTATING.has(args[0]) && !noForce ? [...args, '--force-app-open'] : args
  const r = spawnSync(process.execPath, [CLI, ...full], {
    // TO_REGISTRY_PATH isolates the test from real app instances on this machine.
    encoding: 'utf8', env: { ...process.env, TO_DB_PATH: TEST_DB, TO_REGISTRY_PATH: fixture.registryPath, ...env },
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

// same batch-id with DIFFERENT content must be an error, not a silent skip
const batchFileAltered = join(workDir, 'batch-altered.json')
writeFileSync(batchFileAltered, JSON.stringify({
  batchId: 'selftest-batch-001',
  ops: [{ action: 'add', task: { title: 'AGENT-TEST batch-C (different!)' } }],
}))
r = run(['batch', '--file', batchFileAltered], { expectFail: true })
check('batch-id reuse with different content -> error', r.code === 2 && /DIFFERENT content/.test(r.json?.error || ''), r.json)

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

// journal rotation: with a tiny cap, an append halves the entry count
r = run(['journal', '--limit', '100'])
const journalCountBefore = r.json?.entries?.length ?? 0
r = run(['update', alphaId, '--json', '{"postponed":1}'], { env: { TO_DB_JOURNAL_MAX: '400' } })
check('rotation-trigger update ok', r.json?.ok)
r = run(['journal', '--limit', '100'])
check('journal rotated at cap (entries halved)', r.json?.ok && r.json.entries.length < journalCountBefore + 1,
  { before: journalCountBefore, after: r.json?.entries?.length })

// ── 11. app-running guard (instance registry, pid-validated) ────────────────
const FAKE = { TO_DB_TEST_FAKE_APP: '1' }   // one fake app process, pid 0
const FAKE2 = { TO_DB_TEST_FAKE_APP: '2' }  // two fake app processes, pids 0 and 1
// (a) app process, no registered instance -> old version or starting -> refuse
r = run(['add', '--title', 'AGENT-TEST guard'], { expectFail: true, noForce: true, env: FAKE })
check('process without registered instance -> refused (exit 4)', r.code === 4 && /not registered as a live instance/.test(r.json?.error || ''), r.json)
// (b) instance on the SAME db, pid alive -> live mode, write allowed
writeRegistryRow(fixture.registryPath, TEST_DB)
r = run(['add', '--title', 'AGENT-TEST guard-live'], { noForce: true, env: FAKE })
check('live instance on target DB -> write allowed (live-refresh)', r.json?.ok && (r.json.warnings || []).some(w => /live-refresh active/.test(w)), r.json)
// (c) stale heartbeat but pid ALIVE -> still valid (throttled minimized window)
writeRegistryRow(fixture.registryPath, TEST_DB, { stale: true })
r = run(['add', '--title', 'AGENT-TEST guard-throttled'], { noForce: true, env: FAKE })
check('stale heartbeat + live pid -> still allowed (timer throttling)', r.json?.ok && (r.json.warnings || []).some(w => /live-refresh active/.test(w)), r.json)
// (c2) dead pid -> row invalid (crash leftover) -> refuse
writeRegistryRow(fixture.registryPath, TEST_DB, { pid: 12345 })
r = run(['add', '--title', 'AGENT-TEST guard-deadpid'], { expectFail: true, noForce: true, env: FAKE })
check('dead pid -> instance ignored -> refused', r.code === 4, r.json)
// (c3) no pid recorded -> heartbeat-freshness fallback still works
writeRegistryRow(fixture.registryPath, TEST_DB, { pid: null })
r = run(['add', '--title', 'AGENT-TEST guard-pidless'], { noForce: true, env: FAKE })
check('pidless row + fresh heartbeat -> allowed (fallback)', r.json?.ok && (r.json.warnings || []).some(w => /live-refresh active/.test(w)), r.json)
// (d) instance on ANOTHER db, process accounted for by pid -> target DB is closed -> allowed
writeRegistryRow(fixture.registryPath, join(workDir, 'other.db'))
r = run(['add', '--title', 'AGENT-TEST guard-other'], { noForce: true, env: FAKE })
check('instance on different DB -> target treated as closed', r.json?.ok && (r.json.warnings || []).some(w => /different database/.test(w)), r.json)
// (d2) two processes but only one registered -> the other may be an old version -> refuse
r = run(['add', '--title', 'AGENT-TEST guard-mixed'], { expectFail: true, noForce: true, env: FAKE2 })
check('unregistered second process -> refused', r.code === 4, r.json)
// (e) status reports instances + path source
r = run(['status'], { env: FAKE })
check('status reports appInstances', r.json?.ok && r.json.appInstances?.length === 1 && r.json.appInstances[0].onThisDb === false)
check('status reports dbPathSource=env under test', r.json?.dbPathSource === 'env')
// (f) auto-resolution follows a single live instance; two distinct DBs -> explicit path required
writeRegistryRow(fixture.registryPath, TEST_DB) // back to: one instance, on TEST_DB
const bare = (env) => {
  const rr = spawnSync(process.execPath, [CLI, 'status'], { encoding: 'utf8', env: { ...process.env, TO_REGISTRY_PATH: fixture.registryPath, ...env } })
  let rj = null; try { rj = JSON.parse(rr.stdout) } catch {}
  return { code: rr.status, json: rj }
}
r = bare(FAKE)
check('no explicit path -> follows the running instance', r.json?.ok && r.json.dbPathSource === 'app-instance' && /to-selftest/.test(r.json.dbPath.toLowerCase()), r.json)
writeRegistryRow(fixture.registryPath, join(workDir, 'second.db'), { sessionId: 'second-session', pid: 1 })
r = bare(FAKE2)
check('two instances on different DBs without explicit path -> exit 2', r.code === 2 && /Set the target explicitly/.test(r.json?.error || ''), r.json)
// restore single-target registry for the remaining checks
{
  const db = new DatabaseSync(fixture.registryPath)
  db.prepare("DELETE FROM instances WHERE session_id != 'test-session'").run()
  db.close()
}
writeRegistryRow(fixture.registryPath, TEST_DB)

// ── 12. final verify: nothing broken ───────────────────────────────────────
r = run(['verify'])
check('no invariant errors after all ops', r.json?.ok && r.json.errors.length === 0, r.json)
const appDev = dbq("SELECT value FROM meta WHERE key='device_id'")[0].value
check('app device_id untouched and distinct from agent', appDev && appDev !== agentDid)

fixture.cleanup()

console.log(`\n${passed} passed, ${failed} failed${failed ? ' — ' + failures.join(', ') : ''}`)
process.exit(failed ? 1 : 0)
