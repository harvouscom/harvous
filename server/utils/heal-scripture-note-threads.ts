/**
 * Ensures scripture notes have NoteThreads rows for every thread their parent notes are in.
 * Thread lists merge referenced scripture notes via NoteScriptureReferences; NoteDetailsPanel
 * uses NoteThreads only — this heals missing junction rows (idempotent).
 */

import { db, first, Notes, NoteThreads, NoteScriptureReferences, Threads, eq, and } from '../db';
import { nowISO } from '../db/dates';

export async function healScriptureNoteThreadsFromParents(scriptureNoteId: string, userId: string): Promise<boolean> {
  const scripture = first(
    await db
      .select({ id: Notes.id })
      .from(Notes)
      .where(and(eq(Notes.id, scriptureNoteId), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')))
      .limit(1),
  );
  if (!scripture) return false;

  const parents = await db
    .select({ noteId: NoteScriptureReferences.noteId })
    .from(NoteScriptureReferences)
    .where(eq(NoteScriptureReferences.scriptureNoteId, scriptureNoteId));

  const parentIds = [...new Set(parents.map((p) => p.noteId))];
  if (parentIds.length === 0) return false;

  const threadIdsToAdd = new Set<string>();

  for (const pid of parentIds) {
    const parentNote = first(await db.select({ threadId: Notes.threadId }).from(Notes).where(eq(Notes.id, pid)).limit(1));
    const rels = await db.select({ threadId: NoteThreads.threadId }).from(NoteThreads).where(eq(NoteThreads.noteId, pid));
    for (const r of rels) {
      if (r.threadId && r.threadId !== 'thread_unorganized' && !r.threadId.startsWith('thread_onboarding_')) {
        threadIdsToAdd.add(r.threadId);
      }
    }
    if (
      parentNote?.threadId &&
      parentNote.threadId !== 'thread_unorganized' &&
      !parentNote.threadId.startsWith('thread_onboarding_')
    ) {
      threadIdsToAdd.add(parentNote.threadId);
    }
  }

  if (threadIdsToAdd.size === 0) return false;

  const existing = await db.select({ threadId: NoteThreads.threadId }).from(NoteThreads).where(eq(NoteThreads.noteId, scriptureNoteId));
  const existingSet = new Set(existing.map((e) => e.threadId));

  let inserted = false;
  const scriptureRow = first(await db.select().from(Notes).where(eq(Notes.id, scriptureNoteId)).limit(1));
  const needsPrimaryThread =
    existing.length === 0 || scriptureRow?.threadId === 'thread_unorganized';
  let primaryThreadUpdated = false;

  for (const tid of threadIdsToAdd) {
    if (existingSet.has(tid)) continue;
    const thread = first(
      await db.select({ id: Threads.id }).from(Threads).where(and(eq(Threads.id, tid), eq(Threads.userId, userId))).limit(1),
    );
    if (!thread) continue;

    try {
      await db.insert(NoteThreads).values({
        id: `note-thread-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        noteId: scriptureNoteId,
        threadId: tid,
        createdAt: nowISO(),
      });
      existingSet.add(tid);
      inserted = true;

      if (needsPrimaryThread && tid !== 'thread_unorganized' && !primaryThreadUpdated) {
        await db.update(Notes).set({ threadId: tid }).where(eq(Notes.id, scriptureNoteId));
        primaryThreadUpdated = true;
      }
      await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, tid), eq(Threads.userId, userId)));
    } catch {
      // duplicate or race — ignore
    }
  }

  return inserted;
}
