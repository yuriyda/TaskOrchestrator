/**
 * Google Drive sync module — OAuth2 + Drive API for sync file storage.
 *
 * Uses Google Drive appDataFolder (hidden, app-only space) to store a single
 * sync JSON file. OAuth2 uses the loopback redirect flow (Tauri Rust commands
 * start a temporary localhost listener to capture the authorization code).
 *
 * Scope: drive.file — access only to files created by this application.
 *
 * Editing rules:
 * - Keep transport-agnostic: sync logic lives in sync.js, this module only
 *   handles OAuth and Drive read/write.
 * - Tokens are stored via the db adapter (meta table) — will be replaced
 *   with SecureStore abstraction when cross-platform support is added.
 */

import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata'
const SYNC_FILENAME = 'task-orchestrator-sync.json'

// ─── Token storage (meta table) ─────────────────────────────────────────────

async function saveTokens(db, tokens) {
  for (const [key, value] of Object.entries(tokens)) {
    if (value !== undefined) {
      await db.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", [`gdrive_${key}`, value])
    }
  }
}

async function loadTokens(db) {
  const keys = ['access_token', 'refresh_token', 'client_id', 'client_secret']
  const result = {}
  for (const key of keys) {
    const [row] = await db.select("SELECT value FROM meta WHERE key = ?", [`gdrive_${key}`])
    result[key] = row?.value || null
  }
  return result
}

async function clearTokens(db) {
  await db.execute("DELETE FROM meta WHERE key LIKE 'gdrive_%'")
}

// ─── OAuth2 ─────────────────────────────────────────────────────────────────

async function startOAuthFlow(db, clientId, clientSecret) {
  // Start loopback listener (Rust command)
  const port = await invoke('oauth_start')
  const redirectUri = `http://127.0.0.1:${port}`

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  })
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

  // Open browser for user authorization
  await openUrl(authUrl)

  // Wait for redirect (blocks until user completes auth or timeout)
  const code = await invoke('oauth_await_code')

  // Exchange code for tokens
  const tokenResponse = await tauriFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text()
    throw new Error(`Token exchange failed: ${err}`)
  }

  const tokenData = await tokenResponse.json()
  await saveTokens(db, {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  })

  return true
}

async function refreshAccessToken(db) {
  const tokens = await loadTokens(db)
  if (!tokens.refresh_token || !tokens.client_id || !tokens.client_secret) {
    throw new Error('No refresh token available — re-authorize')
  }

  const response = await tauriFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: tokens.client_id,
      client_secret: tokens.client_secret,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) throw new Error('Token refresh failed')

  const data = await response.json()
  await saveTokens(db, { access_token: data.access_token })
  return data.access_token
}

// ─── Drive API helpers ──────────────────────────────────────────────────────

async function driveRequest(db, url, options = {}) {
  const tokens = await loadTokens(db)
  if (!tokens.access_token) throw new Error('Not authorized')

  let response = await tauriFetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${tokens.access_token}`,
    },
  })

  // If 401, try refreshing the token once
  if (response.status === 401) {
    const newToken = await refreshAccessToken(db)
    response = await tauriFetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${newToken}`,
      },
    })
  }

  return response
}

async function findSyncFile(db) {
  const q = encodeURIComponent(`name='${SYNC_FILENAME}' and 'appDataFolder' in parents and trashed=false`)
  const response = await driveRequest(db,
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)`)

  if (!response.ok) throw new Error(`Drive list failed: ${response.status}`)

  const data = await response.json()
  return data.files?.[0] || null
}

async function downloadSyncFile(db, fileId) {
  const response = await driveRequest(db,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)

  if (!response.ok) throw new Error(`Drive download failed: ${response.status}`)

  return response.json()
}

async function uploadSyncFile(db, content, existingFileId) {
  const metadata = { name: SYNC_FILENAME, ...(existingFileId ? {} : { parents: ['appDataFolder'] }) }
  const boundary = '---task_orchestrator_sync'
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(content)}\r\n` +
    `--${boundary}--`

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'

  const response = await driveRequest(db, url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })

  if (!response.ok) throw new Error(`Drive upload failed: ${response.status}`)

  return response.json()
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function isConnected(db) {
  const tokens = await loadTokens(db)
  return !!(tokens.access_token && tokens.client_id)
}

export async function connect(db, clientId, clientSecret) {
  return startOAuthFlow(db, clientId, clientSecret)
}

export async function disconnect(db) {
  await clearTokens(db)
}

/**
 * Check if a sync file exists on Google Drive.
 */
export async function hasSyncFile(db) {
  const file = await findSyncFile(db)
  return !!file
}

/**
 * Delete the sync file from Google Drive. Destructive — all sync data
 * on Drive is lost. Other devices will start fresh on next sync.
 */
export async function deleteSyncFile(db) {
  const file = await findSyncFile(db)
  if (!file) return false

  const response = await driveRequest(db,
    `https://www.googleapis.com/drive/v3/files/${file.id}`,
    { method: 'DELETE' })

  if (!response.ok && response.status !== 404) {
    throw new Error(`Drive delete failed: ${response.status}`)
  }
  return true
}

/**
 * Sync with Google Drive. Uses the same two-phase protocol as clipboard sync:
 * 1. Download remote sync file → treat as incoming sync_package
 * 2. Compute our package for the remote → upload updated sync file
 *
 * Returns { applied, conflicts, uploaded }
 */
export async function syncWithDrive(db, computeSyncPackageFn, importSyncPackageFn) {
  // Find or create the sync file on Drive
  let file = await findSyncFile(db)
  let remotePkg = null

  if (file) {
    remotePkg = await downloadSyncFile(db, file.id)
  }

  let applied = 0
  let conflicts = 0

  // Import remote changes if any
  if (remotePkg && remotePkg.type === 'sync_package') {
    console.log('[gdrive] Remote package:', {
      deviceId: remotePkg.deviceId,
      tasksCount: remotePkg.tasks?.length,
      vc: remotePkg.vectorClock,
      tasks: remotePkg.tasks?.map(t => ({ id: t.id?.slice(0,8), title: t.title?.slice(0,20), status: t.status, lts: t.lamportTs, did: t.deviceId?.slice(0,8) })),
    })
    const result = await importSyncPackageFn(db, remotePkg)
    applied = result.stats.applied
    conflicts = result.stats.conflicts
    console.log('[gdrive] Import result:', result.stats)
  }

  // Upload full snapshot — after import, local DB has the merged state.
  // Using empty targetVC ensures the Drive file always contains everything,
  // so any device that downloads it gets the complete picture.
  const ourPkg = await computeSyncPackageFn(db, {})

  // Upload our package
  const uploadResult = await uploadSyncFile(db, ourPkg, file?.id || null)

  return { applied, conflicts, uploaded: ourPkg.tasks.length, fileId: uploadResult.id }
}

export { loadTokens }
