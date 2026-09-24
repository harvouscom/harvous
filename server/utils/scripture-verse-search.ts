/**
 * Word search over the whole Bible — "love your enemies", "redeem", "be anxious".
 *
 * Until this, search only reached Scripture someone had already put in a note, so the verse
 * they half-remembered was findable only if they had once written it down. `BibleVerses` holds
 * every verse of every translation the reader can open, and Postgres's `english` text search
 * already stems (redeem / redeemed / redemption), so this is the note search's own FTS pattern
 * pointed at verse text — see docs/future/SCRIPTURE_CONCORDANCE.md, Phases 0 and 1.
 *
 * Indexed by `idx_bibleverses_fts` (server/db/manual/add-bibleverses-fts.sql). The query is
 * correct without it, only slower: every verse of the translation is tokenised per request.
 */
import { db, and, eq, sql, BibleVerses } from '../db';
import { orderedCanonBooks } from '@/utils/bible-book-chapters';
import { getTranslation } from '@/data/translations';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { VERSE_MATCH_END, VERSE_MATCH_START } from '@/utils/verse-search-snippet';

export const VERSE_SEARCH_DEFAULT_LIMIT = 20;
export const VERSE_SEARCH_MAX_LIMIT = 25;
/** Long enough for any phrase someone remembers; short enough that a pasted chapter is refused. */
export const VERSE_SEARCH_MAX_QUERY_LENGTH = 120;

export type VerseSearchHit = {
  book: string;
  chapter: number;
  verse: number;
  /** "John 3:16" */
  reference: string;
  /** Verse text with each match marked; see src/utils/verse-search-snippet.ts. */
  snippet: string;
  translation: string;
};

export type VerseSearchResult = {
  results: VerseSearchHit[];
  hasMore: boolean;
  query: string;
  translation: string;
};

export type VerseSearchParams =
  | { ok: true; query: string; translation: string; limit: number }
  | { ok: false; error: string; code: string };

/** Pure: validate and normalise the request. */
export function parseVerseSearchParams(input: {
  q?: string | null;
  translation?: string | null;
  limit?: string | null;
}): VerseSearchParams {
  const query = (input.q ?? '').replace(/\s+/g, ' ').trim();
  if (query.length < MIN_SEARCH_QUERY_LENGTH) {
    return { ok: false, error: `q must be at least ${MIN_SEARCH_QUERY_LENGTH} characters`, code: 'QUERY_TOO_SHORT' };
  }
  if (query.length > VERSE_SEARCH_MAX_QUERY_LENGTH) {
    return { ok: false, error: `q must be at most ${VERSE_SEARCH_MAX_QUERY_LENGTH} characters`, code: 'QUERY_TOO_LONG' };
  }
  const translation = (input.translation ?? 'NET').trim().toUpperCase() || 'NET';
  if (!getTranslation(translation)) {
    return { ok: false, error: 'Unknown translation', code: 'INVALID_TRANSLATION' };
  }
  const parsedLimit = Number.parseInt(input.limit ?? '', 10);
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, VERSE_SEARCH_MAX_LIMIT)
    : VERSE_SEARCH_DEFAULT_LIMIT;
  return { ok: true, query, translation, limit };
}

/**
 * Postgres's `english` stop list (Snowball's). A query made only of these is an empty tsquery —
 * it can match nothing, and Postgres logs a NOTICE saying so — so it is answered here without
 * a round trip. Typing "the" on the way to "there" is the common case.
 */
const ENGLISH_STOP_WORDS = new Set(
  (
    'i me my myself we our ours ourselves you your yours yourself yourselves he him his himself ' +
    'she her hers herself it its itself they them their theirs themselves what which who whom ' +
    'this that these those am is are was were be been being have has had having do does did ' +
    'doing a an the and but if or because as until while of at by for with about against between ' +
    'into through during before after above below to from up down in out on off over under again ' +
    'further then once here there when where why how all any both each few more most other some ' +
    'such no nor not only own same so than too very s t can will just don should now'
  ).split(' '),
);

/** Pure: whether the query has at least one word text search can match on. */
export function hasSearchableWord(query: string): boolean {
  return query
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .some((word) => word.length > 0 && !ENGLISH_STOP_WORDS.has(word));
}

/**
 * Pure: the words as they would appear in a verse, for the exact-phrase boost — quotes gone,
 * `-excluded` words and `or` dropped, since none of those are text the verse contains.
 */
export function phraseForBoost(query: string): string {
  return query
    .replace(/["“”]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !word.startsWith('-') && word.toLowerCase() !== 'or')
    .join(' ');
}

/** `%` and `_` are wildcards to ILIKE; a query containing them means the characters. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function verseReference(book: string, chapter: number, verse: number): string {
  return `${book} ${chapter}:${verse}`;
}

export async function searchBibleVerses(params: {
  query: string;
  translation: string;
  limit: number;
}): Promise<VerseSearchResult> {
  const { query, translation, limit } = params;
  if (!hasSearchableWord(query)) return { query, translation, hasMore: false, results: [] };

  /*
   * `websearch_to_tsquery`, not `plainto_`: a quoted phrase stays a phrase and `-word` excludes,
   * which is how people already type into a search box. Stop words drop out ("be not anxious"
   * searches "anxious"), and a query of nothing but stop words is an empty tsquery that matches
   * nothing — correctly, since "the" is not a search.
   */
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;
  const verseTsVector = sql`to_tsvector('english', ${BibleVerses.text})`;
  const phrasePattern = `%${escapeLikePattern(phraseForBoost(query))}%`;
  const canon = orderedCanonBooks();
  const canonArray = sql`ARRAY[${sql.join(canon.map((book) => sql`${book}`), sql`, `)}]::text[]`;

  const rows = await db
    .select({
      book: BibleVerses.book,
      chapter: BibleVerses.chapter,
      verse: BibleVerses.verse,
      /* Evaluated after LIMIT (ts_headline is costed high enough that Postgres postpones it
         past the sort), so only the returned rows pay for it. */
      snippet: sql<string>`ts_headline('english', ${BibleVerses.text}, ${tsQuery}, ${
        `StartSel=${VERSE_MATCH_START}, StopSel=${VERSE_MATCH_END}, HighlightAll=true`
      })`,
    })
    .from(BibleVerses)
    .where(and(eq(BibleVerses.translationId, translation), sql`${verseTsVector} @@ ${tsQuery}`))
    .orderBy(
      /* The words in the order typed beat the same words scattered across the verse: someone
         typing "love your enemies" wants Matthew 5:44 above every verse with "love" and
         "enemies" somewhere in it. */
      sql`(${BibleVerses.text} ILIKE ${phrasePattern}) DESC`,
      sql`ts_rank(${verseTsVector}, ${tsQuery}) DESC`,
      sql`array_position(${canonArray}, ${BibleVerses.book})`,
      BibleVerses.chapter,
      BibleVerses.verse,
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  return {
    query,
    translation,
    hasMore,
    results: rows.slice(0, limit).map((row) => ({
      book: row.book,
      chapter: row.chapter,
      verse: row.verse,
      reference: verseReference(row.book, row.chapter, row.verse),
      snippet: row.snippet,
      translation,
    })),
  };
}
