/**
 * localStorage-backed pin store for prototype sidebar highlight lists.
 * Mirrors native UserDefaults behavior — space-scoped for highlights.
 */

const HIGHLIGHT_KEY_PREFIX = 'harvous.prototype.pinnedHighlightThreadIds.';

function safeRead(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function safeWrite(key: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // quota / storage disabled — ignore
  }
}

// ── Highlights (space-scoped) ────────────────────────────────────────────

function highlightKey(spaceId: string): string {
  return `${HIGHLIGHT_KEY_PREFIX}${spaceId}`;
}

export function loadPinnedHighlightIds(spaceId: string | undefined | null): string[] {
  if (!spaceId) return [];
  return safeRead(highlightKey(spaceId));
}

export function savePinnedHighlightIds(spaceId: string, ids: string[]): void {
  safeWrite(highlightKey(spaceId), ids);
}

export function togglePinnedHighlightId(spaceId: string, id: string): string[] {
  const current = loadPinnedHighlightIds(spaceId);
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  savePinnedHighlightIds(spaceId, next);
  return next;
}
