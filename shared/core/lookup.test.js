/**
 * Unit tests for core/lookup.ts — runLookupGc on an in-memory adapter.
 * Storage-agnostic behaviour only; SQLite/IDB adapters have their own integration tests.
 */
import { describe, it, expect } from 'vitest'
import { runLookupGc } from './lookup.ts'

function createMemoryAdapter(init = {}) {
  const state = {
    lists: new Set(init.lists || []),
    tags: new Set(init.tags || []),
    personas: new Set(init.personas || []),
    flows: new Set(init.flows || []),
    usedLists: init.usedLists || [],
    usedTags: init.usedTags || [],
    usedPersonas: init.usedPersonas || [],
    usedFlows: init.usedFlows || [],
    flowMetaNames: init.flowMetaNames || [],
  }
  return {
    state,
    selectUsedLists: async () => state.usedLists,
    selectUsedTags: async () => state.usedTags,
    selectUsedPersonas: async () => state.usedPersonas,
    selectUsedFlows: async () => state.usedFlows,
    selectFlowMetaNames: async () => state.flowMetaNames,
    getAllLookup: async (kind) => [...state[kind]],
    deleteLookup: async (kind, name) => { state[kind].delete(name) },
  }
}

describe('runLookupGc', () => {
  it('removes orphaned lookup entries across all kinds', async () => {
    const a = createMemoryAdapter({
      lists: ['Work', 'Orphan'],
      tags: ['urgent', 'stale'],
      personas: ['Alice', 'Bob'],
      flows: ['Sprint', 'Old'],
      usedLists: ['Work'],
      usedTags: ['urgent'],
      usedPersonas: ['Alice'],
      usedFlows: ['Sprint'],
      flowMetaNames: [],
    })
    const res = await runLookupGc(a)
    expect(res.removed.lists).toEqual(['Orphan'])
    expect(res.removed.tags).toEqual(['stale'])
    expect(res.removed.personas).toEqual(['Bob'])
    expect(res.removed.flows).toEqual(['Old'])
    expect([...a.state.lists]).toEqual(['Work'])
    expect([...a.state.tags]).toEqual(['urgent'])
    expect([...a.state.personas]).toEqual(['Alice'])
    expect([...a.state.flows]).toEqual(['Sprint'])
  })

  it('keeps a flow lookup alive when flow_meta references it without any task', async () => {
    const a = createMemoryAdapter({
      flows: ['Sprint', 'DesignReview'],
      usedFlows: [],
      flowMetaNames: ['DesignReview'],
    })
    const res = await runLookupGc(a)
    expect(res.removed.flows).toEqual(['Sprint'])
    expect([...a.state.flows]).toEqual(['DesignReview'])
  })

  it('returns empty result on empty stores', async () => {
    const a = createMemoryAdapter()
    const res = await runLookupGc(a)
    expect(res.removed).toEqual({ lists: [], tags: [], personas: [], flows: [] })
  })

  it('does not treat used entries as orphans even if they match flow_meta accidentally', async () => {
    const a = createMemoryAdapter({
      flows: ['Sprint'],
      usedFlows: ['Sprint'],
      flowMetaNames: ['Sprint'],
    })
    const res = await runLookupGc(a)
    expect(res.removed.flows).toEqual([])
    expect([...a.state.flows]).toEqual(['Sprint'])
  })
})
