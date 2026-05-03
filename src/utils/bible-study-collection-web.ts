/**
 * Auto primary collection hints for web notes — aligns with native `BibleStudyTagSuggester` intent
 * using client-side keyword corpus (`bible-study-keywords.ts`).
 */

import { stripHtml } from '@/utils/html-stripper';
import {
  findKeywordsInTextWithPriority,
  type BibleStudyKeyword,
} from '@/utils/bible-study-keywords';

const MIN_BODY_WORDS = 25;
const SHORT_NOTE_CONFIDENCE_FLOOR = 1.02;
const AUTO_REPLACE_COOLDOWN_MS = 25_000;

function normalizeCollectionLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim();
  return t.length ? t : null;
}

export interface CollectionChromeState {
  primaryCollection: string | null;
  collectionPinned: boolean;
  collectionUserOverride: boolean;
  collectionLastAutoUpdatedAtIso: string | null;
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

function boostedPrimaryScore(row: ScRow): number {
  let score = row.confidence;
  const cat = row.keyword.category;
  if (cat === 'spiritual' || cat === 'biblical' || cat === 'theme' || cat === 'life') score += 0.08;
  if (cat === 'character' || cat === 'place') {
    score += 0.06;
  }
  if (['spiritual', 'biblical', 'character', 'book', 'theme'].includes(cat)) {
    score = Math.min(1, score + 0.05);
  }
  return score;
}

function pickPrimaryKeyword(rows: ScRow[]): BibleStudyKeyword | null {
  const dedup: ScRow[] = [];
  for (const r of rows) {
    if (r.keyword.name.toLowerCase() === 'god') continue;
    if (dedup.some((d) => d.keyword.name.toLowerCase() === r.keyword.name.toLowerCase())) continue;
    if (dedup.some((d) => overlapsConcept(d.keyword.name, r.keyword.name))) continue;
    dedup.push(r);
    if (dedup.length >= 16) break;
  }
  if (!dedup.length) return null;
  const sorted = [...dedup].sort((a, b) => {
    const sa = boostedPrimaryScore(a);
    const sb = boostedPrimaryScore(b);
    if (Math.abs(sa - sb) > 0.001) return sb - sa;
    return collectionRank(a.keyword.category) - collectionRank(b.keyword.category);
  });
  return sorted[0]?.keyword ?? null;
}

/** Top collection label from title + HTML body. */
export function suggestPrimaryCollectionFromNote(title: string, bodyHtml: string): string | null {
  const plainTitle = (title || '').trim();
  const plainBody = stripHtml(bodyHtml || '', { preserveSpacing: true }).trim();
  const full = `${plainTitle}\n${plainBody}`.trim();
  if (!full) return null;
  const rows: ScRow[] = findKeywordsInTextWithPriority(full, plainTitle, plainBody).map((r) => ({
    keyword: r.keyword,
    confidence: Math.min(1, r.confidence),
  }));
  const primary = pickPrimaryKeyword(rows);
  return primary?.name ?? null;
}

function scoreForName(name: string, rows: ScRow[]): number {
  const row = rows.find((r) => r.keyword.name.toLowerCase() === name.toLowerCase());
  return row ? boostedPrimaryScore(row) : 0;
}

function meetsMinimumContext(title: string, plainBody: string, candidate: string | null, rows: ScRow[]): boolean {
  if (!candidate) return false;
  const words = plainBody.split(/\s+/).filter(Boolean);
  if (words.length >= MIN_BODY_WORDS) return true;
  return scoreForName(candidate, rows) >= SHORT_NOTE_CONFIDENCE_FLOOR;
}

/**
 * After local title/body edit, refresh auto collection when allowed (not pinned / not user override).
 */
export function applyAutoCollectionAfterEdit(
  prev: CollectionChromeState,
  title: string,
  bodyHtml: string,
  now: Date,
): CollectionChromeState {
  if (prev.collectionPinned || prev.collectionUserOverride) return prev;

  const plainTitle = (title || '').trim();
  const plainBody = stripHtml(bodyHtml || '', { preserveSpacing: true }).trim();
  const full = `${plainTitle}\n${plainBody}`.trim();
  if (!full) return prev;

  const rows: ScRow[] = findKeywordsInTextWithPriority(full, plainTitle, plainBody).map((r) => ({
    keyword: r.keyword,
    confidence: Math.min(1, r.confidence),
  }));

  const candidate = pickPrimaryKeyword(rows)?.name ?? null;
  if (!candidate) return prev;
  if (!meetsMinimumContext(plainTitle, plainBody, candidate, rows)) return prev;

  const current = normalizeCollectionLabel(prev.primaryCollection);
  const nowIso = now.toISOString();
  const lastMs = prev.collectionLastAutoUpdatedAtIso ? Date.parse(prev.collectionLastAutoUpdatedAtIso) : NaN;
  const pastCooldown =
    !Number.isFinite(lastMs) || Number.isNaN(now.getTime()) ? true : now.getTime() - lastMs >= AUTO_REPLACE_COOLDOWN_MS;

  if (!current) {
    return { ...prev, primaryCollection: candidate, collectionLastAutoUpdatedAtIso: nowIso };
  }
  if (current.toLowerCase() === candidate.toLowerCase()) {
    return { ...prev, primaryCollection: candidate };
  }

  if (!pastCooldown) return prev;

  const currentScore = scoreForName(current, rows);
  const candidateScore = scoreForName(candidate, rows);
  const materiallyStronger = candidateScore >= currentScore + 0.18;
  const candRow = rows.find((r) => r.keyword.name.toLowerCase() === candidate.toLowerCase());
  const strongSignal =
    !!candRow &&
    (candRow.confidence >= candRow.keyword.confidence + 0.2 || candRow.confidence >= candidateScore - 0.05);

  if (!(materiallyStronger && strongSignal)) return prev;

  return { ...prev, primaryCollection: candidate, collectionLastAutoUpdatedAtIso: nowIso };
}
