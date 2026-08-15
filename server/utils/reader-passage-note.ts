/**
 * Reader write path — a highlight made while reading materializes into a note.
 *
 * A highlight made against a passage has no user-authored note to live inside. Rather
 * than detaching it (`parentNoteId` would have to go nullable, and the portable format
 * has nowhere to serialize a note-less highlight, so exports would silently drop it), the
 * reader finds or creates one lightweight scripture note per chapter and hangs the
 * highlight off that.
 *
 * That keeps the notes layer primary — a verse you marked while reading shows up in your
 * notes like anything else — and means the highlight round-trips through the export and
 * import path already used by every other highlight, with no format change. See
 * src/utils/__tests__/reader-highlight-roundtrip.test.ts.
 */
import {
  db,
  first,
  BibleVerses,
  Notes,
  ScriptureMetadata,
  StudyThreadEntries,
  UserMetadata,
  eq,
  and,
  asc,
  desc,
  gte,
  lte,
  isNotNull,
} from '../db';
import { nowISO } from '../db/dates';
import { generateNoteId, generateStudyThreadEntryId } from '@/utils/ids';
import { getChapterVerseRange } from '@/utils/scripture-detector';
import { createInitialNoteVersion, updateCanonicalNoteInTransaction } from './note-version-service';

/** Provenance marker on notes the reader created, distinguishing them for find-or-create. */
export const READER_NOTE_ADDED_BY = 'reader';

export interface ReaderHighlightInput {
  /** Canonical book name, already validated by the caller. */
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number | null;
  translation: string;
  accent: string;
  /** Optional note the user typed alongside the highlight. */
  annotation?: string | null;
}

