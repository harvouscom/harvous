/**
 * The gentlest form of the cloze: the verse with its gaps, and the missing words laid out as
 * tiles to place (among a few that do not belong — see `buildClozeBank`).
 *
 * Two pieces, because the stage puts them in two places: the line is the scene, and the tray is
 * the work under it. Both are controlled by the one array the typed form already uses — the word
 * in each gap — so a server hint that fills a gap, a retry, and the answer sent are all the same
 * as the typed form's, and grading does not know tiles exist.
 *
 * Which tile is "used" is derived, never stored: each placed word takes the first matching tile
 * not already taken. That handles a word that appears twice (two "love" tiles for two "love"
 * gaps) and a word the server filled in as a hint, without a second piece of state to fall out
 * of step with the first.
 */
import { Fragment } from 'react';
import type { heroSize } from './ExerciseStage';

type PartState = 'right' | 'wrong' | undefined;

function key(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** For each tile, whether a gap holds it. Pure, so the matching can be tested without a render. */
export function bankUsage(bank: readonly string[], values: readonly (string | undefined)[]): boolean[] {
  const used = bank.map(() => false);
  for (const value of values) {
    if (!value?.trim()) continue;
    const at = bank.findIndex((tile, index) => !used[index] && key(tile) === key(value));
    if (at >= 0) used[at] = true;
  }
  return used;
}

/** The gap a tapped tile goes to: the first empty one the server has not already filled. */
export function nextOpenGap(
  total: number,
  values: readonly (string | undefined)[],
  given: ReadonlyMap<number, string>,
): number | null {
  for (let i = 0; i < total; i++) {
    if (given.has(i)) continue;
    if (!values[i]?.trim()) return i;
  }
  return null;
}

export function WordBankLine({
  hero,
  segments,
  blankLengths,
  values,
  given,
  partState,
  disabled,
  onClear,
}: {
  hero: ReturnType<typeof heroSize>;
  segments: readonly string[];
  blankLengths: readonly number[];
  values: readonly (string | undefined)[];
  given: ReadonlyMap<number, string>;
  partState: (index: number) => PartState;
  disabled: boolean;
  /** Tapping a filled gap sends its word back to the tray. */
  onClear: (index: number) => void;
}) {
  return (
    <p className="rx-hero" data-size={hero} data-scripture="">
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {segment}
          {index < blankLengths.length ? (
            (() => {
              const word = given.get(index) ?? values[index] ?? '';
              const filled = Boolean(word.trim());
              const locked = given.has(index);
              return (
                <button
                  type="button"
                  className="rx-gap"
                  data-filled={filled ? '' : undefined}
                  data-state={locked ? 'given' : filled ? partState(index) : undefined}
                  /* Sized to the word it stands for while empty, as the typed gap is. */
                  style={{ minWidth: `${Math.max(3, blankLengths[index]) + 2}ch` }}
                  disabled={disabled || locked || !filled}
                  onClick={() => onClear(index)}
                  aria-label={
                    filled
                      ? `Blank ${index + 1}: ${word}${locked ? '' : ', tap to take it back'}`
                      : `Blank ${index + 1}, empty`
                  }
                >
                  {filled ? word : ' '}
                </button>
              );
            })()
          ) : null}
        </Fragment>
      ))}
    </p>
  );
}

export function WordTray({
  bank,
  values,
  disabled,
  onPlace,
}: {
  bank: readonly string[];
  values: readonly (string | undefined)[];
  disabled: boolean;
  onPlace: (word: string) => void;
}) {
  const used = bankUsage(bank, values);
  return (
    <div className="rx-tray" role="group" aria-label="Words to place">
      {bank.map((word, index) => (
        /*
         * A placed tile leaves its outline behind rather than its space: the tray keeps its shape,
         * so the words that are left do not jump about as each one is taken, and the empty outline
         * says where a word went.
         */
        <button
          key={`${index}-${word}`}
          type="button"
          className="rx-tile"
          data-used={used[index] ? '' : undefined}
          disabled={disabled || used[index]}
          aria-hidden={used[index] ? true : undefined}
          tabIndex={used[index] ? -1 : undefined}
          onClick={() => onPlace(word)}
        >
          {word}
        </button>
      ))}
    </div>
  );
}
