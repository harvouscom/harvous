/**
 * Aggregate detected scripture references across all notes in a space (prototype sidebar Scripture mode).
 * Mirrors native ScriptureBookListIndex shape for the web SPA.
 */

import bibleChaptersData from '../../src/data/bible-chapters.json';
import {
  detectScriptureReferences,
  normalizeScriptureReference,
  parseScriptureReference,
} from '@/utils/scripture-detector';

type BibleChapterRow = { book: string };

export type ScriptureIndexNoteRow = {
  id: string;
  title: string | null;
  content: string | null;
  updatedAt: string | null;
  createdAt: string;
};

export type ScriptureIndexNoteBrief = {
  id: string;
  title: string | null;
  updatedAt: string | null;
  createdAt: string;
};

export type ScriptureIndexPassage = {
  passageKey: string;
  displayRef: string;
  bookOrder: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  referenceCount: number;
  noteCount: number;
  notes: ScriptureIndexNoteBrief[];
};

export type ScriptureIndexBook = {
  bookOrder: number;
  title: string;
  referenceCount: number;
  noteCount: number;
  passages: ScriptureIndexPassage[];
};

export type SpaceScriptureIndexPayload = {
  books: ScriptureIndexBook[];
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** TipTap / legacy HTML stores refs on pill spans; stripping tags can lose them if display text differs. */
function extractDataScriptureReferences(html: string): string[] {
  const out: string[] = [];
  const re = /data-scripture-reference\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const v = m[1]?.trim();
    if (v) out.push(v);
  }
  return out;
}

/** Canonical book order: first-seen index in bible-chapters.json (matches native ordering intent). */
export function canonicalBookOrderMap(): Map<string, number> {
  const data = bibleChaptersData as BibleChapterRow[];
  const m = new Map<string, number>();
  let i = 0;
  for (const row of data) {
    if (!m.has(row.book)) {
      m.set(row.book, i++);
    }
  }
  /*
   * Legacy tolerance, no longer a workaround. Both canons now say "Song of Solomon", but an
   * older native build's tag suggester said "Song of Songs", so a thread or tag name written
   * on that build can still arrive carrying it. Without the alias such a reference sorts to
   * the end of the canon instead of between Ecclesiastes and Isaiah.
   */
  const song = m.get('Song of Solomon');
  if (song !== undefined && !m.has('Song of Songs')) {
    m.set('Song of Songs', song);
  }
  return m;
}

/** First canonical book label per book order (walks bible-chapters in canonical sequence). */
function bookOrderToTitle(): Map<number, string> {
  const data = bibleChaptersData as BibleChapterRow[];
  const orderMap = canonicalBookOrderMap();
  const m = new Map<number, string>();
  for (const row of data) {
    const ord = orderMap.get(row.book);
    if (ord === undefined) continue;
    if (!m.has(ord)) m.set(ord, row.book);
  }
  return m;
}

/** Stable passage key for grouping + sorting. */
function passageKey(bookOrder: number, chapter: number, verseStart: number, verseEnd: number): string {
  return `${bookOrder}:${chapter}:${verseStart}:${verseEnd}`;
}

function parsedFields(parsed: NonNullable<ReturnType<typeof parseScriptureReference>>): {
  chapter: number;
  verseStart: number;
  verseEnd: number;
} {
  const ch = parsed.chapter;
  const v = parsed.verse;
  if (Array.isArray(v)) {
    return { chapter: ch, verseStart: v[0], verseEnd: v[1] };
  }
  return { chapter: ch, verseStart: v, verseEnd: v };
}

