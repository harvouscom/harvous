/**
 * Recognise a photographed Bible page as a passage in a translation — the queries behind
 * POST /api/scripture/identify-passage. The reasoning lives with the pure scoring in
 * src/utils/ocr/passage-match.ts.
 *
 * Probes run one at a time on purpose: each is a single indexed lookup
 * (`idx_bibleverses_fts`), and running them side by side would take several pooled
 * connections for no real gain (see supabase_pool_exhaustion in the team notes).
 */
import { db, and, eq, sql, BibleVerses } from '../db';
import { getTranslation } from '@/data/translations';
import {
  NO_PASSAGE,
  PASSAGE_IDENTIFY_MAX_CHARS,
  PASSAGE_IDENTIFY_MIN_WORDS,
  choosePassage,
  passageWords,
  pickProbePhrases,
  rankCandidateChapters,
  scoreChapter,
  type PassageIdentifyResult,
  type PassageScore,
  type PassageVerse,
} from '@/utils/ocr/passage-match';

/** Enough rows to see every translation's copy of a phrase several times over. */
const PROBE_ROW_LIMIT = 120;

export type PassageIdentifyParams =
  | { ok: true; text: string; preferredTranslation: string | null }
  | { ok: false; error: string; code: string };

export function parsePassageIdentifyParams(body: unknown): PassageIdentifyParams {
  const input = (body ?? {}) as { text?: unknown; preferredTranslation?: unknown };
  if (typeof input.text !== 'string' || !input.text.trim()) {
    return { ok: false, error: 'text is required', code: 'TEXT_REQUIRED' };
  }
  if (input.text.length > PASSAGE_IDENTIFY_MAX_CHARS) {
    return { ok: false, error: `text must be at most ${PASSAGE_IDENTIFY_MAX_CHARS} characters`, code: 'TEXT_TOO_LONG' };
  }
  const preferred =
    typeof input.preferredTranslation === 'string' ? input.preferredTranslation.trim().toUpperCase() : '';
  return {
    ok: true,
    text: input.text,
    preferredTranslation: preferred && getTranslation(preferred) ? preferred : null,
  };
}

export async function identifyPassage(params: {
  text: string;
  preferredTranslation: string | null;
}): Promise<PassageIdentifyResult> {
  const pageWords = passageWords(params.text);
  if (pageWords.length < PASSAGE_IDENTIFY_MIN_WORDS) return NO_PASSAGE;
  const phrases = pickProbePhrases(params.text);
  if (phrases.length === 0) return NO_PASSAGE;

  const verseTsVector = sql`to_tsvector('english', ${BibleVerses.text})`;
  const hitsByPhrase: Array<Array<{ book: string; chapter: number }>> = [];
  for (const phrase of phrases) {
    const rows = await db
      .select({ book: BibleVerses.book, chapter: BibleVerses.chapter })
      .from(BibleVerses)
      .where(sql`${verseTsVector} @@ plainto_tsquery('english', ${phrase})`)
      .limit(PROBE_ROW_LIMIT);
    hitsByPhrase.push(rows);
  }

  const candidates = rankCandidateChapters(hitsByPhrase);
  if (candidates.length === 0) return NO_PASSAGE;

  const scores: PassageScore[] = [];
  for (const { book, chapter } of candidates) {
    const rows: PassageVerse[] = await db
      .select({
        translationId: BibleVerses.translationId,
        book: BibleVerses.book,
        chapter: BibleVerses.chapter,
        verse: BibleVerses.verse,
        text: BibleVerses.text,
      })
      .from(BibleVerses)
      .where(and(eq(BibleVerses.book, book), eq(BibleVerses.chapter, chapter)))
      .orderBy(BibleVerses.translationId, BibleVerses.verse);
    const byTranslation = new Map<string, PassageVerse[]>();
    for (const row of rows) {
      const list = byTranslation.get(row.translationId) ?? [];
      list.push(row);
      byTranslation.set(row.translationId, list);
    }
    for (const verses of byTranslation.values()) {
      const score = scoreChapter(pageWords, verses);
      if (score) scores.push(score);
    }
  }

  return choosePassage(scores, params.preferredTranslation);
}
