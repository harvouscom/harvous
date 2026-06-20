/**
 * TSK cross-reference connections across a space's cited passages (prototype Home, Phase 3).
 * Joins the scripture index against ScriptureCrossReferences and ranks pairs via the pure
 * deriveCrossRefConnections helper.
 */

import {
  db,
  and,
  eq,
  or,
  desc,
  gte,
  ScriptureCrossReferences,
} from '../db';
import {
  deriveCrossRefConnections,
  type HomeCrossRefConnection,
  type HomeCrossRefEdge,
  type HomeCrossRefPassageInput,
} from '@/utils/prototype-home-trends';
import type { ScriptureIndexBook } from './build-space-scripture-index';

const VERSE_SPAN_CAP = 20;
const CROSS_REF_CHUNK = 120;
const MIN_VOTES = 1;
const DEFAULT_LIMIT = 3;

type VerseKey = { book: string; chapter: number; verse: number };

const verseKey = (v: VerseKey) => `${v.book}|${v.chapter}|${v.verse}`;

function expandPassageVerses(
  bookTitle: string,
  chapter: number,
  verseStart: number,
  verseEnd: number,
): VerseKey[] {
  const end = Math.min(verseEnd, verseStart + VERSE_SPAN_CAP - 1);
  const out: VerseKey[] = [];
  for (let verse = verseStart; verse <= end; verse += 1) {
    out.push({ book: bookTitle, chapter, verse });
  }
  return out;
}

function buildPassageInputs(books: ScriptureIndexBook[]): {
  passages: HomeCrossRefPassageInput[];
  verseToPassageKey: Map<string, string>;
} {
  const passages: HomeCrossRefPassageInput[] = [];
  const verseToPassageKey = new Map<string, string>();

  for (const book of books) {
    for (const passage of book.passages) {
      if (!passage.notes.length) continue;
      passages.push({
        passageKey: passage.passageKey,
        displayRef: passage.displayRef,
        bookOrder: passage.bookOrder,
        notes: passage.notes.map((n) => ({
          id: n.id,
          title: n.title,
          updatedAt: n.updatedAt,
          createdAt: n.createdAt,
        })),
      });
      for (const v of expandPassageVerses(book.title, passage.chapter, passage.verseStart, passage.verseEnd)) {
        verseToPassageKey.set(verseKey(v), passage.passageKey);
      }
    }
  }

  return { passages, verseToPassageKey };
}

async function fetchCrossRefEdges(
  citedVerses: VerseKey[],
  verseToPassageKey: Map<string, string>,
): Promise<HomeCrossRefEdge[]> {
  if (!citedVerses.length) return [];

  const edges: HomeCrossRefEdge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < citedVerses.length; i += CROSS_REF_CHUNK) {
    const chunk = citedVerses.slice(i, i + CROSS_REF_CHUNK);
    const anyOf = or(
      ...chunk.map((p) =>
        and(
          eq(ScriptureCrossReferences.fromBook, p.book),
          eq(ScriptureCrossReferences.fromChapter, p.chapter),
          eq(ScriptureCrossReferences.fromVerse, p.verse),
        ),
      ),
    );

    const rows = await db
      .select({
        fromBook: ScriptureCrossReferences.fromBook,
        fromChapter: ScriptureCrossReferences.fromChapter,
        fromVerse: ScriptureCrossReferences.fromVerse,
        toBook: ScriptureCrossReferences.toBook,
        toChapter: ScriptureCrossReferences.toChapterStart,
        toVerse: ScriptureCrossReferences.toVerseStart,
        votes: ScriptureCrossReferences.votes,
      })
      .from(ScriptureCrossReferences)
      .where(and(anyOf, gte(ScriptureCrossReferences.votes, MIN_VOTES)))
      .orderBy(desc(ScriptureCrossReferences.votes));

    for (const row of rows) {
      const fromPassageKey = verseToPassageKey.get(verseKey(row));
      if (!fromPassageKey) continue;

      const toPassageKey = verseToPassageKey.get(
        verseKey({ book: row.toBook, chapter: row.toChapter, verse: row.toVerse }),
      );
      if (!toPassageKey || fromPassageKey === toPassageKey) continue;

      const dedupeKey = `${fromPassageKey}|${toPassageKey}|${row.fromBook}|${row.fromChapter}|${row.fromVerse}|${row.toBook}|${row.toChapter}|${row.toVerse}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      edges.push({ fromKey: fromPassageKey, toKey: toPassageKey, votes: row.votes });
    }
  }

  return edges;
}

export type SpaceScriptureConnectionsPayload = {
  connections: HomeCrossRefConnection[];
};

/** Top TSK-linked passage pairs across a space's scripture index. */
export async function buildSpaceScriptureConnections(
  books: ScriptureIndexBook[],
  opts: { limit?: number; minNotes?: number } = {},
): Promise<SpaceScriptureConnectionsPayload> {
  const { limit = DEFAULT_LIMIT, minNotes = 2 } = opts;
  const { passages, verseToPassageKey } = buildPassageInputs(books);
  if (passages.length < 2) return { connections: [] };

  const citedVerses = [...verseToPassageKey.keys()].map((k) => {
    const [book, chapter, verse] = k.split('|');
    return { book, chapter: Number(chapter), verse: Number(verse) };
  });

  const edges = await fetchCrossRefEdges(citedVerses, verseToPassageKey);
  const connections = deriveCrossRefConnections(passages, edges, { limit, minNotes });

  return { connections };
}
