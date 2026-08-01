import { db, first, Notes, Spaces, SpaceNotes, and, eq, isNull, or } from '../db';
import { broadcastInvalidation, broadcastInvalidationToSpaceMembers } from './realtime';
import type { RealtimeInvalidationPayload, RealtimeNotePatch } from '@/lib/realtime-invalidation';

/**
 * Supabase Broadcast silently rejects oversized payloads (`status === 'error'`).
 * Stay well under the ceiling; followers fall back to authenticated HTTP refetch.
 */
export const REALTIME_NOTE_PATCH_MAX_BYTES = 64 * 1024;

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
 * Build a live-body patch for co-edited notes. Returns null when the note is not
 * open for co-editing, is encrypted, or the payload would exceed the broadcast
 * size cap — callers then send `{type,id}` and followers refetch over HTTP.
 *
 * `spaceId` is always null: `Notes.spaceId` is private organization, not the
 * shared association, and patching it would land the note in the wrong list.
 */
export function buildCoEditRealtimeNotePatch(row: {
  coEditEnabled: boolean | null | undefined;
  contentEncrypted: boolean | null | undefined;
  title: string | null | undefined;
  content: string | null | undefined;
  updatedAt: Date | string | null | undefined;
}): RealtimeNotePatch | null {
  if (!row.coEditEnabled || row.contentEncrypted) return null;
  const content = typeof row.content === 'string' ? row.content : '';
  const title = row.title ?? null;
  const updatedAt =
    row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : typeof row.updatedAt === 'string'
        ? row.updatedAt
        : undefined;
  const patch: RealtimeNotePatch = {
    title,
    content,
    ...(updatedAt ? { updatedAt } : {}),
    spaceId: null,
  };
  const bytes = Buffer.byteLength(JSON.stringify(patch), 'utf8');
  if (bytes > REALTIME_NOTE_PATCH_MAX_BYTES) return null;
  return patch;
}

async function withCoEditLiveBody(
  noteId: string,
  payload: RealtimeInvalidationPayload,
): Promise<RealtimeInvalidationPayload> {
  if (payload.note) return payload;
  if (payload.type !== 'note:updated' && payload.type !== 'note:created') return payload;
  const row = first(
    await db
      .select({
        coEditEnabled: Notes.coEditEnabled,
        contentEncrypted: Notes.contentEncrypted,
        title: Notes.title,
        content: Notes.content,
        updatedAt: Notes.updatedAt,
      })
      .from(Notes)
      .where(eq(Notes.id, noteId))
      .limit(1),
  );
  if (!row) return payload;
  const note = buildCoEditRealtimeNotePatch(row);
  if (!note) return payload;
  return { ...payload, note };
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
  const enriched = await withCoEditLiveBody(noteId, payload);
  broadcastInvalidation(actorUserId, enriched);
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
    broadcastInvalidation(recipientUserId, enriched);
  }
}
