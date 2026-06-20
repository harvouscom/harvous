/**
 * Pure thread suggestion ranking for POST /api/notes/suggest-threads (Phase 4).
 * Aggregates knowledge-layer related-note scores, keyword/concept overlap, and recency
 * into ranked thread picks. Shared by web prototype and native via the server endpoint.
 */

export type ThreadSuggestionReason =
  | 'Shares a passage'
  | 'Cross-referenced passage'
  | 'Shared theme'
  | 'Similar keywords'
  | 'Recently used';

export interface ThreadSuggestionRelatedNote {
  noteId: string;
  score: number;
  sharedPassages: string[];
  sharedCrossRefs: string[];
  sharedThemes: string[];
}

export interface ThreadSuggestionMeta {
  id: string;
  title: string;
  color: string | null;
}

export interface ThreadSuggestionInput {
  relatedNotes: ThreadSuggestionRelatedNote[];
  /** noteId -> threadIds the note belongs to */
  noteIdToThreadIds: Map<string, string[]>;
  /** threadId -> keyword/concept overlap score (0–1 scale) */
  threadKeywordScores: Map<string, number>;
  /** Most-recent thread ids, most recent first */
  recentThreadIds: string[];
  threadMeta: ThreadSuggestionMeta[];
}

export interface ThreadSuggestion {
  threadId: string;
  score: number;
  reason: ThreadSuggestionReason;
}

const UNORGANIZED_THREAD_ID = 'thread_unorganized';
const RECENCY_BASE = 0.3;
const KEYWORD_BASE = 0.5;

function knowledgeReason(related: ThreadSuggestionRelatedNote): ThreadSuggestionReason {
  if (related.sharedPassages.length > 0) return 'Shares a passage';
  if (related.sharedCrossRefs.length > 0) return 'Cross-referenced passage';
  return 'Shared theme';
}

type ThreadAccumulator = {
  knowledgeScore: number;
  knowledgeReason: ThreadSuggestionReason;
  keywordScore: number;
  recencyScore: number;
};

function pickDominantReason(acc: ThreadAccumulator): ThreadSuggestionReason {
  const { knowledgeScore, keywordScore, recencyScore, knowledgeReason: kReason } = acc;
  if (knowledgeScore > 0 && knowledgeScore >= keywordScore && knowledgeScore >= recencyScore) return kReason;
  if (keywordScore > 0 && keywordScore >= recencyScore) return 'Similar keywords';
  if (recencyScore > 0) return 'Recently used';
  return 'Recently used';
}

/**
 * Rank study threads for a note being composed. Knowledge signal (passage / cross-ref / theme)
 * comes from related notes mapped to threads; keyword and recency are fallbacks when no passages
 * are detected.
 */
export function rankThreadSuggestions(
  input: ThreadSuggestionInput,
  opts: { limit?: number } = {},
): ThreadSuggestion[] {
  const { limit = 5 } = opts;
  const byThread = new Map<string, ThreadAccumulator>();

  const ensure = (threadId: string): ThreadAccumulator => {
    let acc = byThread.get(threadId);
    if (!acc) {
      acc = { knowledgeScore: 0, knowledgeReason: 'Shared theme', keywordScore: 0, recencyScore: 0 };
      byThread.set(threadId, acc);
    }
    return acc;
  };

  for (const related of input.relatedNotes) {
    const threadIds = input.noteIdToThreadIds.get(related.noteId) ?? [];
    for (const threadId of threadIds) {
      if (threadId === UNORGANIZED_THREAD_ID) continue;
      const acc = ensure(threadId);
      if (related.score > acc.knowledgeScore) {
        acc.knowledgeScore = related.score;
        acc.knowledgeReason = knowledgeReason(related);
      }
    }
  }

  const recentCount = input.recentThreadIds.length;
  input.recentThreadIds.forEach((threadId, idx) => {
    if (threadId === UNORGANIZED_THREAD_ID) return;
    const acc = ensure(threadId);
    acc.recencyScore = Math.max(acc.recencyScore, RECENCY_BASE * (1 - idx / Math.max(recentCount, 1)));
  });

  for (const [threadId, kwScore] of input.threadKeywordScores) {
    if (threadId === UNORGANIZED_THREAD_ID) continue;
    const acc = ensure(threadId);
    acc.keywordScore = Math.max(acc.keywordScore, KEYWORD_BASE * kwScore);
  }

  const metaById = new Map(input.threadMeta.map((t) => [t.id, t]));
  const ranked: ThreadSuggestion[] = [];

  for (const [threadId, acc] of byThread) {
    if (threadId === UNORGANIZED_THREAD_ID || !metaById.has(threadId)) continue;
    const score = acc.knowledgeScore + acc.keywordScore + acc.recencyScore;
    if (score <= 0) continue;
    ranked.push({ threadId, score, reason: pickDominantReason(acc) });
  }

  ranked.sort((a, b) => b.score - a.score || a.threadId.localeCompare(b.threadId));
  return ranked.slice(0, Math.max(0, limit));
}

/** Score thread title keywords against note text keywords via conceptOverlaps (0–1). */
export function scoreThreadKeywordOverlap(
  noteKeywords: string[],
  threadTitle: string,
  findThreadKeywords: (text: string) => string[],
  overlaps: (a: string, b: string) => boolean,
): number {
  if (!noteKeywords.length) return 0;
  const threadKeywords = findThreadKeywords(threadTitle);
  if (!threadKeywords.length) return 0;

  let matches = 0;
  for (const nk of noteKeywords) {
    if (threadKeywords.some((tk) => overlaps(nk, tk))) matches += 1;
  }
  return matches / noteKeywords.length;
}
