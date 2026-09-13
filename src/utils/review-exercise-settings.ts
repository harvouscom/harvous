/**
 * How much of each kind of exercise a reader would like.
 *
 * Shared by the SPA and the server like `reminder-settings.ts`: the settings page validates what
 * it is about to send, the endpoint validates what it received, and the review engine reads the
 * stored column when it resolves a rung. One shape, one parser, no drift.
 *
 * **Emphasis, not switches.** Each family is More, Normal or Less, and the axis stops there — a
 * named choice, never a dial, for the reason `reminder-settings.ts` gives about "how many": a
 * free number is an invitation to ask for more than anyone should be given.
 *
 * - **Less** is exactly what "off" used to be. Its keys join `material.skip`, the walk passes
 *   them, and the fall-forward still guarantees a question. A preference can never make one
 *   impossible, and it can never cost the queue a row.
 * - **More** counts the family twice in the seeded draw (`emphasisDraw` in `review-prompts.ts`).
 *   A weight and never an order, so it cannot remove anything: putting a family first would make
 *   it the only thing asked wherever it could be, which is an allow-list by another name.
 * - **Normal** is absent. Stored sparse, so a family added later arrives Normal for everybody —
 *   silence is consent, as it was when this was a skip-list.
 *
 * **Offered only where it can do something.** A family that is the only family in every draw it
 * appears in has nothing to lean toward or away from: its step asks it whatever the reader says.
 * That is derived from the ladders (`emphasisIsOfferable`) rather than listed, because the list
 * this replaced was written by hand and was wrong both ways. It offered switches on `memory` and
 * `next`, which own both members of their steps and so could change which of the two was asked
 * but never whether one was; and it refused one on `order` and `note`, which share a draw with
 * other families and can genuinely be asked less.
 *
 * **Stored as version 2 with the old skip-list alongside.** `skip` is derived on every write, so
 * code that only knows version 1 — a rollback, a stale deploy — still reads "Less" as the "off" it
 * always meant, rather than finding no list and wiping the reader's preferences. "More" has no
 * version-1 meaning and is simply not seen there.
 */

import {
  CHAPTER_FAMILIES,
  NOTE_LADDER,
  VERSE_FAMILIES,
  type ReviewPromptKey,
} from '@/utils/review-prompts';
import {
  REVIEW_EXERCISE_FAMILY_ORDER,
  reviewExerciseFamilyId,
  reviewPromptKeysInFamily,
  type ReviewExerciseFamilyId,
} from '@/utils/review-exercise-families';

export type ReviewEmphasis = 'more' | 'normal' | 'less';

/** What is actually stored. Normal is the absence of an entry. */
export type StoredReviewEmphasis = Exclude<ReviewEmphasis, 'normal'>;

export interface ReviewExerciseSettings {
  version: 2;
  emphasis: Partial<Record<ReviewExerciseFamilyId, StoredReviewEmphasis>>;
}

export const DEFAULT_REVIEW_EXERCISE_SETTINGS: ReviewExerciseSettings = Object.freeze({
  version: 2,
  emphasis: Object.freeze({}),
}) as ReviewExerciseSettings;

/** What a rung walk consumes: keys to pass, and keys to weight. */
export interface RungPreferences {
  skip: ReadonlySet<ReviewPromptKey>;
  prefer: ReadonlySet<ReviewPromptKey>;
}

/**
 * Every draw a rung is chosen from — the only places a preference can move a question.
 *
 * - A verse step draws over its whole family.
 * - A chapter step draws over the members *before* its closing `chapter.verse`. That one is the
 *   fallback, not a peer (see `CHAPTER_FAMILIES`), so no preference may reach it.
 * - A note walks the whole ladder from a rotated start.
 */
function rungDraws(): readonly (readonly ReviewPromptKey[])[] {
  return [
    ...VERSE_FAMILIES,
    ...CHAPTER_FAMILIES.map((members) => members.slice(0, -1)),
    NOTE_LADDER,
  ];
}

