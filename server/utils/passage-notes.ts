/**
 * "Everything I've written on this passage" — pure helpers for passage history.
 *
 * `ScriptureMetadata` is the passage→note index (one row per reference in a
 * note). The passage-context strip already lists a few "Same passage" notes,
 * but capped at five, unordered, and mixed with theme and cross-reference
 * matches. This answers the narrower question exactly: which of my notes cite
 * a verse inside this range, newest first. A pastor's "when week 40 needs
 * week 3", and anyone's second pass through Romans 8.
 */

/** A range on one book: chapter:verse to chapter:verse, inclusive. */
export type PassageSpan = {
  book: string;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
};

/** From `parseScriptureReference`'s shape. */
export function passageSpanFromParsed(parsed: {
  book: string;
  chapter: number;
  verse: number | [number, number];
  endChapter?: number;
}): PassageSpan {
  const [startVerse, endVerse] = Array.isArray(parsed.verse) ? parsed.verse : [parsed.verse, parsed.verse];
  return {
    book: parsed.book,
    startChapter: parsed.chapter,
    startVerse,
    endChapter: parsed.endChapter ?? parsed.chapter,
    endVerse,
  };
}

/** A metadata row as a span. A missing verse means the whole chapter. */
export function passageSpanFromMetadata(row: {
  book: string;
  chapter: number;
  verse: number | null;
  verseEnd: number | null;
  chapterEnd: number | null;
}): PassageSpan {
  const startVerse = row.verse ?? 1;
  const endChapter = row.chapterEnd ?? row.chapter;
  const endVerse = row.verse == null ? Number.MAX_SAFE_INTEGER : (row.verseEnd ?? row.verse);
  return { book: row.book, startChapter: row.chapter, startVerse, endChapter, endVerse };
}

const position = (chapter: number, verse: number) => chapter * 100_000 + verse;

/** Do two spans share at least one verse? */
export function passageSpansOverlap(a: PassageSpan, b: PassageSpan): boolean {
  if (a.book !== b.book) return false;
  return (
    position(a.startChapter, a.startVerse) <= position(b.endChapter, b.endVerse) &&
    position(b.startChapter, b.startVerse) <= position(a.endChapter, a.endVerse)
  );
}

export type PassageNoteRow = {
  noteId: string;
  title: string | null;
  reference: string;
  createdAt: Date | string | null;
  book: string;
  chapter: number;
  verse: number | null;
  verseEnd: number | null;
  chapterEnd: number | null;
};

export type PassageNote = {
  noteId: string;
  title: string | null;
  /** The reference as this note wrote it — "Romans 8:28", not the query. */
  reference: string;
  createdAt: string | null;
};

/**
 * One entry per note that touches the span, newest first. A note citing the
 * passage twice appears once, under the first overlapping reference.
 */
export function selectPassageNotes(
  span: PassageSpan,
  rows: readonly PassageNoteRow[],
  excludeNoteId?: string | null,
): PassageNote[] {
  const byNote = new Map<string, PassageNote & { sortKey: number }>();
  for (const row of rows) {
    if (excludeNoteId && row.noteId === excludeNoteId) continue;
    if (byNote.has(row.noteId)) continue;
    if (!passageSpansOverlap(span, passageSpanFromMetadata(row))) continue;
    const created = row.createdAt ? new Date(row.createdAt) : null;
    byNote.set(row.noteId, {
      noteId: row.noteId,
      title: row.title,
      reference: row.reference,
      createdAt: created ? created.toISOString() : null,
      sortKey: created ? created.getTime() : 0,
    });
  }
  return [...byNote.values()]
    .sort((a, b) => b.sortKey - a.sortKey || a.noteId.localeCompare(b.noteId))
    .map(({ sortKey: _sortKey, ...note }) => note);
}
