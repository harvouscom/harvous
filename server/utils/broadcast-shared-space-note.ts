import { db, first, Spaces, eq } from '../db';
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
