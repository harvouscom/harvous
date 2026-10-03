import type { ReviewItemView } from '../../hooks/queries/useReview';
import { fillFraming } from '@/utils/review-framing';
import { reviewRowSource, reviewRowSubject } from '@/utils/review-row-subtitle';
import {
  REVIEW_BEGIN_COPY,
  REVIEW_KEEP_GOING_COPY,
  REVIEW_SITTING_DONE_TITLE,
  REVIEW_SITTING_PROGRESS_LABEL,
  reviewNextReturnCopy,
  reviewTodayProgressCopy,
} from './proto-review-copy';

/**
 * The head of the Review section on Activity: today's sitting as one card, with the next
 * question in it.
 *
 * The section used to be the same shape as every lane around it — an eyebrow over a panel of
 * hairline rows — so the one place on the page that asks something of the reader read as one
 * more list. This puts the question itself in front of them, under what it is about, with how
 * far through today they are and one way in.
 *
 * Shaped like Today's passage, deliberately: the same padding, a caption eyebrow, the words
 * carrying the card, and a **gray** button. An accent fill on Activity was ruled the loudest
 * thing on the page the last time one was tried, louder than what it served.
 *
 * The question is the prompt and only the prompt — never the exercise, which for a marked rung
 * is the answer. And it is in the body face, not the reading face: that face is for Scripture,
 * and a question about someone's own note dressed as Scripture is the one thing it must not be.
 *
 * Counts only what is done ("3 of 8 today"), never what is left — see `reviewTodayProgressCopy`.
 */
export default function PrototypeReviewSittingCard({
  head,
  today,
  nextReturn,
  onBegin,
}: {
  /** The question Begin opens. Null when today is finished. */
  head: ReviewItemView | null;
  today: { answered: number; goal: number } | null;
  /** When there will be more, from `describeNextDue` — said only once today is done. */
  nextReturn: string | null;
  onBegin: (itemId: string) => void;
}) {
  const goal = today?.goal ?? 0;
  const answered = Math.min(today?.answered ?? 0, goal);
  /* Hidden for a sitting of one, as the dock's own bar is: a full-width way of saying "this is
     the only question" is not progress. */
  const showBar = goal > 1;
  const fraction = goal > 0 ? answered / goal : 0;

  const progress = showBar ? (
    <div
      className="proto-review-dock__progress proto-review-sitting__bar"
      role="progressbar"
      aria-label={REVIEW_SITTING_PROGRESS_LABEL}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={answered}
      aria-valuetext={`${answered} of ${goal}`}
    >
      <span
        className="proto-review-dock__progress-fill"
        style={{ transform: `scaleX(${head ? fraction : 1})` }}
      />
    </div>
  ) : null;

  if (!head) {
    /*
     * The day's full stop. The card stays rather than folding to a line, so finishing is
     * visibly the same thing that was started — and says when there will be more, because
     * "done" without "and then?" is a dead end. No button: there is nothing to press.
     */
    return (
      <div className="proto-review-sitting" data-state="done">
        <p className="proto-review-sitting__prompt">{REVIEW_SITTING_DONE_TITLE}</p>
        {nextReturn ? (
          <p className="proto-caption proto-review-sitting__source">{reviewNextReturnCopy(nextReturn)}</p>
        ) : null}
        {progress}
        {goal > 0 ? (
          <div className="proto-review-sitting__foot">
            <span className="proto-caption">{reviewTodayProgressCopy(goal, goal)}</span>
          </div>
        ) : null}
      </div>
    );
  }

  const subject = reviewRowSubject(head);
  const source = head.framing ? fillFraming(head.framing) : reviewRowSource(head, subject);
  const exerciseLabel = head.exercise?.label ?? null;

  return (
    <div className="proto-review-sitting" data-state="ready">
      {/* What it is about first, and the kind of exercise after it — the same order a row
          reads in, so the card and the rows under it say things the same way round. */}
      <p className="proto-caption proto-review-sitting__eyebrow">
        {subject}
        {exerciseLabel ? ` · ${exerciseLabel}` : ''}
      </p>
      <p className="proto-review-sitting__prompt">{head.prompt}</p>
      {source && source !== subject ? (
        <p className="proto-caption proto-review-sitting__source">{source}</p>
      ) : null}
      {progress}
      <div className="proto-review-sitting__foot">
        <span className="proto-caption">
          {goal > 0 ? reviewTodayProgressCopy(answered, goal) : null}
        </span>
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
          onClick={() => onBegin(head.id)}
        >
          {answered > 0 ? REVIEW_KEEP_GOING_COPY : REVIEW_BEGIN_COPY}
        </button>
      </div>
    </div>
  );
}
