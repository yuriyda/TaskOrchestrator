# Agent skill: task management via the database

Give a command-line AI agent (Claude Code or any agent that can run shell
commands) full, safe control over your Task Orchestrator tasks — create,
update, complete, delete, batch-edit and roll back — without opening the app.

The agent never touches SQLite directly: it goes through a guarded CLI
(`bin/to-db.mjs`) that replicates the app's own domain logic (recurrence
spawning, dependency activation, sync clocks, soft deletes) and wraps every
write in a transaction with an automatic backup, an invariant check and a
journaled, sync-safe rollback.

[Русская версия ниже](#скилл-для-агентов-управление-задачами-через-базу)

## Requirements

- **Node.js 23.4+** — the CLI uses the built-in `node:sqlite` module; no npm
  packages are installed.
- **This repository**, with `npm install` done in `tauri-app/` — the skill
  bundles the app's own `shared/core` logic with the repo's esbuild, so the
  agent always runs the same rules as the app. The bundle rebuilds itself
  automatically whenever those sources change.
- Task Orchestrator's database (`tasks.db`). The app itself doesn't need to be
  running — in fact, writes are only allowed while it is closed.

## Setup

**Claude Code, working inside this repo:** nothing to do — a stub in
`.claude/skills/` makes Claude Code auto-discover this folder.

**Claude Code, from any directory:** copy this folder to
`~/.claude/skills/task-orchestrator-db` and create `config.local.json` in it:

```json
{ "repoPath": "C:/path/to/TaskOrchestrator" }
```

**Any other agent:** point it at `SKILL.md` (the operating manual) and let it
run `node <skill-dir>/bin/to-db.mjs ...`. Output is JSON on stdout.

**Which database does the agent use?** Resolution order: `TO_DB_PATH` env →
`config.local.json` → **the database a running app instance has open** → the
app's default per-OS location. A running app (2.8+) registers which DB it has
open — custom paths chosen in its Settings included — so the agent follows the
app automatically. To pin a specific file regardless, add
`"dbPath": "D:/path/tasks.db"` to `config.local.json` or set `TO_DB_PATH`.
Never edit `config.json` for machine-specific paths — `config.local.json` is
gitignored for exactly that.

## Claude Desktop / Claude Cowork (MCP)

Claude Cowork runs its commands inside a sandboxed VM and cannot execute the
CLI on your machine — for it (and any other MCP client) the skill ships an MCP
server that bridges to the same guarded CLI. One-time setup:

```bash
cd skills/task-orchestrator-db/mcp
npm install
```

Then add to `%APPDATA%\Claude\claude_desktop_config.json` (create the file if
missing) and fully restart Claude Desktop:

```json
{
  "mcpServers": {
    "task-orchestrator": {
      "command": "node",
      "args": ["C:/path/to/TaskOrchestrator/skills/task-orchestrator-db/mcp/server.mjs"]
    }
  }
}
```

Claude Desktop starts the server on the host and bridges it into Cowork
sessions automatically. Tools exposed: `create_task`, `create_tasks_batch`
(atomic, idempotent via batchId, max 50), `list_tasks`, `get_task`,
`update_task`, `complete_tasks`, `reopen_task`, `delete_task` (soft),
`rollback_operation`, `db_status`. Dangerous operations (backup restore, guard
overrides, mass deletes) are not exposed at all. A custom DB path can be passed
via an `"env": {"TO_DB_PATH": "..."}` entry in the server config.

## Safety model

- **Reads anytime; writes are guarded per database** — each running app
  instance (2.8+) registers which DB it has open (validated against its live
  process id, so a minimized window or a crash can't confuse the check).
  Target DB open in such an instance → concurrent writes are safe: the app
  live-refreshes within ~3 seconds and clears its Undo history so a stale undo
  can never wipe agent changes. Instances running on other DBs don't block
  writes. An app process with no registration (an old pre-2.8 version) → the
  CLI refuses to write (the old app caches state in memory and its Undo could
  hard-delete external tasks).
- **Backup before every write**: a `VACUUM INTO` snapshot goes to
  `agent-backups/` next to the DB (rotated, default 15).
- **Atomic batches**: up to 200 operations in one transaction, all-or-nothing,
  with `--dry-run` preview and `--batch-id` idempotency for safe retries.
- **Invariant gate**: after applying, before committing, the CLI re-checks the
  whole database (statuses, dates, JSON fields, dependency graph, recurrence
  duplicates, FK, quick_check). New violations → automatic rollback.
- **Journaled rollback**: every write records before-images;
  `rollback --op <id>` restores them as a *new* change with a fresh Lamport
  timestamp, so the revert propagates correctly through Google Drive sync to
  other devices. Detected conflicts (rows modified since) block the rollback.
- **Sync-correct by construction**: the agent registers as its own sync device
  (`vector_clock` row, `sync_log` entries, `lamport = max+1`), deletes are
  always tombstones — never hard deletes.

## Maintenance

After changing the skill, or after the app's schema/domain logic changes:

```
node bin/selftest.mjs
```

builds a throwaway database from the repo's own migrations and runs ~50 checks
(CRUD, recurrence, dependencies, batching, rollback). No real data involved.

When the app's schema moves past v13, the CLI refuses to write until the skill
is updated. Checklist: review new migrations in
`tauri-app/src/store/migrations.ts` and write patterns in
`useTauriTaskStore.ts`; update `SCHEMA_VERSION`, `TASK_COLUMNS`/`NOTE_COLUMNS`
and any affected logic in `bin/to-db.mjs`; update `reference/SCHEMA.md`; run
the selftest.

---

# Скилл для агентов: управление задачами через базу

Даёт консольному ИИ-агенту (Claude Code или любому агенту с доступом к командной
строке) полное и безопасное управление задачами Task Orchestrator — создание,
изменение, завершение, удаление, пакетные правки и откат — без открытия
приложения.

Агент не трогает SQLite напрямую: он работает через защищённый CLI
(`bin/to-db.mjs`), который воспроизводит доменную логику самого приложения
(порождение повторяющихся задач, активация зависимых, часы синхронизации,
мягкое удаление) и оборачивает каждую запись в транзакцию с автоматическим
бэкапом, проверкой инвариантов и журналируемым, безопасным для синхронизации
откатом.

## Требования

- **Node.js 23.4+** — CLI использует встроенный модуль `node:sqlite`; npm-пакеты
  не устанавливаются.
- **Этот репозиторий** с выполненным `npm install` в `tauri-app/` — скилл
  собирает логику из `shared/core` esbuild'ом из репозитория, поэтому агент
  всегда работает по тем же правилам, что и приложение. Бандл пересобирается
  автоматически при изменении исходников.
- База Task Orchestrator (`tasks.db`). Само приложение запускать не нужно —
  наоборот, запись разрешена только когда оно закрыто.

## Установка

**Claude Code внутри этого репозитория:** ничего делать не нужно — стуб в
`.claude/skills/` указывает Claude Code на эту папку автоматически.

**Claude Code из любой директории:** скопируйте эту папку в
`~/.claude/skills/task-orchestrator-db` и создайте в ней `config.local.json`:

```json
{ "repoPath": "C:/путь/к/TaskOrchestrator" }
```

**Любой другой агент:** дайте ему `SKILL.md` (инструкция по работе) и
возможность запускать `node <папка-скилла>/bin/to-db.mjs ...`. Вывод — JSON в
stdout.

**С какой базой работает агент?** Порядок разрешения: переменная `TO_DB_PATH`
→ `config.local.json` → **база, открытая в запущенном приложении** →
стандартный путь для вашей ОС. Запущенное приложение (2.8+) само публикует,
какая база у него открыта — включая нестандартные пути из его настроек, —
поэтому агент автоматически следует за приложением. Чтобы жёстко указать
конкретный файл, добавьте `"dbPath": "D:/путь/tasks.db"` в `config.local.json`
или задайте `TO_DB_PATH`. Не вписывайте машинные пути в `config.json` — для
этого есть гитигнорируемый `config.local.json`.

## Claude Desktop / Claude Cowork (MCP)

Claude Cowork выполняет команды в изолированной VM и не может запускать CLI на
вашей машине — для него (и любого другого MCP-клиента) в скилле есть
MCP-сервер, работающий поверх того же защищённого CLI. Разовая настройка:

```bash
cd skills/task-orchestrator-db/mcp
npm install
```

Затем добавьте в `%APPDATA%\Claude\claude_desktop_config.json` (создайте файл,
если его нет) и полностью перезапустите Claude Desktop:

```json
{
  "mcpServers": {
    "task-orchestrator": {
      "command": "node",
      "args": ["C:/путь/к/TaskOrchestrator/skills/task-orchestrator-db/mcp/server.mjs"]
    }
  }
}
```

Claude Desktop запускает сервер на хосте и автоматически пробрасывает его в
сессии Cowork. Инструменты: `create_task`, `create_tasks_batch` (атомарно,
идемпотентность по batchId, до 50), `list_tasks`, `get_task`, `update_task`,
`complete_tasks`, `reopen_task`, `delete_task` (мягкое), `rollback_operation`,
`db_status`. Опасные операции (восстановление бэкапа, обход защит, массовые
удаления) не экспонируются вовсе. Нестандартный путь к базе передаётся через
`"env": {"TO_DB_PATH": "..."}` в конфиге сервера.

## Модель безопасности

- **Чтение — всегда; запись — под защитой на уровне конкретной базы.** Каждый
  запущенный инстанс приложения (2.8+) регистрирует, какая база у него
  открыта (регистрация валидируется по живому PID процесса — свёрнутое окно
  или крэш не собьют проверку). Целевая база открыта в таком инстансе →
  параллельная запись безопасна: приложение подхватывает изменения за ~3
  секунды и сбрасывает историю Undo, чтобы устаревшая отмена не стёрла
  изменения агента. Инстансы на других базах запись не блокируют. Процесс
  приложения без регистрации (старая версия до 2.8) → CLI откажет в записи
  (старое приложение держит состояние в памяти, а его Undo может жёстко
  удалить внешние задачи).
- **Бэкап перед каждой записью**: снапшот `VACUUM INTO` в `agent-backups/`
  рядом с базой (ротация, по умолчанию 15).
- **Атомарные пакеты**: до 200 операций в одной транзакции, всё-или-ничего,
  с предпросмотром `--dry-run` и идемпотентностью `--batch-id` для безопасных
  повторов.
- **Проверка инвариантов**: после применения, до коммита CLI перепроверяет всю
  базу (статусы, даты, JSON-поля, граф зависимостей, дубли повторяющихся, FK,
  quick_check). Новые нарушения → автоматический откат.
- **Журналируемый откат**: каждая запись сохраняет before-образы строк;
  `rollback --op <id>` восстанавливает их как *новое* изменение со свежим
  Lamport-временем, поэтому откат корректно разъезжается через синхронизацию
  Google Drive на другие устройства. Конфликты (строки менялись после)
  блокируют откат.
- **Корректность синхронизации по построению**: агент регистрируется как
  отдельное устройство синка (строка в `vector_clock`, записи в `sync_log`,
  `lamport = max+1`), удаление — всегда tombstone, никогда физическое.

## Сопровождение

После изменения скилла или схемы/доменной логики приложения:

```
node bin/selftest.mjs
```

— собирает одноразовую базу из миграций самого репозитория и прогоняет ~50
проверок (CRUD, повторения, зависимости, пакеты, откат). Реальные данные не
используются.

Когда схема приложения уйдёт дальше v13, CLI откажется писать, пока скилл не
обновят. Чек-лист: просмотреть новые миграции в
`tauri-app/src/store/migrations.ts` и паттерны записи в `useTauriTaskStore.ts`;
обновить `SCHEMA_VERSION`, `TASK_COLUMNS`/`NOTE_COLUMNS` и затронутую логику в
`bin/to-db.mjs`; обновить `reference/SCHEMA.md`; прогнать selftest.
