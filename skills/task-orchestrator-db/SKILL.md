---
name: task-orchestrator-db
description: Manage tasks in the Task Orchestrator app by writing directly to its SQLite database — create, update, complete, reopen, delete and restore tasks, set attributes (priority, due, recurrence, tags, lists, dependencies, notes), run safe atomic batches, and roll back mistakes. Use whenever asked to add/change/complete tasks in Task Orchestrator without going through the UI.
---

# Task Orchestrator — direct DB task management

You manage the user's real task database. It may sync with their other devices
via Google Drive, and the desktop app keeps live in-memory state. **Never write
to the DB with raw SQL or any other tool — only through the CLI below.** It
preserves every invariant the app relies on (Lamport clocks, sync log, soft
deletes, recurrence spawning, dependency activation) and gives you backups +
rollback.

## The tool

```
node <skill-dir>/bin/to-db.mjs <command> [args]
```

`<skill-dir>` is the directory containing this SKILL.md (inside the app repo:
`skills/task-orchestrator-db`). Quote the path if it contains spaces.

- Prints a single JSON object to stdout. `"ok": true/false` + exit code.
  (An `ExperimentalWarning: SQLite` line on stderr is normal — ignore it.)
- Exit codes: 0 ok · 2 validation/usage · 3 schema mismatch · 4 app running or
  locked · 5 invariant failure (auto-rolled-back) · 6 rollback conflict · 7 internal.
- For complex input write a JSON file and pass `--file` — safer than shell-quoting `--json`.
- DB location resolution, in order: `TO_DB_PATH` env → `config.local.json` →
  **the database a running app instance has open** (the app registers it, incl.
  custom paths from its Settings) → the default per-OS path. `status` shows the
  resolved path and its source (`dbPathSource`). If two running instances use
  different databases and no explicit path is set, the CLI refuses (exit 2) —
  ask the user which DB to target. If counts look empty/wrong, ask the user
  where their DB lives instead of writing into the wrong file.

## Hard rules

1. **Reads are safe anytime.** `status`, `list`, `get`, `verify`, `journal`, `backups` — run freely.
2. **Writing while the app is running — the CLI decides automatically, per
   database.** App 2.8+ registers each running instance (which DB it has open +
   a heartbeat): if the target DB is open in such an instance, concurrent
   writes are safe — the UI picks changes up within ~3 seconds and its Undo is
   protected. If running instances use other DBs, the target counts as closed.
   If an app process exists that is NOT registered (old pre-2.8 version, or
   still starting), the CLI refuses (exit 4) — ask the user to close or update
   the app, or wait a few seconds and retry (or explicitly approve
   `--force-app-open`, understanding the app won't see changes until restart
   and its Undo could hard-delete freshly created tasks). Never add
   `--force-app-open` on your own initiative.
3. **Never delete permanently.** `delete` is a soft delete (tombstone) — that is
   the only correct form; hard deletes would resurrect on sync. There is no
   hard-delete command by design.
4. **Don't touch anything except tasks/notes via the CLI.** No DDL, no edits to
   `meta` (Google Drive tokens live there), `vector_clock`, `day_plans`,
   `flow_meta`, or the app's `schema_version`. The CLI already enforces this.
5. **Destructive scope needs user confirmation.** Mass deletes (>20 tasks or a
   large share of the DB) require `--confirm-mass-delete` — only after the user
   explicitly agreed to that exact scope. Same for `restore-backup --yes`.
6. **After every mutation, read the JSON result** — it lists side effects
   (spawned next occurrences, auto-activated dependents, warnings). Report them
   to the user; they are real changes you made.

## Task references (to:XXXXX)

Tasks are cited in dialogue by short references: `to:` + the unique trailing
part of the task id (5+ chars, like a git short hash). Every command that takes
a task id also accepts a reference — with or without the `to:` prefix,
case-insensitive, O/I/L typos forgiven. `list`/`get`/`add` results include each
task's current `ref`.

- The user may paste lines copied from the app: `to:7K3MZ Task title`. Resolve
  each reference and **verify the title matches** the pasted one before acting;
  on mismatch or an "ambiguous" error (it lists the candidates), ask the user
  instead of guessing.
- A reference prefers a live task over a deleted one with the same suffix (the
  result warns when that happens, or when it resolves to a deleted task).
- When reporting a task you created or changed, mention its `ref` so the user
  can refer back to it; omit refs in plain overview listings.

## Standard workflow

```
status                           # health + app-running check + counts
list --search "..."              # find ids (never guess ids)
batch --file ops.json --dry-run  # preview: full validation, zero changes
batch --file ops.json            # apply atomically
verify                           # optional: confirm invariants still hold
```

Every mutation automatically: makes a pre-op backup (`agent-backups/` next to
the DB), runs in one `BEGIN IMMEDIATE` transaction, validates all invariants
before COMMIT (violations → automatic full rollback), records before-images in
a journal, and prints a `rollbackHint`.

