/**
 * Google Drive sync for PWA — browser-based OAuth2 redirect flow.
 *
 * Unlike the Tauri version (loopback listener), this uses standard browser
 * redirect: the page navigates to Google, then Google redirects back with
 * the auth code in the URL query string.
 *
 * Tokens are stored in IndexedDB (meta store).
 * Scope: drive.appdata — access only to app's hidden folder on Drive.
 */

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata'
const SYNC_FILENAME = 'task-orchestrator-sync.json'

// ─── Token storage (IndexedDB meta store) ───────────────────────────────────

async function saveTokens(db, tokens) {
  for (const [key, value] of Object.entries(tokens)) {
    if (value !== undefined) {
      await db.put('meta', { key: `gdrive_${key}`, value })
    }
  }
}

async function loadTokens(db) {
  const keys = ['access_token', 'refresh_token', 'client_id', 'client_secret']
  const result = {}
  for (const key of keys) {
    const row = await db.get('meta', `gdrive_${key}`)
    result[key] = row?.value || null
  }
  return result
}

async function clearTokens(db) {
  const tx = db.transaction('meta', 'readwrite')
  const all = await tx.store.getAll()
  for (const row of all) {
    if (row.key.startsWith('gdrive_')) await tx.store.delete(row.key)
  }
  await tx.done
}

// ─── OAuth2 (browser redirect flow) ─────────────────────────────────────────

function getRedirectUri() {
  // Use current origin + path (strip any query/hash from previous auth)
  return window.location.origin + window.location.pathname
}

export function startOAuthRedirect(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function extractAuthCode() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (code) {
    // Clean URL without reloading
    window.history.replaceState({}, '', window.location.pathname)
  }
  return code
}

async function exchangeCodeForTokens(code, clientId, clientSecret) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!response.ok) throw new Error(`Token exchange failed: ${await response.text()}`)
  return response.json()
}

async function refreshAccessToken(db) {
  const tokens = await loadTokens(db)
  if (!tokens.refresh_token || !tokens.client_id || !tokens.client_secret) {
    throw new Error('No refresh token — re-authorize')
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
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

  let response = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${tokens.access_token}` },
  })

  if (response.status === 401) {
    const newToken = await refreshAccessToken(db)
    response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${newToken}` },
    })
  }
  return response
}

async function findSyncFile(db) {
  const q = encodeURIComponent(`name='${SYNC_FILENAME}' and 'appDataFolder' in parents and trashed=false`)
  const response = await driveRequest(db,
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`)
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

export async function connect(db, clientId, clientSecret, authCode) {
  const tokenData = await exchangeCodeForTokens(authCode, clientId, clientSecret)
  await saveTokens(db, {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  })
  return true
}

export async function disconnect(db) {
  await clearTokens(db)
}

export async function getConfig(db) {
  const tokens = await loadTokens(db)
  return { clientId: tokens.client_id, clientSecret: tokens.client_secret, hasToken: !!tokens.access_token }
}

export async function syncWithDrive(db, computeSyncPackageFn, importSyncPackageFn) {
  let file = await findSyncFile(db)
  let remotePkg = null
  if (file) remotePkg = await downloadSyncFile(db, file.id)

  let applied = 0, outdated = 0
  if (remotePkg && remotePkg.type === 'sync_package') {
    const result = await importSyncPackageFn(db, remotePkg)
    applied = result.stats.applied
    outdated = result.stats.outdated
  }

  const ourPkg = await computeSyncPackageFn(db, {})
  const uploadResult = await uploadSyncFile(db, ourPkg, file?.id || null)

  return { applied, outdated, uploaded: ourPkg.tasks.length, fileId: uploadResult.id }
}
