# Task Orchestrator DB — schema & integrity reference

Source of truth: the Task Orchestrator repo (`tauri-app/src/store/migrations.ts`,
`store/helpers.ts`, `store/sync.ts`, `shared/core/taskActions.ts`). This skill
supports **schema_version = 13** and verifies the exact column set on every run;
on mismatch it refuses (exit 3).

DB: SQLite, WAL mode, foreign_keys ON. Default path (Tauri appDataDir):
- Windows: `%APPDATA%\com.task-orchestrator.app\tasks.db`
- macOS: `~/Library/Application Support/com.task-orchestrator.app/tasks.db`
- Linux: `~/.config/com.task-orchestrator.app/tasks.db`

The app can point elsewhere via Settings (stored in its WebView localStorage,
unreadable externally) — then the user must set `dbPath` in `config.local.json`
or the `TO_DB_PATH` env var.

## Tables

### tasks
| column | type | semantics |
|---|---|---|
| id | TEXT PK | ULID, 26 chars Crockford Base32. Recurrence spawns use a deterministic id = cyrb128 hash of parent id (`spawnIdFor`) so two devices completing the same task converge on one row. |
| title | TEXT NOT NULL | non-empty |
| status | TEXT | `inbox` \| `active` \| `done` \| `cancelled` |
| priority | INTEGER | 1..4 (4 = none/default) |
| list_name | TEXT NULL | free string; mirrored into `lists` lookup |
| due | TEXT NULL | `YYYY-MM-DD` (local date, no TZ) |
| date_start | TEXT NULL | `YYYY-MM-DD` |
| recurrence | TEXT NULL | `daily`/`weekly`/`monthly`/`yearly` or RRULE `FREQ=...` (RTM import legacy). `nextDue()` bases the next occurrence on *today*, not on `due`. |
| flow_id | TEXT NULL | flow name; mirrored into `flows`; extra metadata in `flow_meta` |
| depends_on | TEXT NULL | JSON array of task ids, or NULL. Never `'[]'` — empty means NULL. Dangling refs to soft-deleted tasks are tolerated by the app (a deleted blocker no longer blocks). |
| tags / personas | TEXT | JSON array of strings, NOT NULL, default `'[]'` |
| created_at | TEXT | ISO datetime UTC |
| url | TEXT NULL | |
| estimate | TEXT NULL | free string; canonical `"30 min"` / `"2 hours"` (Day Planner parses `\d+ h` / `\d+ m`, default 60 min) |
| postponed | INTEGER | count of postpones/snoozes; +1 on each due shift |
| rtm_series_id | TEXT NULL | Remember-The-Milk series id (import). Notes attach to `rtm_series_id ?? id`. Recurring instances of one series share it. |
| completed_at | TEXT NULL | ISO datetime; set on transition→done, preserved on done→done, NULL when leaving done |
| updated_at | TEXT NULL | ISO datetime; bumped on every change. `handleTaskUndone` treats a spawn as "untouched" iff `updated_at == created_at`. |
| deleted_at | TEXT NULL | **soft delete tombstone** — the app filters `deleted_at IS NULL`; sync propagates the tombstone. Hard-deleting a synced row makes it resurrect from other devices. |
| device_id | TEXT NULL | who last modified (26-char id). App device ≠ agent device. |
| lamport_ts | INTEGER | logical clock of the last modification — the sync conflict key |

### notes
`id` (ULID) · `task_series_id` (= task `rtm_series_id ?? id`) · `content` ·
`created_at` (INTEGER epoch **ms**, unlike tasks!) · `deleted_at`/`updated_at`
(ISO) · `device_id` · `lamport_ts`. Soft-deleted like tasks. The app's note
save is full-replace diff-by-id per series (`shared/core/saveNotes.ts`).

### lookup tables: lists, tags, flows, personas
Single `name TEXT PK` column. **Derived state**: kept in sync with live tasks;
GC removes entries no live task references (a flow also survives if `flow_meta`
has it). Not part of the sync package. Always upsert on write, GC after removal.

### flow_meta
`name PK, description, color, deadline` — user-authored flow metadata, IS synced.

### day_plans / day_plan_slots
Day Planner data, local per device (NOT in the sync package). Slots FK →
`day_plans` (CASCADE) and `tasks` (SET NULL). App hard-deletes slots pointing at
tasks being deleted — the CLI mirrors that.

