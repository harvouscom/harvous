/**
 * Which wording a review question is asked in.
 *
 * Review had no answer to this at all. Every passage it fetched, graded and handed back used a
 * hard-coded `'NET'` at twenty-six sites, so a reader whose default was NLT met NET questions —
 * and, because the gaps in a cloze are *that* translation's words and the first letters are its
 * letters, was marked wrong for correctly knowing the wording they actually read.
 * `UserMetadata.defaultTranslation` had existed the whole time; nothing in Review read it.
 *
 * Pure and on its own so both halves of the answer can be tested without a database, and so the
 * precedence is written down exactly once. The I/O half — reading the account's default, memoised
 * per request — is `loadDefaultTranslation` in `server/utils/review-service.ts`.
 */

/**
 * Where there is no reader to ask.
 *
 * The last resort and nothing more: it is what an unauthenticated sample is shown, and what a
 * failed read of the account's preference falls back to. A signed-in reader with a stored default
 * must never reach it. `getUserDefaultTranslation` holds the same value for the same reason, and
 * is the definition Review defers to rather than repeating.
 */
export const DEFAULT_REVIEW_TRANSLATION = 'NET';

/**
 * The translation one item is asked in: its own, or the account's.
 *
 * `ReviewItems.translation` is set at creation from the node's own meta — "the translation it was
 * read in, so a chapter question is asked in the words the reader met it in"
 * (`review-opportunities.ts`) — and is null when there was none to record.
 *
 * **Null means "no particular wording", not "NET".** It resolves live to whatever the reader reads
 * in now, so someone who changes their default is asked in the new one from the next question.
 * The alternative — freezing the default onto the item at creation — would make the preference
 * apply only to items made after it was set, which is not a preference at all.
 *
 * Blank-tolerant because the column is free text and an empty string is not a wording.
 */
export function askedTranslation(item: { translation?: string | null }, fallback: string): string {
  return item.translation?.trim() || fallback;
}
