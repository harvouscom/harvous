/**
 * The illustrated cards: questions about a verse whose answer is a kind of thing — a person, a
 * place, a theme, a book of the Bible, one of the reader's notes — drawn as that thing.
 *
 * Neutral, like every scene: the only colour is the mark (the accent gradient with white for
 * picked or right, the destructive tint for wrong). Each scene has one empty place the answer goes
 * — the speaker's portrait, a pin, a tag, a spine pulled from the shelf — filled from the dock's
 * own marking (`SlotFill`), never guessed. The page still holds no answer key.
 */
import { Fragment, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import { bookByOrder, canonicalBookOrder } from '@/utils/scripture-osis';
import { CANON_BOOK_GROUPS } from '@/utils/admin-pulse-canon-groups';
import { CHOICE_LETTERS, initialsOf, optionState, useChoiceKeys } from './ChoiceOptions';
import type { SlotFill } from './RailSlot';

/**
 * Who: the verse as a speech bubble, and the portrait of whoever it is about as an empty place.
 * A chapter has no single verse to quote, so the chapter's name stands in the bubble instead.
 */
export function SpeakerScene({
  quote,
  label,
  fill,
}: {
  /** The verse, or for a chapter its reference. */
  quote: ReactNode;
  /** Above the bubble: the reference, when the bubble holds the verse. */
  label?: string;
  fill: SlotFill | null;
}) {
  return (
    <div className="rx-speaker">
      <span
        className="rx-speaker__portrait"
        data-filled={fill ? '' : undefined}
        data-state={fill?.state}
        aria-hidden
      >
        {fill ? initialsOf(fill.text) : '?'}
      </span>
      <div className="rx-speaker__bubble">
        {label ? <p className="rx-rail__label">{label}</p> : null}
        <div className="rx-speaker__text">{quote}</div>
      </div>
    </div>
  );
}

/**
 * Places and Theme: the verse, and under it one tagged place — a pin, a tag — that the answer is
 * dropped into. Say it plainly: "Names a place" / "Carries the theme"; the empty place never
 * holds a guess.
 */
export function TagSlotScene({
  children,
  icon,
  label,
  fill,
}: {
  children: ReactNode;
  icon: 'location-dot' | 'tag';
  label: string;
  fill: SlotFill | null;
}) {
  return (
    <>
      {children}
      <p className="rx-tagslot" data-filled={fill ? '' : undefined} data-state={fill?.state}>
        <Icon name={icon} size={13} aria-hidden />
        <span className="rx-tagslot__text">{fill ? fill.text : label}</span>
      </p>
    </>
  );
}

/**
 * Which note: the line quoted back as a strip torn from a page — the reader's own words, in the
 * body face, the marked span still marked — above the fan of their notes it could be from.
 */
export function NoteStrip({ children }: { children: ReactNode }) {
  return (
    <div className="rx-notestrip">
      <p className="rx-rail__label">A line from one of your notes</p>
      <div className="rx-notestrip__text">{children}</div>
    </div>
  );
}

/** Every book in canonical order, once. */
function canon(): string[] {
  const out: string[] = [];
  for (let order = 1; order <= 66; order++) {
    const book = bookByOrder(order);
    if (book) out.push(book);
  }
  return out;
}

/** Whether every option is a book the shelf knows, so the shelf can hold them all. */
export function shelfCanHold(options: readonly string[]): boolean {
  return options.length > 0 && options.every((option) => Number.isFinite(canonicalBookOrder(option)));
}

/** Where a book sits on the shelf, for the gap before each section and the spine's height. */
function groupStart(order: number): 'testament' | 'section' | null {
  if (order === 40) return 'testament';
  return CANON_BOOK_GROUPS.some((group) => group.orderStart === order && order !== 1) ? 'section' : null;
}

/**
 * Where: the whole Bible as a shelf of sixty-six spines, with the books offered standing out —
 * taller, named, and the only ones that can be taken down. Choosing a book is choosing where on
 * the shelf a line lives, which is the question; four names in a grid only ever asked which word
 * was right.
 *
 * The same keys as every choice (A–F, on each named spine), and the same marking. The rest of the
 * shelf is drawn, not offered: a spine that cannot be picked is not a button.
 */
export function BookShelf({
  options,
  disabled,
  missed = [],
  correct,
  pending,
  onPick,
}: {
  options: readonly string[];
  disabled: boolean;
  missed?: readonly string[];
  correct?: string | null;
  pending?: string | null;
  onPick: (option: string) => void;
}) {
  const pick = useChoiceKeys(options, { disabled, missed, onPick });
  const offered = new Map(options.map((option, index) => [canonicalBookOrder(option), { option, index }]));
  return (
    <div className="rx-shelf" role="group" aria-label="Books of the Bible">
      <div className="rx-shelf__books">
        {canon().map((book, i) => {
          const order = i + 1;
          const start = groupStart(order);
          const hit = offered.get(order);
          const gap = start ? <span className="rx-shelf__gap" data-kind={start} aria-hidden /> : null;
          if (!hit) {
            return (
              <Fragment key={book}>
                {gap}
                {/* A spine at rest: its height varies a little by book, as a real shelf's does. */}
                <span className="rx-shelf__spine" style={{ height: `${56 + ((order * 37) % 5) * 7}%` }} aria-hidden />
              </Fragment>
            );
          }
          return (
            <Fragment key={book}>
              {gap}
              <button
                type="button"
                className="rx-shelf__book"
                data-state={optionState(hit.option, { missed, correct, pending })}
                disabled={disabled || missed.includes(hit.option)}
                onClick={() => pick.current(hit.option)}
                aria-label={hit.option}
              >
                <span className="rx-shelf__title">{hit.option}</span>
                <span className="rx-shelf__key" aria-hidden>
                  {CHOICE_LETTERS[hit.index]}
                </span>
              </button>
            </Fragment>
          );
        })}
      </div>
      <div className="rx-shelf__ends" aria-hidden>
        <span>Old Testament</span>
        <span>New Testament</span>
      </div>
    </div>
  );
}
