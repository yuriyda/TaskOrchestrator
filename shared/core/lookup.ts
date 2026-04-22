/**
 * @file lookup.ts
 * @description Lookup garbage collection shared between desktop (SQLite) and PWA (IDB).
 *
 * Lookup tables (lists, tags, personas, flows) are derived state: they exist
 * to speed up UI drawers/filter lists, but the source of truth is the tasks
 * themselves. This module provides a single implementation of the GC rules,
 * parameterised by a StorageAdapter so each backend supplies the raw reads
 * and deletes.
 *
 * Invariant for flows: a flow name stays in the lookup iff (a) a non-deleted
 * task references it, OR (b) a flow_meta row exists for that name. This
 * matches the desktop cleanup in useTauriTaskStore.ts bulkDelete.
 *
 * Use `runLookupGc(adapter)` at startup, on explicit user request in Settings,
 * and incrementally after mutations that might orphan entries (bulkDelete,
 * updateTask). See pwa-architecture-plan-2026-04-21.md Task 1 for rationale.
 */

export type LookupKind = 'lists' | 'tags' | 'personas' | 'flows'

export interface LookupStorageAdapter {
  // Names currently referenced by at least one non-deleted task.
  selectUsedLists(): Promise<string[]>
  selectUsedTags(): Promise<string[]>
  selectUsedPersonas(): Promise<string[]>
  selectUsedFlows(): Promise<string[]>
  // Names kept alive by flow_meta regardless of task references.
  selectFlowMetaNames(): Promise<string[]>
  // Raw contents of a lookup table.
  getAllLookup(kind: LookupKind): Promise<string[]>
  // Remove a lookup entry by name.
  deleteLookup(kind: LookupKind, name: string): Promise<void>
}

export interface LookupGcResult {
  removed: {
    lists: string[]
    tags: string[]
    personas: string[]
    flows: string[]
  }
}

function diff(stored: string[], usedSets: Array<Set<string>>): string[] {
  return stored.filter(name => !usedSets.some(s => s.has(name)))
}

async function gcSimple(adapter: LookupStorageAdapter, kind: LookupKind, used: string[]): Promise<string[]> {
  const stored = await adapter.getAllLookup(kind)
  const orphans = diff(stored, [new Set(used)])
  for (const name of orphans) await adapter.deleteLookup(kind, name)
  return orphans
}

export async function runLookupGc(adapter: LookupStorageAdapter): Promise<LookupGcResult> {
  const [usedLists, usedTags, usedPersonas, usedFlows, flowMetaNames] = await Promise.all([
    adapter.selectUsedLists(),
    adapter.selectUsedTags(),
    adapter.selectUsedPersonas(),
    adapter.selectUsedFlows(),
    adapter.selectFlowMetaNames(),
  ])

  const lists = await gcSimple(adapter, 'lists', usedLists)
  const tags = await gcSimple(adapter, 'tags', usedTags)
  const personas = await gcSimple(adapter, 'personas', usedPersonas)

  const storedFlows = await adapter.getAllLookup('flows')
  const flows = diff(storedFlows, [new Set(usedFlows), new Set(flowMetaNames)])
  for (const name of flows) await adapter.deleteLookup('flows', name)

  return { removed: { lists, tags, personas, flows } }
}
