/**
 * What the reader thought of a question, turned into a reason to ask a different one.
 *
 * Review's three answers describe a memory — "I recalled it", "I almost had it". None of them
 * says anything about the *question*, so a rung that keeps landing badly had no way to be
 * reported except out loud. This is that channel, and a thumbs-down says two things at two sizes:
 *
 * - **Not this, here.** The rung is walked past on that note or passage from the next time it is
 *   asked, for good — `dislikedRungsBySubject`. One vote is enough to say that much.
 * - **Fewer like this.** Counted per exercise family, over three separate items, because the
 *   family is the unit the reader already has a name for and the unit the settings page offers.
 *
 * **A dislike is a reason to walk past a member, never a reason to return nothing.** The set
 * this module derives joins the reader's own "Less" in `material.skip`, so it enters the
 * seeded family walk by the same door and inherits the same fall-forward rule: if every member
 * of a step is quieted, the step still resolves — `verseRungFor` falls to `members[0]`, and
 * `resolveNoteRung` takes its second pass. Nothing here can make a question impossible, and
 * nothing here can cost the queue a row.
 *
 * **Nothing here is stored as a preference.** The tally is derived from the event log inside a
 * rolling window, so the effect is exactly as old as the dislikes that earn it and lapses on its
 * own. A dislike is an observation; only the reader's explicit choice is a preference. Writing
 * this to `reviewExerciseSettings` would be an allow-list by the back door — a setting they
 * never chose and cannot see — which is the thing `review-exercise-settings.ts` forbids.
 *
 * Pure and client-safe: the server derives the set when it resolves a rung, and the SPA uses the
 * same threshold to decide whether it has earned the right to point at Settings.
 */

import { REVIEW_PROMPT_KEYS, type ReviewPromptKey } from '@/utils/review-prompts';
import {
  reviewExerciseFamilyId,
  reviewPromptKeysInFamily,
  type ReviewExerciseFamilyId,
} from '@/utils/review-exercise-families';
import { emphasisIsOfferable, type RungPreferences } from '@/utils/review-exercise-settings';

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
    /*
     * A rung Review no longer asks — "Which note" was retired in Sept 2026 — names no family.
     * `reviewExerciseFamilyId` would file it under `opening`, and three thumbs-down on a question
     * that no longer exists would quietly start walking readers past how a verse begins.
     */
    if (!REVIEW_PROMPT_KEYS.includes(row.rungKey as ReviewPromptKey)) continue;
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
 * Every family is counted, including the four Settings offers no control for. Those are the only
 * family in every draw they belong to, so quieting one never makes it asked less often — but it is
 * still one more reason to walk past, and a reason to walk past is always safe, because where there
 * is nothing else the fall-forward hands it back. Safe to allow and dishonest to *promise*, which
 * is why the offer is gated separately. See `mayOfferExerciseSetting`.
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
 * The reader's own emphasis, with what they keep thumbing down folded in.
 *
 * **A dislike joins `skip` and never `prefer`.** It is an observation, and only the reader's
 * explicit choice is a preference — so nothing inferred can ever make a family asked more often.
 *
 * **An explicit More outranks an inferred less.** Someone who asked for more of a family and then
 * thumbed three of its questions down has said two things, and the one they chose in Settings is
 * the one they can see and change. The third dislike still points them there.
 *
 * Pure, so the merge the service does can be tested without a database.
 */
export function mergeRungPreferences(
  explicit: RungPreferences,
  dislikes: readonly ReviewDislikeRow[],
): RungPreferences {
  const quieted = quietedKeySet(dislikes);
  if (!quieted.size) return explicit;
  const skip = new Set<ReviewPromptKey>(explicit.skip);
  for (const key of quieted) if (!explicit.prefer.has(key)) skip.add(key);
  return { skip, prefer: explicit.prefer };
}

/**
 * Whether the third dislike may point the reader at Settings.
 *
 * Only where Settings has a control to offer. For a family that is the only one in every draw it
 * belongs to, no "Less" would change anything, and naming one would be the lie
 * `review-exercise-settings.ts` warns about — a row promising what the engine is entitled to ignore.
 */
export function mayOfferExerciseSetting(id: ReviewExerciseFamilyId): boolean {
  return emphasisIsOfferable(id);
}

/**
 * What one vote means, given the log as it stands *after* the vote is written.
 *
 * `offerSettings` is true only on the vote that reaches the threshold exactly — a fourth and a
 * fifth dislike get the plain acknowledgement like the rest, because an offer repeated is a nag.
 *
 * **A vote with no rung names no family.** An item that has never been answered has no
 * `lastRungKey`, and `reviewExerciseFamilyId` would helpfully fall back to `opening` — but the
 * tally skips null-rung rows, so the vote counts toward nothing. Reporting a family it was not
 * filed under is the endpoint describing work it did not do. The row is still logged; it simply
 * has nothing to say about which exercise it was about.
 */