### meta (key/value) — DO NOT MODIFY
`schema_version`, `device_id` (the app's own), `gdrive_client_id/secret/
access_token/refresh_token` (OAuth secrets), `last_sync`, `last_sync_lamport`,
`to_locale`, `to_theme`, `to_settings`, `to_guide_completed`, `focus_state_v1`.

### vector_clock
`device_id → counter`: what this DB has seen from each device. The agent has its
own row (id stored in this skill's `state.json`). Rule for any write:
`lamport = max(all counters, all lamport_ts) + 1`, then set the agent's counter
to that value. Never lower anyone's counter.

### sync_log
Local change feed (id ULID, entity, entity_id, action insert/update/delete,
lamport_ts, device_id, data JSON). **Not the sync transport** (sync is
state-based over row lamports) — it feeds the Settings delta-log viewer. Write
one entry per logical change, same shapes the app uses (insert → full camelCase
task object, update → changes object, delete → null).

### sync_activity_log
Diagnostics of *incoming* sync applications. The agent does not write it.

## Sync model (why the discipline matters)

State-based LWW per row: a device sends every row whose `lamport_ts` is greater
than what the target's vector clock says it has seen from that row's
`device_id`. Incoming wins if `lamport_ts` greater, or equal with
lexicographically greater `device_id`. Google Drive holds the exchange file; the
app pushes/pulls (auto-sync ~3s after each app mutation, manual button, on
connect). Consequences:
- A write with a stale/low lamport silently LOSES to any newer edit — that's
  why every agent write takes `max(everything)+1`.
- Deletions must be tombstones; a hard-deleted row comes back on next pull.
- The agent's changes reach other devices on the app's next sync after launch.

## App runtime behaviors that constrain the agent

- The app loads all tasks into React state at start and re-reads **only after
  its own mutations** — it never watches the DB file. External writes while the
  app is open are invisible to it until restart (and its stale edit-dialog saves
  or Undo can clobber them; Undo restores full snapshots and HARD-deletes tasks
  it didn't see before). Hence: write only while the app is closed.
- The app keeps its SQLite connection open with WAL; readers never block.
- App backups: `tasks.backup-v{schema}-{date}.db` next to the DB, rotated to 5,
  created before migrations and on manual "Create backup". Agent backups live in
  `agent-backups/` with a `pre-` prefix specifically so the two rotations never
  touch each other's files.
- Dev builds (`npm run tauri dev`) and installed builds share the same DB and
  the same process-name prefix (`task-orchestrator` / `Task Orchestrator`).

## Completion pipeline (what the CLI replicates from the app)

On transition to `done` (and only on a real transition — done→done is guarded):
1. `completed_at = now`.
2. If recurring: build next occurrence (`buildNextOccurrence` → deterministic
   id `spawnIdFor(parent)`, status `active`, due = `nextDue(today)`, dependsOn
   cleared, postponed 0). If that id exists live → do nothing; if it exists
   soft-deleted → resurrect with fresh dates; else insert.
3. Find inbox tasks whose `depends_on` contains this task; if ALL their blockers
   are now done/absent → set them `active`.

On leaving `done` (reopen/uncheck): `completed_at = NULL`; if recurring and the
spawned occurrence is still untouched (`active`, `updated_at == created_at`,
not deleted) → soft-delete it.

## Invariants checked before every COMMIT (new violations abort the write)

valid status/priority; non-empty title; `YYYY-MM-DD` dates; tags/personas valid
JSON arrays; depends_on NULL or non-empty array; no refs to non-existent tasks;
no dependency cycles; done ⇔ completed_at consistency (warning level); no
duplicate live active recurring instances per rtm series (warning); no
lamport_ts above the vector clock; FK check; PRAGMA quick_check.

Pre-existing violations in the DB never block operations (baseline diff) — they
are reported as warnings; surface them to the user.

## Journal & rollback internals

`journal/ops-<dbhash>.jsonl` (per-DB). Each entry: op id, lamport used, backup
file, before-images of every touched task/note row, hard-deleted planner slots,
ids of created rows and sync_log entries. Rollback = forward compensation:
restore before-image content columns with a NEW lamport (so the revert syncs),
soft-delete rows the op created, re-insert removed slots, fix lookups. Conflict
= a touched row's lamport no longer equals the op's lamport (someone changed it
after) → refuse, or `--force-partial` to skip those rows.

## Known data quirks (tolerated, don't "fix" silently)

- Legacy `depends_on` may be a bare string (pre-v10) — readers parse both.
- RTM-imported `recurrence` can be RRULE with BYDAY etc.; `nextDue` handles
  FREQ/INTERVAL only — exotic rules simply don't spawn.
- Old rows may lack `updated_at`/`device_id` (pre-v6) — treated as ancient.
- `notes.created_at` is epoch ms (number), not ISO.
