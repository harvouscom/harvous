/**
 * Permanently remove legacy onboarding Welcome thread + system seed notes.
 * Onboarding seeding was removed from the product; this utility cleans up
 * orphaned rows and prevents them from leaking into My Home backfill.
 */

import {
  db,
  first,
  Notes,
  Threads,
  NoteThreads,
  NoteScriptureReferences,
  UserMetadata,
  eq,
  and,
  inArray,
  sql,
} from '../db';
import { nowISO } from '../db/dates';
import { deleteNotesCascadeForUser } from './delete-note-cascade';

export function isOnboardingThreadId(threadId: string | null | undefined): boolean {
  return typeof threadId === 'string' && threadId.startsWith('thread_onboarding_');
}

export function isOnboardingSystemNote(note: { threadId: string; addedBy: string | null }): boolean {
  return isOnboardingThreadId(note.threadId) && note.addedBy === 'system';
}

export function onboardingThreadIdForUser(userId: string): string {
  return `thread_onboarding_${userId}`;
}

/** SQL fragment: exclude onboarding threads. */
export const NOT_ONBOARDING_THREADS = sql`NOT starts_with(${Threads.id}::text, 'thread_onboarding_')`;

/** SQL fragment: exclude onboarding thread junction rows. */
export const NOT_ONBOARDING_JUNCTION_THREAD = sql`NOT starts_with(${NoteThreads.threadId}::text, 'thread_onboarding_')`;

/** SQL fragment: exclude notes in onboarding threads. */
export const NOT_ONBOARDING_NOTES_THREAD = sql`NOT starts_with(${Notes.threadId}::text, 'thread_onboarding_')`;

/** SQL fragment: exclude system-seeded onboarding pack notes. */
export const NOT_ONBOARDING_SYSTEM_NOTES = sql`${Notes.addedBy} IS DISTINCT FROM 'system'`;

export type PurgeOnboardingResult = {
  notesDeleted: number;
  threadDeleted: boolean;
};

async function collectOnboardingNoteIds(userId: string): Promise<string[]> {
  const packNotes = await db
    .select({ id: Notes.id })
    .from(Notes)
    .where(
      and(
        eq(Notes.userId, userId),
        sql`starts_with(${Notes.threadId}::text, 'thread_onboarding_')`,
      ),
    );

  const ids = new Set(packNotes.map((n) => n.id));
  if (ids.size === 0) return [];

  const refs = await db
    .select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
    .from(NoteScriptureReferences)
    .where(inArray(NoteScriptureReferences.noteId, [...ids]));

  for (const ref of refs) {
    if (ref.scriptureNoteId) ids.add(ref.scriptureNoteId);
  }

  return [...ids];
}

/**
 * Delete onboarding thread, pack notes, linked scripture child notes, and junction rows.
 * Idempotent — no-op when no onboarding content remains.
 */
export async function purgeOnboardingContentForUser(userId: string): Promise<PurgeOnboardingResult> {
  const onboardingThreadId = onboardingThreadIdForUser(userId);

  const threadRow = first(
    await db
      .select({ id: Threads.id })
      .from(Threads)
      .where(and(eq(Threads.id, onboardingThreadId), eq(Threads.userId, userId)))
      .limit(1),
  );

  const noteIds = await collectOnboardingNoteIds(userId);

  if (!threadRow && noteIds.length === 0) {
    return { notesDeleted: 0, threadDeleted: false };
  }

  let notesDeleted = 0;
  if (noteIds.length > 0) {
    const { deletedNoteIds } = await deleteNotesCascadeForUser(userId, noteIds);
    notesDeleted = deletedNoteIds.length;
  }

  await db.delete(NoteThreads).where(eq(NoteThreads.threadId, onboardingThreadId));

  let threadDeleted = false;
  if (threadRow) {
    await db.delete(Threads).where(and(eq(Threads.id, onboardingThreadId), eq(Threads.userId, userId)));
    threadDeleted = true;
  }

  await db
    .update(UserMetadata)
    .set({ onboardingPackVersionApplied: 0, updatedAt: nowISO() })
    .where(eq(UserMetadata.userId, userId));

  return { notesDeleted, threadDeleted };
}
