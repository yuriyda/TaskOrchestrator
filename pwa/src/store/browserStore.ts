/**
 * IndexedDB-backed task store for PWA — mirrors the Tauri store interface.
 *
 * Uses the `idb` library for promise-based IndexedDB access.
 * Schema matches the SQLite schema from the Tauri app so sync packages
 * are compatible between desktop and PWA.
 *
 * Editing rules:
 * - Keep the same public API as useTauriTaskStore (storeApi.js contract).
 * - All data lives in IndexedDB — offline-first, no network required for CRUD.
 */

import { openDB } from 'idb'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  isConnected as gdriveIsConnected, connect as gdriveConnect,
  disconnect as gdriveDisconnect, syncWithDrive as gdriveSyncWithDrive,
  getConfig as gdriveGetConfig, startOAuthRedirect, extractAuthCode,
} from './googleDrivePwa.js'
import {
  handleTaskDone, isTaskBlocked, computeNextCycleStatus,
} from '@shared/core/taskActions.js'
import { localIsoDate } from '@shared/core/date.js'

const DB_NAME = 'task-orchestrator'
const DB_VERSION = 2

function ulid() {
  const t = Date.now().toString(36).toUpperCase().padStart(10, '0')
  const r = Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('').toUpperCase()
  return t + r
}

// Sync conflict resolution: incoming wins if its lamportTs is strictly greater,
// or if lamportTs is equal and its deviceId is lexicographically greater
// (deterministic tie-break ensures all devices converge on the same winner).
function shouldReplace(incomingLts, localLts, incomingDid, localDid) {
  const inL = incomingLts || 0
  const loL = localLts || 0
  if (inL > loL) return true
  if (inL < loL) return false
  return (incomingDid || '') > (localDid || '')
}

async function initDB(name = DB_NAME) {
  return openDB(name, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      // v1 → initial schema
      if (oldVersion < 1) {
        const tasks = db.createObjectStore('tasks', { keyPath: 'id' })
        tasks.createIndex('status', 'status')
        tasks.createIndex('priority', 'priority')
        tasks.createIndex('list', 'list')
        tasks.createIndex('deletedAt', 'deletedAt')
        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('taskSeriesId', 'taskSeriesId')
        db.createObjectStore('lists', { keyPath: 'name' })
        db.createObjectStore('tags', { keyPath: 'name' })
        db.createObjectStore('flows', { keyPath: 'name' })
        db.createObjectStore('personas', { keyPath: 'name' })
        db.createObjectStore('flowMeta', { keyPath: 'name' })
        db.createObjectStore('meta', { keyPath: 'key' })
        db.createObjectStore('vectorClock', { keyPath: 'deviceId' })
      }
      // v2 → notes gain soft-delete + lamport/device for cross-device sync parity with desktop
      if (oldVersion < 2) {
        const notes = tx.objectStore('notes')
        if (!notes.indexNames.contains('deletedAt')) notes.createIndex('deletedAt', 'deletedAt')
      }
    },
  })
}

async function getOrCreateDeviceId(db) {
  const row = await db.get('meta', 'device_id')
  if (row) return row.value
  const id = ulid()
  await db.put('meta', { key: 'device_id', value: id })
  return id
}

async function nextLamport(db, deviceId) {
  const tx = db.transaction('vectorClock', 'readwrite')
  let row = await tx.store.get(deviceId)
  const counter = (row?.counter || 0) + 1
  await tx.store.put({ deviceId, counter })
  await tx.done
  return counter
}

// Build IDB storage adapter for use with core/taskActions.js functions.
function buildIdbOps(db) {
  return {
    getTask: async (id) => (await db.get('tasks', id)) ?? null,

    insertTask: async (task) => { await db.put('tasks', task) },

    findInboxDependents: async (taskId) => {
      const all = await db.getAll('tasks')
      return all.filter(t => Array.isArray(t.dependsOn) && t.dependsOn.includes(taskId) && t.status === 'inbox' && !t.deletedAt)
    },

    isBlockerActive: async (taskId) => {
      const t = await db.get('tasks', taskId)
      return t ? (t.status !== 'done' && !t.deletedAt) : false
    },

    activateTask: async (id, lts, did) => {
      const t = await db.get('tasks', id)
      if (t) {
        t.status = 'active'
        t.updatedAt = new Date().toISOString()
        t.lamportTs = lts
        t.deviceId = did
        await db.put('tasks', t)
      }
    },
  }
}

