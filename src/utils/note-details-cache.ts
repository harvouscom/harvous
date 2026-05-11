/**
 * Short-lived in-memory cache for note details.
 * Used so reopening the same note within TTL shows content immediately without loading state.
 */

const TTL_MS = 2 * 60 * 1000; // 2 minutes

export interface CachedNoteDetailsData {
  threads: unknown[];
  allUserThreads: unknown[];
  comments: unknown[];
  tags: unknown[];
  referencingNotes: unknown[];
  linkedFromNotes?: unknown[];
  linkedToNotes?: unknown[];
  note: {
    createdAt?: string | null;
    simpleNoteId?: number | null;
    version?: string | null;
    addedBy?: string | null;
    noteType?: string | null;
    userId?: string | null;
    linkedFromNoteId?: string | null;
  } | null;
}

interface CacheEntry {
  data: CachedNoteDetailsData;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedNoteDetails(noteId: string): CachedNoteDetailsData | null {
  const entry = cache.get(noteId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) {
    cache.delete(noteId);
    return null;
  }
  return entry.data;
}

export function setCachedNoteDetails(noteId: string, data: CachedNoteDetailsData): void {
  cache.set(noteId, { data, fetchedAt: Date.now() });
}

export function invalidateNoteDetailsCache(noteId: string): void {
  cache.delete(noteId);
}
