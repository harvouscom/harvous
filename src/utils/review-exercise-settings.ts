/**
 * Which kinds of exercise a reader would rather not be given.
 *
 * Shared by the SPA and the server like `reminder-settings.ts`: the settings page validates what
 * it is about to send, the endpoint validates what it received, and the review engine reads the
 * stored column when it resolves a rung. One shape, one parser, no drift.
 *
 * **Stored as what is turned off, not what is on.** An allow-list would freeze the feature at the
 * families that existed the day someone last opened this page — every rung added afterwards would
 * arrive switched off for them, which is the opposite of what they asked for. A skip-list means
 * silence is consent, and a new exercise reaches everybody.
 *
 * **A family can always be switched off; a *question* can never become impossible.** The engine
 * resolves a step by walking its family and falling forward to the first member the material
 * allows, ending on the default. Skipping is one more reason to walk past a member — it is never
 * a reason to return nothing. So a reader who turns off every family still gets asked; they get
 * asked the family defaults, which is the same place an item with no material lands. That is why
 * `alwaysOn` exists below: those families are the last resort on their step, and offering a switch
 * that the engine is entitled to ignore would be a lie told in a settings row.
 */

import { REVIEW_PROMPT_KEYS, type ReviewPromptKey } from '@/utils/review-prompts';
import {
  REVIEW_EXERCISE_FAMILY_ORDER,
  reviewPromptKeysInFamily,
  type ReviewExerciseFamilyId,
} from '@/utils/review-exercise-families';

export interface ReviewExerciseSettings {
  version: 1;
  /** Prompt keys the reader has asked not to be given. Never the whole set — see `alwaysOn`. */
  skip: ReviewPromptKey[];
}

export const DEFAULT_REVIEW_EXERCISE_SETTINGS: ReviewExerciseSettings = { version: 1, skip: [] };

/**
 * Families the engine falls back to, which therefore cannot be turned off.
 *
 * Each is the closing member of a step: `opening` closes the chapter families and opens the verse
 * ladder, `order` and `changed` are the only member of their steps, and `note` is the one rung a
 * note with nothing but a body can be asked. Turning any of them off would leave a step with
 * nothing to resolve to, and the engine would show it anyway.
 */
export const ALWAYS_ON_FAMILIES: readonly ReviewExerciseFamilyId[] = [
  'opening',
  'order',
  'changed',
  'note',
];

export function familyIsAlwaysOn(id: ReviewExerciseFamilyId): boolean {
  return ALWAYS_ON_FAMILIES.includes(id);
}

/** The families a reader may actually switch, in the order the page lists them. */
export function switchableFamilies(): ReviewExerciseFamilyId[] {
  return REVIEW_EXERCISE_FAMILY_ORDER.filter((id) => !familyIsAlwaysOn(id));
}

const VALID_KEYS = new Set<string>(REVIEW_PROMPT_KEYS);

/** Every key of a switchable family — what a stored skip-list is allowed to contain. */
function skippableKeys(): Set<string> {
  const out = new Set<string>();
  for (const id of switchableFamilies()) {
    for (const key of reviewPromptKeysInFamily(id)) out.add(key);
  }
  return out;
}

/**
 * Read the stored column.
 *
 * Tolerant on purpose: an unreadable value is "no preferences" rather than an error, because the
 * alternative is a reader whose Review stops working over a bad row. Keys that are unknown, or
 * that belong to an always-on family, are dropped rather than rejecting the whole document — a
 * retired rung should not invalidate the preferences someone still holds about the others.
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
  if (!parsed || typeof parsed !== 'object') return DEFAULT_REVIEW_EXERCISE_SETTINGS;
  const skip = (parsed as { skip?: unknown }).skip;
  if (!Array.isArray(skip)) return DEFAULT_REVIEW_EXERCISE_SETTINGS;
  const allowed = skippableKeys();
  const kept = [...new Set(skip.filter((key): key is string => typeof key === 'string'))]
    .filter((key) => VALID_KEYS.has(key) && allowed.has(key))
    .sort();
  return { version: 1, skip: kept as ReviewPromptKey[] };
}

export function serializeReviewExerciseSettings(settings: ReviewExerciseSettings): string {
  return JSON.stringify({ version: 1, skip: [...settings.skip].sort() });
}

/** What the endpoint accepts from the page: the same rules, applied to a parsed body. */
export function validateReviewExerciseSettingsInput(input: unknown): ReviewExerciseSettings | null {
  if (!input || typeof input !== 'object') return null;
  const skip = (input as { skip?: unknown }).skip;
  if (!Array.isArray(skip)) return null;
  if (skip.some((key) => typeof key !== 'string')) return null;
  return parseReviewExerciseSettings(JSON.stringify({ version: 1, skip }));
}

/** The set the engine consults. Empty for every reader who has never opened the page. */
export function skippedKeySet(settings: ReviewExerciseSettings): ReadonlySet<ReviewPromptKey> {
  return new Set(settings.skip);
}

/** True when the reader is currently being given this family. */
export function familyIsOn(
  settings: ReviewExerciseSettings,
  id: ReviewExerciseFamilyId,
): boolean {
  if (familyIsAlwaysOn(id)) return true;
  const keys = reviewPromptKeysInFamily(id);
  return !keys.every((key) => settings.skip.includes(key));
}

/** Turn a whole family on or off, since a family is the unit the page offers. */
export function withFamily(
  settings: ReviewExerciseSettings,
  id: ReviewExerciseFamilyId,
  on: boolean,
): ReviewExerciseSettings {
  if (familyIsAlwaysOn(id)) return settings;
  const keys = new Set<string>(reviewPromptKeysInFamily(id));
  const rest = settings.skip.filter((key) => !keys.has(key));
  const skip = on ? rest : [...rest, ...reviewPromptKeysInFamily(id)];
  return { version: 1, skip: [...new Set(skip)].sort() as ReviewPromptKey[] };
}
