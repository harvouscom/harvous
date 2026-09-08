/**
 * Turn raw event rows into study-feed moments.
 *
 * Pure, so the shape of the feed can be tested without a database — the same reason
 * `collapseReadingHistory` sits beside its route rather than inside it.
 *
 * Collapsing is the whole job here. The logs these read from are honest about every save and
 * every open, which is right for a log and wrong for a feed: eleven autosaves of one
 * paragraph are one act of writing, and a chapter opened four times while working through it
 * is one reading. What the reader should see is the act, not its telemetry.
 *
 * Every function expects rows newest-first, matching the queries' `order by createdAt desc`.
 */

import { stripHtmlForPreview } from '@/utils/html-stripper';
import {
  isReadingDwellBucket,
  readingDwellStrength,
  type ReadingDwellBucket,
} from '@/utils/reading-event-kinds';
import type {
  StudyFeedHighlightItem,
  StudyFeedNoteItem,
  StudyFeedReadingItem,
  StudyFeedRevisitItem,
} from '@/utils/study-feed-items';

/**
 * How long a pause can be before a burst of saves counts as coming back to a note.
 *
 * Longer than the 45 minutes that separates two sittings in the feed's clustering, and
 * deliberately so: these are two different questions. Clustering asks whether two moments
 * belong side by side; this asks whether a run of autosaves is one act of writing. Sitting
 * with a note for an hour and a half, saving throughout, is still writing it once.
 */
export const NOTE_SAVE_BURST_GAP_MS = 90 * 60 * 1000;

/** Reading and revisiting collapse on the feed's own sitting gap — see study-feed-items.ts. */
export const EVENT_SESSION_GAP_MS = 45 * 60 * 1000;

const SNIPPET_MAX = 200;

