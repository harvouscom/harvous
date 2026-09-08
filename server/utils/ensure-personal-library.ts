/**
 * The caller's personal library, creating it on first use.
 *
 * Lifted out of server/routes/library.ts when Discover gained a second caller —
 * installing a shared link has to put it somewhere, and an installer who has
 * never opened the library panel has no row yet. Sits beside
 * ensure-personal-home-space.ts, which answers the same shape of question for
 * spaces.
 */

import { db, ResourceLibraries, eq, and, first } from '../db';
import { now } from '../db/dates';
import { isUniqueViolationError } from './db-errors';

export type LibraryRow = typeof ResourceLibraries.$inferSelect;

export const DEFAULT_PERSONAL_LIBRARY_TITLE = 'My Library';

/** The caller's personal library, or null when they haven't saved anything yet. */
export async function findPersonalLibrary(userId: string): Promise<LibraryRow | null> {
  return (
    first(
      await db
        .select()
        .from(ResourceLibraries)
        .where(and(eq(ResourceLibraries.ownerKind, 'user'), eq(ResourceLibraries.ownerId, userId)))
        .limit(1),
    ) ?? null
  );
}

/**
 * The caller's personal library, creating it on first use.
 *
 * Two clients saving their first item at once both see no library and both
 * insert. The unique index on (ownerKind, ownerId) rejects the loser, who then
 * re-reads the winner's row — an account never ends up with two libraries.
 */
export async function ensurePersonalLibrary(userId: string): Promise<LibraryRow> {
  const existing = await findPersonalLibrary(userId);
  if (existing) return existing;

  const timestamp = now();
  const row: LibraryRow = {
    id: `lib_${crypto.randomUUID()}`,
    ownerKind: 'user',
    ownerId: userId,
    title: DEFAULT_PERSONAL_LIBRARY_TITLE,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    await db.insert(ResourceLibraries).values(row);
    return row;
  } catch (error) {
    if (!isUniqueViolationError(error)) throw error;
    const raced = await findPersonalLibrary(userId);
    if (!raced) throw error;
    return raced;
  }
}
