import { db, SyncDeletedEntities, and, eq, gt } from '../db';
import { nowISO } from '../db/dates';
import { isSyncDeletedEntitiesTableMissing } from './pg-undefined-relation';

const EVENT_CHUNK = 1000;
const EMPTY_FEED: SyncDeletionFeed = { deletedNoteIds: [], deletedStudyThreadIds: [], deletedThreadIds: [] };

export interface SyncDeletionFeed {
  deletedNoteIds: string[];
  deletedStudyThreadIds: string[];
  deletedThreadIds: string[];
}

type DeletedEntityType = 'note' | 'studyThread' | 'thread';

export async function recordDeletedEntities(
  userId: string,
  entityType: DeletedEntityType,
  entityIds: string[],
): Promise<void> {
  const uniqueIds = Array.from(new Set(entityIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const now = nowISO();
  const rows = uniqueIds.map((entityId) => ({
    id: `sync_delete_${entityType}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    userId,
    entityType,
    entityId,
    deletedAt: now,
  }));

  try {
    for (let i = 0; i < rows.length; i += EVENT_CHUNK) {
      await db.insert(SyncDeletedEntities).values(rows.slice(i, i + EVENT_CHUNK));
    }
  } catch (error) {
    if (isSyncDeletedEntitiesTableMissing(error)) {
      console.warn(
        '[sync/deletion-log] SyncDeletedEntities table missing; skipping tombstone writes. Run `npm run db:push`.',
      );
      return;
    }
    throw error;
  }
}

export async function loadDeletedEntitiesSince(userId: string, sinceDate: Date): Promise<SyncDeletionFeed> {
  let rows: Array<{ entityType: string; entityId: string | null }> = [];
  try {
    rows = await db
      .select({
        entityType: SyncDeletedEntities.entityType,
        entityId: SyncDeletedEntities.entityId,
      })
      .from(SyncDeletedEntities)
      .where(and(eq(SyncDeletedEntities.userId, userId), gt(SyncDeletedEntities.deletedAt, sinceDate)));
  } catch (error) {
    if (isSyncDeletedEntitiesTableMissing(error)) {
      console.warn(
        '[sync/deletion-log] SyncDeletedEntities table missing; returning empty deletion feed. Run `npm run db:push`.',
      );
      return EMPTY_FEED;
    }
    throw error;
  }

  const deletedNoteIds = new Set<string>();
  const deletedStudyThreadIds = new Set<string>();
  const deletedThreadIds = new Set<string>();

  for (const row of rows) {
    if (!row.entityId) continue;
    if (row.entityType === 'note') deletedNoteIds.add(row.entityId);
    if (row.entityType === 'studyThread') deletedStudyThreadIds.add(row.entityId);
    if (row.entityType === 'thread') deletedThreadIds.add(row.entityId);
  }

  return {
    deletedNoteIds: Array.from(deletedNoteIds),
    deletedStudyThreadIds: Array.from(deletedStudyThreadIds),
    deletedThreadIds: Array.from(deletedThreadIds),
  };
}

