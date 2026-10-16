/**
 * "Our Bible" for a shared space — the chapters the room has written about or highlighted.
 *
 * Built only from what the space already shares: the notes shared into it (the same set its
 * Scripture view indexes) and the highlights made on them. A member's own reading, and anything
 * they keep in their personal space, never counts — it is a map of the room, not of its people,
 * and every chapter on it is one any member can already open from the space.
 *
 * Personal My Bible stays owner-scoped (`bible-coverage.ts`); the two never mix.
 */

import { db, Notes, StudyThreadEntries, and, eq, isNotNull, ne } from '../db';
import { buildBibleCoverage, type BibleCoverage, type ChapterRef } from '@/utils/bible-coverage';
import { buildSpaceScriptureIndex } from './build-space-scripture-index';
import { chaptersForReference } from './bible-coverage';
import { NOT_ONBOARDING_NOTES_THREAD, NOT_ONBOARDING_SYSTEM_NOTES } from './purge-onboarding-content';
import { isStudyThreadEntriesTableMissing } from './pg-undefined-relation';
import { activeSpaceNotePredicate } from './space-note-predicate';

/**
 * The notes a space's Scripture index reads: shared into it (or, for a personal space, the
 * owner's own there), readable, and not scaffolding. One definition, so the index and the map
 * can never disagree about what the room has written.
 */
export function scriptureIndexNoteFilter(spaceId: string, personalOwnerUserId?: string) {
  return and(
    ...(personalOwnerUserId
      ? [eq(Notes.spaceId, spaceId), eq(Notes.userId, personalOwnerUserId)]
      : [activeSpaceNotePredicate(spaceId)]),
    eq(Notes.contentEncrypted, false),
    ne(Notes.noteType, 'scripture'),
    NOT_ONBOARDING_NOTES_THREAD,
    NOT_ONBOARDING_SYSTEM_NOTES,
  );
}

async function sharedHighlightReferences(spaceId: string): Promise<string[]> {
  try {
    const rows = await db
      .selectDistinct({ reference: StudyThreadEntries.scriptureReference })
      .from(StudyThreadEntries)
      .innerJoin(Notes, eq(StudyThreadEntries.parentNoteId, Notes.id))
      .where(
        and(
          // The same rows the space's Highlights list shows: on a note in the room, made in it.
          activeSpaceNotePredicate(spaceId),
          eq(StudyThreadEntries.spaceId, spaceId),
          eq(Notes.contentEncrypted, false),
          eq(StudyThreadEntries.isArchived, false),
          isNotNull(StudyThreadEntries.scriptureReference),
        ),
      );
    return rows.flatMap((row) => (row.reference ? [row.reference] : []));
  } catch (error) {
    if (isStudyThreadEntriesTableMissing(error)) return [];
    throw error;
  }
}

export async function loadSpaceBibleCoverage(spaceId: string): Promise<BibleCoverage> {
  const [noteRows, references] = await Promise.all([
    db
      .select({ id: Notes.id, title: Notes.title, content: Notes.content, createdAt: Notes.createdAt })
      .from(Notes)
      .where(scriptureIndexNoteFilter(spaceId)),
    sharedHighlightReferences(spaceId),
  ]);

  const index = buildSpaceScriptureIndex(
    noteRows.map((note) => ({
      id: note.id,
      title: note.title ?? null,
      content: note.content ?? null,
      updatedAt: null,
      createdAt: String(note.createdAt),
    })),
  );
  // One citing-note entry per (note, chapter): several notes on a chapter is how the room's
  // map deepens, the way several of your own notes deepen yours.
  const cited: (ChapterRef & { noteId: string })[] = index.books.flatMap((book) =>
    book.passages.flatMap((passage) =>
      passage.notes.map((note) => ({ book: book.title, chapter: passage.chapter, noteId: note.id })),
    ),
  );
  const highlighted = references.flatMap((reference) => chaptersForReference(reference));

  return buildBibleCoverage({ read: [], cited, highlighted, depth: [] });
}
