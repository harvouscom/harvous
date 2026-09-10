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

/**
 * The fold over what the reader put aside, on Home.
 *
 * "Paused" and "put down" are two different acts — a season, and a decision — but one drawer:
 * both are things taken out of the queue, and both are picked back up the same way. Naming the
 * count is the point of the fold, since a drawer you cannot see into is one you never open.
 */
export const reviewSetAsideCopy = (count: number) =>
  count === 1 ? '1 you put aside' : `${count} you put aside`;

/**
 * The fold over what is scheduled but not due.
 *
 * Named by when rather than by count alone — "3 coming back later" is a fact about the queue's
 * shape, not a debt. It is the one group Home hid entirely: with nothing due the section used
 * to disappear, taking every scheduled item with it, and the page that used to list them is
 * gone.
 */
export const reviewComingBackCopy = (count: number) =>
  count === 1 ? '1 coming back later' : `${count} coming back later`;
export const REVIEW_REMOVE_COPY = 'Remove from Review';

/*
 * The same three actions, in the word that fits under a glyph in the row's icon-block menu.
 * The full sentences above stay the accessible names — "Pause" alone would not say what is
 * being paused to someone listening rather than looking.
 */
export const REVIEW_PAUSE_SHORT_COPY = 'Pause';
export const REVIEW_REMOVE_SHORT_COPY = 'Remove';
export const REVIEW_MORE_COPY = 'More';

/**
 * What a row's answer says back.
 *
 * The queue keeps its shape when an item leaves it — `refillReviewQueue` fills the freed slot on
 * the same refetch, deliberately, so the section does not shrink as you use it. The cost is that
 * the strongest answer in the menu looked like it had done nothing at all: the row went, another
 * took its place, and nothing said which had happened. These confirm the act.
 *
 * Still no counting and no blame, per the note at the top of this file — "Removed from Review",
 * not "1 removed", and "Coming back later" echoes `reviewComingBackCopy` rather than naming a
 * date the reader did not choose.
 */
export const REVIEW_REMOVED_TOAST = 'Removed from Review';
export const REVIEW_PAUSED_TOAST = 'Paused';
export const REVIEW_RESUMED_TOAST = 'Back in Review';
export const REVIEW_DEFERRED_TOAST = 'Coming back later';

/**
 * Failure copy for the same three answers.
 *
 * These mutations shipped with no `onError` at all, so a 4xx or 5xx was indistinguishable from
 * success — the menu closed either way. Written as the caller's fallback for `toastError`, which
 * only shows server prose when the code is allow-listed as user-authored.
 */
export const REVIEW_REMOVE_FAILED_TOAST = "Couldn't remove that — try again";
export const REVIEW_PAUSE_FAILED_TOAST = "Couldn't change that — try again";
export const REVIEW_DEFER_FAILED_TOAST = "Couldn't put that off — try again";

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
export const REVIEW_LOADING_LABEL = 'Finding your next review';
export const REVIEW_EMPTY_COPY = 'Nothing waiting. Keep studying.';

/**
 * The empty card, in two states, because "nothing due" and "nothing yet" are different facts
 * and one sentence was answering for both.
 *
 * The up-to-date one says when the next thing comes back. That is the opposite of a count of
 * what is owed: it is a reason to put the app down, said once, with a date the reader can hold
 * the app to. It stays a statement about what is *scheduled* — the queue refills from study as
 * it happens, so a promise that nothing will arrive before Tuesday is a promise this feature
 * cannot keep.
 *
 * The nothing-yet one says where reviews come from, because a new reader looking at an empty
 * feature has no way to know it is fed by their own study rather than by a button they missed.
 *
 * It says only that. It used to add "Mark a verse or write a note, and they start showing up
 * here", which pushed the block to four lines and, sat above a date, read as a list of chores
 * standing between the reader and the thing they were promised. One sentence for where reviews
 * come from and one for when, and the pair fits in two lines.
 */
export const REVIEW_EMPTY_UP_TO_DATE_TITLE = 'You are up to date';
export const REVIEW_EMPTY_NOTHING_YET_TITLE = 'Nothing to review yet';
export const REVIEW_EMPTY_NOTHING_YET_BODY = 'Reviews come from your own study.';
export const REVIEW_EMPTY_SETTLED_BODY = 'Nothing waiting right now.';
export const reviewNextDueCopy = (when: string) => `The next one comes back ${when}.`;

/**
 * When the engine has not started yet and waiting is all it needs.
 *
 * Only ever shown with a date the gate can actually keep: age is one of three things holding a
 * piece of study back, and the other two need the reader to do something. Saying "Thursday" to
 * someone whose notes will still not qualify on Thursday is worse than the silence it replaces.
 */
export const reviewColdStartOpensCopy = (when: string) => `The first ones should arrive ${when}.`;

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
export const REVIEW_ALTERED_CAPTION = 'One word here is not what it says';

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

/**
 * What the reader thought of the QUESTION, which is a third thing.
 *
 * The three answers above describe a memory — "I recalled it" — and the outcome line describes
 * how it went. Neither says anything about the exercise the app chose, so a rung that keeps
 * landing badly had nowhere to be reported. These two are about that, and about nothing else:
 * they never grade the reader, and like everything else here they say nothing about wrong, fail
 * or mistake, because a miss on a verse is none of those.
 *
 * Both carry a word beside the glyph. A bare icon was tried once in this very feature and
 * removed — see REVIEW_ADD_COPY — and a glyph meaning "fewer of these" has no settled shape at
 * all, so an unlabelled one would be a question the reader has to answer before they can answer
 * the question.
 *
 * "Not helpful" is the reader's own phrase for this, and it deliberately avoids "Show fewer",
 * which is already the Activity fold's toggle a few lines above.
 */