const OFFERABLE = new Set<ReviewExerciseFamilyId>(
  REVIEW_EXERCISE_FAMILY_ORDER.filter((id) =>
    rungDraws().some((draw) => {
      const families = new Set(draw.map((key) => reviewExerciseFamilyId(key)));
      return families.has(id) && families.size > 1;
    }),
  ),
);

/**
 * Whether More or Less on this family can change how often it is asked.
 *
 * True when it shares at least one draw with another family. `review-emphasis-honesty.test.ts`
 * checks the claim by resolving rungs rather than by reading tables, so a new rung that changes
 * the answer fails a test before it reaches a settings row.
 */
export function emphasisIsOfferable(id: ReviewExerciseFamilyId): boolean {
  return OFFERABLE.has(id);
}

/**
 * The families Settings offers no control for, in page order.
 *
 * Written out so the page and the tests have a list a person can read, and asserted equal to the
 * derivation so the two cannot drift. Each is the only family in every draw it is part of:
 * `opening` and `changed` are the sole exercise on their verse steps — and `opening` is also every
 * chapter step's fallback — while `memory` and `next` own both members of theirs.
 */
export const ALWAYS_ON_FAMILIES: readonly ReviewExerciseFamilyId[] = [
  'opening',
  'memory',
  'next',
  'changed',
];

export function familyIsAlwaysOn(id: ReviewExerciseFamilyId): boolean {
  return !emphasisIsOfferable(id);
}

/** The families a reader can lean toward or away from, in the order the page lists them. */
export function offerableFamilies(): ReviewExerciseFamilyId[] {
  return REVIEW_EXERCISE_FAMILY_ORDER.filter(emphasisIsOfferable);
}

function cleanEmphasis(raw: Record<string, unknown>): ReviewExerciseSettings['emphasis'] {
  const out: ReviewExerciseSettings['emphasis'] = {};
  // Page order, so a document round-trips to the same string.
  for (const id of REVIEW_EXERCISE_FAMILY_ORDER) {
    const value = raw[id];
    if ((value === 'more' || value === 'less') && emphasisIsOfferable(id)) out[id] = value;
  }
  return out;
}

/**
 * A version-1 skip-list, read as emphasis.
 *
 * A family whose every key was skipped becomes Less, which is lossless: the old page only ever
 * wrote whole families, and Less resolves to the same skip set. A family now offered no control
 * is dropped — `memory` and `next` among them, whose switches never changed how often they were
 * asked. A partly skipped family is left Normal, because that document was not written by the page.
 */
function emphasisFromSkipList(skip: readonly unknown[]): ReviewExerciseSettings['emphasis'] {
  const skipped = new Set(skip.filter((key): key is string => typeof key === 'string'));
  const out: ReviewExerciseSettings['emphasis'] = {};
  for (const id of offerableFamilies()) {
    const keys = reviewPromptKeysInFamily(id);
    if (keys.length && keys.every((key) => skipped.has(key))) out[id] = 'less';
  }
  return out;
}

/**
 * Read the stored column.
 *
 * Tolerant on purpose: an unreadable value is "no preferences" rather than an error, because the
 * alternative is a reader whose Review stops working over a bad row. Unknown families, unknown
 * values and families with no control are dropped rather than rejecting the whole document — a
 * retired family should not invalidate the preferences someone still holds about the others.
 *
 * `version` is read by shape and never trusted: a document with `emphasis` is version 2, one with
 * only `skip` is version 1, and anything else is the default.
 */
