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

/**
 * The section heading on Activity.
 *
 * It was "Study Inbox" for its first week and the word was wrong twice over. An inbox is
 * something other people fill and you are behind on; this is the reader's own study coming
 * back. And the file directly above forbids exactly this vocabulary — nothing here says
 * "due" or "remaining" for the same reason nothing should say "inbox".
 */
export const REVIEW_SECTION_TITLE = 'Review';

/**
 * Shown when a Plus reader has an empty queue.
 *
 * Not "0 items due". The point of an empty inbox is that there is nothing to do, and the way
 * to say that is to say it.
 */
export const REVIEW_EMPTY_COPY = 'Nothing waiting. Keep studying.';

export const REVIEW_SEE_ALL_COPY = 'See all';

/* The note's ⋯ menu is the one place this is offered. The Review card briefly carried a `+`
   for it too, which was disabled everywhere the card usually sits and explained itself to
   nobody — two entry points for one action, one of them a bare icon. */
export const REVIEW_ADD_COPY = 'Add to Review';
export const REVIEW_ADDED_COPY = 'In Review';

/** The three answers. Descriptions of a memory, never ratings of the app. */
export const REVIEW_RECALLED_COPY = 'I recalled it';
export const REVIEW_ALMOST_COPY = 'I almost had it';
/*
 * Revealing opens the real thing — the note, the passage, the Thread — so the button names
 * where you are about to go. "Show my note" described a panel that no longer exists; these
 * describe a destination, and they are the reader's own things, not the app's.
 */
export const REVIEW_REVEAL_COPY = 'Check my note';
export const REVIEW_REVEAL_VERSE_COPY = 'Check the verse';
export const REVIEW_REVEAL_THREAD_COPY = 'Open the Thread';
export const REVIEW_REVEAL_CONNECTION_COPY = 'Check my notes';
/** After revealing cold: the honest answer is that it needed looking at. */
export const REVIEW_REVEALED_ACK_COPY = 'Got it now';

/**
 * The word the dock says back after an answer, before the next return.
 *
 * Past tense and one word each, because this is a receipt rather than praise. "Well done" for
 * remembering a verse is the app grading a spiritual practice, which is what the whole feature
 * is built not to do.
 */
export const REVIEW_OUTCOME_ACK_COPY: Record<'recalled' | 'almost' | 'revealed', string> = {
  recalled: 'Recalled.',
  almost: 'Almost.',
  revealed: 'Read again.',
};

/** The graded rungs: the reader has arranged or chosen, and asks the app to mark it. */
export const REVIEW_CHECK_COPY = 'Check it';

/** Said once, on the answer that moves something into durable recall. Never a score. */
export const REVIEW_CROSSED_TO_HOLDING_COPY = 'This one is holding now.';
export const REVIEW_ATTEMPT_PLACEHOLDER = 'Write what you remember, if you want to';

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