async function fetchAllTasks(db) {
  const all = await db.getAll('tasks')
  const notes = await db.getAll('notes')
  const notesMap = {}
  for (const n of notes) {
    if (n.deletedAt) continue
    if (!notesMap[n.taskSeriesId]) notesMap[n.taskSeriesId] = []
    notesMap[n.taskSeriesId].push(n)
  }
  return all
    .filter(t => !t.deletedAt)
    .map(t => ({ ...t, notes: notesMap[t.rtmSeriesId || t.id] || [], subtasks: [] }))
    .sort((a, b) => (a.priority || 4) - (b.priority || 4) || (a.createdAt || '').localeCompare(b.createdAt || ''))
}

async function fetchLookups(db) {
  const [lists, tags, flows, personas, flowMetaRows] = await Promise.all([
    db.getAll('lists'),
    db.getAll('tags'),
    db.getAll('flows'),
    db.getAll('personas'),
    db.getAll('flowMeta'),
  ])
  const fm = {}
  for (const r of flowMetaRows) fm[r.name] = { description: r.description || '', color: r.color || '', deadline: r.deadline || null }
  return {
    lists: lists.map(r => r.name),
    tags: tags.map(r => r.name),
    flows: flows.map(r => r.name),
    personas: personas.map(r => r.name),
    flowMeta: fm,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBrowserTaskStore(dbName = DB_NAME) {
  const [ready, setReady] = useState(false)
  const [tasks, setTasks] = useState([])
  const [lists, setLists] = useState([])
  const [tags, setTags] = useState([])
  const [flows, setFlows] = useState([])
  const [flowMeta, setFlowMeta] = useState({})
  const [personas, setPersonas] = useState([])
  const [history, setHistory] = useState([])
  const dbRef = useRef(null)
  const deviceIdRef = useRef(null)

  const refresh = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    setTasks(await fetchAllTasks(db))
    const lookups = await fetchLookups(db)
    setLists(lookups.lists)
    setTags(lookups.tags)
    setFlows(lookups.flows)
    setFlowMeta(lookups.flowMeta)
    setPersonas(lookups.personas)
  }, [])

  // Init
  useEffect(() => {
    initDB(dbName).then(async db => {
      dbRef.current = db
      deviceIdRef.current = await getOrCreateDeviceId(db)
      await refresh()
      setReady(true)
    })
  }, [])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addTask = useCallback(async (data) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const now = new Date().toISOString()
    const task = {
      id: ulid(),
      title: data.title || '',
      status: data.status || 'inbox',
      priority: data.priority || 4,
      list: data.list || null,
      due: data.due || null,
      recurrence: data.recurrence || null,
      flowId: data.flowId || null,
      dependsOn: data.dependsOn?.length ? data.dependsOn : null,
      tags: data.tags || [],
      personas: data.personas || [],
      url: data.url || null,
      dateStart: data.dateStart || null,
      estimate: data.estimate || null,
      postponed: 0,
      rtmSeriesId: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: did,
      lamportTs: lts,
    }
    try {
      await db.put('tasks', task)
      if (task.list) await db.put('lists', { name: task.list })
      for (const t of task.tags) await db.put('tags', { name: t })
      for (const p of task.personas) await db.put('personas', { name: p })
      if (task.flowId) await db.put('flows', { name: task.flowId })
    } catch (e) {
      console.error('addTask failed:', e, task)
      throw e
    }
    await refresh()
  }, [refresh])

  const updateTask = useCallback(async (id, changes) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const task = await db.get('tasks', id)
    if (!task) return
    const updated = {
      ...task,
      ...changes,
      updatedAt: new Date().toISOString(),
      deviceId: did,
      lamportTs: lts,
    }
    if (changes.status === 'done' && !task.completedAt) {
      updated.completedAt = new Date().toISOString()
    } else if (changes.status && changes.status !== 'done') {
      updated.completedAt = null
    }
    await db.put('tasks', updated)
    if (updated.list) await db.put('lists', { name: updated.list })
    if (updated.tags) for (const t of updated.tags) await db.put('tags', { name: t })
    if (updated.personas) for (const p of updated.personas) await db.put('personas', { name: p })
    if (updated.flowId) await db.put('flows', { name: updated.flowId })
    // Handle completion side-effects: spawn next occurrence, activate dependents
    if (changes.status === 'done') {
      const ops = buildIdbOps(db)
      await handleTaskDone(ops, id, ulid, lts, did)
    }
    await refresh()
  }, [refresh])

  const saveNotes = useCallback(async (taskId, noteTexts) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const now = new Date().toISOString()
    const seriesId = (await db.get('tasks', taskId))?.rtmSeriesId || taskId
    const existing = await db.getAllFromIndex('notes', 'taskSeriesId', seriesId)
    const remainingTexts = noteTexts.map(c => c.trim()).filter(Boolean)
    const alive = existing.filter(n => !n.deletedAt)
    // Soft-delete notes that are no longer in the edited set
    for (const n of alive) {
      n.deletedAt = now
      n.updatedAt = now
      n.lamportTs = lts
      n.deviceId = did
      await db.put('notes', n)
    }
    // Insert fresh notes (always new ids — matches desktop saveNotes semantics)
    for (const content of remainingTexts) {
      await db.put('notes', {
        id: ulid(), taskSeriesId: seriesId, content,
        createdAt: Date.now(), updatedAt: now,
        deletedAt: null, lamportTs: lts, deviceId: did,
      })
    }
    await refresh()
  }, [refresh])

  const bulkStatus = useCallback(async (ids, status) => {
    const db = dbRef.current
    if (!db) return { activated: [], skippedBlocked: 0 }
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const now = new Date().toISOString()
    const ops = buildIdbOps(db)
    const activatedNames = []
    let skippedBlocked = 0
    for (const id of ids) {
      const task = await db.get('tasks', id)
      if (!task) continue
      // Block active/done transitions for tasks with unfinished dependencies
      if ((status === 'active' || status === 'done') && await isTaskBlocked(ops, id)) {
        skippedBlocked++
        continue
      }
      task.status = status
      task.updatedAt = now
      task.deviceId = did
      task.lamportTs = lts
      task.completedAt = status === 'done' ? now : null
      await db.put('tasks', task)
      if (status === 'done') {
        const doneResult = await handleTaskDone(ops, id, ulid, lts, did)
        activatedNames.push(...doneResult.activated.map(a => a.title))
      }
    }
    await refresh()
    return { activated: activatedNames, skippedBlocked }
  }, [refresh])

  const bulkCycle = useCallback(async (ids) => {
    const db = dbRef.current
    if (!db) return { activated: [] }
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const now = new Date().toISOString()
    const ops = buildIdbOps(db)
    const activatedNames = []
    for (const id of ids) {
      const task = await db.get('tasks', id)
      if (!task) continue
      const blocked = await isTaskBlocked(ops, id)
      const next = computeNextCycleStatus(task.status, blocked)
      task.status = next
      task.updatedAt = now
      task.deviceId = did
      task.lamportTs = lts
      task.completedAt = next === 'done' ? now : null
      await db.put('tasks', task)
      if (next === 'done') {
        const doneResult = await handleTaskDone(ops, id, ulid, lts, did)
        activatedNames.push(...doneResult.activated.map(a => a.title))
      }
    }
    await refresh()
    return { activated: activatedNames }
  }, [refresh])

  const bulkDelete = useCallback(async (ids) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const now = new Date().toISOString()
    for (const id of ids) {
      const task = await db.get('tasks', id)
      if (!task) continue
      task.deletedAt = now
      task.updatedAt = now
      task.deviceId = did
      task.lamportTs = lts
      await db.put('tasks', task)
    }
    await refresh()
  }, [refresh])

  const bulkPriority = useCallback(async (ids, priority) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const now = new Date().toISOString()
    for (const id of ids) {
      const task = await db.get('tasks', id)
      if (!task) continue
      task.priority = priority
      task.updatedAt = now
      task.deviceId = did
      task.lamportTs = lts
      await db.put('tasks', task)
    }
    await refresh()
  }, [refresh])

  const bulkDueShift = useCallback(async (ids, _cur) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const now = new Date().toISOString()
    for (const id of ids) {
      const task = await db.get('tasks', id)
      if (!task || !task.due || !/^\d{4}-\d{2}-\d{2}$/.test(task.due)) continue
      const d = new Date(task.due + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      task.due = localIsoDate(d)
      task.postponed = (task.postponed || 0) + 1
      task.updatedAt = now
      task.deviceId = did
      task.lamportTs = lts
      await db.put('tasks', task)
    }
    await refresh()
  }, [refresh])

  const bulkSnooze = useCallback(async (ids, days, months, _cur) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const now = new Date().toISOString()
    const today = localIsoDate(new Date())
    for (const id of ids) {
      const task = await db.get('tasks', id)
      if (!task) continue
      const base = (task.due && /^\d{4}-\d{2}-\d{2}$/.test(task.due))
        ? new Date(task.due + 'T12:00:00')
        : new Date(today + 'T12:00:00')
      if (months) base.setMonth(base.getMonth() + months)
      if (days) base.setDate(base.getDate() + days)
      task.due = localIsoDate(base)
      task.postponed = (task.postponed || 0) + 1
      task.updatedAt = now
      task.deviceId = did
      task.lamportTs = lts
      await db.put('tasks', task)
    }
    await refresh()
  }, [refresh])

  const bulkAssignToday = useCallback(async (ids, _cur) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const now = new Date().toISOString()
    const today = localIsoDate(new Date())
    for (const id of ids) {
      const task = await db.get('tasks', id)
      if (!task) continue
      task.status = 'active'
      task.due = today
      task.updatedAt = now
      task.deviceId = did
      task.lamportTs = lts
      await db.put('tasks', task)
    }
    await refresh()
  }, [refresh])

  const clearAll = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    await db.clear('tasks')
    await db.clear('notes')
    await db.clear('lists')
    await db.clear('tags')
    await db.clear('flows')
    await db.clear('flowMeta')
    await db.clear('personas')
    // vectorClock and meta (device_id) intentionally NOT cleared —
    // clearAll is a local operation; sync data survives so next sync can restore.
    await refresh()
  }, [refresh])

  const updateFlow = useCallback(async (name, changes) => {
    const db = dbRef.current
    if (!db) return
    await db.put('flows', { name })
    const existing = await db.get('flowMeta', name) || { name }
    await db.put('flowMeta', { ...existing, ...changes })
    await refresh()
  }, [refresh])

  const deleteFlow = useCallback(async (name) => {
    const db = dbRef.current
    if (!db) return
    await db.delete('flowMeta', name)
    await db.delete('flows', name)
    // Clear flow from tasks
    const allTasks = await db.getAll('tasks')
    for (const t of allTasks) {
      if (t.flowId === name) {
        t.flowId = null
        await db.put('tasks', t)
      }
    }
    await refresh()
  }, [refresh])

  const saveMeta = useCallback(async (key, value) => {
    const db = dbRef.current
    if (!db) return
    await db.put('meta', { key, value })
    setMetaSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const [metaSettings, setMetaSettings] = useState(null)
  useEffect(() => {
    if (!dbRef.current) return
    dbRef.current.getAll('meta').then(rows => {
      const m = {}
      for (const r of rows) m[r.key] = r.value
      setMetaSettings(m)
    })
  }, [ready])

  const [gdriveJustConnected, setGdriveJustConnected] = useState(false)

  // ── Google Drive sync (PWA browser flow) ─────────────────────────────────

  // IDB-based computeSyncPackage (mirrors SQLite version: tasks + notes + flowMeta + lookups)
  const computeSyncPackageIdb = async (db, targetVC = {}) => {
    const devRow = await db.get('meta', 'device_id')
    const localDeviceId = devRow?.value || null
    const vcRows = await db.getAll('vectorClock')
    const localVC = Object.fromEntries(vcRows.map(r => [r.deviceId, r.counter]))

    const allTasks = await db.getAll('tasks')
    const tasksToSend = allTasks.filter(t => {
      if (!t.deviceId) return true
      const targetKnows = targetVC[t.deviceId] || 0
      return t.lamportTs > targetKnows
    })

    const allSeriesIds = new Set(allTasks.map(t => t.rtmSeriesId || t.id))
    const allNotes = await db.getAll('notes')
    const notesToSend = allNotes
      .filter(n => {
        if (!allSeriesIds.has(n.taskSeriesId)) return false
        if (!n.deviceId) return true
        const targetKnows = targetVC[n.deviceId] || 0
        return (n.lamportTs || 0) > targetKnows
      })
      .map(n => ({
        id: n.id,
        taskSeriesId: n.taskSeriesId,
        content: n.content || '',
        createdAt: n.createdAt ?? Date.now(),
        deletedAt: n.deletedAt || null,
        updatedAt: n.updatedAt || null,
        lamportTs: n.lamportTs || 0,
        deviceId: n.deviceId || null,
      }))

    const lists = (await db.getAll('lists')).map(r => r.name)
    const tags = (await db.getAll('tags')).map(r => r.name)
    const flows = (await db.getAll('flows')).map(r => r.name)
    const personas = (await db.getAll('personas')).map(r => r.name)
    const flowMetaRows = await db.getAll('flowMeta')
    const flowMeta = flowMetaRows.map(r => ({
      name: r.name,
      description: r.description || '',
      color: r.color || '',
      deadline: r.deadline || null,
    }))

    return {
      type: 'sync_package',
      deviceId: localDeviceId,
      vectorClock: localVC,
      tasks: tasksToSend,
      notes: notesToSend,
      lists, tags, flows, personas, flowMeta,
    }
  }

  // IDB-based importSyncPackage — mirrors desktop semantics including tie-break,
  // soft-deleted note propagation, and flowMeta upsert.
  const importSyncPackageIdb = async (db, pkg) => {
    const { tasks: remoteTasks, notes: remoteNotes, vectorClock: remoteVC,
      lists: rLists, tags: rTags, flows: rFlows, personas: rPersonas, flowMeta: rFlowMeta } = pkg
    const devRow = await db.get('meta', 'device_id')
    const localDeviceId = devRow?.value || null

    let applied = 0, skipped = 0, outdated = 0

    // Update vector clock
    if (remoteVC) {
      for (const [devId, counter] of Object.entries(remoteVC)) {
        const existing = await db.get('vectorClock', devId)
        const maxCounter = Math.max(existing?.counter || 0, counter)
        await db.put('vectorClock', { deviceId: devId, counter: maxCounter })
      }
    }

    if (remoteTasks) {
      let maxImportedLts = 0
      for (const task of remoteTasks) {
        const existing = await db.get('tasks', task.id)
        maxImportedLts = Math.max(maxImportedLts, task.lamportTs || 0)
        if (!existing) {
          await db.put('tasks', task)
          applied++
        } else if (task.deviceId === localDeviceId) {
          skipped++
        } else if (shouldReplace(task.lamportTs, existing.lamportTs, task.deviceId, existing.deviceId)) {
          await db.put('tasks', { ...existing, ...task })
          applied++
        } else if ((task.lamportTs || 0) === (existing.lamportTs || 0)) {
          skipped++
        } else {
          outdated++
        }
      }
      // Lamport clock merge: ensure local counter ≥ max imported timestamp
      if (localDeviceId && maxImportedLts > 0) {
        const existing = await db.get('vectorClock', localDeviceId)
        const maxCounter = Math.max(existing?.counter || 0, maxImportedLts)
        await db.put('vectorClock', { deviceId: localDeviceId, counter: maxCounter })
      }
    }

    // Lookup tables
    if (rLists) for (const n of rLists) await db.put('lists', { name: n })
    if (rTags) for (const n of rTags) await db.put('tags', { name: n })
    if (rFlows) for (const n of rFlows) await db.put('flows', { name: n })
    if (rPersonas) for (const n of rPersonas) await db.put('personas', { name: n })

    // Flow metadata (upsert, also ensures flow row exists)
    if (rFlowMeta) {
      for (const fm of rFlowMeta) {
        await db.put('flows', { name: fm.name })
        await db.put('flowMeta', {
          name: fm.name,
          description: fm.description || '',
          color: fm.color || '',
          deadline: fm.deadline || null,
        })
      }
    }

    // Notes with lamport + tie-break, preserving soft-delete (deletedAt)
    if (remoteNotes) {
      for (const note of remoteNotes) {
        const existing = await db.get('notes', note.id)
        const createdAt = typeof note.createdAt === 'number'
          ? note.createdAt
          : (note.createdAt ? new Date(note.createdAt).getTime() : Date.now())
        if (!existing) {
          await db.put('notes', {
            id: note.id,
            taskSeriesId: note.taskSeriesId || '',
            content: note.content || '',
            createdAt,
            deletedAt: note.deletedAt || null,
            updatedAt: note.updatedAt || null,
            lamportTs: note.lamportTs || 0,
            deviceId: note.deviceId || null,
          })
        } else if (shouldReplace(note.lamportTs, existing.lamportTs, note.deviceId, existing.deviceId)) {
          await db.put('notes', {
            ...existing,
            content: note.content || '',
            deletedAt: note.deletedAt || null,
            updatedAt: note.updatedAt || null,
            lamportTs: note.lamportTs || 0,
            deviceId: note.deviceId || null,
          })
        }
      }
    }

    return { stats: { applied, skipped, outdated } }
  }

  // Handle OAuth redirect code on page load
  useEffect(() => {
    if (!ready) return
    const code = extractAuthCode()
    if (!code) return
    const db = dbRef.current
    if (!db) return
    gdriveGetConfig(db).then(cfg => {
      if (cfg.clientId && cfg.clientSecret) {
        gdriveConnect(db, cfg.clientId, cfg.clientSecret, code)
          .then(() => { console.log('[gdrive] Connected via redirect'); setGdriveJustConnected(true) })
          .catch(e => console.error('[gdrive] Connect failed:', e))
      }
    })
  }, [ready])

  const gdriveConnectAccount = useCallback(async (clientId, clientSecret) => {
    const db = dbRef.current
    if (!db) return false
    // Save credentials before redirect (so we can use them after return)
    await saveMeta('gdrive_client_id', clientId)
    await saveMeta('gdrive_client_secret', clientSecret)
    // Redirect to Google auth
    startOAuthRedirect(clientId)
    return true // Page will navigate away
  }, [saveMeta])

  const gdriveDisconnectAccount = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    await gdriveDisconnect(db)
  }, [])

  const gdriveSyncNow = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const result = await gdriveSyncWithDrive(db, computeSyncPackageIdb, importSyncPackageIdb)
    const isoNow = new Date().toISOString()
    await db.put('meta', { key: 'last_sync', value: isoNow })
    setMetaSettings(prev => ({ ...prev, last_sync: isoNow }))
    await refresh()
    return result
  }, [refresh])

  const gdriveGetConfigCb = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    return gdriveGetConfig(db)
  }, [])

  const gdriveCheckConnectionCb = useCallback(async () => {
    const db = dbRef.current
    if (!db) return false
    return gdriveIsConnected(db)
  }, [])

  return {
    ready,
    tasks, lists, tags, flows, flowMeta, personas,
    addTask, updateTask, saveNotes, bulkStatus, bulkCycle, bulkDelete, bulkPriority,
    bulkDueShift, bulkSnooze, bulkAssignToday,
    updateFlow, deleteFlow,
    clearAll,
    canUndo: false,
    undo: () => {},
    metaSettings, saveMeta,
    // Tauri-specific stubs (no-op in PWA)
    importRtm: null,
    loadDemoData: null,
    dbPath: null,
    revealDb: null,
    openNewDb: null,
    createNewDb: null,
    moveCurrentDb: null,
    createBackup: null,
    listBackups: null,
    restoreBackup: null,
    exportSync: null,
    importSync: null,
    exportSyncRequest: null,
    handleSyncRequest: null,
    importSyncClipboard: null,
    getSyncLog: null,
    getSyncStats: null,
    clearSyncData: null,
    // Google Drive sync (PWA implementation)
    gdriveCheckConnection: gdriveCheckConnectionCb,
    gdriveConnectAccount,
    gdriveDisconnectAccount,
    gdriveSyncNow,
    gdriveGetConfig: gdriveGetConfigCb,
    gdriveJustConnected,
    gdriveCheckSyncFile: null,
    gdrivePurgeSyncFile: null,
    openUrl: (url) => window.open(url, '_blank'),
  }
}
