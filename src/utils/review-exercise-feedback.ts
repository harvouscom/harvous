/**
 * What the reader thought of a question, turned into a reason to ask a different one.
 *
 * Review's three answers describe a memory — "I recalled it", "I almost had it". None of them
 * says anything about the *question*, so a rung that keeps landing badly had no way to be
 * reported except out loud. This is that channel: a thumbs-down means "fewer questions like
 * this", counted per exercise family, because the family is the unit the reader already has a
 * name for and the unit the settings page already switches.
 *
 * **A dislike is a reason to walk past a member, never a reason to return nothing.** The set
 * this module derives joins the reader's Settings skip-list in `material.skip`, so it enters the
 * seeded family walk by the same door and inherits the same fall-forward rule: if every member
 * of a step is quieted, the step still resolves — `verseRungFor` falls to `members[0]`, and
 * `resolveNoteRung` takes its second pass. Nothing here can make a question impossible, and
 * nothing here can cost the queue a row.
 *
 * **Nothing here is stored as a preference.** The tally is derived from the event log inside a
 * rolling window, so the effect is exactly as old as the dislikes that earn it and lapses on its
 * own. A dislike is an observation; only the reader's explicit switch is a preference. Writing
 * this to `reviewExerciseSettings` would be an allow-list by the back door — a setting they
 * never chose and cannot see — which is the thing `review-exercise-settings.ts` forbids.
 *
 * Pure and client-safe: the server derives the set when it resolves a rung, and the SPA uses the
 * same threshold to decide whether it has earned the right to point at Settings.
 */

import type { ReviewPromptKey } from '@/utils/review-prompts';
import {
  reviewExerciseFamilyId,
  reviewPromptKeysInFamily,
  type ReviewExerciseFamilyId,
} from '@/utils/review-exercise-families';
import { familyIsAlwaysOn } from '@/utils/review-exercise-settings';

/**
 * How many times the reader must say it, on how many different items, before the engine leans away.
 *
 * Counted over **distinct review items**, which is the whole rule. One dislike is a mistap or a
 * bad verse. Two can still be one passage asked the same way twice, because a family comes round
 * again on the maintenance cycle. Three separate items is the first count that cannot be one
 * passage's bad luck, and it is the difference between "I dislike this exercise" and "I dislike
 * this verse being asked this way". It is also the number this feature already speaks in —
 * `REVIEW_MAX_ATTEMPTS` is 3.
 */
export const REVIEW_DISLIKE_THRESHOLD = 3;

/**
 * How far back the count reaches, and therefore how long the effect lasts.
 *
 * One number does both jobs: there is nothing stored and nothing to expire, so thirty days after
 * the third-oldest qualifying dislike the family simply comes back. Intervals run to a fortnight
 * and beyond once a verse is holding, so thirty days is long enough for three dislikes to be
 * reachable without bingeing, and short enough that a preference expressed a season ago does not
 * silently govern today.
 */
export const REVIEW_DISLIKE_WINDOW_DAYS = 30;

/** One `disliked` row, reduced to the two things the tally needs. */
export interface ReviewDislikeRow {
  reviewItemId: string;
  rungKey: string | null;
}

/** The instant the window opens, given "now". */
export function reviewDislikeWindowStart(now: Date): Date {
  return new Date(now.getTime() - REVIEW_DISLIKE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** How many distinct items the reader has thumbed down, per family. */
export function dislikedItemsByFamily(
  rows: readonly ReviewDislikeRow[],
): Map<ReviewExerciseFamilyId, Set<string>> {
  const byFamily = new Map<ReviewExerciseFamilyId, Set<string>>();
  for (const row of rows) {
    if (!row.rungKey) continue;
    const family = reviewExerciseFamilyId(row.rungKey);
    let items = byFamily.get(family);
    if (!items) {
      items = new Set<string>();
      byFamily.set(family, items);
    }
    items.add(row.reviewItemId);
  }
  return byFamily;
}

/**
 * Families the reader has told us, on three separate items, they would rather have less of.
 *
 * Always-on families are included on purpose. They cannot be switched off in Settings because
 * they are the last resort on their step, but "cannot be switched off" is not the same as
 * "cannot be leaned away from": a note carrying citations or links can be asked `cited` or
 * `linked` instead of `note`, and the walk will prefer those once `note` is quieted. Where there
 * is genuinely nothing else, the fall-forward hands it back anyway — which is why quieting one
 * is safe to allow and dishonest to *promise*. See `mayOfferExerciseSetting`.
 */
export function quietedFamilies(
  rows: readonly ReviewDislikeRow[],
): ReadonlySet<ReviewExerciseFamilyId> {
  const quieted = new Set<ReviewExerciseFamilyId>();
  for (const [family, items] of dislikedItemsByFamily(rows)) {
    if (items.size >= REVIEW_DISLIKE_THRESHOLD) quieted.add(family);
  }
  return quieted;
}

/** The prompt keys those families cover — the shape the rung walk consumes. */
export function quietedKeySet(rows: readonly ReviewDislikeRow[]): ReadonlySet<ReviewPromptKey> {
  const keys = new Set<ReviewPromptKey>();
  for (const family of quietedFamilies(rows)) {
    for (const key of reviewPromptKeysInFamily(family)) keys.add(key);
  }
  return keys;
}

/**
 * Whether the third dislike may point the reader at the Settings toggle.
 *
 * False for the always-on families, because there is no switch there to offer. Naming one would
 * be the lie `review-exercise-settings.ts` warns about — a row promising something the engine is
 * entitled to ignore. The engine still leans away where it can; it just does not say so.
 */
export function mayOfferExerciseSetting(id: ReviewExerciseFamilyId): boolean {
  return !familyIsAlwaysOn(id);
}

/**
 * What one vote means, given the log as it stands *after* the vote is written.
 *
 * `offerSettings` is true only on the vote that reaches the threshold exactly — a fourth and a
 * fifth dislike say "Noted." like the rest, because an offer repeated is a nag.
 */
export function describeDislike(
  rungKey: string | null,
  rowsIncludingThisVote: readonly ReviewDislikeRow[],
): { family: ReviewExerciseFamilyId; offerSettings: boolean } {
  const family = reviewExerciseFamilyId(rungKey);
  const items = dislikedItemsByFamily(rowsIncludingThisVote).get(family);
  const reachedNow = items?.size === REVIEW_DISLIKE_THRESHOLD;
  return { family, offerSettings: Boolean(reachedNow) && mayOfferExerciseSetting(family) };
}
