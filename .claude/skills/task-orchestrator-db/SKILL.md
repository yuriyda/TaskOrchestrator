---
name: task-orchestrator-db
description: Manage tasks in the Task Orchestrator app by writing directly to its SQLite database — create, update, complete, reopen, delete and restore tasks, set attributes (priority, due, recurrence, tags, lists, dependencies, notes), run safe atomic batches, and roll back mistakes. Use whenever asked to add/change/complete tasks in Task Orchestrator without going through the UI.
---

This is a discovery stub. The skill itself lives in the agent-neutral folder
`skills/task-orchestrator-db/` at the repo root, so that non-Claude agents can
find and use it too.

Read `skills/task-orchestrator-db/SKILL.md` and follow it exactly. The CLI it
describes is `skills/task-orchestrator-db/bin/to-db.mjs`.
