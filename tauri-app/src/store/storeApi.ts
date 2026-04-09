/**
 * StoreApi contract — defines the shape every store implementation must follow.
 *
 * Both useTauriTaskStore (SQLite) and useTaskStore (in-memory) should conform
 * to this interface. TypeScript types are defined in ../types.ts (StoreApi).
 */

// URL allowlist for openUrl — prevents opening dangerous schemes
const ALLOWED_SCHEMES = ['https:', 'http:']

/**
 * Validates a URL against the allowlist of safe schemes.
 */
export function isUrlAllowed(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return ALLOWED_SCHEMES.includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Wraps a raw openUrl function with scheme validation.
 * Rejects file://, javascript:, data:, mailto: etc.
 */
export function createSafeOpenUrl(rawOpenUrl: (url: string) => Promise<void>): (url: string) => Promise<void> {
  return async (url: string): Promise<void> => {
    if (!isUrlAllowed(url)) {
      console.warn('[openUrl] Blocked URL with disallowed scheme:', url)
      return
    }
    return rawOpenUrl(url)
  }
}
