/**
 * Client-side passage-derived folder/tag candidates, read from the cached per-user passage
 * knowledge. Mirrors the server-side `getPassageTagCandidates`, but works offline from the
 * localStorage cache so the synchronous suggesters can use it. Pure (cache passed in) and tested.
 * See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md (Phase 2 / Option B).
 */

import { detectScriptureReferences, parseScriptureReference } from '@/utils/scripture-detector';
import { conceptOverlapsAny } from '@/utils/bible-study-concept-overlaps';
import { normalizePlaceName } from './bible-place-name';
import type { PassageKnowledgeMap } from './passage-knowledge-cache';

export { normalizePlaceName };

export type PassageCandidateKind = 'person' | 'place' | 'theme';

export interface ClientPassageCandidate {
  keyword: string;
  category: string;
  kind: PassageCandidateKind;
}

/** Distinct "book|chapter|verse" keys cited in some text (ranges anchored at their start verse). */
export function citedVerseKeys(text: string): string[] {
  const out = new Set<string>();
  for (const ref of detectScriptureReferences(text)) {
    const parsed = parseScriptureReference(ref.reference);
    if (!parsed) continue;
    const verse = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
    if (!Number.isInteger(verse)) continue;
    out.add(`${parsed.book}|${parsed.chapter}|${verse}`);
  }
  return [...out];
}

/** Candidates for a set of verse keys, from the cache. Pure. */
export function passageCandidatesFromVerseKeys(
  verseKeys: string[],
  cache: PassageKnowledgeMap,
  opts: { includeThemes?: boolean } = {},
): ClientPassageCandidate[] {
  const seen = new Set<string>();
  const out: ClientPassageCandidate[] = [];
  const add = (keyword: string, category: string, kind: PassageCandidateKind) => {
    const trimmed = keyword.trim();
    const key = `${kind}:${trimmed.toLowerCase()}`;
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    out.push({ keyword: trimmed, category, kind });
  };

  for (const verseKey of verseKeys) {
    const entry = cache[verseKey];
    if (!entry) continue;
    for (const name of entry.people) add(name, 'character', 'person');
    for (const name of entry.places) add(normalizePlaceName(name), 'place', 'place');
    if (opts.includeThemes) for (const label of entry.themes) add(label, 'theme', 'theme');
  }
  return out;
}

/** Convenience: extract cited verses from text and resolve their candidates from the cache. */
export function passageCandidatesFromText(
  text: string,
  cache: PassageKnowledgeMap,
  opts: { includeThemes?: boolean } = {},
): ClientPassageCandidate[] {
  return passageCandidatesFromVerseKeys(citedVerseKeys(text), cache, opts);
}

export interface SuggestedTagLike {
  name: string;
  category: string;
  confidence: number;
}

const PASSAGE_TAG_CONFIDENCE = 0.8;
const MAX_PASSAGE_TAGS = 4;

/**
 * Merge passage people/place candidates into base tag suggestions as net-new tags (themes are
 * skipped — too broad; the server corroborates those). Pure. Deduped via `conceptOverlaps`,
 * respecting folder-label and dismissed exclusions. Mirrors the server's `mergePassageTags`.
 */
export function mergePassageTagSuggestions(
  base: SuggestedTagLike[],
  candidates: ClientPassageCandidate[],
  opts: { excludeLabels?: string[]; dismissed?: string[]; maxAdd?: number } = {},
): SuggestedTagLike[] {
  const excludeLabels = opts.excludeLabels ?? [];
  const dismissed = (opts.dismissed ?? []).map((d) => d.toLowerCase());
  const maxAdd = opts.maxAdd ?? MAX_PASSAGE_TAGS;

  const out = [...base];
  const present = new Set(out.map((s) => s.name.toLowerCase()));
  let added = 0;
  for (const c of candidates) {
    if (c.kind === 'theme') continue;
    if (added >= maxAdd) break;
    const low = c.keyword.toLowerCase();
    if (present.has(low) || dismissed.includes(low)) continue;
    if (conceptOverlapsAny(c.keyword, excludeLabels)) continue;
    if (out.some((s) => conceptOverlapsAny(c.keyword, [s.name]))) continue;
    out.push({ name: c.keyword, category: c.category, confidence: PASSAGE_TAG_CONFIDENCE });
    present.add(low);
    added++;
  }
  return out;
}