export function parseReviewExerciseSettings(
  raw: string | null | undefined,
): ReviewExerciseSettings {
  if (!raw || typeof raw !== 'string') return DEFAULT_REVIEW_EXERCISE_SETTINGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_REVIEW_EXERCISE_SETTINGS;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return DEFAULT_REVIEW_EXERCISE_SETTINGS;
  }
  const doc = parsed as { emphasis?: unknown; skip?: unknown };
  if (doc.emphasis && typeof doc.emphasis === 'object' && !Array.isArray(doc.emphasis)) {
    return { version: 2, emphasis: cleanEmphasis(doc.emphasis as Record<string, unknown>) };
  }
  if (Array.isArray(doc.skip)) return { version: 2, emphasis: emphasisFromSkipList(doc.skip) };
  return DEFAULT_REVIEW_EXERCISE_SETTINGS;
}

export function serializeReviewExerciseSettings(settings: ReviewExerciseSettings): string {
  const emphasis = cleanEmphasis(settings.emphasis);
  const clean: ReviewExerciseSettings = { version: 2, emphasis };
  return JSON.stringify({ version: 2, emphasis, skip: [...skippedKeySet(clean)].sort() });
}

/**
 * What the endpoint accepts from the page: the same rules, applied to a parsed body.
 *
 * A version-1 body is still accepted, from a tab running the switch-era page until it reloads.
 * It writes whole-family Less exactly as it always wrote "off", and cannot express More, so a
 * reader who saves from such a tab loses any More they had set — the cost of a stale tab, and no
 * worse than the switch it thinks it is sending.
 */
export function validateReviewExerciseSettingsInput(input: unknown): ReviewExerciseSettings | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const { emphasis, skip } = input as { emphasis?: unknown; skip?: unknown };
  if (emphasis !== undefined) {
    if (!emphasis || typeof emphasis !== 'object' || Array.isArray(emphasis)) return null;
    if (Object.values(emphasis).some((value) => typeof value !== 'string')) return null;
    return parseReviewExerciseSettings(JSON.stringify({ version: 2, emphasis }));
  }
  if (Array.isArray(skip)) {
    if (skip.some((key) => typeof key !== 'string')) return null;
    return parseReviewExerciseSettings(JSON.stringify({ version: 1, skip }));
  }
  return null;
}

/** Where a family sits. Normal for anything unset, and for every family with no control. */
export function emphasisFor(
  settings: ReviewExerciseSettings,
  id: ReviewExerciseFamilyId,
): ReviewEmphasis {
  if (!emphasisIsOfferable(id)) return 'normal';
  return settings.emphasis[id] ?? 'normal';
}

/** Set one family. Refused, unchanged, for a family with no control to set. */
export function withEmphasis(
  settings: ReviewExerciseSettings,
  id: ReviewExerciseFamilyId,
  next: ReviewEmphasis,
): ReviewExerciseSettings {
  if (!emphasisIsOfferable(id)) return settings;
  const emphasis = { ...settings.emphasis };
  if (next === 'normal') delete emphasis[id];
  else emphasis[id] = next;
  return { version: 2, emphasis: cleanEmphasis(emphasis) };
}

function keysAt(settings: ReviewExerciseSettings, level: StoredReviewEmphasis): Set<ReviewPromptKey> {
  const keys = new Set<ReviewPromptKey>();
  for (const id of REVIEW_EXERCISE_FAMILY_ORDER) {
    if (emphasisFor(settings, id) !== level) continue;
    for (const key of reviewPromptKeysInFamily(id)) keys.add(key);
  }
  return keys;
}

/** The keys a walk passes. Empty for every reader who has never opened the page. */
export function skippedKeySet(settings: ReviewExerciseSettings): ReadonlySet<ReviewPromptKey> {
  return keysAt(settings, 'less');
}

/** The keys a walk weights. Empty for every reader who has never opened the page. */
export function preferredKeySet(settings: ReviewExerciseSettings): ReadonlySet<ReviewPromptKey> {
  return keysAt(settings, 'more');
}

export function rungPreferencesFor(settings: ReviewExerciseSettings): RungPreferences {
  return { skip: skippedKeySet(settings), prefer: preferredKeySet(settings) };
}