export interface ReaderHighlightResult {
  noteId: string;
  studyThreadId: string;
  reference: string;
  /** True when this highlight brought the passage note into existence. */
  createdNote: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Title for a chapter's passage note — `"John 3"`. */
export function readerPassageNoteTitle(book: string, chapter: number): string {
  return `${book} ${chapter}`;
}

/**
 * Reference string for a highlight, built from the canonical book name.
 *
 * Deliberately not passed through `normalizeScriptureReference`: that maps some books onto
 * an alias which is not the canonical spelling stored in `BibleVerses` and
 * `ScriptureMetadata` — `"Song of Solomon"` normalizes to `"Song of Songs"`. Storing the
 * alias would leave the highlight invisible to the reader's own chapter query, which
 * matches on the canonical name. The book arriving here is already canonical
 * (`canonicalizeReaderBook`), and `"<Book> <chapter>:<verse>"` is the normalized shape for
 * a verse or range anyway, so there is nothing left to normalize.
 */
export function readerHighlightReference(
  book: string,
  chapter: number,
  verseStart: number,
  verseEnd?: number | null,
): string {
  const span =
    verseEnd != null && verseEnd > verseStart ? `${verseStart}-${verseEnd}` : `${verseStart}`;
  return `${book} ${chapter}:${span}`;
}

/**
 * One highlighted verse span, rendered for the passage note's body.
 *
 * The mark carries `data-study-thread-id` so the editor paints it like any other
 * highlight, and the verse text sits inside it so the export's inline `==mark==` pass has
 * something to match.
 */
export function buildVerseHighlightHtml(input: {
  verseStart: number;
  verseEnd?: number | null;
  text: string;
  accent: string;
  studyThreadId: string;
}): string {
  const label =
    input.verseEnd != null && input.verseEnd > input.verseStart
      ? `${input.verseStart}-${input.verseEnd}`
      : `${input.verseStart}`;
  return (
    `<blockquote class="reader-passage-verse" data-verse="${escapeHtml(label)}">` +
    `<sup class="verse-num">${escapeHtml(label)}</sup> ` +
    `<mark data-color="${escapeHtml(input.accent)}" data-study-thread-id="${escapeHtml(input.studyThreadId)}">` +
    `${escapeHtml(input.text)}</mark>` +
    `</blockquote>`
  );
}

/** Append a highlight block to a passage note's body, keeping earlier ones intact. */
export function appendVerseHighlightHtml(existing: string, snippet: string): string {
  const body = (existing || '').trim();
  return body ? `${body}\n${snippet}` : snippet;
}

/**
 * Create the highlight, materializing the chapter's passage note when it is the first one.
 *
 * Runs in one transaction so a highlight can never end up without the note it belongs to.
 */
export async function materializeReaderHighlight(
  userId: string,
  input: ReaderHighlightInput,
): Promise<ReaderHighlightResult> {
  const now = nowISO();
  const chapterVerses = getChapterVerseRange(input.book, input.chapter);
  const maxVerse = chapterVerses?.end ?? input.verseStart;
  const verseEnd = input.verseEnd != null && input.verseEnd > input.verseStart ? input.verseEnd : null;
  const reference = readerHighlightReference(input.book, input.chapter, input.verseStart, verseEnd);
  const studyThreadId = generateStudyThreadEntryId();

  // Verse text for the excerpt and the note body. Read outside the transaction: shared
  // Scripture text, not user data.
  const verseRows = await db
    .select({ verse: BibleVerses.verse, text: BibleVerses.text })
    .from(BibleVerses)
    .where(
      and(
        eq(BibleVerses.translationId, input.translation),
        eq(BibleVerses.book, input.book),
        eq(BibleVerses.chapter, input.chapter),
        gte(BibleVerses.verse, input.verseStart),
        lte(BibleVerses.verse, verseEnd ?? input.verseStart),
      ),
    )
    .orderBy(asc(BibleVerses.verse));
  const excerpt = verseRows.map((r) => r.text).join(' ').trim();

  const snippet = buildVerseHighlightHtml({
    verseStart: input.verseStart,
    verseEnd,
    text: excerpt,
    accent: input.accent,
    studyThreadId,
  });

  return db.transaction(async (tx) => {
    // Take the per-user lock before looking for the chapter's note. Two highlights landing
    // in the same chapter at once would otherwise both find nothing and both create one,
    // leaving the chapter with two passage notes. Locking first makes find-or-create atomic
    // per user; the row is needed for simpleNoteId on the create path anyway.
    const metadata = first(
      await tx
        .select({ highestSimpleNoteId: UserMetadata.highestSimpleNoteId })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, userId))
        .for('update')
        .limit(1),
    );
    if (!metadata) throw new Error('User metadata missing while creating a reader passage note');

    // The reader keeps one note per chapter, identified by its provenance plus the
    // passage its metadata records.
    const existing = first(
      await tx
        .select({ id: Notes.id, content: Notes.content })
        .from(Notes)
        .innerJoin(ScriptureMetadata, eq(ScriptureMetadata.noteId, Notes.id))
        .where(
          and(
            eq(Notes.userId, userId),
            eq(Notes.addedBy, READER_NOTE_ADDED_BY),
            eq(ScriptureMetadata.book, input.book),
            eq(ScriptureMetadata.chapter, input.chapter),
          ),
        )
        .limit(1),
    );

    let noteId: string;
    let createdNote = false;

    if (existing) {
      noteId = existing.id;
      await updateCanonicalNoteInTransaction(tx, {
        noteId,
        actorId: userId,
        patch: (lockedNote) => ({
          content: appendVerseHighlightHtml(lockedNote.content, snippet),
          updatedAt: now,
        }),
        nextContent: (lockedNote) => ({
          title: lockedNote.title,
          content: appendVerseHighlightHtml(lockedNote.content, snippet),
          contentEncrypted: lockedNote.contentEncrypted,
        }),
        source: 'reader-highlight',
        now,
      });
    } else {
      createdNote = true;
      noteId = generateNoteId();
      const title = readerPassageNoteTitle(input.book, input.chapter);

      const latestNote = first(
        await tx
          .select({ simpleNoteId: Notes.simpleNoteId })
          .from(Notes)
          .where(and(eq(Notes.userId, userId), isNotNull(Notes.simpleNoteId)))
          .orderBy(desc(Notes.simpleNoteId))
          .limit(1),
      );
      const nextSimpleNoteId =
        Math.max(metadata.highestSimpleNoteId, latestNote?.simpleNoteId ?? 0) + 1;

      const note = first(
        await tx
          .insert(Notes)
          .values({
            id: noteId,
            title,
            content: snippet,
            threadId: 'thread_unorganized',
            spaceId: null,
            simpleNoteId: nextSimpleNoteId,
            noteType: 'scripture',
            userId,
            addedBy: READER_NOTE_ADDED_BY,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      )!;
      await createInitialNoteVersion(tx, {
        noteId: note.id,
        noteAuthorId: userId,
        content: {
          title: note.title,
          content: note.content,
          contentEncrypted: note.contentEncrypted,
        },
        createdAt: now,
        source: 'reader-highlight',
      });
      await tx
        .update(UserMetadata)
        .set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: now })
        .where(eq(UserMetadata.userId, userId));
      await tx.insert(ScriptureMetadata).values({
        id: `scripture_${note.id}_${crypto.randomUUID()}`,
        noteId: note.id,
        reference: `${input.book} ${input.chapter}`,
        book: input.book,
        chapter: input.chapter,
        verse: 1,
        verseEnd: maxVerse,
        chapterEnd: null,
        translation: input.translation,
        originalText: '',
        createdAt: now,
      });
    }

    // Read back the version the highlight is being anchored against.
    const currentVersionId =
      first(
        await tx.select({ currentVersionId: Notes.currentVersionId }).from(Notes).where(eq(Notes.id, noteId)).limit(1),
      )?.currentVersionId ?? null;

    const annotation = input.annotation?.trim() || '';
    await tx.insert(StudyThreadEntries).values({
      id: studyThreadId,
      userId,
      parentNoteId: noteId,
      spaceId: null,
      entryKindRaw: 'scriptureLink',
      highlightAccentRaw: input.accent,
      sourceSnippet: excerpt,
      focusTitle: reference,
      notesBody: '',
      miniNoteBody: annotation,
      linkedNoteId: null,
      linkedNoteTitle: null,
      // A passage highlight is anchored by its reference, not by an offset into prose —
      // the same shape the scripture-pill passage-highlight path produces.
      anchorLocation: null,
      anchorLength: null,
      anchorTextSnapshot: excerpt || null,
      noteVersionId: currentVersionId,
      scriptureReference: reference,
      scripturePassageTranslation: input.translation,
      scripturePassageExcerpt: excerpt || null,
      isArchived: false,
      highlightListEditedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { noteId, studyThreadId, reference, createdNote };
  });
}
