/**
 * One line under a review that says why it is here, or what it connects to.
 *
 * "Cited in three of your notes." "On adoption, which you have been circling since June." A row
 * that carries only its task reads as a worksheet; a row that says what the thing is to *this*
 * reader reads as written for them. That is the whole job of this file, and it is deliberately
 * small: one sentence, chosen from facts the app already holds, never invented.
 *
 * Three rules.
 *
 * **Reader facts outrank curated facts, which outrank state.** What the reader did with a
 * passage is worth more than what an index says about it, and both are worth more than where it
 * sits on a ladder. Within a group the seed picks, so a reader with several heavily-revisited
 * verses is not told "you keep coming back to this one" under every single row.
 *
 * **Never the answer.** A theme line on the theme rung, a name on the person rung, a count on
 * the cross-reference rung, a citation count on the rung that asks which note cites it — each
 * would print the answer under the question. And nothing at all where the subject itself is the
 * answer. These are pinned by tests, one per leak.
 *
 * **Never a bare fallback.** Null is a real answer; the row prints its provenance instead.
 *
 * The line ships as a template and its arguments rather than as text, because the one thing in
 * it that depends on the reader — the month a passage entered their study — has to be rendered
 * in their own zone. `fillFraming` does that on the client.
 */

import type { RecallState } from '@/utils/review-item-kinds';
import type { ReviewPromptKey } from '@/utils/review-prompts';
import { hashSeed } from '@/utils/verse-cloze';

export interface ReviewFramingFacts {
  kind: 'note' | 'verse' | 'chapter';
  rungKey: ReviewPromptKey;
  /** True on the rungs whose answer is the subject itself; nothing is framed there. */
  identityIsAnswer: boolean;
  /** 0 while climbing the ladder; 1, 2, 3… on maintenance passes. */
  pass: number;
  recallState: RecallState;
  revisitCount: number;
  citedInNotes: number;
  /** ISO. When this first entered the reader's study, from the Study Bible layer. */
  firstStudiedAt: string | null;
  /** Curated topic on the verse at or above the relevance floor, as a display label. */
  topTheme: string | null;
  person: string | null;
  crossRefCount: number;
  /** The reader marked a span of this verse in the Bible reader. */
  readerMarked: boolean;
}

export type ReviewFramingTemplate =
  | 'returning'
  | 'cited'
  | 'marked'
  | 'since'
  | 'themeSince'
  | 'theme'
  | 'person'
  | 'crossrefs'
  | 'pass'
  | 'holding';

export interface ReviewFramingSpec {
  template: ReviewFramingTemplate;
  args: { n?: number; label?: string; sinceIso?: string };
}

const DAY_MS = 86_400_000;

function daysAgo(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / DAY_MS;
}

/**
 * The line for one item, or null.
 *
 * Groups in priority order; within a group, every template whose condition holds is a candidate
 * and the seed picks one — so the ranking is between kinds of fact, not a fixed sentence.
 */
export function reviewFraming(
  facts: ReviewFramingFacts,
  seed: string,
  now: Date = new Date(),
): ReviewFramingSpec | null {
  if (facts.identityIsAnswer) return null;

  const age = daysAgo(facts.firstStudiedAt, now);
  // A person can frame a passage or a chapter; a note is never "about Nicodemus".
  const isScripture = facts.kind !== 'note';
  const key = facts.rungKey;

  // Leak rules, each the reason a candidate is left out of its group.
  const themeLeaks = key === 'verse.theme';
  const personLeaks = key === 'verse.person' || key === 'chapter.person';
  const crossrefLeaks = key === 'verse.crossref' || key === 'verse.locate';
  const citedLeaks = key === 'verse.connect';

  const reader: ReviewFramingSpec[] = [];
  if (facts.revisitCount >= 2) reader.push({ template: 'returning', args: {} });
  if (facts.citedInNotes >= 2 && !citedLeaks) {
    reader.push({ template: 'cited', args: { n: facts.citedInNotes } });
  }
  if (facts.readerMarked) reader.push({ template: 'marked', args: {} });
  if (age !== null && age >= 60 && facts.revisitCount >= 1 && facts.firstStudiedAt) {
    reader.push({ template: 'since', args: { sinceIso: facts.firstStudiedAt } });
  }

  const curated: ReviewFramingSpec[] = [];
  if (facts.topTheme && !themeLeaks) {
    if (age !== null && age >= 30 && facts.firstStudiedAt) {
      curated.push({
        template: 'themeSince',
        args: { label: facts.topTheme, sinceIso: facts.firstStudiedAt },
      });
    } else {
      curated.push({ template: 'theme', args: { label: facts.topTheme } });
    }
  }
  if (isScripture && facts.person && !personLeaks) {
    curated.push({ template: 'person', args: { label: facts.person } });
  }
  if (facts.crossRefCount >= 8 && !crossrefLeaks) {
    curated.push({ template: 'crossrefs', args: { n: facts.crossRefCount } });
  }

  const state: ReviewFramingSpec[] = [];
  if (facts.pass >= 1) state.push({ template: 'pass', args: {} });
  if (facts.recallState === 'durable') state.push({ template: 'holding', args: {} });

  for (const group of [reader, curated, state]) {
    if (group.length) return group[hashSeed(seed) % group.length];
  }
  return null;
}

/** Render a spec in the reader's own zone. Month names come from the client's locale. */
export function fillFraming(spec: ReviewFramingSpec, now: Date = new Date()): string {
  const month = (iso: string | undefined) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString(undefined, { month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
  };
  switch (spec.template) {
    case 'returning':
      return 'You keep coming back to this one.';
    case 'cited':
      return `Cited in ${spec.args.n ?? 0} of your notes.`;
    case 'marked':
      return 'You marked this while reading.';
    case 'since':
      return `In your study since ${month(spec.args.sinceIso)}.`;
    case 'themeSince':
      return `On ${spec.args.label ?? ''}, which you have been circling since ${month(spec.args.sinceIso)}.`;
    case 'theme':
      return `On ${spec.args.label ?? ''}.`;
    case 'person':
      return `About ${spec.args.label ?? ''}.`;
    case 'crossrefs':
      return `Cross-referenced ${spec.args.n ?? 0} times.`;
    case 'pass':
      return 'Back for another pass.';
    case 'holding':
      return 'Holding. Keep it that way.';
  }
}
