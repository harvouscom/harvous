/**
 * Ensures every user has a personal "My Home" space row (native HarvousSpaceBootstrap parity).
 * Prototype and space-scoped APIs expect an owned space even when the user only uses the dashboard pile.
 */
import { generateSpaceId } from '@/utils/ids';
import { getThreadGradientCSS } from '@/utils/colors';
import { db, Spaces, Notes, eq, and, isNull, first } from '../db';
import { nowISO } from '../db/dates';

export async function ensurePersonalHomeSpace(userId: string): Promise<string> {
  const existing = first(
    await db
      .select({ id: Spaces.id })
      .from(Spaces)
      .where(eq(Spaces.userId, userId))
      .limit(1),
  );
  if (existing?.id) return existing.id;

  const id = generateSpaceId();
  const now = nowISO();
  const backgroundGradient = getThreadGradientCSS('paper');

  await db.insert(Spaces).values({
    id,
    title: 'My Home',
    description: null,
    color: 'paper',
    backgroundGradient,
    userId,
    isPublic: false,
    isActive: true,
    order: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Notes created on the classic dashboard often have null spaceId; scope them to My Home.
  await db
    .update(Notes)
    .set({ spaceId: id, updatedAt: now })
    .where(and(eq(Notes.userId, userId), isNull(Notes.spaceId)));

  return id;
}
