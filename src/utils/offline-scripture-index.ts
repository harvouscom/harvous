/**
 * Offline mirror of a space's passage→note index.
 *
 * The reader's margin markers are derived from this index, and reading is the one thing that
 * has to keep working on a plane. Notes are already mirrored; this is the small companion
 * that says which of them cite what.
 *
 * Every function here swallows its errors and returns a neutral value. A missing mirror means
 * "no markers this session", which is a quiet degradation; letting IndexedDB throw into the
 * reader would not be.
 */

import { offlineDB, ensureDatabaseOpen } from './offline-db';

export async function saveScriptureIndexLocal(
  userId: string,
  spaceId: string,
  books: unknown[],
): Promise<void> {
  if (!userId || !spaceId || !Array.isArray(books)) return;
  try {
    await ensureDatabaseOpen();
    await offlineDB.scriptureIndexCache.put({
      spaceId,
      userId,
      books,
      updatedAt: Date.now(),
    });
  } catch {
    /* mirroring is best-effort; the live query is the source of truth */
  }
}

export async function getScriptureIndexLocal(
  userId: string,
  spaceId: string,
): Promise<unknown[] | null> {
  if (!userId || !spaceId) return null;
  try {
    await ensureDatabaseOpen();
    const row = await offlineDB.scriptureIndexCache.get({ spaceId, userId });
    return Array.isArray(row?.books) ? row.books : null;
  } catch {
    return null;
  }
}

/** Drop a space's mirror — used when its notes are wiped, so stale dots cannot outlive them. */
export async function clearScriptureIndexLocal(userId: string, spaceId: string): Promise<void> {
  if (!userId || !spaceId) return;
  try {
    await ensureDatabaseOpen();
    await offlineDB.scriptureIndexCache.delete([spaceId, userId]);
  } catch {
    /* nothing to do — a mirror that cannot be cleared is refreshed on next sync anyway */
  }
}
