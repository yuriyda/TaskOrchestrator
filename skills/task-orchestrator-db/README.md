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

**Custom DB location** (if you moved your DB via app Settings): add
`"dbPath": "D:/path/tasks.db"` to `config.local.json`, or set the `TO_DB_PATH`
environment variable. By default the skill finds the DB at the app's standard
per-OS location. Never edit `config.json` for machine-specific paths —
`config.local.json` is gitignored for exactly that.

## Safety model

- **Reads anytime; writes only while the app is closed** — the CLI detects a
  running Task Orchestrator and refuses (the app caches state in memory and
  would not see external changes; its Undo could even hard-delete them).
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

**Нестандартный путь к базе** (если вы переносили её через настройки
приложения): добавьте `"dbPath": "D:/путь/tasks.db"` в `config.local.json` или
задайте переменную окружения `TO_DB_PATH`. По умолчанию скилл находит базу в
стандартном месте для вашей ОС. Не вписывайте машинные пути в `config.json` —
для этого есть гитигнорируемый `config.local.json`.

## Модель безопасности

- **Чтение — всегда; запись — только при закрытом приложении.** CLI сам
  обнаруживает запущенный Task Orchestrator и отказывает (приложение держит
  состояние в памяти, не увидит внешних изменений, а его Undo может их даже
  жёстко удалить).
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