export function describeDislike(
  rungKey: string | null,
  rowsIncludingThisVote: readonly ReviewDislikeRow[],
): { family: ReviewExerciseFamilyId | null; offerSettings: boolean } {
  if (!rungKey) return { family: null, offerSettings: false };
  /*
   * Nor does a rung Review no longer asks — an item last answered on `note.folder`, say. The tally
   * already skips those rows; naming `opening` (the fallback) here would claim a family it never
   * counted toward.
   */
  if (!REVIEW_PROMPT_KEYS.includes(rungKey as ReviewPromptKey)) return { family: null, offerSettings: false };
  const family = reviewExerciseFamilyId(rungKey);
  const items = dislikedItemsByFamily(rowsIncludingThisVote).get(family);
  const reachedNow = items?.size === REVIEW_DISLIKE_THRESHOLD;
  return { family, offerSettings: Boolean(reachedNow) && mayOfferExerciseSetting(family) };
}

/**
 * One `disliked` row with what its item asks about: the note, or the passage.
 *
 * Joined from `ReviewItems` at read time rather than carried on the event, because the material a
 * rung is resolved from is loaded by note and by passage — never by review item — and that is the
 * door every rung walk, the list's, the reveal's and the grader's alike, comes in by.
 */
export interface ReviewDislikeSubjectRow extends ReviewDislikeRow {
  noteId: string | null;
  scriptureReference: string | null;
}

/** The material a note is asked from is loaded by its id. */
export function noteDislikeSubjectKey(noteId: string): string {
  return `note:${noteId}`;
}

/** A verse or chapter is loaded by its reference, as the item stores it. */
export function passageDislikeSubjectKey(reference: string): string {
  return `passage:${reference.trim().toLowerCase()}`;
}

/**
 * The exercises the reader thumbed down on each note and passage — per item, and for good.
 *
 * The family tally above asks three items before it leans away, because one thumbs-down is too
 * little to say anything about a *kind* of question. It is plenty to say something about this
 * passage asked this way, which is what the reader just told us, so that is honoured at once and
 * not forgotten: no window, because nothing here quiets anything beyond the one item, and the
 * cap on the read keeps it bounded.
 *
 * Keyed by subject rather than by review item, because subject is what the material is loaded by.
 * The rung's own prefix says which: a `note.*` rung was asked of a note, a `verse.*` or
 * `chapter.*` rung of a passage. Two items on one passage — a verse and the highlight that made
 * it — share their dislikes, which is the same passage asked the same way twice.
 */
export function dislikedRungsBySubject(
  rows: readonly ReviewDislikeSubjectRow[],
): Map<string, Set<ReviewPromptKey>> {
  const out = new Map<string, Set<ReviewPromptKey>>();
  for (const row of rows) {
    if (!row.rungKey || !REVIEW_PROMPT_KEYS.includes(row.rungKey as ReviewPromptKey)) continue;
    const key = row.rungKey as ReviewPromptKey;
    let subject: string | null = null;
    if (key.startsWith('note.')) {
      subject = row.noteId ? noteDislikeSubjectKey(row.noteId) : null;
    } else if (key.startsWith('verse.') || key.startsWith('chapter.')) {
      subject = row.scriptureReference?.trim() ? passageDislikeSubjectKey(row.scriptureReference) : null;
    }
    if (!subject) continue;
    let keys = out.get(subject);
    if (!keys) {
      keys = new Set<ReviewPromptKey>();
      out.set(subject, keys);
    }
    keys.add(key);
  }
  return out;
}

/** What a rung walk needs from one subject's dislikes: walk past them, and do not fall back to them. */
export interface SubjectRungPreferences extends RungPreferences {
  /**
   * The rungs thumbed down on this very subject. Already in `skip`; carried apart because the
   * walks' last-resort passes set the reader's Less aside, and these should be set aside later
   * still — only when there is nothing else at all to ask.
   */
  avoid?: ReadonlySet<ReviewPromptKey>;
}

/**
 * The reader's emphasis for one subject, with what they thumbed down on it folded in.
 *
 * **Into `skip`, and past an explicit More.** More is a weight across every passage; a thumbs-down
 * on this one is the more specific thing said, and the walk drops a skipped member before it
 * weighs anything. Returns `prefs` itself when there is nothing to fold, so a reader who never
 * voted resolves exactly the rung they always did.
 */
export function withSubjectDislikes(
  prefs: RungPreferences,
  disliked: ReadonlySet<ReviewPromptKey> | undefined,
): SubjectRungPreferences {
  if (!disliked?.size) return prefs;
  return { skip: new Set<ReviewPromptKey>([...prefs.skip, ...disliked]), prefer: prefs.prefer, avoid: disliked };
}
