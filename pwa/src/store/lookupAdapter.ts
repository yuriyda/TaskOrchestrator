/**
 * @file lookupAdapter.ts
 * @description IndexedDB-backed implementation of LookupStorageAdapter (see shared/core/lookup.ts).
 * Used by runLookupGc in PWA at startup, on Settings trigger, and incrementally after
 * mutations. Keep the adapter thin — GC rules live in the shared module.
 */
import type { LookupKind, LookupStorageAdapter } from '@shared/core/lookup'

const STORE: Record<LookupKind, string> = {
  lists: 'lists',
  tags: 'tags',
  personas: 'personas',
  flows: 'flows',
}

function aliveTasks(tasks: any[]): any[] {
  return tasks.filter(t => !t.deletedAt)
}

export function createIdbLookupAdapter(db: any): LookupStorageAdapter {
  const collectFromAlive = async <T>(project: (t: any) => T[] | T | null | undefined): Promise<string[]> => {
    const all = await db.getAll('tasks')
    const set = new Set<string>()
    for (const t of aliveTasks(all)) {
      const value = project(t)
      if (Array.isArray(value)) {
        for (const v of value) if (typeof v === 'string' && v) set.add(v)
      } else if (typeof value === 'string' && value) {
        set.add(value)
      }
    }
    return [...set]
  }

  return {
    async selectUsedLists() {
      return collectFromAlive(t => t.list)
    },
    async selectUsedTags() {
      return collectFromAlive(t => t.tags)
    },
    async selectUsedPersonas() {
      return collectFromAlive(t => t.personas)
    },
    async selectUsedFlows() {
      return collectFromAlive(t => t.flowId)
    },
    async selectFlowMetaNames() {
      const rows = await db.getAll('flowMeta')
      return rows.map((r: any) => r.name)
    },
    async getAllLookup(kind) {
      const rows = await db.getAll(STORE[kind])
      return rows.map((r: any) => r.name)
    },
    async deleteLookup(kind, name) {
      await db.delete(STORE[kind], name)
    },
  }
}
