/**
 * Node identity for the reader's Study Bible layer.
 *
 * The curated scripture knowledge layer is shared terrain: topics, cross-references, people,
 * places, none of it keyed to anyone. This module names the things a *person's* study can be
 * about, so that every writer — a chapter read, a highlight, a link, a review answer — can
 * address the same node from whatever ids it happens to be holding.
 *
 * One rule: a node key is `${kind}:${id}`, and this file is the only place that builds one.
 * Eight key shapes already exist in this codebase for roughly these concepts (`Book|ch|v` in
 * scripture-knowledge, `bookOrder:ch:vs:ve` in the space index, `s:<hex>` for highlight spans,
 * a normalized display string on review items), and the reason the layer gets a ninth rather
 * than adopting one of them is that none of them spans kinds. A single column that has to hold
 * a note id, a verse, a topic slug and a sorted note pair needs its own namespaced form.
 *
 * Pure. No database, no network — the server writer and any client reader share it.
 */

import { verseKeyFromParts, type VerseKeyParts } from '@/utils/scripture-verse-keys';
import {
  getChapterVerseRange,
  normalizeScriptureReference,
  parseScriptureReference,
} from '@/utils/scripture-detector';

/**
 * What study can be about.
 *
 * `chapter` exists because reading is recorded per chapter and nothing finer — the reader
 * turns to Romans 8, not to Romans 8:28 — so a verse writer also touches the chapter above
 * it and the two granularities stay comparable. `connection` is a node rather than an edge
 * because the reader can be asked about the link itself ("why did you connect these?"),
 * which means it needs its own counts and its own review schedule.
 */
