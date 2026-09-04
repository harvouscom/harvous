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

import type { ReviewEchoManner } from '@/utils/review-answer-echo';

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
/**
 * Opening the dock, before the queue has answered.
 *
 * Not the empty state, which is what used to show here: "Nothing waiting" is a claim, and
 * making it while the request is still in flight told the reader the feature had nothing for
 * them a beat before the question arrived. First impressions were of an empty product.
 */
/** Announced to a screen reader while the dots show; never printed. */
export const REVIEW_LOADING_LABEL = 'Finding your next one';
export const REVIEW_EMPTY_COPY = 'Nothing waiting. Keep studying.';

/*
 * Both halves of one toggle, not a link.
 *
 * "See all" used to navigate to a Review page, which is the thing this feature spent a whole
 * redesign getting away from: a question about your study belongs beside your study, not on a
 * destination you have to come back from. It opens the rest of the list where it already is.
 */
export const REVIEW_SEE_ALL_COPY = 'See all';

/**
 * The caption on the altered block itself.
 *
 * The prompt already says one word has been changed. This says it a second time, on the words,
 * because the prompt can be scrolled past, cropped out of a screenshot, or skipped by someone
 * tapping straight at the text — and the one thing this rung must never do is let an altered
 * line be read as Scripture.
 */
/* "Wrong" is on the voice doc's forbidden list; the caption says what the line is, not what the
   reader might be. */
export const REVIEW_ALTERED_CAPTION = 'Altered — one word here is not what it says';

/** Said plainly above the restored verse, so the correction is unmistakable. */
export const REVIEW_TRUTH_LABEL = 'As it actually reads';
export const REVIEW_SEE_LESS_COPY = 'Show fewer';

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
export const REVIEW_REVEAL_CHAPTER_COPY = 'Check the chapter';
export const REVIEW_REVEAL_THREAD_COPY = 'Open the Thread';
export const REVIEW_REVEAL_CONNECTION_COPY = 'Check my notes';
/** After revealing cold: the honest answer is that it needed looking at. */
export const REVIEW_REVEALED_ACK_COPY = 'Got it now';

/**
 * What the dock says back after an answer, before the next return.
 *
 * Said the way a person would, not the way the schedule names it: "Recalled." was the outcome
 * enum with a full stop on it, and BRAND_VOICE.md's rule against systematic language applies
 * to a card that is talking to someone about a verse. Still a receipt rather than praise —
 * "well done" for remembering Scripture is the app grading a spiritual practice — and still
 * inside the forbidden-words list: nothing here says wrong, fail or mistake, because a miss on
 * a verse is not one.
 */
export const REVIEW_OUTCOME_ACK_COPY: Record<'recalled' | 'almost' | 'revealed', string> = {
  recalled: 'You had it.',
  almost: 'Got there.',
  revealed: 'Not this time.',
};

/** The graded rungs: the reader has arranged or chosen, and asks the app to mark it. */
export const REVIEW_CHECK_COPY = 'Check it';

/** Said after a wrong answer that still has a go left. No scolding, no exclamation. */
export const REVIEW_TRY_AGAIN_COPY = 'Not that one. One more go.';

/**
 * The same beat, but specific, where the answer had parts to mark.
 *
 * "Not that one" is all you can say about a tap. Where the reader filled four gaps or named
 * three words, saying how many landed is the difference between a colour and a correction —
 * and it is what makes the second go about the part they actually missed. Counting words are
 * fine here: this counts what went right, not what is owed.
 */
export function reviewPartsAgainCopy(right: number, total: number): string {
  if (right <= 0) return 'None of those yet. One more go.';
  if (right === total) return 'All there. One more go.';
  return right === 1 ? 'One of those is right. One more go.' : `${right} of those are right. One more go.`;
}

/** What a written verse reached, said without naming a word of it. */
export function reviewReachedCopy(matched: number, total: number): string {
  return matched <= 0
    ? 'None of the words that carry it yet.'
    : `You reached ${matched} of the ${total} words that carry it.`;
}

