/**
 * The sample: one fill-in-the-gaps question, answered in place, for an account without Review.
 *
 * Same shape as the dock's cloze — inputs in the gaps, sized by the word, two goes, then the
 * verse — built from the same pure code, so what a free account tries is the thing a paid one
 * gets and not a mock-up of it. It lives in the Review section rather than the dock because
 * the dock is the feature's and is gated with it; this is the one card that is deliberately
 * not.
 *
 * Nothing here writes. The server rebuilds the same question from the same day-seed to mark
 * it, so a reload mid-answer shows the same gaps, and there is no queue to confuse a later
 * subscription with.
 */
import { Fragment, useState } from 'react';
import { useAnswerReviewSample } from '../../hooks/mutations/useReviewMutations';
import type { ReviewSampleView } from '../../hooks/queries/useReview';
import {
  REVIEW_CHECK_COPY,
  REVIEW_OUTCOME_ACK_COPY,
  REVIEW_SAMPLE_AFTER,
  REVIEW_SAMPLE_EYEBROW_WELL_KNOWN,
  REVIEW_SAMPLE_EYEBROW_YOURS,
  REVIEW_SAMPLE_PROMPT,
  REVIEW_TRUTH_LABEL,
  REVIEW_TRY_AGAIN_COPY,
} from './proto-review-copy';

export default function PrototypeReviewSample({
  sample,
  day,
  maxAttempts,
}: {
  sample: ReviewSampleView;
  day: string;
  maxAttempts: number;
}) {
  const answer = useAnswerReviewSample();
  const [blanks, setBlanks] = useState<string[]>([]);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [missed, setMissed] = useState(false);
  const [result, setResult] = useState<{ correct: boolean; verseText: string } | null>(null);

  const filled = sample.cloze.blankLengths.every((_, i) => (blanks[i] ?? '').trim().length > 0);

  const submit = () => {
    answer.mutate(
      { day, words: sample.cloze.blankLengths.map((_, i) => (blanks[i] ?? '').trim()), attemptNumber },
      {
        onSuccess: (data) => {
          if (data.finalized === false) {
            setMissed(true);
            setAttemptNumber((n) => Math.min(maxAttempts, n + 1));
            return;
          }
          setResult({ correct: data.correct, verseText: data.verseText ?? '' });
        },
      },
    );
  };

  return (
    <div className="proto-review-sample">
      <p className="proto-caption proto-review-sample__eyebrow">
        {sample.source === 'yours' ? REVIEW_SAMPLE_EYEBROW_YOURS : REVIEW_SAMPLE_EYEBROW_WELL_KNOWN}
        {' · '}
        {sample.reference}
      </p>
      {result ? (
        <div className="proto-review-dock__result">
          <div className="proto-review-dock__answer">
            <p className="proto-caption proto-review-dock__truth-label">{REVIEW_TRUTH_LABEL}</p>
            <p
              className="proto-review-dock__verse proto-review-dock__verse--scripture"
              dangerouslySetInnerHTML={{ __html: result.verseText }}
            />
          </div>
          <p className="proto-review-dock__result-text">
            <span className="proto-review-dock__result-outcome">
              {REVIEW_OUTCOME_ACK_COPY[result.correct ? (attemptNumber > 1 ? 'almost' : 'recalled') : 'revealed']}
            </span>
            <span className="proto-review-dock__result-next">{REVIEW_SAMPLE_AFTER}</span>
          </p>
        </div>
      ) : (
        <>
          <p className="proto-review-dock__prompt">{REVIEW_SAMPLE_PROMPT}</p>
          <p className="proto-challenge__cloze">
            {sample.cloze.segments.map((segment, index) => (
              <Fragment key={index}>
                {segment}
                {index < sample.cloze.blankLengths.length ? (
                  <input
                    type="text"
                    className="proto-review-dock__blank"
                    style={{ width: `${Math.max(4, sample.cloze.blankLengths[index]) + 1}ch` }}
                    value={blanks[index] ?? ''}
                    onChange={(event) => {
                      const next = [...blanks];
                      next[index] = event.target.value;
                      setBlanks(next);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && filled && !answer.isPending) submit();
                    }}
                    aria-label={`Blank ${index + 1}`}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={answer.isPending}
                  />
                ) : null}
              </Fragment>
            ))}
          </p>
          {missed ? <p className="proto-caption proto-review-dock__retry">{REVIEW_TRY_AGAIN_COPY}</p> : null}
          <div className="proto-review-dock__actions">
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--compact"
              disabled={!filled || answer.isPending}
              onClick={submit}
            >
              {REVIEW_CHECK_COPY}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