export function buildSpaceScriptureIndex(notes: ScriptureIndexNoteRow[]): SpaceScriptureIndexPayload {
  const bookOrderMap = canonicalBookOrderMap();
  const orderTitles = bookOrderToTitle();

  type MutablePassage = {
    displayRef: string;
    bookOrder: number;
    chapter: number;
    verseStart: number;
    verseEnd: number;
    referenceCount: number;
    noteIds: Set<string>;
    notes: Map<string, ScriptureIndexNoteBrief>;
  };

  const passages = new Map<string, MutablePassage>();

  const resolvePassageRef = (
    refSource: string,
  ): { pKey: string; norm: string; bookOrder: number; chapter: number; verseStart: number; verseEnd: number } | null => {
    const norm = normalizeScriptureReference(refSource.trim()) ?? refSource.trim();
    const parsed = parseScriptureReference(norm);
    if (!parsed) return null;

    const bookOrder = bookOrderMap.get(parsed.book);
    if (bookOrder === undefined) return null;

    const { chapter, verseStart, verseEnd } = parsedFields(parsed);
    return { pKey: passageKey(bookOrder, chapter, verseStart, verseEnd), norm, bookOrder, chapter, verseStart, verseEnd };
  };

  const ingestPassageRef = (
    noteRow: ScriptureIndexNoteRow,
    resolved: NonNullable<ReturnType<typeof resolvePassageRef>>,
  ) => {
    const { pKey, norm, bookOrder, chapter, verseStart, verseEnd } = resolved;

    let m = passages.get(pKey);
    if (!m) {
      m = {
        displayRef: norm,
        bookOrder,
        chapter,
        verseStart,
        verseEnd,
        referenceCount: 0,
        noteIds: new Set(),
        notes: new Map(),
      };
      passages.set(pKey, m);
    }
    m.referenceCount += 1;
    if (!m.noteIds.has(noteRow.id)) {
      m.noteIds.add(noteRow.id);
      m.notes.set(noteRow.id, {
        id: noteRow.id,
        title: noteRow.title,
        updatedAt: noteRow.updatedAt,
        createdAt: noteRow.createdAt,
      });
    }
  };

  for (const note of notes) {
    const raw = note.content ?? '';
    const plain = stripHtml(raw);
    const detected = detectScriptureReferences(plain);
    const uniquePassages = new Map<string, NonNullable<ReturnType<typeof resolvePassageRef>>>();

    for (const ref of detected) {
      const resolved = resolvePassageRef(ref.reference);
      if (resolved) uniquePassages.set(resolved.pKey, resolved);
    }

    for (const attrRef of extractDataScriptureReferences(raw)) {
      const resolved = resolvePassageRef(attrRef);
      if (resolved) uniquePassages.set(resolved.pKey, resolved);
    }

    for (const resolved of uniquePassages.values()) {
      ingestPassageRef(note, resolved);
    }
  }

  const bookMap = new Map<
    number,
    {
      referenceCount: number;
      noteIds: Set<string>;
      passageList: ScriptureIndexPassage[];
    }
  >();

  const sortedPassageEntries = [...passages.entries()].sort(([, a], [, b]) => {
    if (a.bookOrder !== b.bookOrder) return a.bookOrder - b.bookOrder;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    if (a.verseStart !== b.verseStart) return a.verseStart - b.verseStart;
    return a.verseEnd - b.verseEnd;
  });

  for (const [pKey, m] of sortedPassageEntries) {
    const noteArr = [...m.notes.values()].sort((x, y) => {
      const ax = x.updatedAt || x.createdAt;
      const ay = y.updatedAt || y.createdAt;
      return ay.localeCompare(ax);
    });

    let bucket = bookMap.get(m.bookOrder);
    if (!bucket) {
      bucket = { referenceCount: 0, noteIds: new Set(), passageList: [] };
      bookMap.set(m.bookOrder, bucket);
    }
    bucket.referenceCount += m.referenceCount;
    for (const id of m.noteIds) {
      bucket.noteIds.add(id);
    }
    bucket.passageList.push({
      passageKey: pKey,
      displayRef: m.displayRef,
      bookOrder: m.bookOrder,
      chapter: m.chapter,
      verseStart: m.verseStart,
      verseEnd: m.verseEnd,
      referenceCount: m.referenceCount,
      noteCount: m.noteIds.size,
      notes: noteArr,
    });
  }

  const books: ScriptureIndexBook[] = [...bookMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bookOrder, bucket]) => ({
      bookOrder,
      title: orderTitles.get(bookOrder) ?? 'Scripture',
      referenceCount: bucket.referenceCount,
      noteCount: bucket.noteIds.size,
      passages: bucket.passageList,
    }));

  return { books };
}