/* Names the subject, so two blocks under a verdict line cannot be read as being about the
   memory that was just described. Four words, in the caption size. */
export const REVIEW_FEEDBACK_PROMPT_COPY = 'This kind of question';
export const REVIEW_FEEDBACK_UP_COPY = 'Good question';
export const REVIEW_FEEDBACK_DOWN_COPY = 'Not helpful';

/** The full sentence for the accessible name; the family is what is actually being rated. */
export const reviewFeedbackUpAria = (family: string) => `Good question — more ${family}`;
export const reviewFeedbackDownAria = (family: string) => `Not helpful — fewer ${family}`;

/**
 * Said back, and nothing more.
 *
 * Never "you will see fewer of these". The engine leans away where the step has somewhere else
 * to go, and on a note with nothing but a body it must still fall back to the rung just marked
 * unhelpful. A card that promised otherwise would be the lie `review-exercise-settings.ts`
 * names, moved from a settings row onto a study card.
 */
export const REVIEW_FEEDBACK_ACK_COPY = 'Noted.';

/**
 * The third time, for a family the reader can actually switch.
 *
 * Offered once — a fourth and a fifth say "Noted." like the rest, because an offer repeated is a
 * nag — and never for an always-on family, where there is no switch and naming one would promise
 * something the engine is entitled to ignore.
 */
export const REVIEW_FEEDBACK_SETTINGS_LINK_COPY = 'Review exercises';
export const reviewFeedbackOfferCopy = (family: string) =>
  `Noted. You can turn ${family} off in`;

/** A vote is a log line, not a setting; losing one is not worth interrupting a sitting for. */
export const REVIEW_FEEDBACK_FAILED_TOAST = "Couldn't note that";

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

/**
 * What a written verse reached, said without naming a word of it.
 *
 * "The words that carry it" was a coined term for content words — true, and no help at all to
 * someone who cannot tell which those are. "Key words" is the same idea in words people
 * already use.
 */
export function reviewReachedCopy(matched: number, total: number): string {
  return matched <= 0
    ? 'None of its key words yet.'
    : `You wrote ${matched} of its ${total} key words.`;
}

/** Above the answer, after the last go. */
export const REVIEW_ANSWER_LABEL = 'The answer';

/**
 * The same slot on the rungs keyed to the curated index. A miss there means the reader disagreed
 * with the index, not that they forgot something they knew, and the label says whose reading it
 * is rather than calling it the answer.
 */
export const REVIEW_INDEX_ANSWER_LABEL = 'The reference works say';

/** Said once, on the answer that moves something into durable recall. Never a score. */
/**
 * A leech. Said once, plainly, with a way down: the ladder has been asking this one the same
 * way four times since it was last held, and a fifth is not going to work.
 */
export const REVIEW_SLIPPING_COPY = 'This one keeps slipping away. An easier ask next time?';
/*
 * The same offer, for an item that was never held rather than lost.
 *
 * "Keeps slipping away" describes a loss, and saying that to someone about a verse they have
 * never once got right is describing something that did not happen to them. This says what is
 * actually true and offers the same way out.
 */
export const REVIEW_STALLED_COPY = 'This way of asking is not landing. Try a different one?';
export const REVIEW_STEP_BACK_COPY = 'Make it easier';
export const REVIEW_STEPPED_BACK_COPY = 'Done. It comes back easier next time.';
/**
 * The way on from a result, and the way out.
 *
 * Both are offered because a sitting is not a queue to clear: stopping after one is a complete
 * act, and the card should not imply otherwise by only offering "next". "Enough for now" is the
 * same voice as the rest — no count of what is left, no suggestion that leaving is quitting.
 */
export const REVIEW_NEXT_COPY = 'Next one';
export const REVIEW_ENOUGH_COPY = 'Enough for now';

export const REVIEW_CROSSED_TO_HOLDING_COPY = 'You have this one now.';
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
export const REVIEW_SAMPLE_PROMPT = 'Fill in the blanks.';

/**
 * The instruction for each way the sample can ask.
 *
 * Written the way every other prompt in the feature is: an instruction ending in a full stop,
 * never a question. The sample is a real rung, so it speaks like one.
 */
export const REVIEW_SAMPLE_PROMPTS: Record<string, string> = {
  blanks: 'Fill in the blanks.',
  letters: 'Write the verse from its first letters.',
  order: 'Put the verse back in order.',
  next: 'Pick the verse that follows.',
};

/**
 * The chips above the question.
 *
 * The same words the paid feature uses for these families, so what a reader learns here is what
 * they see inside — and what they can ask for more of in Settings.
 */
export const REVIEW_SAMPLE_EXERCISE_LABELS: Record<string, string> = {
  blanks: 'Blanks',
  letters: 'First letters',
  order: 'Order',
  next: 'What follows',
};

/** Above the chips: what the row of them is for, said once. */
export const REVIEW_SAMPLE_CHOOSE = 'Try it another way';
/**
 * After the sample is answered, in the reader's second person rather than the app's third.
 *
 * "That is Review." names the feature at someone who has not bought it, which is the app
 * talking about itself. What they just did is the argument: they answered a question about
 * their own passage and it was marked. This says what that becomes.
 */
export const REVIEW_SAMPLE_AFTER =
  'Review brings your own study back, just before you would lose it — asked a different way each time.';
/** The offer, once. Both ways out, so the card is a question rather than a toll gate. */
export const REVIEW_SAMPLE_SEE_PLUS = 'See Plus';
export const REVIEW_SAMPLE_NOT_NOW = 'Not now';
export const REVIEW_PLUS_TITLE = 'Return to your study with Review';
export const REVIEW_PLUS_META = 'Come back to your own notes on a schedule';
export const PLUS_BADGE_COPY = 'Plus';
