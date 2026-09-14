import { db, NoteVersions, and, asc, desc, eq, first, gte, lt } from '../db';
import type { Auth } from '../middleware/types';
import { hasFeatureWithReconcile } from '../middleware/require-feature';
import { hasEntitlement } from './entitlements';
import { historyVisibleSince, type NoteHistoryRow } from './note-history-visibility';

/** Metadata only — the list never reads version bodies. */
export async function loadNoteHistoryRows(input: {
  noteId: string;
  authorId: string;
  before: number | null;
  take: number;
}): Promise<{ rows: NoteHistoryRow[]; successorCreatedAt: Date | null }> {
  const rows = (await db
    .select({
      id: NoteVersions.id,
      version: NoteVersions.version,
      title: NoteVersions.title,
      contentEncrypted: NoteVersions.contentEncrypted,
      source: NoteVersions.source,
      createdAt: NoteVersions.createdAt,
      editedBy: NoteVersions.editedBy,
      authorId: NoteVersions.authorId,
    })
    .from(NoteVersions)
    .where(
      and(
        eq(NoteVersions.noteId, input.noteId),
        eq(NoteVersions.authorId, input.authorId),
        input.before === null ? undefined : lt(NoteVersions.version, input.before),
      ),
    )
    .orderBy(desc(NoteVersions.version))
    .limit(input.take)) as NoteHistoryRow[];

  if (input.before === null) return { rows, successorCreatedAt: null };
  const successor = first(
    await db
      .select({ createdAt: NoteVersions.createdAt })
      .from(NoteVersions)
      .where(and(eq(NoteVersions.noteId, input.noteId), gte(NoteVersions.version, input.before)))
      .orderBy(asc(NoteVersions.version))
      .limit(1),
  ) as { createdAt: Date } | undefined;
  return { rows, successorCreatedAt: successor?.createdAt ?? null };
}

/** Null when the account sees all history. Reconcile only once a row is actually locked. */
export async function resolveHistoryVisibleSince(
  auth: Auth,
  now: Date,
  options: { reconcile: boolean; throttle?: boolean },
): Promise<Date | null> {
  const hasFullHistory = options.reconcile
    ? await hasFeatureWithReconcile(auth, 'full_history', { throttle: options.throttle })
    : await hasEntitlement(auth, 'full_history');
  return historyVisibleSince(now, hasFullHistory);
}
