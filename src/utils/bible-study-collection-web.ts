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
  secondaryCollections: string[];
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
const MAX_AUTO_SECONDARIES = 5;

export function suggestSecondaryCollectionsFromNote(
  title: string,
  bodyHtml: string,
  primary: string | null,
): string[] {
  const plainTitle = (title || '').trim();
  const plainBody = stripHtml(bodyHtml || '', { preserveSpacing: true }).trim();
  const full = `${plainTitle}\n${plainBody}`.trim();
  if (!full) return [];
  const primaryNorm = normalizeCollectionLabel(primary);
  if (!primaryNorm) return [];

  const rows: ScRow[] = findKeywordsInTextWithPriority(full, plainTitle, plainBody).map((r) => ({
    keyword: r.keyword,
    confidence: Math.min(1, r.confidence),
  }));

  if (
    !meetsMinimumContext(plainTitle, plainBody, pickPrimaryKeyword(rows)?.name ?? null, rows)
  ) {
    return [];
  }

  const dedup: ScRow[] = [];
  for (const r of rows) {
    if (r.keyword.name.toLowerCase() === 'god') continue;
    if (dedup.some((d) => d.keyword.name.toLowerCase() === r.keyword.name.toLowerCase())) continue;
    if (dedup.some((d) => overlapsConcept(d.keyword.name, r.keyword.name))) continue;
    dedup.push(r);
    if (dedup.length >= 16) break;
  }

  const scored = dedup
    .map((r) => ({ row: r, score: boostedPrimaryScore(r) }))
    .filter((x) => x.score >= SECONDARY_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const names: string[] = [];
  for (const { row } of scored) {
    if (names.length >= MAX_AUTO_SECONDARIES) break;
    const name = row.keyword.name;
    if (name.toLowerCase() === primaryNorm.toLowerCase()) continue;
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) continue;
    names.push(name);
  }
  return normalizeSecondaryList(primary, names);
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
 * After local title/body edit, refresh auto collection. Pinned freezes primary only; secondaries still suggest.
 * Manual (`collectionUserOverride` without pin) skips auto updates until restored.
 */
export function applyAutoCollectionAfterEdit(
  prev: CollectionChromeState,
  title: string,
  bodyHtml: string,
  now: Date,
): CollectionChromeState {
  if (prev.collectionUserOverride && !prev.collectionPinned) return prev;

  const plainTitle = (title || '').trim();
  const plainBody = stripHtml(bodyHtml || '', { preserveSpacing: true }).trim();
  const full = `${plainTitle}\n${plainBody}`.trim();
  if (!full) return prev;

  const freezePrimary = prev.collectionPinned || prev.collectionUserOverride;

  const rows: ScRow[] = findKeywordsInTextWithPriority(full, plainTitle, plainBody).map((r) => ({
    keyword: r.keyword,
    confidence: Math.min(1, r.confidence),
  }));

  const candidate = pickPrimaryKeyword(rows)?.name ?? null;
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
    nextPrimary = candidate;
    nextLastAuto = nowIso;
  } else if (current.toLowerCase() === candidate.toLowerCase()) {
    nextPrimary = candidate;
  } else {
    if (!pastCooldown) {
      const secs = suggestSecondaryCollectionsFromNote(title, bodyHtml, prev.primaryCollection);
      return { ...prev, secondaryCollections: secs };
    }

    const currentScore = scoreForName(current, rows);
    const candidateScore = scoreForName(candidate, rows);
    const materiallyStronger = candidateScore >= currentScore + 0.18;
    const candRow = rows.find((r) => r.keyword.name.toLowerCase() === candidate.toLowerCase());
    const strongSignal =
      !!candRow &&
      (candRow.confidence >= candRow.keyword.confidence + 0.2 || candRow.confidence >= candidateScore - 0.05);

    if (!(materiallyStronger && strongSignal)) {
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