export const NODE_KINDS = [
  'note',
  'verse',
  'chapter',
  'theme',
  'person',
  'place',
  'thread',
  'connection',
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

export function isNodeKind(value: string): value is NodeKind {
  return (NODE_KINDS as readonly string[]).includes(value);
}

/**
 * The six kinds of attention, deliberately orthogonal.
 *
 * A signal increments exactly one counter, so a scorer can tell the difference between
 * having seen something and having done something about it. `exposure` is passive contact,
 * `revisit` is coming back on purpose, `connection` is linking it to something else,
 * `expansion` is writing more about it, `synthesis` is saying what the whole thing is, and
 * `review` is answering a question about it.
 */
export const NODE_SIGNALS = [
  'exposure',
  'revisit',
  'connection',
  'expansion',
  'synthesis',
  'review',
] as const;

export type NodeSignal = (typeof NODE_SIGNALS)[number];

export function isNodeSignal(value: string): value is NodeSignal {
  return (NODE_SIGNALS as readonly string[]).includes(value);
}

export type ChapterKeyParts = { book: string; chapter: number };

/** Sorted, so a link added from either end is one node — matching NoteConnections' unique pair. */
const sortedPair = (a: string, b: string): [string, string] => ([a, b].sort() as [string, string]);

export const nodeKey = {
  note: (noteId: string) => `note:${noteId}`,
  /** `verse:John|15|5` — the same inner shape scripture-knowledge already uses. */
  verse: (parts: VerseKeyParts) => `verse:${verseKeyFromParts(parts)}`,
  chapter: (parts: ChapterKeyParts) => `chapter:${parts.book}|${parts.chapter}`,
  /** Slug, never the label: labels are display text and change with the curation. */
  theme: (slug: string) => `theme:${slug}`,
  person: (slug: string) => `person:${slug}`,
  place: (slug: string) => `place:${slug}`,
  /** Keyed by the representative note the graph picked, as review items already are. */
  thread: (repNoteId: string) => `thread:${repNoteId}`,
  connection: (noteId: string, secondaryNoteId: string) => {
    const [a, b] = sortedPair(noteId, secondaryNoteId);
    return `connection:${a}|${b}`;
  },
} as const;

export type ParsedNodeKey = { kind: NodeKind; parts: string[] };

/** Split a key back into its kind and id parts. Returns null for anything this file did not build. */
export function parseNodeKey(key: string): ParsedNodeKey | null {
  const separator = key.indexOf(':');
  if (separator <= 0) return null;
  const kind = key.slice(0, separator);
  const rest = key.slice(separator + 1);
  if (!isNodeKind(kind) || !rest) return null;
  return { kind, parts: rest.split('|') };
}

/** The `{book, chapter, verse}` behind a `verse:` key, or null if it is not one. */
export function verseKeyPartsFromNodeKey(key: string): VerseKeyParts | null {
  const parsed = parseNodeKey(key);
  if (!parsed || parsed.kind !== 'verse' || parsed.parts.length !== 3) return null;
  const chapter = Number(parsed.parts[1]);
  const verse = Number(parsed.parts[2]);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
  return { book: parsed.parts[0], chapter, verse };
}

/** The chapter a verse sits in. Every verse touch emits this too, so reading and marking compare. */
export function chapterKeyForVerse(parts: VerseKeyParts): string {
  return nodeKey.chapter({ book: parts.book, chapter: parts.chapter });
}

/** "John 15:5" — must match what normalizeScriptureReference produces for a single verse. */
export function verseReferenceLabel(parts: VerseKeyParts): string {
  return `${parts.book} ${parts.chapter}:${parts.verse}`;
}

export type VerseNodesResult = {
  verses: VerseKeyParts[];
  chapters: ChapterKeyParts[];
  /** True when the reference covers more verses than `cap`, so callers can say so if they care. */
  truncated: boolean;
};

/**
 * How many verses one reference may become.
 *
 * A reader who highlights a whole psalm should not write eighty rows for one gesture. Twelve
 * covers every ordinary highlight and pill; past that the chapter node carries the signal.
 */
export const VERSE_NODE_CAP = 12;

/**
 * Expand a stored reference into the verse and chapter nodes it touches.
 *
 * Handles cross-chapter ranges, which `verseKeysFromScriptureReference` next door does not:
 * "Exodus 6:28-7:7" has its end verse in a different chapter from its start, so iterating
 * 28..7 in chapter 6 produces nothing at all.
 *
 * A reference naming a whole chapter yields the chapter node alone. `normalizeScriptureReference`
 * turns "John 3" into "John 3:1-36", which would otherwise be indistinguishable from someone
 * deliberately marking thirty-six verses — and after the cap, from marking the first twelve.
 */
export function verseNodesForReference(
  reference: string,
  options: { cap?: number } = {},
): VerseNodesResult {
  const cap = options.cap ?? VERSE_NODE_CAP;
  const empty: VerseNodesResult = { verses: [], chapters: [], truncated: false };
  const trimmed = reference?.trim();
  if (!trimmed) return empty;

  const normalized = normalizeScriptureReference(trimmed) ?? trimmed;
  const parsed = parseScriptureReference(normalized.replace(/,\s+/g, ','));
  if (!parsed) return empty;

  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : verseStart;
  const endChapter = parsed.endChapter ?? parsed.chapter;

  // A whole chapter named as such is a chapter, not its verses. Single-chapter references only:
  // a cross-chapter range that happens to start and end on chapter boundaries is still a range.
  if (parsed.endChapter == null && Array.isArray(parsed.verse)) {
    const range = getChapterVerseRange(parsed.book, parsed.chapter);
    if (range && verseStart <= range.start && verseEnd >= range.end) {
      return {
        verses: [],
        chapters: [{ book: parsed.book, chapter: parsed.chapter }],
        truncated: false,
      };
    }
  }

  const verses: VerseKeyParts[] = [];
  let truncated = false;

  const push = (chapter: number, verse: number): boolean => {
    if (verses.length >= cap) {
      truncated = true;
      return false;
    }
    verses.push({ book: parsed.book, chapter, verse });
    return true;
  };

  outer: for (let chapter = parsed.chapter; chapter <= endChapter; chapter++) {
    const range = getChapterVerseRange(parsed.book, chapter);
    const from = chapter === parsed.chapter ? verseStart : (range?.start ?? 1);
    // Without a known verse count an intermediate chapter would run forever; the chapter node
    // still records the contact, so stopping at the start verse loses nothing that matters.
    const to = chapter === endChapter ? verseEnd : (range?.end ?? from);
    for (let verse = from; verse <= to; verse++) {
      if (!push(chapter, verse)) break outer;
    }
  }

  const chapterKeys = new Map<string, ChapterKeyParts>();
  for (const v of verses) {
    chapterKeys.set(`${v.book}|${v.chapter}`, { book: v.book, chapter: v.chapter });
  }

  return { verses, chapters: [...chapterKeys.values()], truncated };
}

/**
 * The `ReviewItems.sourceKey` a node would produce, so the engine can skip nodes already queued.
 *
 * Deliberately mirrors `reviewSourceKey` in server/utils/review-service.ts rather than importing
 * it — that module reaches for the database — and a test asserts the two agree. Returns null for
 * kinds Review has no question for (chapter, theme, person, place).
 */
export function reviewSourceKeyForNode(input: {
  nodeKind: NodeKind;
  nodeKey: string;
  noteId?: string | null;
  secondaryNoteId?: string | null;
}): string | null {
  const parsed = parseNodeKey(input.nodeKey);
  if (!parsed) return null;

  switch (parsed.kind) {
    case 'note':
    case 'thread':
      return parsed.parts[0] ? `${parsed.kind}:${parsed.parts[0]}` : null;
    case 'verse': {
      const parts = verseKeyPartsFromNodeKey(input.nodeKey);
      return parts ? `verse:${verseReferenceLabel(parts).toLowerCase()}` : null;
    }
    case 'connection': {
      const [a, b] = parsed.parts;
      if (!a || !b) return null;
      // review-service joins the pair with ':' where the node key uses '|'; both are sorted.
      return `connection:${a}:${b}`;
    }
    default:
      return null;
  }
}
