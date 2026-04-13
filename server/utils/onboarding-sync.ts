/**
 * Applies the latest onboarding markdown pack to existing users when ONBOARDING_PACK_VERSION increases.
 */

import {
  db,
  first,
  Notes,
  Threads,
  NoteThreads,
  UserMetadata,
  NoteTags,
  ScriptureMetadata,
  NoteScriptureReferences,
  ResourceMetadata,
  Comments,
  eq,
  and,
  or,
  desc,
} from '../db';
import { nowISO } from '../db/dates';
import { processScriptureReferences } from './process-scripture-references';

async function deleteSystemNoteRows(userId: string, noteId: string): Promise<void> {
  await db.update(Notes).set({ linkedFromNoteId: null, updatedAt: nowISO() }).where(eq(Notes.linkedFromNoteId, noteId));
  await db.delete(NoteThreads).where(eq(NoteThreads.noteId, noteId));
  await db
    .delete(NoteScriptureReferences)
    .where(or(eq(NoteScriptureReferences.noteId, noteId), eq(NoteScriptureReferences.scriptureNoteId, noteId)));
  await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
  await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
  await db.delete(Comments).where(eq(Comments.noteId, noteId));
  await db.delete(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId));
  await db.delete(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
}

export async function syncOnboardingNotesIfNeeded(userId: string): Promise<void> {
  const { loadOnboardingNotes, ONBOARDING_PACK_VERSION } = await import('@/utils/load-onboarding-notes');
  const { generateNoteId } = await import('@/utils/ids');

  const meta = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1));
  if (!meta) return;

  const applied = meta.onboardingPackVersionApplied ?? 0;
  if (applied >= ONBOARDING_PACK_VERSION) return;

  const onboardingThreadId = `thread_onboarding_${userId}`;
  const threadRow = first(await db.select({ id: Threads.id }).from(Threads).where(eq(Threads.id, onboardingThreadId)).limit(1));
  if (!threadRow) return;

  const pack = loadOnboardingNotes();
  if (pack.length === 0) {
    await db.update(UserMetadata).set({ onboardingPackVersionApplied: ONBOARDING_PACK_VERSION, updatedAt: nowISO() }).where(eq(UserMetadata.userId, userId));
    return;
  }

  const systemNotes = await db
    .select()
    .from(Notes)
    .where(and(eq(Notes.threadId, onboardingThreadId), eq(Notes.userId, userId), eq(Notes.addedBy, 'system')))
    .orderBy(desc(Notes.simpleNoteId));

  const bySimple = new Map<number, (typeof systemNotes)[0]>();
  for (const n of systemNotes) {
    if (n.simpleNoteId != null) bySimple.set(n.simpleNoteId, n);
  }

  const ts = nowISO();

  for (let i = 0; i < pack.length; i++) {
    const order = i + 1;
    const noteData = pack[i];
    const title = noteData.title.charAt(0).toUpperCase() + noteData.title.slice(1);
    const content = noteData.content;
    const existing = bySimple.get(order);

    if (existing) {
      await db
        .update(Notes)
        .set({ title, content, updatedAt: ts })
        .where(and(eq(Notes.id, existing.id), eq(Notes.userId, userId)));
      try {
        await processScriptureReferences(existing.id, userId, onboardingThreadId, content);
      } catch (e) {
        console.error('[onboarding-sync] scripture processing failed', existing.id, e);
      }
    } else {
      const noteId = generateNoteId();
      await db.insert(Notes).values({
        id: noteId,
        title,
        content,
        threadId: onboardingThreadId,
        spaceId: null,
        simpleNoteId: order,
        userId,
        isPublic: false,
        addedBy: 'system',
        createdAt: ts,
        lastVisited: ts,
      });
      await db.insert(NoteThreads).values({
        id: `note-thread-${noteId}-${Date.now()}`,
        noteId,
        threadId: onboardingThreadId,
        createdAt: nowISO(),
      });
      try {
        await processScriptureReferences(noteId, userId, onboardingThreadId, content);
      } catch (e) {
        console.error('[onboarding-sync] scripture processing failed', noteId, e);
      }
    }
  }

  const maxPackOrder = pack.length;
  const extras = systemNotes.filter((n) => n.simpleNoteId != null && n.simpleNoteId > maxPackOrder);
  for (const row of extras) {
    await deleteSystemNoteRows(userId, row.id);
  }

  await db
    .update(Threads)
    .set({
      subtitle: `${pack.length} notes to get you started`,
      updatedAt: ts,
    })
    .where(and(eq(Threads.id, onboardingThreadId), eq(Threads.userId, userId)));

  await db
    .update(UserMetadata)
    .set({ onboardingPackVersionApplied: ONBOARDING_PACK_VERSION, updatedAt: nowISO() })
    .where(eq(UserMetadata.userId, userId));

  console.log('[onboarding-sync] applied pack version', ONBOARDING_PACK_VERSION, { userId });
}
