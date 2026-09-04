/**
 * The sample: one fill-in-the-gaps question, answered in place, for an account without Review.
 *
 * Same shape as the dock's cloze — inputs in the blanks, sized by the word, the same three
 * goes — built from the same pure code, so what a free account tries is the thing a paid one
 * gets and not a mock-up of it. It lives in the Review section rather than the dock because
 * the dock is the feature's and is gated with it; this is the one card that is deliberately
 * not.
 *
 * The offer comes after the answer, not before it. A paywall above an untried thing is asking
 * someone to buy a description; the same words under a question they have just answered are
 * about something that happened to them.
 *
 * Nothing here writes. The server rebuilds the same question from the same day-seed to mark
 * it, so a reload mid-answer shows the same gaps, and there is no queue to confuse a later
 * subscription with.
 */
import { Fragment, useState } from 'react';
import { useAnswerReviewSample } from '../../hooks/mutations/useReviewMutations';
import type { ReviewSampleView } from '../../hooks/queries/useReview';
import Icon from '@/components/react/Icon';
import {
  REVIEW_CHECK_COPY,
  REVIEW_OUTCOME_ACK_COPY,
  REVIEW_SAMPLE_AFTER,
  REVIEW_SAMPLE_EYEBROW_WELL_KNOWN,
  REVIEW_SAMPLE_EYEBROW_YOURS,
  REVIEW_SAMPLE_NOT_NOW,
  REVIEW_SAMPLE_PROMPT,
  REVIEW_SAMPLE_SEE_PLUS,
  REVIEW_TRUTH_LABEL,
  REVIEW_TRY_AGAIN_COPY,
} from './proto-review-copy';

export default function PrototypeReviewSample({
  sample,
  day,
  maxAttempts,
  onSeePlus,
  onNotNow,
  onAnswered,
}: {
  sample: ReviewSampleView;
  day: string;
  maxAttempts: number;
  onSeePlus: () => void;
  onNotNow: () => void;
  /** So the section can drop its own offer row once this card is carrying one. */
  onAnswered?: () => void;
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
          onAnswered?.();
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
          <div className="proto-review-dock__verdict">
            <span className="proto-review-dock__verdict-icon" aria-hidden>
              <Icon name={result.correct ? 'check' : 'xmark'} size={13} />
            </span>
            <p className="proto-review-dock__result-text">
              <span className="proto-review-dock__result-outcome">
                {REVIEW_OUTCOME_ACK_COPY[result.correct ? (attemptNumber > 1 ? 'almost' : 'recalled') : 'revealed']}
              </span>
            </p>
          </div>
          {/*
            * The offer, now that there is something it refers to. Both ways out: a card with
            * only "See Plus" on it is a toll gate, and the reader has just done the one thing
            * that makes the answer to it obvious either way.
            */}
          <p className="proto-review-dock__result-text">{REVIEW_SAMPLE_AFTER}</p>
          <div className="proto-review-dock__actions">
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--compact"
              onClick={onSeePlus}
            >
              {REVIEW_SAMPLE_SEE_PLUS}
            </button>
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
              onClick={onNotNow}
            >
              {REVIEW_SAMPLE_NOT_NOW}
            </button>
          </div>
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
