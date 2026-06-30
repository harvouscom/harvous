import { db, StudyThreadMemberOrders, eq, and } from '../db';
import { nowISO } from '../db/dates';
import {
  appendStudyThreadMemberOrder,
  removeStudyThreadMemberFromOrder,
} from '@/utils/study-thread-trail';

export function parseStudyThreadMemberOrder(raw: string | null | undefined): string[] | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

export function serializeStudyThreadMemberOrder(ids: string[]): string {
  return JSON.stringify(ids);
}

export async function fetchStudyThreadMemberOrder(
  repNoteId: string,
  userId: string,
): Promise<string[] | null> {
  const row = await db
    .select({ orderedNoteIds: StudyThreadMemberOrders.orderedNoteIds })
    .from(StudyThreadMemberOrders)
    .where(and(eq(StudyThreadMemberOrders.repNoteId, repNoteId), eq(StudyThreadMemberOrders.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);
  return row ? parseStudyThreadMemberOrder(row.orderedNoteIds) : null;
}

export async function upsertStudyThreadMemberOrder(
  repNoteId: string,
  userId: string,
  orderedNoteIds: string[],
): Promise<void> {
  const payload = {
    orderedNoteIds: serializeStudyThreadMemberOrder(orderedNoteIds),
    updatedAt: nowISO(),
  };
  const existing = await db
    .select({ repNoteId: StudyThreadMemberOrders.repNoteId })
    .from(StudyThreadMemberOrders)
    .where(and(eq(StudyThreadMemberOrders.repNoteId, repNoteId), eq(StudyThreadMemberOrders.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    await db
      .update(StudyThreadMemberOrders)
      .set(payload)
      .where(and(eq(StudyThreadMemberOrders.repNoteId, repNoteId), eq(StudyThreadMemberOrders.userId, userId)));
    return;
  }

  await db.insert(StudyThreadMemberOrders).values({
    repNoteId,
    userId,
    ...payload,
  });
}

export async function deleteStudyThreadMemberOrder(repNoteId: string, userId: string): Promise<void> {
  await db
    .delete(StudyThreadMemberOrders)
    .where(and(eq(StudyThreadMemberOrders.repNoteId, repNoteId), eq(StudyThreadMemberOrders.userId, userId)));
}

/** When manual order exists, append newly connected note ids. */
export async function appendStudyThreadMemberOrderOnConnect(
  repNoteId: string,
  userId: string,
  newNoteIds: string[],
  memberIds: string[],
): Promise<void> {
  const memberSet = new Set(memberIds);
  const current = await fetchStudyThreadMemberOrder(repNoteId, userId);
  const next = appendStudyThreadMemberOrder(current, newNoteIds, memberSet);
  if (!next) return;
  await upsertStudyThreadMemberOrder(repNoteId, userId, next);
}

/** Drop a note from stored manual order when it leaves the cluster. */
export async function removeStudyThreadMemberOrderOnDisconnect(
  repNoteId: string,
  userId: string,
  removedNoteId: string,
): Promise<void> {
  const current = await fetchStudyThreadMemberOrder(repNoteId, userId);
  const next = removeStudyThreadMemberFromOrder(current, removedNoteId);
  if (!current) return;
  if (!next) {
    await deleteStudyThreadMemberOrder(repNoteId, userId);
    return;
  }
  await upsertStudyThreadMemberOrder(repNoteId, userId, next);
}
