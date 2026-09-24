/**
 * The options on a multiple-choice rung, as answer cards.
 *
 * They were compact pill buttons — the settings page's control, 28px tall, wrapping in a row — so
 * a question with four verse openings read as a toolbar. These are pieces: a full-height card
 * each, laid out in a grid, pressed down when tapped, and marked where they sit.
 *
 * Everything else about them is what `ReviewChoiceChips` already did, and deliberately so:
 *
 * - Every rung sends `almost` and lets the server decide. The page has no answer key, and
 *   `correct` is only ever what came back from marking.
 * - The letters are real. A keycap that shows "A" and does nothing when you press A is a lie, so
 *   the bare letters are bound while a choice is on screen — guarded by `isTypingInInput`, since
 *   the dock stays open over a note and a review must never eat a keystroke meant for the page.
 * - `opening` is display only: the value handed back is the option itself, because the server
 *   rebuilds the exercise to mark the tap and an ellipsis in the string would not match.
 */
import { useEffect, useRef } from 'react';
import { isTypingInInput } from '@/utils/keyboard-shortcuts';

export const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/**
 * The first words of something longer, trailing off. A clause that already ends in its own stop
 * ("disappointment.") took the ellipsis after it and read as four dots; the stop goes first.
 * Display only — the value sent back is always the option as the server built it.
 */
export function trailOff(text: string): string {
  return `${text.replace(/[\s.,;:]+$/u, '')}…`;
}

/** Past this, an option is a sentence rather than a name, and wants a wider card. */
const LONG_OPTION = 28;

export interface ChoiceOptionsProps {
  options: readonly string[];
  disabled: boolean;
  onPick: (option: string) => void;
  /** Options already tried and wrong. Marked, and not offered again. */
  missed?: readonly string[];
  /** The option the server just marked right. */
  correct?: string | null;
  /** The option on its way to being marked, so the tap is seen to land. */
  pending?: string | null;
  /** These options are the first words of something longer, so they trail off. */
  opening?: boolean;
  /**
   * The option under the pointer or the keyboard focus, and null when it leaves — for a card
   * that shows on its scene what an option would mean (the highlighter on What you marked).
   */
  onPreview?: (option: string | null) => void;
}

export function ChoiceOptions({
  options,
  disabled,
  onPick,
  missed = [],
  correct,
  pending,
  opening = false,
  onPreview,
}: ChoiceOptionsProps) {
  const pick = useRef(onPick);
  pick.current = onPick;
  const missedRef = useRef(missed);
  missedRef.current = missed;

  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingInInput()) return;
      const index = CHOICE_LETTERS.indexOf(
        event.key.toUpperCase() as (typeof CHOICE_LETTERS)[number],
      );
      if (index < 0 || index >= options.length) return;
      // A key for an option already ruled out does nothing, as its card does.
      if (missedRef.current.includes(options[index])) return;
      event.preventDefault();
      pick.current(options[index]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [options, disabled]);

  const long = opening || options.some((option) => option.length > LONG_OPTION);

  return (
    <div className="rx-options" data-long={long ? '' : undefined} data-count={options.length}>
      {options.map((option, index) => {
        const state = missed.includes(option)
          ? 'wrong'
          : correct === option
            ? 'right'
            : pending === option
              ? 'picked'
              : undefined;
        return (
          <button
            key={option}
            type="button"
            className="rx-option"
            data-state={state}
            disabled={disabled || missed.includes(option)}
            onClick={() => pick.current(option)}
            onMouseEnter={onPreview ? () => onPreview(option) : undefined}
            onMouseLeave={onPreview ? () => onPreview(null) : undefined}
            onFocus={onPreview ? () => onPreview(option) : undefined}
            onBlur={onPreview ? () => onPreview(null) : undefined}
          >
            {/* aria-hidden: the letter is a way to reach the button, not part of what it says. */}
            <span className="rx-option__key" aria-hidden>
              {CHOICE_LETTERS[index]}
            </span>
            <span className="rx-option__label">{opening ? trailOff(option) : option}</span>
          </button>
        );
      })}
    </div>
  );
}
