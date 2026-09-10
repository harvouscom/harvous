/**
 * The sample: one real, marked question for an account without Review.
 *
 * Same shape as the dock's rungs — inputs in the blanks, chips to order, the same goes — built
 * from the same pure code, so what a free account tries is the thing a paid one gets and not a
 * mock-up of it. It lives in the Review section rather than the dock because the dock is the
 * feature's and is gated with it; this is the one card that is deliberately not.
 *
 * **The reader picks how to be asked.** It was fill-in-the-blanks and only that, which is the
 * right exercise to open on — it is what people picture when they think "commit a verse to
 * memory" — but a feature whose claim is that it varies what it asks was making that claim
 * through a card that only ever did one thing. The four here are the rungs keyed to nothing but
 * the verse's own text, so they need no history to work, and they wear the names the paid rungs
 * wear so the word learned here is the word seen inside.
 *
 * The offer comes after the answer, not before it. A paywall above an untried thing is asking
 * someone to buy a description; the same words under a question they have just answered are
 * about something that happened to them.
 *
 * Nothing here writes. The server rebuilds the same question from the same day-seed to mark it,
 * so a reload mid-answer shows the same question, and there is no queue to confuse a later
 * subscription with.
 */
import { Fragment, useState } from 'react';
import { TRANSLATION_ORDER, TRANSLATIONS } from '@/data/translations';
import { useAnswerReviewSample } from '../../hooks/mutations/useReviewMutations';
import type { ReviewSampleView, SampleExerciseKind } from '../../hooks/queries/useReview';
import { readReviewSampleResult, writeReviewSampleResult } from './use-dismissible-review-sample';
import Icon from '@/components/react/Icon';
import {
  REVIEW_CHECK_COPY,
  REVIEW_OUTCOME_ACK_COPY,
  REVIEW_SAMPLE_AFTER,
  REVIEW_SAMPLE_CHOOSE,
  REVIEW_SAMPLE_EXERCISE_LABELS,
  REVIEW_SAMPLE_EYEBROW_WELL_KNOWN,
  REVIEW_SAMPLE_EYEBROW_YOURS,
  REVIEW_SAMPLE_NOT_NOW,
  REVIEW_SAMPLE_PROMPTS,
  REVIEW_SAMPLE_SEE_PLUS,
  REVIEW_TRUTH_LABEL,
  REVIEW_TRY_AGAIN_COPY,
} from './proto-review-copy';

/** The order the chips are offered in, gentlest first. */
const EXERCISE_ORDER: SampleExerciseKind[] = ['blanks', 'letters', 'order', 'next'];

