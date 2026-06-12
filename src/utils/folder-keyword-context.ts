/**
 * Folder-scoring context guards — skip incidental spiritual/biblical mentions that
 * describe childhood church ritual rather than the note's subject.
 * Keep in sync with native `FolderKeywordContextGate` (Swift).
 */

import type { BibleStudyKeyword } from '@/utils/bible-study-keywords';

const RITUAL_DESCRIPTIVE_FOLDER_KEYWORDS = new Set([
  'prayer',
  'worship',
  'communion',
  'praise',
  'thanksgiving',
  'baptism',
  'sabbath',
]);

/** e.g. "Prayer was this formal sounding way…" — ritual description, not the note theme. */
const RITUAL_DESCRIPTIVE_RE = /\b([a-z][a-z\s'-]{0,40})\s+was\s+(?:this|a|just)\b/giu;

function escapeRegexToken(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeThemeToken(token: string): string {
  return token.trim().toLowerCase();
}

function keywordMatchesRitualSubject(keyword: BibleStudyKeyword, subject: string): boolean {
  const sub = normalizeThemeToken(subject);
  if (!sub) return false;
  const name = keyword.name.trim().toLowerCase();
  if (sub === name) return true;
  return keyword.synonyms.some((syn) => normalizeThemeToken(syn) === sub);
}

/** True when the keyword appears only as a ritual/definitional "X was this…" mention. */
export function isRitualDescriptiveFolderMention(
  keyword: BibleStudyKeyword,
  plainTitle: string,
  plainBody: string,
): boolean {
  const key = keyword.name.trim().toLowerCase();
  if (!RITUAL_DESCRIPTIVE_FOLDER_KEYWORDS.has(key)) return false;

  const corpus = `${plainTitle} ${plainBody}`.trim();
  if (!corpus) return false;

  for (const m of corpus.matchAll(RITUAL_DESCRIPTIVE_RE)) {
    const subject = m[1] ?? '';
    if (!keywordMatchesRitualSubject(keyword, subject)) continue;
    return true;
  }
  return false;
}

/** Penalty applied in folder primary scoring for ritual-descriptive theme mentions. */
export const RITUAL_DESCRIPTIVE_FOLDER_SCORE_PENALTY = 0.18;
