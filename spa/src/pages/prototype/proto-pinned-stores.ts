/**
 * localStorage-backed pin store for prototype highlight, folder and Thread lists.
 * Mirrors native UserDefaults behavior — space-scoped.
 *
 * **Writes announce themselves.** Every surface that shows pins used to read once into its
 * own React state, which was fine while the sidebar was the only one — pinning there and
 * re-reading there agreed with itself. It stopped being fine the moment the search panel
 * showed the same folders and the organize host started doing the pinning on behalf of
 * both: a write from one had no way to reach the other, so a pinned folder stayed unpinned
 * on screen until something unrelated re-rendered. `subscribePinnedStores` is the fix, and
 * it is the same shape `proto-recall-seen` already uses for the same reason.
 */

const HIGHLIGHT_KEY_PREFIX = 'harvous.prototype.pinnedHighlightThreadIds.';
const FOLDER_KEY_PREFIX = 'harvous.prototype.pinnedFolderRowIds.';

/** Native `HarvousFolderRow.ungroupedRowId` — not pin/rename/remove. */
export const PROTO_UNSORTED_FOLDER_ROW_ID = '__ungrouped__';

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

const listeners = new Set<() => void>();

/** Notified after any pin write, so every list showing pins can re-read. */
export function subscribePinnedStores(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function safeWrite(key: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // quota / storage disabled — ignore
  }
  /* Announced even when the write itself failed: the in-memory answer a reader would
     compute is unchanged either way, and staying silent would leave the one surface that
     did update out of step with the rest. */
  listeners.forEach((listener) => listener());
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

// ── Folders (space-scoped) ───────────────────────────────────────────────

function folderKey(spaceId: string): string {
  return `${FOLDER_KEY_PREFIX}${spaceId}`;
}

export function folderRowId(name: string | null): string {
  return name ?? PROTO_UNSORTED_FOLDER_ROW_ID;
}

export function loadPinnedFolderIds(spaceId: string | undefined | null): string[] {
  if (!spaceId) return [];
  return safeRead(folderKey(spaceId)).filter((id) => id !== PROTO_UNSORTED_FOLDER_ROW_ID);
}

export function savePinnedFolderIds(spaceId: string, ids: string[]): void {
  const cleaned = ids.filter((id) => id !== PROTO_UNSORTED_FOLDER_ROW_ID);
  safeWrite(folderKey(spaceId), cleaned);
}

export function togglePinnedFolderId(spaceId: string, rowId: string): string[] {
  if (rowId === PROTO_UNSORTED_FOLDER_ROW_ID) return loadPinnedFolderIds(spaceId);
  const current = loadPinnedFolderIds(spaceId);
  const next = current.includes(rowId) ? current.filter((x) => x !== rowId) : [...current, rowId];
  savePinnedFolderIds(spaceId, next);
  return next;
}

export function removePinnedFolderId(spaceId: string, rowId: string): string[] {
  const next = loadPinnedFolderIds(spaceId).filter((id) => id !== rowId);
  savePinnedFolderIds(spaceId, next);
  return next;
}

export function applyFolderPinOrdering<T extends { name: string | null }>(
  folders: T[],
  pinnedIds: string[],
): T[] {
  if (pinnedIds.length === 0) return folders;
  const pinnedSet = new Set(pinnedIds);
  const byId = new Map(folders.map((f) => [folderRowId(f.name), f]));
  const pinned: T[] = [];
  pinnedIds.forEach((id) => {
    const row = byId.get(id);
    if (row) pinned.push(row);
  });
  const rest = folders.filter((f) => !pinnedSet.has(folderRowId(f.name)));
  return [...pinned, ...rest];
}

// ── Study-thread clusters (space-scoped) ───────────────────────────────────

const THREAD_CLUSTER_KEY_PREFIX = 'harvous.prototype.pinnedThreadClusterIds.';

function threadClusterKey(spaceId: string): string {
  return `${THREAD_CLUSTER_KEY_PREFIX}${spaceId}`;
}

export function threadClusterRowId(clusterId: string): string {
  return clusterId;
}

export function loadPinnedThreadClusterIds(spaceId: string | undefined | null): string[] {
  if (!spaceId) return [];
  return safeRead(threadClusterKey(spaceId));
}

export function savePinnedThreadClusterIds(spaceId: string, ids: string[]): void {
  safeWrite(threadClusterKey(spaceId), ids);
}

export function togglePinnedThreadClusterId(spaceId: string, clusterId: string): string[] {
  const current = loadPinnedThreadClusterIds(spaceId);
  const next = current.includes(clusterId)
    ? current.filter((x) => x !== clusterId)
    : [...current, clusterId];
  savePinnedThreadClusterIds(spaceId, next);
  return next;
}

export function removePinnedThreadClusterId(spaceId: string, clusterId: string): string[] {
  const next = loadPinnedThreadClusterIds(spaceId).filter((id) => id !== clusterId);
  savePinnedThreadClusterIds(spaceId, next);
  return next;
}

export function applyThreadClusterPinOrdering<T extends { id: string }>(
  clusters: T[],
  pinnedIds: string[],
): T[] {
  if (pinnedIds.length === 0) return clusters;
  const pinnedSet = new Set(pinnedIds);
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const pinned: T[] = [];
  pinnedIds.forEach((id) => {
    const row = byId.get(id);
    if (row) pinned.push(row);
  });
  const rest = clusters.filter((c) => !pinnedSet.has(c.id));
  return [...pinned, ...rest];
}
