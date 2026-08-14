/**
 * Reader routes — a passage-shaped view over the user's own study material.
 *
 * Endpoints:
 *   GET /api/reader/chapter
 *
 * The reader is a lens, not a store: it reads `BibleVerses` for the text and projects
 * the user's existing notes (`ScriptureMetadata`) and highlights
 * (`StudyThreadEntries.scriptureReference`) onto the verses they cite. Nothing is
 * written here.
 */
import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import {
  db,
  BibleVerses,
  Notes,
  ScriptureMetadata,
  StudyThreadEntries,
  eq,
  and,
  asc,
  like,
  lte,
  sql,
} from '../db';
import { handleAPIError } from '@/utils/error-handling';
import { getChapterVerseRange, getBookChapterCount } from '@/utils/scripture-detector';
import { getTranslation } from '@/data/translations';
import {
  buildReaderChapterStudy,
  canonicalizeReaderBook,
  chapterReferenceLikePattern,
  type ReaderHighlightRow,
  type ReaderPassageRow,
} from '../utils/reader-chapter';

const app = new Hono();

const DEFAULT_TRANSLATION = 'NET';

app.get('/api/reader/chapter', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const rawBook = c.req.query('book')?.trim() || '';
    const chapter = Number.parseInt(c.req.query('chapter') ?? '', 10);
    const rawTranslation = c.req.query('translation')?.trim() || DEFAULT_TRANSLATION;

    const book = canonicalizeReaderBook(rawBook);
    if (!book) return c.json({ error: 'Unknown book', code: 'INVALID_BOOK' }, 400);

    const chapterCount = getBookChapterCount(book);
    if (!Number.isFinite(chapter) || chapter < 1 || (chapterCount != null && chapter > chapterCount)) {
      return c.json({ error: 'Chapter out of range', code: 'INVALID_CHAPTER' }, 400);
    }

    // Only known translations reach the query — the column is free text otherwise.
    const translation = getTranslation(rawTranslation) ? rawTranslation : DEFAULT_TRANSLATION;

    const maxVerse = getChapterVerseRange(book, chapter)?.end ?? 0;

    const verseRows = await db
      .select({ verse: BibleVerses.verse, text: BibleVerses.text })
      .from(BibleVerses)
      .where(
        and(
          eq(BibleVerses.translationId, translation),
          eq(BibleVerses.book, book),
          eq(BibleVerses.chapter, chapter),
        ),
      )
      .orderBy(asc(BibleVerses.verse));

    // Notes citing this chapter. A row may span a verse range and cross chapters, so
    // match anything whose span contains the requested chapter and slice it per verse later.
    const passageRows = await db
      .select({
        noteId: ScriptureMetadata.noteId,
        noteTitle: Notes.title,
        reference: ScriptureMetadata.reference,
        chapter: ScriptureMetadata.chapter,
        verse: ScriptureMetadata.verse,
        verseEnd: ScriptureMetadata.verseEnd,
        chapterEnd: ScriptureMetadata.chapterEnd,
      })
      .from(ScriptureMetadata)
      .innerJoin(Notes, eq(Notes.id, ScriptureMetadata.noteId))
      .where(
        and(
          eq(Notes.userId, auth.userId),
          eq(ScriptureMetadata.book, book),
          lte(ScriptureMetadata.chapter, chapter),
          sql`coalesce(${ScriptureMetadata.chapterEnd}, ${ScriptureMetadata.chapter}) >= ${chapter}`,
        ),
      );

    // Highlights carry only a normalized reference string, so narrow by prefix in SQL and
    // expand to verses in the projection.
    const highlightRows = await db
      .select({
        id: StudyThreadEntries.id,
        parentNoteId: StudyThreadEntries.parentNoteId,
        parentNoteTitle: Notes.title,
        scriptureReference: StudyThreadEntries.scriptureReference,
        highlightAccentRaw: StudyThreadEntries.highlightAccentRaw,
        entryKindRaw: StudyThreadEntries.entryKindRaw,
        scripturePassageExcerpt: StudyThreadEntries.scripturePassageExcerpt,
      })
      .from(StudyThreadEntries)
      .leftJoin(Notes, eq(Notes.id, StudyThreadEntries.parentNoteId))
      .where(
        and(
          eq(StudyThreadEntries.userId, auth.userId),
          eq(StudyThreadEntries.isArchived, false),
          like(StudyThreadEntries.scriptureReference, chapterReferenceLikePattern(book, chapter)),
        ),
      );

    const study = buildReaderChapterStudy({
      book,
      chapter,
      maxVerse: maxVerse || verseRows.length,
      passages: passageRows as ReaderPassageRow[],
      highlights: highlightRows as ReaderHighlightRow[],
    });

    const noteIds = new Set<string>();
    let highlightCount = 0;
    for (const slot of Object.values(study)) {
      slot.notes.forEach((n) => noteIds.add(n.noteId));
      highlightCount += slot.highlights.length;
    }

    return c.json({
      success: true,
      book,
      chapter,
      chapterCount,
      translation,
      verses: verseRows,
      study,
      counts: { notes: noteIds.size, highlights: highlightCount },
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/reader/chapter',
      action: 'reader_chapter',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
