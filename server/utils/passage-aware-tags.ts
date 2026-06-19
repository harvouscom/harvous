/**
 * Passage-aware auto-tagging (Phase 2).
 *
 * The prose auto-tagger (`generateAutoTags`) scores a note's title + body against the keyword
 * corpus and ignores the note's own scripture references. This module folds in a SECOND signal
 * — the themes, people, and places of the passages the note cites — turning "confidence" into a
 * multi-signal score:
 *
 *   - Corroboration: a prose tag that a referenced passage also supports gets a confidence boost.
 *   - Net-new: people/places the note references but never named in prose are added as tags
 *     (high-precision proper nouns). Passage THEMES are intentionally NOT auto-added — OpenBible
 *     topic breadth is noisy, so themes only ever corroborate (see the doc's guardrail).
 *
 * The merge is pure (`mergePassageTags`) so it can be unit-tested without a DB. Reuses the
 * existing `conceptOverlaps` dedup. See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md (Phase 2).
 */

import { conceptOverlaps } from '@/utils/bible-study-concept-overlaps';
import { getNotePassages, getKnowledgeForPassages, type VerseKey } from './scripture-knowledge';
import type { AutoTagSuggestion } from './auto-tag-generator';

export type PassageTagKind = 'person' | 'place' | 'theme';

export interface PassageTagCandidate {
  keyword: string;
  category: string;
  relevance: number;
  kind: PassageTagKind;
}

const ENTITY_RELEVANCE = 1_000_000; // entities outrank themes for net-new ordering
const NET_NEW_CONFIDENCE = 0.8; // people/places are accurate proper nouns
const CORROBORATION_BOOST = 0.1;
const MIN_THEME_CORROBORATION_RELEVANCE = 50; // ignore weak/incidental topic edges when boosting

export interface MergeOptions {
  boost?: number;
  netNewConfidence?: number;
  threshold?: number;
  maxNetNew?: number;
  excludeLabels?: string[];
  dismissed?: string[];
}

/**
 * Merge passage-derived candidates into prose auto-tag suggestions. Pure.
 * Themes/entities that concept-overlap a prose tag boost it; net-new tags are added only for
 * people/places (never raw passage themes).
 */
export function mergePassageTags(
  prose: AutoTagSuggestion[],
  candidates: PassageTagCandidate[],
  opts: MergeOptions = {},
): AutoTagSuggestion[] {
  const boost = opts.boost ?? CORROBORATION_BOOST;
  const netNewConfidence = opts.netNewConfidence ?? NET_NEW_CONFIDENCE;
  const threshold = opts.threshold ?? 0;
  const maxNetNew = opts.maxNetNew ?? 4;
  const excludeLabels = opts.excludeLabels ?? [];
  const dismissed = (opts.dismissed ?? []).map((d) => d.toLowerCase());

  const corroborates = (c: PassageTagCandidate, tag: string): boolean => {
    if (c.kind === 'theme' && (c.relevance < MIN_THEME_CORROBORATION_RELEVANCE || c.keyword.length < 4)) return false;
    return conceptOverlaps(c.keyword, tag);
  };

  const out = prose.map((s) => ({ ...s }));
  for (const s of out) {
    if (candidates.some((c) => corroborates(c, s.keyword))) {
      s.confidence = Math.min(1, s.confidence + boost);
    }
  }

  const present = new Set(out.map((s) => s.keyword.toLowerCase()));
  const entityCandidates = candidates
    .filter((c) => c.kind === 'person' || c.kind === 'place')
    .sort((a, b) => b.relevance - a.relevance);

  let added = 0;
  for (const c of entityCandidates) {
    if (added >= maxNetNew) break;
    const key = c.keyword.toLowerCase();
    if (present.has(key)) continue;
    if (dismissed.includes(key)) continue;
    if (netNewConfidence < threshold) continue;
    if (out.some((s) => conceptOverlaps(c.keyword, s.keyword))) continue; // overlaps existing → already boosted
    if (excludeLabels.some((l) => conceptOverlaps(c.keyword, l))) continue;
    out.push({ keyword: c.keyword, category: c.category, confidence: netNewConfidence, isExisting: false });
    present.add(key);
    added++;
  }

  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

/** Build passage candidates (people, places, themes) for a note's referenced passages. */
export async function getPassageTagCandidates(passages: VerseKey[]): Promise<PassageTagCandidate[]> {
  const { people, places, themes } = await getKnowledgeForPassages(passages, { themeLimit: 30 });
  const out: PassageTagCandidate[] = [];
  for (const p of people) out.push({ keyword: p.name, category: 'character', relevance: ENTITY_RELEVANCE, kind: 'person' });
  for (const p of places) out.push({ keyword: p.name, category: 'place', relevance: ENTITY_RELEVANCE, kind: 'place' });
  for (const t of themes) out.push({ keyword: t.label, category: 'theme', relevance: t.relevance, kind: 'theme' });
  return out;
}

/**
 * Enrich prose auto-tag suggestions with the note's passage signals. Non-throwing: any failure
 * returns the original suggestions unchanged, so passage enrichment can never break tagging.
 */
export async function enrichAutoTagsWithPassages(
  noteId: string,
  proseSuggestions: AutoTagSuggestion[],
  opts: { threshold?: number; excludeLabels?: string[]; dismissed?: string[] } = {},
): Promise<AutoTagSuggestion[]> {
  try {
    const passages = await getNotePassages(noteId);
    if (!passages.length) return proseSuggestions;
    const candidates = await getPassageTagCandidates(passages);
    if (!candidates.length) return proseSuggestions;
    return mergePassageTags(proseSuggestions, candidates, {
      threshold: opts.threshold,
      excludeLabels: opts.excludeLabels,
      dismissed: opts.dismissed,
    });
  } catch (err) {
    console.error('[enrichAutoTagsWithPassages] non-critical failure:', err instanceof Error ? err.message : err);
    return proseSuggestions;
  }
}
