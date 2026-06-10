/**
 * Auto primary collection hints for web notes — aligns with native `BibleStudyTagSuggester` intent
 * using client-side keyword corpus (`bible-study-keywords.ts`).
 */

import { stripHtml } from '@/utils/html-stripper';
import {
  findKeywordsInTextWithPriority,
  isAutoFolderExcludedKeyword,
  type BibleStudyKeyword,
} from '@/utils/bible-study-keywords';

const MIN_BODY_WORDS = 25;
const SHORT_NOTE_CONFIDENCE_FLOOR = 0.9;
const AUTO_REPLACE_COOLDOWN_MS = 25_000;

/** When two folder scores are within this band, prefer title hit and category rank. */
const PRIMARY_SCORE_AMBIGUITY_EPS = 0.04;

function normalizeCollectionLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim();
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

function overlapsConcept(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const pairs: [string, string][] = [
    ['grace', 'mercy'],
    ['faith', 'belief'],
    ['jesus', 'christ'],
    ['prayer', 'intercession'],
  ];
  for (const [p, q] of pairs) {
    if ((x === p && y === q) || (x === q && y === p)) return true;
  }
  return false;
}

interface ScRow {
  keyword: BibleStudyKeyword;
  confidence: number;
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
    case 'theme':
      score += 0.08;
      break;
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
  return score;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rough occurrence count for folder eligibility (name + synonyms; word-bound for single tokens). */
function countKeywordOccurrences(plainTitle: string, plainBody: string, keyword: BibleStudyKeyword): number {
  const corpus = `${plainTitle} ${plainBody}`.toLowerCase();
  let total = 0;
  const needles = [keyword.name, ...keyword.synonyms];
  const seen = new Set<string>();
  for (const raw of needles) {
    const n = raw.trim().toLowerCase();
    if (!n || seen.has(n)) continue;
    seen.add(n);
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
const SECONDARY_CHARACTER_PLACE_MIN_SCORE = 0.88;
const MAX_AUTO_SECONDARIES = 5;

function dedupeRowsByKeywordName(rows: ScRow[]): ScRow[] {
  const by = new Map<string, ScRow>();
  for (const r of rows) {
    if (isAutoFolderExcludedKeyword(r.keyword.name)) continue;
    const k = r.keyword.name.toLowerCase();
    const prev = by.get(k);
    if (!prev || r.confidence > prev.confidence) by.set(k, r);
  }
  return [...by.values()];
}

function betterPrimaryRow(a: ScRow, b: ScRow, plainTitle: string, plainBody: string): ScRow {
  const sa = folderPrimaryScore(a, plainTitle, plainBody);
  const sb = folderPrimaryScore(b, plainTitle, plainBody);
  if (Math.abs(sa - sb) > PRIMARY_SCORE_AMBIGUITY_EPS) {
    return sa >= sb ? a : b;
  }
  const aTitle = candidateAppearsInTitle(plainTitle, a.keyword.name);
  const bTitle = candidateAppearsInTitle(plainTitle, b.keyword.name);
  if (aTitle !== bTitle) {
    return aTitle ? a : b;
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
  if (!deduped.length) return null;
  return deduped.reduce((best, cur) => betterPrimaryRow(best, cur, plainTitle, plainBody));
}

function isEligibleSecondaryFolder(row: ScRow, plainTitle: string, plainBody: string): boolean {
  const ps = folderPrimaryScore(row, plainTitle, plainBody);
  const cat = row.keyword.category;
  if (cat === 'character' || cat === 'place') {
    const inTitle = candidateAppearsInTitle(plainTitle, row.keyword.name);
    const occ = countKeywordOccurrences(plainTitle, plainBody, row.keyword);
    const strongContext = inTitle || occ >= 3;
    const floor = strongContext ? SECONDARY_MIN_SCORE : SECONDARY_CHARACTER_PLACE_MIN_SCORE;
    return ps >= floor;
  }
  return ps >= SECONDARY_MIN_SCORE;
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
      r.keyword.name.toLowerCase() !== pLow && !overlapsConcept(r.keyword.name, primaryName),
  );
  candidates.sort((a, b) => folderPrimaryScore(b, plainTitle, plainBody) - folderPrimaryScore(a, plainTitle, plainBody));

  const names: string[] = [];
  for (const r of candidates) {
    if (names.length >= MAX_AUTO_SECONDARIES) break;
    if (names.some((n) => overlapsConcept(n, r.keyword.name))) continue;
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
 * After local title/body edit, refresh auto collection. Pinned freezes primary only; secondaries still suggest.
 * Manual (`collectionUserOverride` without pin) skips auto updates until restored.
 */
export function applyAutoCollectionAfterEdit(
  prev: CollectionChromeState,
  title: string,
  bodyHtml: string,
  now: Date,
  options?: { allowPrimaryUpdate?: boolean },
): CollectionChromeState {
  const allowPrimaryUpdate = options?.allowPrimaryUpdate ?? true;
  if (prev.collectionUserOverride && !prev.collectionPinned) return prev;

  const { rows, plainTitle, plainBody } = buildRowsForCollectionSuggest(title, bodyHtml);
  if (!rows.length) return prev;

  const freezePrimary = prev.collectionPinned || prev.collectionUserOverride;

  const candidate = pickPrimaryKeyword(rows, plainTitle, plainBody)?.name ?? null;
  if (!candidate || !meetsMinimumContext(plainTitle, plainBody, candidate, rows)) {
    const secsEmpty = suggestSecondaryCollectionsFromNote(title, bodyHtml, prev.primaryCollection);
    return { ...prev, secondaryCollections: secsEmpty };
  }

  if (freezePrimary) {
    const secondaryCollections = suggestSecondaryCollectionsFromNote(title, bodyHtml, prev.primaryCollection);
    return { ...prev, secondaryCollections };
  }

  const current = normalizeCollectionLabel(prev.primaryCollection);
  const nowIso = now.toISOString();
  const lastMs = prev.collectionLastAutoUpdatedAtIso ? Date.parse(prev.collectionLastAutoUpdatedAtIso) : NaN;
  const pastCooldown =
    !Number.isFinite(lastMs) || Number.isNaN(now.getTime()) ? true : now.getTime() - lastMs >= AUTO_REPLACE_COOLDOWN_MS;

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
    if (!pastCooldown) {
      const secs = suggestSecondaryCollectionsFromNote(title, bodyHtml, prev.primaryCollection);
      return { ...prev, secondaryCollections: secs };
    }

    const currentScore = scoreForName(current, rows, plainTitle, plainBody);
    const candidateScore = scoreForName(candidate, rows, plainTitle, plainBody);
    const materiallyStronger = candidateScore >= currentScore + 0.18;
    const candRow = rows.find((r) => r.keyword.name.toLowerCase() === candidate.toLowerCase());
    const strongSignal =
      !!candRow &&
      (candRow.confidence >= candRow.keyword.confidence + 0.2 || candRow.confidence >= candidateScore - 0.05);

    if (!(materiallyStronger && strongSignal)) {
      const secs = suggestSecondaryCollectionsFromNote(title, bodyHtml, prev.primaryCollection);
      return { ...prev, secondaryCollections: secs };
    }

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