function toISO(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function bucketStamp(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Plain text for a card, from note HTML.
 *
 * Scripture pills strip to their reference text, which is what `stripHtml` already does —
 * a snippet reading "Romans 8:1 changed how I read failure" is the sentence the person
 * wrote, and dropping the reference would leave a hole in it.
 */
export function studyFeedSnippet(content: string | null | undefined): string {
  if (!content) return '';
  return stripHtmlForPreview(content, SNIPPET_MAX);
}

export interface NoteRowForFeed {
  id: string;
  title: string | null;
  content: string | null;
  noteType?: string | null;
  primaryCollection?: string | null;
  createdAt: string | Date | null;
}

/** `Notes` rows → one `note-created` moment each. */
export function buildNoteCreatedItems(rows: NoteRowForFeed[]): StudyFeedNoteItem[] {
  const items: StudyFeedNoteItem[] = [];
  for (const row of rows) {
    const at = toISO(row.createdAt);
    if (!at || !row.id) continue;
    items.push({
      id: `note-created:${row.id}`,
      kind: 'note-created',
      at,
      noteId: row.id,
      title: row.title ?? null,
      noteType: row.noteType ?? null,
      folder: row.primaryCollection ?? null,
      snippet: studyFeedSnippet(row.content),
      scriptureRefs: [],
    });
  }
  return items;
}

export interface NoteVersionRowForFeed {
  noteId: string;
  createdAt: string | Date | null;
  title: string | null;
  content: string | null;
}

/**
 * `NoteVersions` rows → one `note-updated` moment per writing session.
 *
 * The newest row in a burst supplies the title and snippet: it is what the note said when
 * the person stopped, which is the version they would recognise.
 *
 * `noteCreatedAt` suppresses the burst that *is* the note being written — otherwise every
 * new note arrives twice, once as "wrote this" and once as "edited this", a minute apart.
 */
export function buildNoteUpdatedItems(
  rows: NoteVersionRowForFeed[],
  noteCreatedAt: Map<string, string>,
): StudyFeedNoteItem[] {
  const byNote = new Map<string, NoteVersionRowForFeed[]>();
  for (const row of rows) {
    if (!row.noteId || !toISO(row.createdAt)) continue;
    const list = byNote.get(row.noteId);
    if (list) list.push(row);
    else byNote.set(row.noteId, [row]);
  }

  const items: StudyFeedNoteItem[] = [];
  for (const [noteId, noteRows] of byNote) {
    let burst: NoteVersionRowForFeed[] = [];

    const flush = () => {
      if (burst.length === 0) return;
      const newest = burst[0];
      const oldest = burst[burst.length - 1];
      const at = toISO(newest.createdAt)!;
      const startAt = toISO(oldest.createdAt)!;

      // A burst that begins at (or before) the note's creation is the note being written.
      const created = noteCreatedAt.get(noteId);
      if (created && bucketStamp(startAt) <= bucketStamp(created) + NOTE_SAVE_BURST_GAP_MS) {
        burst = [];
        return;
      }

      items.push({
        id: `note-updated:${noteId}:${bucketStamp(startAt)}`,
        kind: 'note-updated',
        at,
        startAt: startAt === at ? undefined : startAt,
        noteId,
        title: newest.title ?? null,
        snippet: studyFeedSnippet(newest.content),
        scriptureRefs: [],
        saveCount: burst.length,
      });
      burst = [];
    };

    for (const row of noteRows) {
      if (burst.length === 0) {
        burst.push(row);
        continue;
      }
      const previous = bucketStamp(toISO(burst[burst.length - 1].createdAt)!);
      const current = bucketStamp(toISO(row.createdAt)!);
      if (previous - current <= NOTE_SAVE_BURST_GAP_MS) burst.push(row);
      else {
        flush();
        burst.push(row);
      }
    }
    flush();
  }

  return items;
}

export interface HighlightRowForFeed {
  id: string;
  parentNoteId: string | null;
  highlightAccentRaw: string;
  sourceSnippet: string;
  anchorQuote: string | null;
  scriptureReference: string | null;
  scripturePassageTranslation: string | null;
  scripturePassageExcerpt: string | null;
  createdAt: string | Date | null;
}

/**
 * `StudyThreadEntries` rows → one moment each. No collapsing: each highlight is a separate
 * deliberate act, and two highlights in one passage are two things somebody noticed.
 */
export function buildHighlightItems(
  rows: HighlightRowForFeed[],
  noteTitles: Map<string, string | null>,
): StudyFeedHighlightItem[] {
  const items: StudyFeedHighlightItem[] = [];
  for (const row of rows) {
    const at = toISO(row.createdAt);
    if (!at || !row.id) continue;

    const isScripture = !row.parentNoteId && !!row.scriptureReference;
    const excerpt = (
      isScripture
        ? row.scripturePassageExcerpt || row.sourceSnippet
        : row.anchorQuote || row.sourceSnippet
    )?.trim();
    if (!excerpt) continue;

    items.push({
      id: `highlight:${row.id}`,
      kind: isScripture ? 'highlight-scripture' : 'highlight-note',
      at,
      entryId: row.id,
      accent: row.highlightAccentRaw,
      excerpt,
      noteId: row.parentNoteId ?? undefined,
      noteTitle: row.parentNoteId ? (noteTitles.get(row.parentNoteId) ?? null) : undefined,
      reference: row.scriptureReference ?? undefined,
      translation: row.scripturePassageTranslation ?? undefined,
    });
  }
  return items;
}

export interface ReadingRowForFeed {
  book: string;
  bookOrder: number;
  chapter: number;
  translation: string;
  dwellBucket: string;
  createdAt: string | Date | null;
}

/**
 * `ReadingEvents` rows → one moment per book per sitting.
 *
 * Two passes, and the order of them is the whole point. Sittings are cut first, on time
 * alone; books are grouped second, inside each sitting. Grouping by book first — the obvious
 * way — quietly fails on how people actually read: an evening spent moving between Exodus
 * and Psalms interleaves the two books' rows, so no two rows of the same book are ever
 * adjacent, nothing collapses, and an hour of study arrives as a dozen separate lines. That
 * is the audit log this feed exists not to be.
 *
 * Sittings break on a gap rather than on a calendar day: the server does not know what day
 * it is where the reader is, and a sitting that runs past midnight is still one sitting. The
 * day it lands on is decided on the client, from the timestamp returned here.
 *
 * Chapters come back ascending, because a run through John 15–17 reads as a range rather
 * than as the reverse-chronological order the rows arrived in.
 */
export function buildReadingItems(rows: ReadingRowForFeed[]): StudyFeedReadingItem[] {
  const usable = rows.filter(
    // Glances are logged but say nothing about study — a mis-tap is not a reading.
    (row) => row.dwellBucket !== 'glance' && row.book && toISO(row.createdAt),
  );

  const sittings: ReadingRowForFeed[][] = [];
  let current: ReadingRowForFeed[] = [];
  for (const row of usable) {
    if (current.length === 0) {
      current = [row];
      continue;
    }
    const previous = bucketStamp(toISO(current[current.length - 1].createdAt)!);
    if (previous - bucketStamp(toISO(row.createdAt)!) <= EVENT_SESSION_GAP_MS) current.push(row);
    else {
      sittings.push(current);
      current = [row];
    }
  }
  if (current.length > 0) sittings.push(current);

  const items: StudyFeedReadingItem[] = [];
  for (const sitting of sittings) {
    const byBook = new Map<number, ReadingRowForFeed[]>();
    for (const row of sitting) {
      const list = byBook.get(row.bookOrder);
      if (list) list.push(row);
      else byBook.set(row.bookOrder, [row]);
    }

    for (const bookRows of byBook.values()) {
      const newest = bookRows[0];
      const oldest = bookRows[bookRows.length - 1];
      const at = toISO(newest.createdAt)!;
      const startAt = toISO(oldest.createdAt)!;
      const chapters = [...new Set(bookRows.map((r) => r.chapter))].sort((a, b) => a - b);
      const strongest = bookRows.reduce<ReadingDwellBucket>((best, row) => {
        if (!isReadingDwellBucket(row.dwellBucket)) return best;
        return readingDwellStrength(row.dwellBucket) > readingDwellStrength(best)
          ? row.dwellBucket
          : best;
      }, 'read');

      items.push({
        id: `passage-read:${newest.bookOrder}:${bucketStamp(startAt)}`,
        kind: 'passage-read',
        at,
        startAt: startAt === at ? undefined : startAt,
        book: newest.book,
        bookOrder: newest.bookOrder,
        chapters,
        translation: newest.translation,
        dwellBucket: strongest === 'study' ? 'study' : 'read',
      });
    }
  }

  return items;
}

export interface VisitRowForFeed {
  noteId: string;
  dwellBucket: string;
  createdAt: string | Date | null;
}

export interface NoteUpdateSpan {
  noteId: string;
  startMs: number;
  endMs: number;
}

/**
 * `NoteVisitEvents` rows → one `note-revisited` moment per return.
 *
 * Only `study` visits earn a place — a 90-second sit, per `note-visit-kinds.ts`. The weaker
 * `read` bucket starts at twelve seconds, which is the length of finding a note rather than
 * reading it, and admitting it filled a morning with six near-identical "you returned to…"
 * lines stamped the same minute. Returning to something is worth recording; passing through
 * it on the way somewhere else is the navigation telemetry this feed is meant to leave out.
 *
 * Two further suppressions stop the feed saying one thing twice. Glances never count, a bar
 * every other aggregate honours. And a visit overlapping a writing session is dropped: the
 * note is already there as "you wrote in this", and "you also read it" adds only a line.
 */
export function buildRevisitItems(
  rows: VisitRowForFeed[],
  updateSpans: NoteUpdateSpan[],
): StudyFeedRevisitItem[] {
  const spansByNote = new Map<string, NoteUpdateSpan[]>();
  for (const span of updateSpans) {
    const list = spansByNote.get(span.noteId);
    if (list) list.push(span);
    else spansByNote.set(span.noteId, [span]);
  }

  const byNote = new Map<string, VisitRowForFeed[]>();
  for (const row of rows) {
    if (row.dwellBucket !== 'study') continue;
    if (!row.noteId || !toISO(row.createdAt)) continue;
    const list = byNote.get(row.noteId);
    if (list) list.push(row);
    else byNote.set(row.noteId, [row]);
  }

  const items: StudyFeedRevisitItem[] = [];
  for (const [noteId, visits] of byNote) {
    const spans = spansByNote.get(noteId) ?? [];
    let bucket: VisitRowForFeed[] = [];

    const flush = () => {
      if (bucket.length === 0) return;
      const at = toISO(bucket[0].createdAt)!;
      const startAt = toISO(bucket[bucket.length - 1].createdAt)!;
      const startMs = bucketStamp(startAt);
      const endMs = bucketStamp(at);

      const overlapsWriting = spans.some(
        (span) => startMs <= span.endMs && endMs >= span.startMs,
      );
      if (overlapsWriting) {
        bucket = [];
        return;
      }

      items.push({
        id: `note-revisited:${noteId}:${startMs}`,
        kind: 'note-revisited',
        at,
        startAt: startAt === at ? undefined : startAt,
        noteId,
        title: null,
        visitCount: bucket.length,
        noteType: null,
        folder: null,
      });
      bucket = [];
    };

    for (const row of visits) {
      if (bucket.length === 0) {
        bucket.push(row);
        continue;
      }
      const previous = bucketStamp(toISO(bucket[bucket.length - 1].createdAt)!);
      const current = bucketStamp(toISO(row.createdAt)!);
      if (previous - current <= EVENT_SESSION_GAP_MS) bucket.push(row);
      else {
        flush();
        bucket.push(row);
      }
    }
    flush();
  }

  return items;
}
