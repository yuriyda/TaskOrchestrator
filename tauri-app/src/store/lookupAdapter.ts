/**
 * @file lookupAdapter.ts
 * @description SQLite-backed implementation of LookupStorageAdapter (see shared/core/lookup.ts).
 * Used by runLookupGc on desktop at startup, on Settings trigger, and incrementally.
 * Do not add desktop-specific logic here — this adapter should stay a thin wrapper
 * over SQL so the shared GC rules remain the single source of truth.
 */
import type { LookupKind, LookupStorageAdapter } from '@shared/core/lookup'

const TABLE: Record<LookupKind, string> = {
  lists: 'lists',
  tags: 'tags',
  personas: 'personas',
  flows: 'flows',
}

export function createSqliteLookupAdapter(db: any): LookupStorageAdapter {
  return {
    async selectUsedLists() {
      const rows = await db.select(
        `SELECT DISTINCT list_name AS name FROM tasks
           WHERE list_name IS NOT NULL AND deleted_at IS NULL`
      )
      return rows.map((r: any) => r.name)
    },
    async selectUsedTags() {
      const rows = await db.select(
        `SELECT DISTINCT value AS name FROM tasks, json_each(tasks.tags)
           WHERE tasks.deleted_at IS NULL`
      )
      return rows.map((r: any) => r.name)
    },
    async selectUsedPersonas() {
      const rows = await db.select(
        `SELECT DISTINCT value AS name FROM tasks, json_each(tasks.personas)
           WHERE tasks.deleted_at IS NULL`
      )
      return rows.map((r: any) => r.name)
    },
    async selectUsedFlows() {
      const rows = await db.select(
        `SELECT DISTINCT flow_id AS name FROM tasks
           WHERE flow_id IS NOT NULL AND deleted_at IS NULL`
      )
      return rows.map((r: any) => r.name)
    },
    async selectFlowMetaNames() {
      const rows = await db.select(`SELECT name FROM flow_meta`)
      return rows.map((r: any) => r.name)
    },
    async getAllLookup(kind) {
      const rows = await db.select(`SELECT name FROM ${TABLE[kind]}`)
      return rows.map((r: any) => r.name)
    },
    async deleteLookup(kind, name) {
      await db.execute(`DELETE FROM ${TABLE[kind]} WHERE name=?`, [name])
    },
  }
}
