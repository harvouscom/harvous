/**
 * Subject vocabulary → auto-tag candidates. Maps informal prose to canonical subject tags
 * (same vocabulary as folder auto-assign). Keep in sync with native SubjectTagCandidates.swift.
 */

import { conceptOverlapsAny } from '@/utils/bible-study-concept-overlaps';
import { SUBJECT_VOCABULARY, type Subject, type SubjectCategory } from '@/utils/subject-vocabulary';

export const MAX_SUBJECT_TAG_CANDIDATES = 4;

const CONF_NAME_TITLE = 0.82;
const CONF_NAME_BODY = 0.76;
const CONF_SYN_TITLE = 0.78;
const CONF_SYN_BODY = 0.72;

export interface SubjectTagCandidate {
  name: string;
  category: string;
  confidence: number;
  source: 'subject';
  /** Informal phrase that matched (for ghost-chip tooltip). */
  matchedPhrase?: string;
}

export interface SubjectTagCandidateOptions {
  excludeLabels?: string[];
  excludeTagNames?: string[];
  existingTagNames?: string[];
  confidenceThreshold?: number;
}

function normalize(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function padded(text: string): string {
  return ` ${normalize(text)} `;
}

function containsPhrase(paddedText: string, phrase: string): boolean {
  const t = normalize(phrase);
  if (t.length < 3) return false;
  return paddedText.includes(` ${t} `);
}

function subjectCategoryToTagCategory(category: SubjectCategory): string {
  switch (category) {
    case 'spiritual':
      return 'spiritual';
    case 'biblical':
      return 'biblical';
    case 'life':
      return 'life';
    case 'narrative':
      return 'theme';
    default:
      return 'theme';
  }
}

function scoreSubjectMatch(
  subject: Subject,
  paddedTitle: string,
  paddedBody: string,
): { confidence: number; matchedPhrase?: string } | null {
  let best = 0;
  let matchedPhrase: string | undefined;

  const consider = (phrase: string, confidence: number) => {
    if (confidence <= best) return;
    best = confidence;
    matchedPhrase = phrase;
  };

  if (containsPhrase(paddedTitle, subject.name)) {
    consider(subject.name, CONF_NAME_TITLE);
  } else if (containsPhrase(paddedBody, subject.name)) {
    consider(subject.name, CONF_NAME_BODY);
  }

  for (const syn of subject.synonyms) {
    if (containsPhrase(paddedTitle, syn)) {
      consider(syn, CONF_SYN_TITLE);
    } else if (containsPhrase(paddedBody, syn)) {
      consider(syn, CONF_SYN_BODY);
    }
  }

  if (best <= 0) return null;
  return { confidence: best, matchedPhrase };
}

/** Canonical subject tags implied by note title + plain body. Pure. */
export function subjectTagCandidatesFromText(
  title: string,
  body: string,
  options: SubjectTagCandidateOptions = {},
): SubjectTagCandidate[] {
  const threshold = options.confidenceThreshold ?? 0.7;
  const excludeLabels = options.excludeLabels ?? [];
  const excludeTagNames = options.excludeTagNames ?? [];
  const existingTagNames = options.existingTagNames ?? [];
  const isExcluded = (name: string) =>
    conceptOverlapsAny(name, excludeLabels) ||
    conceptOverlapsAny(name, excludeTagNames) ||
    conceptOverlapsAny(name, existingTagNames);

  const paddedTitle = padded(title || '');
  const paddedBody = padded(body || '');
  if (paddedTitle.length <= 2 && paddedBody.length <= 2) return [];

  const raw: SubjectTagCandidate[] = [];
  for (const subject of SUBJECT_VOCABULARY) {
    const scored = scoreSubjectMatch(subject, paddedTitle, paddedBody);
    if (!scored || scored.confidence < threshold) continue;
    if (isExcluded(subject.name)) continue;
    if (raw.some((r) => conceptOverlapsAny(r.name, [subject.name]))) continue;
    raw.push({
      name: subject.name,
      category: subjectCategoryToTagCategory(subject.category),
      confidence: scored.confidence,
      source: 'subject',
      matchedPhrase: scored.matchedPhrase !== subject.name ? scored.matchedPhrase : undefined,
    });
  }

  raw.sort((a, b) => b.confidence - a.confidence);
  return raw.slice(0, MAX_SUBJECT_TAG_CANDIDATES);
}

/** Merge subject candidates into base tag suggestions (deduped, capped). Pure. */
export function mergeSubjectTagSuggestions<T extends { name: string; category: string; confidence: number }>(
  base: T[],
  candidates: SubjectTagCandidate[],
  opts: { excludeLabels?: string[]; excludeTagNames?: string[]; maxAdd?: number } = {},
): Array<T | SubjectTagCandidate> {
  const excludeLabels = opts.excludeLabels ?? [];
  const excludeTagNames = opts.excludeTagNames ?? [];
  const maxAdd = opts.maxAdd ?? MAX_SUBJECT_TAG_CANDIDATES;
  const isExcluded = (name: string) =>
    conceptOverlapsAny(name, excludeLabels) || conceptOverlapsAny(name, excludeTagNames);

  const out: Array<T | SubjectTagCandidate> = [...base];
  const present = new Set(out.map((s) => s.name.toLowerCase()));
  let added = 0;
  for (const c of candidates) {
    if (added >= maxAdd) break;
    const low = c.name.toLowerCase();
    if (present.has(low)) continue;
    if (isExcluded(c.name)) continue;
    if (out.some((s) => conceptOverlapsAny(c.name, [s.name]))) continue;
    out.push(c);
    present.add(low);
    added++;
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}