/** Above the answer, after the last go. */
export const REVIEW_ANSWER_LABEL = 'The answer';

/**
 * The same slot on the rungs keyed to the curated index. A miss there means the reader disagreed
 * with the index, not that they forgot something they knew, and the label says whose reading it
 * is rather than calling it the answer.
 */
export const REVIEW_INDEX_ANSWER_LABEL = 'The index has this as';

/** Said once, on the answer that moves something into durable recall. Never a score. */
/**
 * A leech. Said once, plainly, with a way down: the ladder has been asking this one the same
 * way four times since it was last held, and a fifth is not going to work.
 */
export const REVIEW_SLIPPING_COPY = 'This one keeps slipping. An easier ask next time?';
export const REVIEW_STEP_BACK_COPY = 'Step back a rung';
export const REVIEW_STEPPED_BACK_COPY = 'Stepped back. It comes back easier.';
/**
 * The way on from a result, and the way out.
 *
 * Both are offered because a sitting is not a queue to clear: stopping after one is a complete
 * act, and the card should not imply otherwise by only offering "next". "Enough for now" is the
 * same voice as the rest — no count of what is left, no suggestion that leaving is quitting.
 */
export const REVIEW_NEXT_COPY = 'Next one';
export const REVIEW_ENOUGH_COPY = 'Enough for now';

export const REVIEW_CROSSED_TO_HOLDING_COPY = 'This one is holding now.';
/** The first-letters rung asks for the whole verse, not a note about it. */
export const REVIEW_INITIALS_PLACEHOLDER = 'Write the verse out';

/*
 * "if you want to" was honest while nothing marked the answer, and wrong the moment something
 * did. The ask is direct now, and what you write comes back beside the verse afterwards.
 */
export const REVIEW_ATTEMPT_PLACEHOLDER = 'Write what you remember';
export const REVIEW_YOUR_WORDS_LABEL = 'What you wrote';

/**
 * The heading above the reader's own answer on the result card, by what they actually did.
 *
 * Four, because "what you wrote" over three tapped chips is not what happened, and the result
 * is meant to be a recap of the moment rather than a generic slot. `wrote` reuses the constant
 * above so the free-recall card keeps the words it always had.
 */
export const REVIEW_ECHO_LABEL: Record<ReviewEchoManner, string> = {
  picked: 'What you picked',
  ordered: 'The order you put them in',
  filled: 'What you filled in',
  wrote: REVIEW_YOUR_WORDS_LABEL,
};

export const CHALLENGE_STEP_DONE_COPY = 'Done';
export const CHALLENGE_STEP_SKIP_COPY = 'Skip this';
export const CHALLENGE_CONTINUE_COPY = 'Continue';
export const CHALLENGE_PAUSE_COPY = 'Pause';
export const CHALLENGE_ARCHIVE_COPY = 'Put this down';
export const CHALLENGE_START_COPY = 'Start';

/** Written by the note cascade, so the page can say why rather than implying the reader stopped. */
export const CHALLENGE_RETIRED_COPY = 'The note this path was built on is gone.';

/** Plus prompts. One line, no exclamation, no urgency. */
/**
 * The sample. One real question for an account that does not have Review, so the paywall row
 * has a thing above it to have tried. Eyebrows say whose verse it is — the reader's own study
 * where anything of theirs fits, a well-known one otherwise — because "a verse from your study"
 * over John 3:16 they never cited would be a lie in the first line.
 */
export const REVIEW_SAMPLE_EYEBROW_YOURS = 'From your own study';
export const REVIEW_SAMPLE_EYEBROW_WELL_KNOWN = 'A verse to try it on';
export const REVIEW_SAMPLE_PROMPT = 'Fill in the gaps.';
export const REVIEW_SAMPLE_AFTER = 'That is Review. It brings a verse back just before you would forget it.';
export const REVIEW_PLUS_TITLE = 'Return to your study with Review';
export const REVIEW_PLUS_META = 'Come back to your own notes on a schedule';
export const PLUS_BADGE_COPY = 'Plus';
