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
  or,
  sql,
} from '../db';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import { getChapterVerseRange, getBookChapterCount } from '@/utils/scripture-detector';
import { isStudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import { materializeReaderHighlight } from '../utils/reader-passage-note';
import { getTranslation } from '@/data/translations';
import {
  buildReaderChapterStudy,
  canonicalizeReaderBook,
  chapterReferenceLikePatterns,
  type ReaderHighlightRow,
  type ReaderPassageRow,
} from '../utils/reader-chapter';

const app = new Hono();

const DEFAULT_TRANSLATION = 'NET';

type ResolvedBookChapter =
  | { ok: false; message: string; code: string }
  | { ok: true; book: string; chapter: number; chapterCount: number | null };

/** Resolve a book/chapter pair from request input, or the error to return for it. */
function resolveBookChapter(rawBook: string, rawChapter: unknown): ResolvedBookChapter {
  const book = canonicalizeReaderBook(rawBook);
  if (!book) return { ok: false, message: 'Unknown book', code: 'INVALID_BOOK' };
  const chapter = typeof rawChapter === 'number' ? rawChapter : Number.parseInt(String(rawChapter ?? ''), 10);
  const chapterCount = getBookChapterCount(book);
  if (!Number.isFinite(chapter) || chapter < 1 || (chapterCount != null && chapter > chapterCount)) {
    return { ok: false, message: 'Chapter out of range', code: 'INVALID_CHAPTER' };
  }
  return { ok: true, book, chapter, chapterCount };
}

app.get('/api/reader/chapter', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const rawBook = c.req.query('book')?.trim() || '';
    const chapter = Number.parseInt(c.req.query('chapter') ?? '', 10);
    const rawTranslation = c.req.query('translation')?.trim() || DEFAULT_TRANSLATION;

    const resolved = resolveBookChapter(rawBook, chapter);
    if (!resolved.ok) return c.json({ error: resolved.message, code: resolved.code }, 400);
    const { book, chapterCount } = resolved;

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
          or(
            ...chapterReferenceLikePatterns(book, chapter).map((pattern) =>
              like(StudyThreadEntries.scriptureReference, pattern),
            ),
          ),
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

/**
 * Highlight a verse span from the reader.
 *
 * The highlight lands on the chapter's passage note, which is created on the first
 * highlight in that chapter. Keeping it attached to a note is what lets it export and
 * re-import like any other highlight.
 */
app.post('/api/reader/highlight', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'A JSON body is required', code: 'INVALID_BODY' }, 400);
    }

    const resolved = resolveBookChapter(String(body.book ?? '').trim(), body.chapter);
    if (!resolved.ok) return c.json({ error: resolved.message, code: resolved.code }, 400);
    const { book, chapter } = resolved;

    const chapterVerses = getChapterVerseRange(book, chapter);
    const lastVerse = chapterVerses?.end ?? 0;
    const verseStart = Number.parseInt(String(body.verseStart ?? ''), 10);
    if (!Number.isFinite(verseStart) || verseStart < 1 || (lastVerse > 0 && verseStart > lastVerse)) {
      return c.json({ error: 'Verse out of range', code: 'INVALID_VERSE' }, 400);
    }

    let verseEnd: number | null = null;
    if (body.verseEnd != null && String(body.verseEnd).trim() !== '') {
      const parsed = Number.parseInt(String(body.verseEnd), 10);
      if (!Number.isFinite(parsed) || parsed < verseStart || (lastVerse > 0 && parsed > lastVerse)) {
        return c.json({ error: 'Verse range out of range', code: 'INVALID_VERSE_RANGE' }, 400);
      }
      verseEnd = parsed > verseStart ? parsed : null;
    }

    const rawTranslation = String(body.translation ?? '').trim() || DEFAULT_TRANSLATION;
    const translation = getTranslation(rawTranslation) ? rawTranslation : DEFAULT_TRANSLATION;

    const rawAccent = String(body.accent ?? '').trim();
    const accent = isStudyHighlightAccentKey(rawAccent) ? rawAccent : 'warmAmber';

    const annotation = typeof body.annotation === 'string' ? body.annotation : null;

    const result = await materializeReaderHighlight(auth.userId, {
      book,
      chapter,
      verseStart,
      verseEnd,
      translation,
      accent,
      annotation,
    });

    return c.json({ success: true, ...result }, 201);
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/reader/highlight',
      action: 'reader_highlight',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
