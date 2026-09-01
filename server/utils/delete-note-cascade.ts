import {
  db,
  Notes,
  NoteThreads,
  NoteConnections,
  NoteScriptureReferences,
  NoteTags,
  Comments,
  ScriptureMetadata,
  ResourceMetadata,
  StudyThreadEntries,
  NoteVersions,
  SpaceNotes,
  NoteFingerprints,
  RecallEvents,
  NoteVisitEvents,
  ReviewItems,
  ReviewEvents,
  Challenges,
  ChurchServicePublishedNotes,
  ChurchSeriesPublishedNotes,
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
import { recordDeletedEntities } from './sync-deletion-log';
import { updateCanonicalNoteInTransaction } from './note-version-service';

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

export const NOTE_DELETE_CASCADE_TABLES = [
  'NoteConnections',
  'NoteThreads',
  'NoteScriptureReferences',
  'NoteTags',
  'Comments',
  'ScriptureMetadata',
  'ResourceMetadata',
  'StudyThreadEntries',
  'SpaceNotes',
  'NoteVersions',
  'NoteFingerprints',
  'RecallEvents',
  'NoteVisitEvents',
  'ReviewItems',
  'ReviewEvents',
  'Challenges',
  'ChurchServicePublishedNotes',
  'ChurchSeriesPublishedNotes',
  'Notes',
] as const;

/**
 * Deletes notes (owned by user) with all related rows needed by note sync flows.
 * Returns the exact ids that were deleted so callers can emit sync tombstones.
 */
export async function deleteNotesCascadeForUser(userId: string, noteIds: string[]): Promise<DeleteNotesCascadeResult> {
  if (noteIds.length === 0) {
    return { deletedNoteIds: [], deletedStudyThreadIds: [] };
  }

  const { deletedNoteIds, deletedStudyThreadIds, foreignStudyThreadIds } = await db.transaction(async (tx) => {
    const ownedIds: string[] = [];
    for (const chunk of chunkIds(noteIds)) {
      const owned = await tx
        .select({ id: Notes.id })
        .from(Notes)
        .where(and(eq(Notes.userId, userId), inArray(Notes.id, chunk)))
        .for('update');
      ownedIds.push(...owned.map((row) => row.id));
    }
    if (ownedIds.length === 0) {
      return { deletedNoteIds: [], deletedStudyThreadIds: [], foreignStudyThreadIds: [] };
    }

    const ownStudyIds: string[] = [];
    const foreignByUser = new Map<string, string[]>();
    for (const chunk of chunkIds(ownedIds)) {
      const studyRows = await tx
        .select({ id: StudyThreadEntries.id, userId: StudyThreadEntries.userId })
        .from(StudyThreadEntries)
        .where(
          or(
            inArray(StudyThreadEntries.parentNoteId, chunk),
            and(eq(StudyThreadEntries.userId, userId), inArray(StudyThreadEntries.linkedNoteId, chunk)),
          ),
        );
      for (const row of studyRows) {
        if (row.userId === userId) ownStudyIds.push(row.id);
        else foreignByUser.set(row.userId, [...(foreignByUser.get(row.userId) ?? []), row.id]);
      }
    }

    for (const chunk of chunkIds(ownedIds)) {
      await tx
        .delete(NoteConnections)
        .where(
          or(
            inArray(NoteConnections.fromNoteId, chunk),
            inArray(NoteConnections.toNoteId, chunk),
          ),
        );
      await tx.delete(NoteThreads).where(inArray(NoteThreads.noteId, chunk));
      await tx
        .delete(NoteScriptureReferences)
        .where(
          or(
            inArray(NoteScriptureReferences.noteId, chunk),
            inArray(NoteScriptureReferences.scriptureNoteId, chunk),
          ),
        );
      await tx.delete(NoteTags).where(inArray(NoteTags.noteId, chunk));
      await tx.delete(Comments).where(inArray(Comments.noteId, chunk));
      await tx.delete(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, chunk));
      await tx.delete(ResourceMetadata).where(inArray(ResourceMetadata.noteId, chunk));
      await tx
        .delete(StudyThreadEntries)
        .where(
          or(
            inArray(StudyThreadEntries.parentNoteId, chunk),
            and(eq(StudyThreadEntries.userId, userId), inArray(StudyThreadEntries.linkedNoteId, chunk)),
          ),
        );
      await tx.delete(SpaceNotes).where(inArray(SpaceNotes.noteId, chunk));
      await tx.delete(NoteVersions).where(inArray(NoteVersions.noteId, chunk));
      // Memory-layer rows. Without these, a deleted note keeps feeding Home:
      // fingerprints drive the greeting's canon-section line, and RecallEvents are
      // the cross-device source of truth for what's already been resurfaced.
      // RecallEvents.noteId is nullable, so this leaves generative rows alone.
      await tx.delete(NoteFingerprints).where(inArray(NoteFingerprints.noteId, chunk));
      await tx.delete(RecallEvents).where(inArray(RecallEvents.noteId, chunk));
      // The visit log too — it is what tells resurfacing which notes are returned to, so a
      // deleted note left in it would keep weighting a library it is no longer part of.
      await tx.delete(NoteVisitEvents).where(inArray(NoteVisitEvents.noteId, chunk));
      // Review rows go; challenges are retired instead.
      //
      // A review item is a question about a note, and a question about a note that no longer
      // exists cannot be answered — it would surface in the inbox forever with nothing behind
      // the Reveal. Both ends of a `connection` item count, so either column deleting the note
      // retires the pair.
      //
      // A challenge is the opposite case and the reason this is an UPDATE rather than a DELETE.
      // Its steps produced ordinary notes the reader still owns — evidence added, a link made, a
      // summary written — and those artifacts point back at a path that explains them. Deleting
      // the row would leave the notes orphaned and make a finished piece of work disappear
      // because one of its inputs was tidied up. `retired` keeps the record and takes it off
      // every active surface. Only active and paused rows move; a completed challenge is history
      // and stays completed.
      await tx.delete(ReviewEvents).where(inArray(ReviewEvents.noteId, chunk));
      await tx
        .delete(ReviewItems)
        .where(
          and(
            eq(ReviewItems.userId, userId),
            or(inArray(ReviewItems.noteId, chunk), inArray(ReviewItems.secondaryNoteId, chunk)),
          ),
        );
      await tx
        .update(Challenges)
        .set({ status: 'retired', updatedAt: new Date() })
        .where(
          and(
            eq(Challenges.userId, userId),
            inArray(Challenges.status, ['active', 'paused']),
            or(
              inArray(Challenges.sourceNoteId, chunk),
              inArray(Challenges.sourceSecondaryNoteId, chunk),
            ),
          ),
        );
      // A published step's claim on the week it accompanies. Left behind, the
      // week would still read as published and a republish would skip it —
      // the series would be permanently missing a step no one could restore.
      await tx
        .delete(ChurchServicePublishedNotes)
        .where(inArray(ChurchServicePublishedNotes.noteId, chunk));
      // The same claim at series grain. Nothing skips a republish over this one,
      // but a stale row would keep pointing "This Sunday" at a note that is gone
      // — the congregant read resolves titles, so the row would vanish silently
      // from the list while staying in the table forever.
      await tx
        .delete(ChurchSeriesPublishedNotes)
        .where(inArray(ChurchSeriesPublishedNotes.noteId, chunk));
      await tx
        .delete(Notes)
        .where(and(eq(Notes.userId, userId), inArray(Notes.id, chunk)));
    }
    return {
      deletedNoteIds: ownedIds,
      deletedStudyThreadIds: ownStudyIds,
      foreignStudyThreadIds: [...foreignByUser.entries()],
    };
  });

  if (deletedNoteIds.length === 0) {
    return { deletedNoteIds: [], deletedStudyThreadIds: [] };
  }

  // Tombstones are an external sync side effect and intentionally happen only
  // after the relational delete transaction commits.
  for (const [annotatorUserId, ids] of foreignStudyThreadIds) {
    await recordDeletedEntities(annotatorUserId, 'studyThread', ids);
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
        await db.transaction((tx) =>
          updateCanonicalNoteInTransaction(tx, {
            noteId: note.id,
            actorId: userId,
            patch: { updatedAt: nowISO() },
            nextContent: (lockedNote) => {
              let lockedContent = lockedNote.content;
              for (const deletedId of deletedNoteIds) {
                lockedContent = stripNoteLinksToNoteId(lockedContent, deletedId);
              }
              return {
                title: lockedNote.title,
                content: lockedContent,
                contentEncrypted: lockedNote.contentEncrypted,
              };
            },
            source: 'delete-link-cleanup',
            now: nowISO(),
          }),
        );
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
