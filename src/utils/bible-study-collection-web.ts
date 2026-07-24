/**
 * Auto primary collection hints for web notes — aligns with native `BibleStudyTagSuggester` intent
 * using client-side keyword corpus (`bible-study-keywords.ts`).
 */

import {
  conceptOverlaps,
  dedupeKeywordRowsByConceptOverlap,
  folderLabelsForTagExclusion,
} from '@/utils/bible-study-concept-overlaps';
import {
  isRitualDescriptiveFolderMention,
  RITUAL_DESCRIPTIVE_FOLDER_SCORE_PENALTY,
} from '@/utils/folder-keyword-context';
import { stripHtml } from '@/utils/html-stripper';
import { countLifeKeywordNeedleInLowerText } from '@/utils/life-keyword-context';
import {
  findKeywordsInTextWithPriority,
  isAutoFolderExcludedKeyword,
  type BibleStudyKeyword,
} from '@/utils/bible-study-keywords';

export { folderLabelsForTagExclusion };

const MIN_BODY_WORDS = 25;
const SHORT_NOTE_CONFIDENCE_FLOOR = 0.9;

/** When two folder scores are within this band, prefer title hit and category rank. */
const PRIMARY_SCORE_AMBIGUITY_EPS = 0.04;
const OPENING_SEGMENT_MAX_WORDS = 120;
const OPENING_NARRATIVE_FOLDER_BOOST = 0.1;

function normalizeCollectionLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  // Canonicalize typographic apostrophes/quotes to ASCII and collapse internal whitespace (preserve
  // casing) so newly assigned folder names don't diverge into "O' Holy Night" (curly ’) vs
  // "O' Holy Night" (straight ') duplicates. Bucketing/comparison also normalizes via normalizeFolderKey.
  const t = value
    .replace(/[‘’ʼ′`´]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length ? t : null;
}

export interface CollectionChromeState {
  primaryCollection: string | null;
  secondaryCollections: string[];
  collectionPinned: boolean;
  collectionUserOverride: boolean;
  collectionLastAutoUpdatedAtIso: string | null;
}

export function collectionChromeStatesEqual(a: CollectionChromeState, b: CollectionChromeState): boolean {
  return (
    a.primaryCollection === b.primaryCollection &&
    a.collectionPinned === b.collectionPinned &&
    a.collectionUserOverride === b.collectionUserOverride &&
    a.collectionLastAutoUpdatedAtIso === b.collectionLastAutoUpdatedAtIso &&
    a.secondaryCollections.length === b.secondaryCollections.length &&
    a.secondaryCollections.every((label, index) => label === b.secondaryCollections[index])
  );
}

function collectionRank(cat: string): number {
  if (cat === 'spiritual') return 0;
  if (cat === 'biblical' || cat === 'theme') return 1;
  if (cat === 'book') return 2;
  if (cat === 'life') return 3;
  if (cat === 'character') return 4;
  if (cat === 'place') return 5;
  return 10;
}

interface ScRow {
  keyword: BibleStudyKeyword;
  confidence: number;
}

/** First paragraph (or first ~120 words) — narrative anchor for testimony-shaped notes. */
export function extractOpeningSegment(plainTitle: string, plainBody: string): string {
  const title = (plainTitle || '').trim();
  const body = (plainBody || '').trim();
  const firstParagraph = body.split(/\n\s*\n/).filter(Boolean)[0] ?? body;
  let segment = title ? `${title}\n${firstParagraph}` : firstParagraph;
  const words = segment.split(/\s+/).filter(Boolean);
  if (words.length > OPENING_SEGMENT_MAX_WORDS) {
    segment = words.slice(0, OPENING_SEGMENT_MAX_WORDS).join(' ');
  }
  return segment.trim();
}

function keywordAppearsInText(keyword: BibleStudyKeyword, text: string): boolean {
  const lower = text.toLowerCase();
  if (!lower) return false;
  const needles = [keyword.name, ...keyword.synonyms];
  const seen = new Set<string>();
  for (const raw of needles) {
    const n = raw.trim().toLowerCase();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (n.includes(' ') || n.includes('-')) {
      if (lower.includes(n)) return true;
    } else {
      const re = new RegExp(`\\b${escapeRegExp(n)}\\b`, 'i');
      if (re.test(lower)) return true;
    }
  }
  return false;
}

function keywordAppearsInOpening(keyword: BibleStudyKeyword, plainTitle: string, plainBody: string): boolean {
  return keywordAppearsInText(keyword, extractOpeningSegment(plainTitle, plainBody));
}

function folderPrimaryScore(row: ScRow, plainTitle: string, plainBody: string): number {
  let score = Math.min(1, row.confidence);
  const cat = row.keyword.category;
  if (['spiritual', 'biblical', 'character', 'book', 'theme'].includes(cat)) {
    score = Math.min(1, score + 0.05);
  }
  switch (cat) {
    case 'spiritual':
    case 'biblical':
    case 'life':
    case 'theme': {
      // Corroboration ladder: a single incidental mention of a broad/generic theme should not
      // outrank a recurring, note-defining topic. Recurrence earns the full boost.
      const occ = countKeywordOccurrences(plainTitle, plainBody, row.keyword);
      if (occ <= 1) {
        score += 0.03;
      } else if (occ >= 3) {
        score += 0.12;
      } else {
        score += 0.08;
      }
      break;
    }
    case 'character':
    case 'place': {
      const occ = countKeywordOccurrences(plainTitle, plainBody, row.keyword);
      if (occ <= 1) {
        score -= 0.12;
      } else if (occ >= 5) {
        score += 0.28;
      } else if (occ >= 3) {
        score += 0.18;
      } else {
        score += 0.06;
      }
      break;
    }
    default:
      break;
  }
  if (keywordAppearsInOpening(row.keyword, plainTitle, plainBody)) {
    score = Math.min(1.25, score + OPENING_NARRATIVE_FOLDER_BOOST);
  }
  if (isRitualDescriptiveFolderMention(row.keyword, plainTitle, plainBody)) {
    score -= RITUAL_DESCRIPTIVE_FOLDER_SCORE_PENALTY;
  }
  return score;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rough occurrence count for folder eligibility (name + synonyms; word-bound for single tokens). */
function countKeywordOccurrences(plainTitle: string, plainBody: string, keyword: BibleStudyKeyword): number {
  const titleLower = (plainTitle || '').toLowerCase();
  const bodyLower = (plainBody || '').toLowerCase();
  let total = 0;
  const needles = [keyword.name, ...keyword.synonyms];
  const seen = new Set<string>();
  for (const raw of needles) {
    const n = raw.trim().toLowerCase();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (keyword.category === 'life' || keyword.name.toLowerCase() === 'marriage') {
      total += countLifeKeywordNeedleInLowerText(titleLower, raw, keyword.name);
      total += countLifeKeywordNeedleInLowerText(bodyLower, raw, keyword.name);
      continue;
    }
    const corpus = `${titleLower} ${bodyLower}`;
    if (n.includes(' ') || n.includes('-')) {
      let i = 0;
      while ((i = corpus.indexOf(n, i)) !== -1) {
        total++;
        i += Math.max(1, n.length);
      }
    } else {
      const re = new RegExp(`\\b${escapeRegExp(n)}\\b`, 'g');
      total += (corpus.match(re) || []).length;
    }
  }
  return total;
}

function normalizeSecondaryList(primary: string | null, raw: string[]): string[] {
  const p = primary?.trim().toLowerCase() ?? '';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const t = (s || '').trim();
    if (!t.length) continue;
    const low = t.toLowerCase();
    if (p && low === p) continue;
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(t);
  }
  return out;
}

const SECONDARY_MIN_SCORE = 0.78;
// Weak (single-mention, not-in-title) character/place hits must clear a high bar to become a
// secondary folder — above the most a lone mention can score (incl. the opening boost) so a name
// dropped once in passing stays a tag, not a folder.
const SECONDARY_CHARACTER_PLACE_MIN_SCORE = 0.95;
const MAX_AUTO_SECONDARIES = 3;

function dedupeRowsByKeywordName(rows: ScRow[]): ScRow[] {
  const by = new Map<string, ScRow>();
  for (const r of rows) {
    if (isAutoFolderExcludedKeyword(r.keyword.name)) continue;
    const k = r.keyword.name.toLowerCase();
    const prev = by.get(k);
    if (!prev || r.confidence > prev.confidence) by.set(k, r);
  }
  return dedupeKeywordRowsByConceptOverlap(
    [...by.values()],
    (r) => r.keyword.name,
    (r) => r.confidence,
  );
}

const THEME_PRIMARY_CATEGORIES = new Set(['spiritual', 'biblical', 'life', 'theme']);

function isThemePrimaryCategory(cat: string): boolean {
  return THEME_PRIMARY_CATEGORIES.has(cat);
}

/** A named person or place — gated for primary eligibility (books still organize by themselves). */
function isSpecificCategory(cat: string): boolean {
  return cat === 'character' || cat === 'place';
}

/**
 * A named person/place may only win the *primary* folder when the note is genuinely about them:
 * they appear in the title, or recur (>= 3 mentions). A single passing mention stays a tag/secondary
 * rather than defining the folder. Themes and book references are always primary-eligible (a note
 * studying a book organizes by that book). Keep in sync with native
 * BibleStudyTagSuggester.isPrimaryEligible.
 */
function isPrimaryEligibleRow(row: ScRow, plainTitle: string, plainBody: string): boolean {
  if (!isSpecificCategory(row.keyword.category)) return true;
  if (candidateAppearsInTitle(plainTitle, row.keyword.name)) return true;
  return countKeywordOccurrences(plainTitle, plainBody, row.keyword) >= 3;
}

/**
 * A Bible book "defines" the note — and may win the *primary* folder over a theme — only when the
 * note is genuinely a study of it: the book is in the title, or it recurs (>= 3). A passing citation
 * never beats a real theme and stays a tag. Mirrors the character/place gate intent in
 * `isPrimaryEligibleRow`. Keep in sync with native BibleStudyTagSuggester.
 */
function isBookDefining(row: ScRow, plainTitle: string, plainBody: string): boolean {
  if (row.keyword.category !== 'book') return false;
  if (candidateAppearsInTitle(plainTitle, row.keyword.name)) return true;
  return countKeywordOccurrences(plainTitle, plainBody, row.keyword) >= 3;
}

function betterPrimaryRow(a: ScRow, b: ScRow, plainTitle: string, plainBody: string): ScRow {
  const sa = folderPrimaryScore(a, plainTitle, plainBody);
  const sb = folderPrimaryScore(b, plainTitle, plainBody);

  const aCharPlace = a.keyword.category === 'character' || a.keyword.category === 'place';
  const bCharPlace = b.keyword.category === 'character' || b.keyword.category === 'place';
  if (isThemePrimaryCategory(a.keyword.category) && bCharPlace && !candidateAppearsInTitle(plainTitle, b.keyword.name)) {
    if (sb - sa < 0.18) return a;
  }
  if (isThemePrimaryCategory(b.keyword.category) && aCharPlace && !candidateAppearsInTitle(plainTitle, a.keyword.name)) {
    if (sa - sb < 0.18) return b;
  }
  // A theme outranks a Bible-book mention unless the book is the note's subject (book-defining:
  // in title or recurring). A passing book citation never wins primary over a real theme; a
  // book-study (defining book) competes on raw score, so its title boost can carry the primary.
  if (isThemePrimaryCategory(a.keyword.category) && b.keyword.category === 'book' && !isBookDefining(b, plainTitle, plainBody)) {
    return a;
  }
  if (isThemePrimaryCategory(b.keyword.category) && a.keyword.category === 'book' && !isBookDefining(a, plainTitle, plainBody)) {
    return b;
  }

  if (Math.abs(sa - sb) > PRIMARY_SCORE_AMBIGUITY_EPS) {
    return sa >= sb ? a : b;
  }
  const aTitle = candidateAppearsInTitle(plainTitle, a.keyword.name);
  const bTitle = candidateAppearsInTitle(plainTitle, b.keyword.name);
  if (aTitle !== bTitle) {
    return aTitle ? a : b;
  }
  const aOpening = keywordAppearsInOpening(a.keyword, plainTitle, plainBody);
  const bOpening = keywordAppearsInOpening(b.keyword, plainTitle, plainBody);
  if (aOpening !== bOpening) {
    return aOpening ? a : b;
  }
  const ra = collectionRank(a.keyword.category);
  const rb = collectionRank(b.keyword.category);
  if (ra !== rb) {
    return ra < rb ? a : b;
  }
  return sa >= sb ? a : b;
}

/** Stronger of two rows for primary folder (used to fold full keyword set). */
function pickPrimaryRowFromDeduped(deduped: ScRow[], plainTitle: string, plainBody: string): ScRow | null {
  // Gate the primary slot to note-defining candidates so a passing person/place mention does not
  // define the folder. Secondaries/tags are derived separately and still surface these names.
  const eligible = deduped.filter((row) => isPrimaryEligibleRow(row, plainTitle, plainBody));
  if (!eligible.length) return null;
  return eligible.reduce((best, cur) => betterPrimaryRow(best, cur, plainTitle, plainBody));
}

function isEligibleSecondaryFolder(row: ScRow, plainTitle: string, plainBody: string): boolean {
  const ps = folderPrimaryScore(row, plainTitle, plainBody);
  const cat = row.keyword.category;
  const inTitle = candidateAppearsInTitle(plainTitle, row.keyword.name);
  const occ = countKeywordOccurrences(plainTitle, plainBody, row.keyword);
  // Books are folder-only-when-primary: a cited-but-not-primary book never becomes a secondary
  // folder — it surfaces as a tag instead. Keep in sync with native BibleStudyTagSuggester.
  if (cat === 'book') return false;
  if (cat === 'character' || cat === 'place') {
    const strongContext = inTitle || occ >= 3;
    const floor = strongContext ? SECONDARY_MIN_SCORE : SECONDARY_CHARACTER_PLACE_MIN_SCORE;
    return ps >= floor;
  }
  if (cat === 'life') {
    const strongContext = inTitle || occ >= 3;
    return strongContext && ps >= SECONDARY_MIN_SCORE;
  }
  const strongContext = inTitle || occ >= 2;
  return strongContext && ps >= SECONDARY_MIN_SCORE;
}

function suggestSecondaryNamesForPrimary(
  rows: ScRow[],
  primaryName: string,
  plainTitle: string,
  plainBody: string,
): string[] {
  const deduped = dedupeRowsByKeywordName(rows);
  const pLow = primaryName.trim().toLowerCase();
  let candidates = deduped.filter(
    (r) =>
      r.keyword.name.toLowerCase() !== pLow && !conceptOverlaps(r.keyword.name, primaryName),
  );
  candidates.sort((a, b) => folderPrimaryScore(b, plainTitle, plainBody) - folderPrimaryScore(a, plainTitle, plainBody));

  const names: string[] = [];
  for (const r of candidates) {
    if (names.length >= MAX_AUTO_SECONDARIES) break;
    if (names.some((n) => conceptOverlaps(n, r.keyword.name))) continue;
    if (!isEligibleSecondaryFolder(r, plainTitle, plainBody)) continue;
    names.push(r.keyword.name);
  }
  return normalizeSecondaryList(primaryName, names);
}

function buildRowsForCollectionSuggest(
  title: string,
  bodyHtml: string,
): { rows: ScRow[]; plainTitle: string; plainBody: string } {
  const plainTitle = (title || '').trim();
  const plainBody = stripHtml(bodyHtml || '', { preserveSpacing: true }).trim();
  const full = `${plainTitle}\n${plainBody}`.trim();
  if (!full) return { rows: [], plainTitle, plainBody };

  const rows: ScRow[] = findKeywordsInTextWithPriority(full, plainTitle, plainBody).map((r) => ({
    keyword: r.keyword,
    confidence: Math.min(1, r.confidence),
  }));
  return { rows, plainTitle, plainBody };
}

export function suggestSecondaryCollectionsFromNote(
  title: string,
  bodyHtml: string,
  primary: string | null,
): string[] {
  const { rows, plainTitle, plainBody } = buildRowsForCollectionSuggest(title, bodyHtml);
  if (!rows.length) return [];
  const primaryNorm = normalizeCollectionLabel(primary);
  if (!primaryNorm) return [];

  const deduped = dedupeRowsByKeywordName(rows);
  const primaryWinner = pickPrimaryRowFromDeduped(deduped, plainTitle, plainBody);
  if (!meetsMinimumContext(plainTitle, plainBody, primaryWinner?.keyword.name ?? null, rows)) {
    return [];
  }

  return suggestSecondaryNamesForPrimary(rows, primaryNorm, plainTitle, plainBody);
}

export type WebCollectionNavSource = { type: 'home' } | { type: 'collection'; name: string | null };

export function collectionContextBannerText(
  primary: string | null,
  secondaries: string[],
  source: WebCollectionNavSource,
): string | null {
  const p = normalizeCollectionLabel(primary);
  const secs = normalizeSecondaryList(p, secondaries);
  const labels: string[] = [];
  if (p) labels.push(p);
  for (const s of secs) {
    if (labels.some((x) => x.toLowerCase() === s.toLowerCase())) continue;
    labels.push(s);
  }
  if (labels.length === 0) return null;

  let contextLabel: string;
  if (source.type === 'home') {
    contextLabel = labels[0];
  } else {
    const b = source.name?.trim();
    contextLabel = b && b.length > 0 ? b : labels[0];
  }
  const otherCount = labels.filter((x) => x.toLowerCase() !== contextLabel.toLowerCase()).length;
  if (otherCount <= 0) return null;
  return `${contextLabel} +${otherCount}`;
}

function pickPrimaryKeyword(rows: ScRow[], plainTitle: string, plainBody: string): BibleStudyKeyword | null {
  const deduped = dedupeRowsByKeywordName(rows);
  return pickPrimaryRowFromDeduped(deduped, plainTitle, plainBody)?.keyword ?? null;
}

/** True when the stored primary is a Bible book from passing citations only (not a book study). */
export function isNonDefiningBookPrimary(title: string, bodyHtml: string, primary: string | null): boolean {
  if (!primary?.trim()) return false;
  const { rows, plainTitle, plainBody } = buildRowsForCollectionSuggest(title, bodyHtml);
  const row = rows.find(
    (r) => r.keyword.category === 'book' && r.keyword.name.toLowerCase() === primary.trim().toLowerCase(),
  );
  if (!row) return false;
  return !isBookDefining(row, plainTitle, plainBody);
}

/** Top collection label from title + HTML body. */
export function suggestPrimaryCollectionFromNote(title: string, bodyHtml: string): string | null {
  const { rows, plainTitle, plainBody } = buildRowsForCollectionSuggest(title, bodyHtml);
  if (!rows.length) return null;
  const primary = pickPrimaryKeyword(rows, plainTitle, plainBody);
  if (!primary?.name) return null;
  if (!meetsMinimumContext(plainTitle, plainBody, primary.name, rows)) return null;
  return primary.name;
}

function scoreForName(name: string, rows: ScRow[], plainTitle: string, plainBody: string): number {
  const row = rows.find((r) => r.keyword.name.toLowerCase() === name.toLowerCase());
  return row ? folderPrimaryScore(row, plainTitle, plainBody) : 0;
}

function normalizeTitleToken(token: string): string {
  return token.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** True when the folder candidate is clearly present in the title (native `inTitle` / book-title parity). */
function candidateAppearsInTitle(plainTitle: string, candidate: string | null): boolean {
  if (!candidate || !plainTitle.trim()) return false;
  const cNorm = normalizeTitleToken(candidate);
  if (!cNorm.length) return false;
  const titleLower = plainTitle.toLowerCase();
  if (candidate.includes(' ')) {
    return titleLower.includes(candidate.trim().toLowerCase());
  }
  const titleWords = plainTitle.split(/\s+/).filter(Boolean);
  return titleWords.some((w) => normalizeTitleToken(w) === cNorm);
}

function meetsMinimumContext(title: string, plainBody: string, candidate: string | null, rows: ScRow[]): boolean {
  if (!candidate) return false;
  const words = plainBody.split(/\s+/).filter(Boolean);
  if (words.length >= MIN_BODY_WORDS) return true;
  return scoreForName(candidate, rows, title, plainBody) >= SHORT_NOTE_CONFIDENCE_FLOOR;
}

/**
 * After local title/body edit, refresh auto collection.
 * Pinned or manual override freezes primary only; secondaries still suggest.
 * "Use auto suggestion" clears override so primary can track again.
 */
export function applyAutoCollectionAfterEdit(
  prev: CollectionChromeState,
  title: string,
  bodyHtml: string,
  now: Date,
  options?: { allowPrimaryUpdate?: boolean },
): CollectionChromeState {
  const allowPrimaryUpdate = options?.allowPrimaryUpdate ?? true;

  const { rows, plainTitle, plainBody } = buildRowsForCollectionSuggest(title, bodyHtml);
  const freezePrimary = prev.collectionPinned || prev.collectionUserOverride;

  if (!rows.length) {
    if (freezePrimary) {
      const secondaryCollections = suggestSecondaryCollectionsFromNote(title, bodyHtml, prev.primaryCollection);
      return { ...prev, secondaryCollections };
    }
    return {
      ...prev,
      primaryCollection: null,
      secondaryCollections: [],
      collectionLastAutoUpdatedAtIso: null,
    };
  }

  const candidate = pickPrimaryKeyword(rows, plainTitle, plainBody)?.name ?? null;
  if (!candidate || !meetsMinimumContext(plainTitle, plainBody, candidate, rows)) {
    if (freezePrimary) {
      const secsEmpty = suggestSecondaryCollectionsFromNote(title, bodyHtml, prev.primaryCollection);
      return { ...prev, secondaryCollections: secsEmpty };
    }
    return {
      ...prev,
      primaryCollection: null,
      secondaryCollections: [],
      collectionLastAutoUpdatedAtIso: null,
    };
  }

  if (freezePrimary) {
    const secondaryCollections = suggestSecondaryCollectionsFromNote(title, bodyHtml, prev.primaryCollection);
    return { ...prev, secondaryCollections };
  }

  const current = normalizeCollectionLabel(prev.primaryCollection);
  const nowIso = now.toISOString();

  let nextPrimary: string | null = prev.primaryCollection;
  let nextLastAuto = prev.collectionLastAutoUpdatedAtIso;

  if (!current) {
    if (!allowPrimaryUpdate) {
      const secs = suggestSecondaryCollectionsFromNote(title, bodyHtml, prev.primaryCollection);
      return { ...prev, secondaryCollections: secs };
    }
    nextPrimary = candidate;
    nextLastAuto = nowIso;
  } else if (current.toLowerCase() === candidate.toLowerCase()) {
    nextPrimary = candidate;
  } else {
    // Auto mode tracks the best candidate. The content-boundary gate (`allowPrimaryUpdate`) is the
    // only stabilizer — there is no time cooldown or score hysteresis keeping a stale primary.
    if (!allowPrimaryUpdate) {
      const secs = suggestSecondaryCollectionsFromNote(title, bodyHtml, prev.primaryCollection);
      return { ...prev, secondaryCollections: secs };
    }
    nextPrimary = candidate;
    nextLastAuto = nowIso;
  }

  const secondaryCollections = suggestSecondaryCollectionsFromNote(title, bodyHtml, nextPrimary);
  return {
    ...prev,
    primaryCollection: nextPrimary,
    secondaryCollections,
    collectionLastAutoUpdatedAtIso: nextLastAuto,
  };
}
