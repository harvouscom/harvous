/**
 * The words Review and Challenges use.
 *
 * Separate from `proto-recall-copy.ts` because the two features mean different things by
 * similar-looking actions. A recall card's "Remind me later" defers a suggestion Harvous made;
 * a review item's "Not now" defers something the reader themselves asked to be shown. Sharing
 * the strings would eventually mean sharing the menus, and the menus are not the same: recall
 * offers a snooze ladder ending in "never", Review offers a pause the reader can undo.
 *
 * The whole vocabulary avoids counting and blame. Nothing here says "due", "overdue",
 * "remaining", or "missed" — those are the words that turn a study aid into a task manager,
 * and the strategy doc names that failure mode explicitly.
 */

export const REVIEW_START_COPY = 'Start';
export const REVIEW_DEFER_COPY = 'Not now';
export const REVIEW_PAUSE_COPY = 'Pause this';
export const REVIEW_RESUME_COPY = 'Start again';
export const REVIEW_REMOVE_COPY = 'Remove from Review';
export const REVIEW_MORE_COPY = 'More';

/** The section heading on Activity. */
export const STUDY_INBOX_TITLE = 'Study Inbox';

/**
 * Shown when a Plus reader has an empty queue.
 *
 * Not "0 items due". The point of an empty inbox is that there is nothing to do, and the way
 * to say that is to say it.
 */
export const REVIEW_EMPTY_COPY = 'Nothing waiting. Keep studying.';

export const REVIEW_SEE_ALL_COPY = 'See all';

/** Cold start, before there is a queue at all. */
export const REVIEW_SEED_TITLE = 'Start reviewing';
export const REVIEW_SEED_META = 'Pick up three things worth returning to';

export const REVIEW_ADD_COPY = 'Add to Review';
export const REVIEW_ADDED_COPY = 'In Review';

/** The three answers. Descriptions of a memory, never ratings of the app. */
export const REVIEW_RECALLED_COPY = 'I recalled it';
export const REVIEW_ALMOST_COPY = 'I almost had it';
export const REVIEW_REVEAL_COPY = 'Show my note';
export const REVIEW_REVEAL_VERSE_COPY = 'Show the verse';
/** After revealing cold: the honest answer is that it needed looking at. */
export const REVIEW_REVEALED_ACK_COPY = 'Got it now';
export const REVIEW_ATTEMPT_PLACEHOLDER = 'Write what you remember, if you want to';
export const REVIEW_HAVE_IT_COPY = 'I have it in mind';

export const CHALLENGE_STEP_DONE_COPY = 'Done';
export const CHALLENGE_STEP_SKIP_COPY = 'Skip this';
export const CHALLENGE_CONTINUE_COPY = 'Continue';
export const CHALLENGE_PAUSE_COPY = 'Pause';
export const CHALLENGE_ARCHIVE_COPY = 'Put this down';
export const CHALLENGE_START_COPY = 'Start';

/** Written by the note cascade, so the page can say why rather than implying the reader stopped. */
export const CHALLENGE_RETIRED_COPY = 'The note this path was built on is gone.';

/** Plus prompts. One line, no exclamation, no urgency. */
export const REVIEW_PLUS_TITLE = 'Return to your study with Review';
export const REVIEW_PLUS_META = 'Come back to your own notes on a schedule';
export const PLUS_BADGE_COPY = 'Plus';
