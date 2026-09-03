/**
 * @file taskRef.ts
 * @description Task references — short, human-pasteable task ids ("to:XXXXX")
 *   for talking to AI agents about specific tasks. A reference is the shortest
 *   unique SUFFIX of the task's ULID (like a git short hash): computed on the
 *   fly against the current set of live task ids, never stored — so it needs
 *   no schema changes and cannot conflict under multi-device sync. When a new
 *   task makes a 5-char suffix ambiguous, freshly generated references simply
 *   lengthen; previously copied short ones resolve via the ambiguity path.
 */

// Crockford Base32 (same alphabet as ulid.ts): no I, L, O, U.
const REF_CHARS = /^[0-9A-HJKMNP-TV-Z]+$/;

/** Shortest suffix length generated for display/copy. */
export const TASK_REF_MIN_LEN = 5;
/** Shortest suffix length accepted on lookup (typed refs may be older/shorter). */
export const TASK_REF_MIN_LOOKUP_LEN = 4;

/**
 * Normalize user/agent input into a canonical reference: strips the "to:"
 * prefix, uppercases, applies Crockford forgiveness (O→0, I/L→1). Returns the
 * bare suffix (or full 26-char id), or null if the input is not a reference.
 */
export function normalizeTaskRef(input: string): string | null {
  const s = String(input ?? "").trim()
    .replace(/^to:/i, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (s.length < TASK_REF_MIN_LOOKUP_LEN || s.length > 26) return null;
  return REF_CHARS.test(s) ? s : null;
}

/**
 * Shortest suffix of `id` (at least `minLen` chars) that no other id in
 * `allIds` ends with. Falls back to the full id if every suffix collides.
 */
export function taskRefSuffix(id: string, allIds: Iterable<string>, minLen: number = TASK_REF_MIN_LEN): string {
  const others: string[] = [];
  for (const other of allIds) if (other !== id) others.push(other);
  for (let len = minLen; len < id.length; len++) {
    const suffix = id.slice(-len);
    if (!others.some(o => o.endsWith(suffix))) return suffix;
  }
  return id;
}

/** Display/copy form of a reference: "to:" + unique suffix. */
export function formatTaskRef(id: string, allIds: Iterable<string>, minLen?: number): string {
  return "to:" + taskRefSuffix(id, allIds, minLen);
}
