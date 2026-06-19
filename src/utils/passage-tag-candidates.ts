/**
 * Client-side passage-derived folder/tag candidates, read from the cached per-user passage
 * knowledge. Mirrors the server-side `getPassageTagCandidates`, but works offline from the
 * localStorage cache so the synchronous suggesters can use it. Pure (cache passed in) and tested.
 * See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md (Phase 2 / Option B).
 */

import { detectScriptureReferences, parseScriptureReference } from '@/utils/scripture-detector';
import type { PassageKnowledgeMap } from './passage-knowledge-cache';

export type PassageCandidateKind = 'person' | 'place' | 'theme';

export interface ClientPassageCandidate {
  keyword: string;
  category: string;
  kind: PassageCandidateKind;
}

/** OpenBible disambiguates places as "Bethlehem 1" / "Judea 1"; show the plain name. */
export function normalizePlaceName(name: string): string {
  return name.replace(/\s+\d+$/, '').trim();
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