export default function PrototypeReviewSample({
  sample,
  day,
  maxAttempts,
  onSeePlus,
  onNotNow,
  onAnswered,
  onTranslationChange,
  onExerciseChange,
}: {
  sample: ReviewSampleView;
  day: string;
  maxAttempts: number;
  onSeePlus: () => void;
  onNotNow: () => void;
  onTranslationChange?: (translation: string) => void;
  /** Switching the chip re-asks the server, because the question is built there. */
  onExerciseChange?: (exercise: SampleExerciseKind) => void;
  /** So the section can drop its own offer row once this card is carrying one. */
  onAnswered?: () => void;
}) {
  const answer = useAnswerReviewSample();
  const [blanks, setBlanks] = useState<string[]>([]);
  const [written, setWritten] = useState('');
  const [placed, setPlaced] = useState<number[]>([]);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [missed, setMissed] = useState(false);
  const [result, setResult] = useState<{ correct: boolean; verseText: string } | null>(() => {
    const stored = readReviewSampleResult(day);
    return stored ? { correct: stored.correct, verseText: stored.verseText } : null;
  });
  const translation = sample.translation?.trim() || 'NET';
  const translationLabel = TRANSLATIONS[translation]?.abbreviation ?? translation;
  const exercise = sample.exercise;
  const available = sample.available ?? [exercise.kind];

  /* Every surface has its own "is there anything to check yet", and none may submit empty. */
  const filled =
    exercise.kind === 'blanks'
      ? exercise.cloze.blankLengths.every((_, i) => (blanks[i] ?? '').trim().length > 0)
      : exercise.kind === 'letters'
        ? written.trim().length > 0
        : exercise.kind === 'order'
          ? placed.length === exercise.phrases.length
          : false;

  const send = (payload: Parameters<typeof answer.mutate>[0]) => {
    answer.mutate(payload, {
      onSuccess: (data) => {
        if (data.finalized === false) {
          setMissed(true);
          setAttemptNumber((n) => Math.min(maxAttempts, n + 1));
          return;
        }
        const next = { correct: data.correct, verseText: data.verseText ?? '' };
        setResult(next);
        writeReviewSampleResult({ day, translation, ...next });
        onAnswered?.();
      },
    });
  };

  const base = { day, translation, exercise: exercise.kind, attemptNumber };
  const submit = () => {
    if (exercise.kind === 'blanks') {
      send({ ...base, words: exercise.cloze.blankLengths.map((_, i) => (blanks[i] ?? '').trim()) });
    } else if (exercise.kind === 'letters') {
      send({ ...base, text: written.trim() });
    } else if (exercise.kind === 'order') {
      send({ ...base, order: placed });
    }
  };

  /* Switching the chip clears whatever was half-answered: it is a different question now. */
  const chooseExercise = (kind: SampleExerciseKind) => {
    if (kind === exercise.kind) return;
    setBlanks([]);
    setWritten('');
    setPlaced([]);
    setMissed(false);
    setAttemptNumber(1);
    onExerciseChange?.(kind);
  };

  return (
    <div className="proto-review-sample">
      <p className="proto-caption proto-review-sample__eyebrow">
        {sample.source === 'yours' ? REVIEW_SAMPLE_EYEBROW_YOURS : REVIEW_SAMPLE_EYEBROW_WELL_KNOWN}
        {' · '}
        {sample.reference}
        {' · '}
        {onTranslationChange && !result ? (
          <label>
            <select
              className="proto-caption"
              value={translation}
              onChange={(event) => onTranslationChange(event.target.value)}
              aria-label="Translation"
            >
              {TRANSLATION_ORDER.map((id) => (
                <option key={id} value={id}>
                  {TRANSLATIONS[id]?.abbreviation ?? id}
                </option>
              ))}
            </select>
          </label>
        ) : (
          translationLabel
        )}
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
          {/*
            * The chooser, above the question rather than below it.
            *
            * Only the kinds this verse can actually carry are offered: a verse at the end of a
            * book has nothing following it, and a chip that produced no question would be worse
            * than no chip. Hidden entirely when only one kind is possible.
            */}
          {available.length > 1 && onExerciseChange ? (
            <div className="proto-review-sample__exercises" role="group" aria-label={REVIEW_SAMPLE_CHOOSE}>
              {EXERCISE_ORDER.filter((kind) => available.includes(kind)).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
                  aria-pressed={kind === exercise.kind}
                  data-current={kind === exercise.kind ? '' : undefined}
                  disabled={answer.isPending}
                  onClick={() => chooseExercise(kind)}
                >
                  {REVIEW_SAMPLE_EXERCISE_LABELS[kind] ?? kind}
                </button>
              ))}
            </div>
          ) : null}

          <p className="proto-review-dock__prompt">{REVIEW_SAMPLE_PROMPTS[exercise.kind]}</p>

          {exercise.kind === 'blanks' ? (
            <p className="proto-challenge__cloze">
              {exercise.cloze.segments.map((segment, index) => (
                <Fragment key={index}>
                  {segment}
                  {index < exercise.cloze.blankLengths.length ? (
                    <input
                      type="text"
                      className="proto-review-dock__blank"
                      style={{ width: `${Math.max(4, exercise.cloze.blankLengths[index]) + 1}ch` }}
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
          ) : null}

          {exercise.kind === 'letters' ? (
            <>
              <p className="proto-review-dock__verse proto-review-dock__initials">
                {exercise.initials}
              </p>
              <textarea
                className="proto-review-dock__input"
                value={written}
                onChange={(event) => setWritten(event.target.value)}
                aria-label="The verse"
                disabled={answer.isPending}
                rows={3}
              />
            </>
          ) : null}

          {exercise.kind === 'order' ? (
            <>
              <ol className="proto-review-dock__chips proto-review-dock__chips--placed">
                {placed.map((index, position) => (
                  <li key={`${index}-${position}`}>
                    <button
                      type="button"
                      className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact proto-review-dock__choice"
                      disabled={answer.isPending}
                      onClick={() => setPlaced((current) => current.filter((_, i) => i !== position))}
                    >
                      {exercise.phrases[index]}
                    </button>
                  </li>
                ))}
              </ol>
              <div className="proto-review-dock__chips">
                {exercise.phrases.map((phrase, index) =>
                  placed.includes(index) ? null : (
                    <button
                      key={index}
                      type="button"
                      className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
                      disabled={answer.isPending}
                      onClick={() => setPlaced((current) => [...current, index])}
                    >
                      {phrase}
                    </button>
                  ),
                )}
              </div>
            </>
          ) : null}

          {exercise.kind === 'next' ? (
            /* A tap, so it submits on the tap: there is nothing to check afterwards. */
            <div className="proto-review-dock__chips">
              {exercise.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact proto-review-dock__choice"
                  disabled={answer.isPending}
                  onClick={() => send({ ...base, option })}
                >
                  {option}…
                </button>
              ))}
            </div>
          ) : null}

          {missed ? <p className="proto-caption proto-review-dock__retry">{REVIEW_TRY_AGAIN_COPY}</p> : null}
          {exercise.kind === 'next' ? null : (
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
          )}
        </>
      )}
    </div>
  );
}
