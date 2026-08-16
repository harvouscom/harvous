/**
 * The reader's margin bars, from the space's scripture index — the offline path.
 *
 * Online, the bars come from `/api/scripture/chapter-notes`, which reads `ScriptureMetadata`
 * by chapter. On a plane that call fails and the margin goes blank, which the reader cannot
 * do: reading is the one thing that has to survive without a network. The space scripture
 * index is already mirrored into IndexedDB (`offline-scripture-index.ts`) and refreshed
 * whenever a note changes, so this bridges its shape to the anchor shape the bars draw.
 *
 * Whole-space rather than per-chapter on purpose: a per-chapter cache is only warm where you
 * have already been, and a reader offline is exactly the person opening a chapter they have
 * not visited yet.
 *
 * One shape difference needs care, confirmed against the index builder: a cross-chapter range
 * ("Romans 8:20-9:10") is flattened to verseStart/verseEnd and its end chapter dropped, so it
 * arrives with the pair INVERTED (20, 10). That is anchored from verseStart to the end of its
 * own chapter, which keeps the note visible where it starts; the tail chapter cannot be
 * recovered from the index as stored, so those verses go un-marked rather than mis-marked.
 * The live endpoint carries `chapterEnd` for the same case; here it is null, and the bar
 * still runs to the chapter's end.
 */

import { getChapterVerseRange } from './scripture-detector';
import { canonicalBookOrderMap } from './scripture-passage-drill';

/** The subset of the mirrored index this needs — matches `ScriptureIndexBook` on the wire. */
export type IndexedNoteLike = {
  id: string;
  title: string | null;
  updatedAt: string | null;
  createdAt?: string;
};

export type IndexedPassageLike = {
  displayRef: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  notes?: IndexedNoteLike[];
};

export type IndexedBookLike = {
  bookOrder: number;
  passages: IndexedPassageLike[];
};

/** Mirrors `ChapterNoteAnchor` in `usePrototypeChapterNotes` — one row per note per passage. */
export type ChapterAnchorLike = {
  noteId: string;
  reference: string;
  verse: number;
  verseEnd: number | null;
  chapterEnd: number | null;
  title: string | null;
  updatedAt: string | null;
};

export function chapterAnchorsFromScriptureIndex(
  books: readonly IndexedBookLike[] | null | undefined,
  book: string,
  chapter: number,
): ChapterAnchorLike[] {
  if (!books?.length || !book || !Number.isFinite(chapter)) return [];

  const bookOrder = canonicalBookOrderMap().get(book.trim());
  if (bookOrder === undefined) return [];

  const chapterRange = getChapterVerseRange(book.trim(), chapter);
  const out: ChapterAnchorLike[] = [];

  for (const indexed of books) {
    if (indexed.bookOrder !== bookOrder) continue;
    for (const passage of indexed.passages) {
      if (passage.chapter !== chapter || !passage.notes?.length) continue;

      const verse = Math.max(1, Math.floor(passage.verseStart));
      const rawEnd = Math.floor(passage.verseEnd);
      // The flattened cross-chapter case: run to the end of this chapter.
      const end = rawEnd < verse ? (chapterRange?.end ?? verse) : rawEnd;
      const verseEnd = end > verse ? end : null;

      for (const note of passage.notes) {
        out.push({
          noteId: note.id,
          reference: passage.displayRef,
          verse,
          verseEnd,
          chapterEnd: null,
          title: note.title,
          updatedAt: note.updatedAt,
        });
      }
    }
  }
  return out;
}
