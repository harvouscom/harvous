import { Fragment } from 'react';
import { isSubmitKey, nextBlankIndex } from '../review-dock-keys';
import type { heroSize } from './ExerciseStage';

/**
 * A verse with gaps in it, where the gaps are inputs.
 *
 * Two rungs render this: the cloze, where a gap is empty, and the lower tiers of the initials
 * rung, where each gap keeps its word's first letter beside it as the hint the rung is named
 * for. One component because they are the same act — put the missing words back where they
 * belong — and because the second one arrived by staging the first.
 *
 * A gap the server has given away after a miss is filled and locked: it is no longer a question,
 * and leaving it editable invites the reader to retype what they were just handed.
 */
export function GapLine({
  hero,
  segments,
  blankLengths,
  letters,
  values,
  given,
  partState,
  disabled,
  onChange,
  onSubmit,
}: {
  /** Set on the card stage: the line is the scene, in the reading face at the scene's size. */
  hero?: ReturnType<typeof heroSize>;
  segments: string[];
  blankLengths: number[];
  letters?: string[];
  values: string[];
  given: Map<number, string>;
  partState: (index: number) => 'right' | 'wrong' | undefined;
  disabled: boolean;
  onChange: (index: number, value: string) => void;
  /** Called when Enter lands on the last gap still to fill. */
  onSubmit: () => void;
}) {
  return (
    <p
      className={hero ? 'rx-hero' : 'proto-challenge__cloze'}
      data-size={hero}
      data-scripture={hero ? '' : undefined}
      data-gapline=""
    >
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {segment}
          {index < blankLengths.length ? (
            <span className="proto-review-dock__gap">
              {letters?.[index] ? (
                // The letter is the hint, not part of what gets typed — so it sits beside the
                // input rather than inside it, where it would have to be typed around.
                <span className="proto-review-dock__gap-letter" aria-hidden>
                  {letters[index]}
                </span>
              ) : null}
              <input
                type="text"
                className="proto-review-dock__blank"
                data-answer={given.has(index) ? 'given' : partState(index)}
                style={{ width: `${Math.max(4, blankLengths[index]) + 1}ch` }}
                value={values[index] ?? ''}
                onChange={(event) => onChange(index, event.target.value)}
                /*
                 * Enter moves to the next gap still empty, and submits from the last one — the
                 * tap rungs have had A-F bound since they shipped and the typed ones had
                 * nothing, so filling in a verse ended with a reach for the mouse.
                 */
                onKeyDown={(event) => {
                  if (!isSubmitKey(event)) return;
                  event.preventDefault();
                  const next = nextBlankIndex(values, index, blankLengths.length);
                  if (next === null) {
                    onSubmit();
                    return;
                  }
                  const inputs = event.currentTarget
                    .closest('[data-gapline]')
                    ?.querySelectorAll<HTMLInputElement>('.proto-review-dock__blank');
                  inputs?.[next]?.focus();
                }}
                aria-label={
                  letters?.[index] ? `Word ${index + 1}, starts with ${letters[index]}` : `Blank ${index + 1}`
                }
                aria-invalid={partState(index) === 'wrong' ? true : undefined}
                autoComplete="off"
                spellCheck={false}
                readOnly={given.has(index)}
                disabled={disabled}
              />
            </span>
          ) : null}
        </Fragment>
      ))}
    </p>
  );
}
