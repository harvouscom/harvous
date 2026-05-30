import {
  db,
  Notes,
  NoteThreads,
  NoteScriptureReferences,
  NoteTags,
  Comments,
  ScriptureMetadata,
  ResourceMetadata,
  StudyThreadEntries,
  and,
  eq,
  inArray,
  like,
  not,
  or,
  first,
} from '../db';
import { nowISO } from '../db/dates';
import { stripNoteLinksToNoteId } from '@/utils/tiptap-helpers';

const DELETE_CHUNK = 2000;

function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    chunks.push(ids.slice(i, i + DELETE_CHUNK));
  }
  return chunks;
}

export interface DeleteNotesCascadeResult {
  deletedNoteIds: string[];
  deletedStudyThreadIds: string[];
}

/**
 * Deletes notes (owned by user) with all related rows needed by note sync flows.
 * Returns the exact ids that were deleted so callers can emit sync tombstones.
 */
export async function deleteNotesCascadeForUser(userId: string, noteIds: string[]): Promise<DeleteNotesCascadeResult> {
  if (noteIds.length === 0) {
    return { deletedNoteIds: [], deletedStudyThreadIds: [] };
  }

  const deletedNoteIds: string[] = [];
  for (const chunk of chunkIds(noteIds)) {
    const owned = await db
      .select({ id: Notes.id })
      .from(Notes)
      .where(and(eq(Notes.userId, userId), inArray(Notes.id, chunk)));
    deletedNoteIds.push(...owned.map((row) => row.id));
  }
  if (deletedNoteIds.length === 0) {
    return { deletedNoteIds: [], deletedStudyThreadIds: [] };
  }

  await db
    .update(Notes)
    .set({ linkedFromNoteId: null, updatedAt: nowISO() })
    .where(and(eq(Notes.userId, userId), inArray(Notes.linkedFromNoteId, deletedNoteIds)));

  const deletedStudyThreadIds: string[] = [];
  for (const chunk of chunkIds(deletedNoteIds)) {
    const studyRows = await db
      .select({ id: StudyThreadEntries.id })
      .from(StudyThreadEntries)
      .where(
        and(
          eq(StudyThreadEntries.userId, userId),
          or(inArray(StudyThreadEntries.parentNoteId, chunk), inArray(StudyThreadEntries.linkedNoteId, chunk)),
        ),
      );
    deletedStudyThreadIds.push(...studyRows.map((row) => row.id));
  }

  for (const chunk of chunkIds(deletedNoteIds)) {
    await db.delete(NoteThreads).where(inArray(NoteThreads.noteId, chunk));
    await db
      .delete(NoteScriptureReferences)
      .where(or(inArray(NoteScriptureReferences.noteId, chunk), inArray(NoteScriptureReferences.scriptureNoteId, chunk)));
    await db.delete(NoteTags).where(inArray(NoteTags.noteId, chunk));
    await db.delete(Comments).where(inArray(Comments.noteId, chunk));
    await db.delete(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, chunk));
    await db.delete(ResourceMetadata).where(inArray(ResourceMetadata.noteId, chunk));
    await db
      .delete(StudyThreadEntries)
      .where(
        and(
          eq(StudyThreadEntries.userId, userId),
          or(inArray(StudyThreadEntries.parentNoteId, chunk), inArray(StudyThreadEntries.linkedNoteId, chunk)),
        ),
      );
  }

  for (const chunk of chunkIds(deletedNoteIds)) {
    await db.delete(Notes).where(and(eq(Notes.userId, userId), inArray(Notes.id, chunk)));
  }

  // Best-effort cleanup: remove inline links to deleted notes in remaining user notes.
  try {
    const notesWithLinks = await db
      .select({ id: Notes.id, content: Notes.content })
      .from(Notes)
      .where(and(eq(Notes.userId, userId), not(eq(Notes.contentEncrypted, true)), like(Notes.content, '%data-note-id=%')));
    for (const note of notesWithLinks) {
      if (!note.content?.includes('data-note-id')) continue;
      let nextContent = note.content;
      for (const deletedId of deletedNoteIds) {
        nextContent = stripNoteLinksToNoteId(nextContent, deletedId);
      }
      if (nextContent !== note.content) {
        await db.update(Notes).set({ content: nextContent, updatedAt: nowISO() }).where(and(eq(Notes.id, note.id), eq(Notes.userId, userId)));
      }
    }
  } catch {
    // Non-critical path.
  }

  return { deletedNoteIds, deletedStudyThreadIds };
}

export async function deleteSingleNoteCascadeForUser(userId: string, noteId: string): Promise<DeleteNotesCascadeResult> {
  return deleteNotesCascadeForUser(userId, [noteId]);
}

export async function loadOwnedNoteForDeletion(userId: string, noteId: string) {
  return first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, userId))).limit(1));
}
