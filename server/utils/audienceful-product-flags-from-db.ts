/**
 * Derive Audienceful product-behavior flags from Postgres (2.0 semantics).
 * Study Threads ≠ folders: NoteConnections clusters and shared-space Threads only.
 */
import {
  db,
  Notes,
  Threads,
  Spaces,
  SpaceMemberships,
  NoteConnections,
  eq,
  and,
  ne,
  isNotNull,
} from '../db';
import type { AudiencefulProductFlags } from '@/utils/audienceful';

export async function loadAudiencefulProductFlagsFromDb(
  userId: string,
): Promise<AudiencefulProductFlags> {
  const flags: AudiencefulProductFlags = {};

  const [noteRow] = await db
    .select({ id: Notes.id })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .limit(1);
  if (noteRow) flags.has_created_note = true;

  const [connectionRow] = await db
    .select({ id: NoteConnections.id })
    .from(NoteConnections)
    .where(eq(NoteConnections.userId, userId))
    .limit(1);
  if (connectionRow) {
    // Any NoteConnections edge implies a 2.0 study Thread cluster (≥2 notes).
    flags.has_created_thread = true;
  } else {
    // Shared-space Start Thread rows (not Classic personal piles).
    const [sharedThread] = await db
      .select({ id: Threads.id })
      .from(Threads)
      .innerJoin(Spaces, eq(Threads.spaceId, Spaces.id))
      .where(and(eq(Threads.userId, userId), ne(Spaces.type, 'personal')))
      .limit(1);
    if (sharedThread) flags.has_created_thread = true;
  }

  const [sharedNote] = await db
    .select({ id: Notes.id })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), isNotNull(Notes.shareToken)))
    .limit(1);
  if (sharedNote) {
    flags.has_shared = true;
  } else {
    const [sharedThreadToken] = await db
      .select({ id: Threads.id })
      .from(Threads)
      .where(and(eq(Threads.userId, userId), isNotNull(Threads.shareToken)))
      .limit(1);
    if (sharedThreadToken) flags.has_shared = true;
  }

  const [ownedSharedSpace] = await db
    .select({ id: Spaces.id })
    .from(Spaces)
    .where(and(eq(Spaces.userId, userId), eq(Spaces.type, 'shared')))
    .limit(1);
  if (ownedSharedSpace) flags.has_created_space = true;

  const [joinedMembership] = await db
    .select({ id: SpaceMemberships.id })
    .from(SpaceMemberships)
    .innerJoin(Spaces, eq(SpaceMemberships.spaceId, Spaces.id))
    .where(
      and(
        eq(SpaceMemberships.userId, userId),
        eq(Spaces.type, 'shared'),
        ne(SpaceMemberships.role, 'owner'),
      ),
    )
    .limit(1);
  if (joinedMembership) flags.has_joined_space = true;

  return flags;
}
