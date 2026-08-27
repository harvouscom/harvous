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

/**
 * Deferral — rests the suggestion and lets it come back.
 *
 * One answer, and the app picks how long. Two named lengths were tried ("in a week", "in a
 * month") and asked the wrong question: nobody knows on a Tuesday whether they want a
 * passage back in seven days or thirty. What a reader can say is *later*, and how often they
 * say it about the same card is the better signal — so the window comes from
 * `nextSnoozeWindowDays`, backing off each time this one is put off again.
 *
 * No hint stating the window, deliberately, because there is no single number to state and a
 * tooltip promising one would be the label/effect drift this file exists to prevent. "Later"
 * is honest about being vague; "rest this for three weeks" was precise and, once the ladder
 * existed, wrong.
 */
export const RECALL_SNOOZE_COPY = {
  label: 'Remind me later',
  ariaFor: (title: string) => `Remind me later about ${title}`,
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
