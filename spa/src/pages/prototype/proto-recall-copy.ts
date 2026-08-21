/**
 * The words a suggestion's controls use, in one place.
 *
 * These were inline at three sites — the shelf row, the paper-stack edge, and the shell's
 * handlers — and drifted exactly as that arrangement invites. The edge promised "Don't suggest
 * this again" for months while the handler behind it posted an ordinary three-week snooze,
 * byte-identical to the shelf's "Not now". Nobody decided that; the label and the effect were
 * edited by different hands at different times and nothing held them together.
 *
 * Centralized before the behaviour changed rather than after, and not for tidiness: a control's
 * wording and its effect are one decision. Keeping them in one file is what makes the next
 * divergence a visible edit instead of an oversight.
 *
 * Aria labels take the row's **title**, not its eyebrow. The old ones read "Stop suggesting A
 * passage you keep returning to", because the eyebrow is the category and the title is the
 * thing — a screen reader needs the second one to tell two rows apart.
 */

import { RECALL_COOLDOWN_DAYS } from './proto-recall-cooldown';

const WEEKS = Math.round(RECALL_COOLDOWN_DAYS / 7);

/**
 * "Not now" — rests the suggestion and lets it come back.
 *
 * The tooltip states the window rather than leaving it to be discovered, because the whole
 * point of having two answers is that the reader can tell them apart before choosing.
 */
export const RECALL_SNOOZE_COPY = {
  label: 'Not now',
  hint: `Rest this for ${WEEKS} weeks`,
  ariaFor: (title: string) => `Not now — remind me later about ${title}`,
} as const;

/**
 * "Not interested" — the permanent one.
 *
 * Says "again" because it means it. This label was on the control before the behaviour was,
 * which is the defect this whole change exists to close; it is only correct now because
 * `dismissed` carries no window.
 */
export const RECALL_DISMISS_COPY = {
  label: 'Not interested',
  hint: 'Never suggest this again',
  ariaFor: (title: string) => `Not interested — never suggest ${title} again`,
} as const;

/** "Nevermind" — undoes whichever of the two was said, and puts the row back on the shelf. */
export const RECALL_NEVERMIND_COPY = {
  label: 'Nevermind',
  ariaFor: (title: string) => `Nevermind — back to ${title} and keep suggesting it`,
} as const;

/** The overflow that holds the answer you should have to mean. */
export const RECALL_MORE_COPY = {
  ariaFor: (title: string) => `More answers for ${title}`,
  hint: 'More',
} as const;

/** Clears the breadcrumb without answering the suggestion either way. */
export const RECALL_PUT_DOWN_COPY = {
  label: 'Put the way back down',
  ariaFor: (title: string) => `Stop showing ${title} behind this`,
} as const;