## Commands

Read:
- `status` — paths, schema, app process, counts, vector clock, integrity, last op.
- `list [--status inbox,active] [--search text] [--list L] [--tag T] [--flow F] [--persona P] [--due-before YYYY-MM-DD] [--due-after ...] [--overdue] [--recurring] [--include-deleted] [--limit N]`
- `get <id|to:ref>` — full task + notes + blockers + dependents + planner slots.
- `verify [--deep]` — invariant audit of the whole DB.
- `journal [--limit N]` — history of agent operations.

Write (all accept `--dry-run`, `--batch-id <id>` for idempotent retries):
- `add --json {task}` or flags (`--title` required; `--status --priority --list --due --date-start --recurrence --flow --url --estimate --tags a,b --personas x,y --depends-on id1,id2 --note "text"`)
- `update <id> --json {changes}` or the same flags. Pass the literal value
  `null` to clear a field. `notes` REPLACES the whole note list (omitted notes
  are deleted) — to append, `get` first, then send old + new.
- `complete <id...>` / `reopen <id...>` / `delete <id...>` / `restore <id...>`
- `batch --file ops.json` — `{"batchId": "...", "ops": [{"action":"add","task":{...}}, {"action":"update","id":"...","changes":{...}}, {"action":"complete","id":"..."}, {"action":"reopen"|"delete"|"restore","id":"..."}, {"action":"set-status","id":"...","status":"..."}]}`. Atomic: any failing op rolls back the whole batch.
- `rollback [--op <opId>] [--dry-run] [--force-partial]` — undo an agent
  operation from journal before-images. Sync-safe (a new forward change, so it
  propagates to other devices). Refuses if rows were modified after that op
  (exit 6) — then either accept `--force-partial` (skips conflicted rows) or
  leave it and tell the user.
- `backup [--label x]` / `backups` / `restore-backup <file> --yes` — file-level
  snapshots. `restore-backup` replaces the WHOLE DB and discards everything
  newer — disaster recovery only, explicit user approval required.

## Field semantics (validate before sending)

- `status`: `inbox` | `active` | `done` | `cancelled`. Prefer `complete`/`reopen`
  over raw status writes — they run the completion side effects correctly.
- `priority`: number 1 (highest) … 4 (default/none).
- `due`, `dateStart`: `"YYYY-MM-DD"` or null. Convert natural language to ISO yourself.
- `recurrence`: `"daily" | "weekly" | "monthly" | "yearly"` or an RTM-style
  `FREQ=...` RRULE, or null. The next occurrence is computed from the
  *completion day*, not the old due date.
- `dependsOn`: array of task ids (or `to:` refs) or null. The CLI rejects unknown ids,
  self-references and cycles. A task with unfinished dependencies cannot be
  completed (order ops inside one batch so blockers complete first, or pass
  `--skip-blocked` to skip those with a warning).
- `tags`, `personas`: arrays of strings (deduped automatically).
- `list`, `flowId`: plain strings; lookup tables are maintained automatically.
- `estimate`: free string; use `"30 min"` / `"2 hours"` so the Day Planner can parse it.
- `notes`: array of `{content, id?, createdAt?}` — full-replace semantics (see above).
- `title` non-empty. A duplicate live title only produces a warning; avoid
  creating duplicates unless the user wants it.

## Completion side effects (automatic — report them)

- Completing a **recurring** task spawns the next occurrence (`active`, due =
  today + interval) with a deterministic id. Result: `spawnedNext`.
- Completing a task **others depend on** auto-activates dependents whose
  blockers are now all done. Result: `activatedDependents`.
- `reopen` of a completed recurring task removes its spawned occurrence if it
  is still untouched. Result: `removedUntouchedSpawn`.
- Re-completing an already-done task is a guarded no-op (no duplicate spawn).

## When something goes wrong

- Wrong change just applied → `rollback --op <opId>` (the opId is in the result
  you just received; `rollback` with no args targets the most recent op).
- Exit 3 (schema): the app migrated (or DB is older than the skill). Tell the
  user; if the app is newer, the skill needs updating — do NOT write.
- Exit 4: an unregistered app process is running (pre-2.8 version or one still
  starting up), or another agent op holds the lock — ask the user to
  close/update the app, or wait a few seconds and retry.
- Exit 5: your ops would have broken an invariant; nothing was changed. Read the
  error, fix the ops.
- Catastrophe (DB corrupted, bad state you cannot compensate): `backups`, then
  `restore-backup <newest-good> --yes` with the user's explicit approval, app closed.

Deep details (full schema, sync model, invariants, app behaviors):
read `reference/SCHEMA.md` in this skill directory. Maintainers: after changing
the skill or the app's schema/domain logic, run `node bin/selftest.mjs`.
