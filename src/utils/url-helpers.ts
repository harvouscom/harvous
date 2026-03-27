/**
 * URL ↔ Database ID conversion utilities.
 *
 * Database IDs use underscore prefixes: thread_abc123, note_def456, space_ghi789
 * URLs use slash-separated segments: /thread/abc123, /note/def456, /space/ghi789
 *
 * These helpers are the single source of truth for all conversions.
 */

export type EntityType = 'thread' | 'note' | 'space' | 'local';

const PREFIXES: Array<[string, string]> = [
  ['thread_', '/thread/'],
  ['note_', '/note/'],
  ['space_', '/space/'],
  ['local_', '/local/'],
];

/**
 * Convert a database ID to a URL path.
 * "thread_abc123"           → "/thread/abc123"
 * "thread_unorganized"      → "/thread/unorganized"
 * "thread_onboarding_user1" → "/thread/onboarding_user1"
 * "note_def456"             → "/note/def456"
 * "space_ghi789"            → "/space/ghi789"
 *
 * When `threadContext` is provided and the ID is a note, appends `?thread=threadId`
 * so the server can reliably determine which thread the user navigated from.
 */
export function idToUrl(id: string, threadContext?: string, fromNoteId?: string): string {
  if (id == null || typeof id !== 'string') return '/';
  let url = `/${id}`;
  for (const [prefix, urlPrefix] of PREFIXES) {
    if (id.startsWith(prefix)) {
      url = urlPrefix + id.slice(prefix.length);
      break;
    }
  }
  if (threadContext && id.startsWith('note_')) {
    url += `?thread=${threadContext}`;
    if (fromNoteId && fromNoteId.startsWith('note_')) {
      url += `&from=${fromNoteId}`;
    }
  }
  return url;
}

/**
 * Convert a new-format URL path to a database ID.
 * "/thread/abc123" → "thread_abc123"
 * "/note/def456"   → "note_def456"
 * Returns null if the path doesn't match the new format.
 */
export function urlToId(pathname: string): string | null {
  for (const [prefix, urlPrefix] of PREFIXES) {
    if (pathname.startsWith(urlPrefix)) {
      const rest = pathname.slice(urlPrefix.length);
      if (rest) return prefix + rest;
    }
  }
  return null;
}

/**
 * Extract the database ID from a URL path (handles both old and new format).
 * "/thread/abc123"  → "thread_abc123"  (new format)
 * "/thread_abc123"  → "thread_abc123"  (old format, backward compat)
 * "/dashboard"      → null
 */
export function extractIdFromPath(pathname: string): string | null {
  // Try new format first
  const fromNew = urlToId(pathname);
  if (fromNew) return fromNew;

  // Try old format: /thread_abc123
  const id = pathname.startsWith('/') ? pathname.substring(1) : pathname;
  for (const [prefix] of PREFIXES) {
    if (id.startsWith(prefix)) return id;
  }
  return null;
}

/**
 * Detect entity type from a URL path (handles both old and new format).
 * "/thread/abc123"  → "thread"
 * "/thread_abc123"  → "thread"
 * "/note/def456"    → "note"
 * "/dashboard"      → null
 */
export function detectEntityTypeFromPath(pathname: string): EntityType | null {
  // New format
  if (pathname.startsWith('/thread/')) return 'thread';
  if (pathname.startsWith('/note/')) return 'note';
  if (pathname.startsWith('/space/')) return 'space';
  if (pathname.startsWith('/local/')) return 'local';

  // Old format
  const id = pathname.startsWith('/') ? pathname.substring(1) : pathname;
  if (id.startsWith('thread_')) return 'thread';
  if (id.startsWith('note_')) return 'note';
  if (id.startsWith('space_')) return 'space';
  if (id.startsWith('local_')) return 'local';

  return null;
}

/**
 * Check if a pathname uses the old URL format (e.g., /thread_abc123).
 */
export function isOldUrlFormat(pathname: string): boolean {
  const id = pathname.startsWith('/') ? pathname.substring(1) : pathname;
  for (const [prefix] of PREFIXES) {
    if (id.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Convert an old-format URL to the new format, preserving query string.
 * "/thread_abc123"         → "/thread/abc123"
 * "/thread_abc123?tab=all" → "/thread/abc123?tab=all"
 */
export function oldUrlToNewUrl(pathname: string, search: string = ''): string {
  const id = pathname.startsWith('/') ? pathname.substring(1) : pathname;
  return idToUrl(id) + search;
}

/**
 * Read the parent note id from the current URL query string (?from=note_xxx).
 */
export function getFromNoteId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromNoteId = new URLSearchParams(window.location.search).get('from');
    return fromNoteId && fromNoteId.startsWith('note_') ? fromNoteId : null;
  } catch {
    return null;
  }
}
