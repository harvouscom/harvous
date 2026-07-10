import { db, first, Spaces, SpaceNotes, and, eq, isNull, or } from '../db';
import { broadcastInvalidation, broadcastInvalidationToSpaceMembers } from './realtime';
import type { RealtimeInvalidationPayload } from '@/lib/realtime-invalidation';

/** Notify the actor and all other members when a note mutation affects a shared/public space. */
export async function broadcastNoteInvalidation(
  actorUserId: string,
  spaceId: string | null | undefined,
  payload: RealtimeInvalidationPayload,
): Promise<void> {
  broadcastInvalidation(actorUserId, payload);
  if (!spaceId) return;
  const space = first(
    await db.select({ type: Spaces.type }).from(Spaces).where(eq(Spaces.id, spaceId)).limit(1),
  );
  if (space?.type !== 'shared' && space?.type !== 'public') return;
  await broadcastInvalidationToSpaceMembers(spaceId, payload, actorUserId);
}

export function dedupeBroadcastSpaceIds(
  rows: Array<{ spaceId: string | null | undefined }>,
): string[] {
  return [...new Set(rows.map((row) => row.spaceId).filter((id): id is string => Boolean(id)))];
}

export function dedupeBroadcastRecipientIds(
  memberIdsBySpace: string[][],
  actorUserId: string,
): string[] {
  const recipients = new Set(memberIdsBySpace.flat());
  recipients.delete(actorUserId);
  return [...recipients];
}

/**
 * Fan out canonical note edits through active associations only. Notes.spaceId
 * is private organization and must never be interpreted as shared visibility.
 */
export async function broadcastCanonicalNoteInvalidation(
  actorUserId: string,
  noteId: string,
  payload: RealtimeInvalidationPayload,
): Promise<void> {
  broadcastInvalidation(actorUserId, payload);
  const associationRows = await db
    .select({ spaceId: SpaceNotes.spaceId })
    .from(SpaceNotes)
    .innerJoin(
      Spaces,
      and(
        eq(Spaces.id, SpaceNotes.spaceId),
        isNull(Spaces.deletedAt),
        or(eq(Spaces.type, 'shared'), eq(Spaces.type, 'public')),
      ),
    )
    .where(
      and(
        eq(SpaceNotes.noteId, noteId),
        isNull(SpaceNotes.removedAt),
      ),
    );
  const sharedSpaceIds = dedupeBroadcastSpaceIds(
    associationRows.filter(
      (row) => row.spaceId,
    ),
  );
  const { getSpaceMemberUserIds } = await import('./shared-space-visit');
  const memberIdsBySpace = await Promise.all(
    sharedSpaceIds.map((spaceId) => getSpaceMemberUserIds(spaceId)),
  );
  for (const recipientUserId of dedupeBroadcastRecipientIds(
    memberIdsBySpace,
    actorUserId,
  )) {
    broadcastInvalidation(recipientUserId, payload);
  }
}
