/**
 * The rail: the thing the question is about, fixed, and a place beside it that the answer goes in.
 *
 * Five families ask "what goes with this": what follows a verse, which comes first, what a verse
 * is cross-referenced with, what a note links to, which passage a note cites, how a verse begins.
 * As a verse above a grid of options they read as a quiz about a paragraph. As a rail they read as
 * the relationship being asked about — the verse, an arrow, and an empty place — and the tap puts
 * the answer where it belongs, so the mark lands on the relationship rather than on a list.
 *
 * Stacked, never side by side: a verse is twenty to forty words, and half a card's width would
 * make it scroll inside a card that is meant not to. The labels never carry the answer — "Next
 * verse", not "Romans 5:9", or the question becomes arithmetic.
 *
 * Tap-to-answer, like every choice rung: the options below stay `ChoiceOptions`, keys and all. The
 * slot only shows what that tap did, derived from the dock's marking by `slotFill`.
 */
import type { ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import { trailOff } from './ChoiceOptions';

export interface SlotFill {
  text: string;
  /**
   * On its way to the server, marked right, or tried and wrong — or `placed`, a filled place that
   * is not itself the answer (the second of "which comes first"), which stays neutral.
   */
  state: 'picked' | 'right' | 'wrong' | 'placed';
}

/**
 * What the slot holds, from what the dock already knows: the option on its way to being marked,
 * else the one marked right, else the last one marked wrong (which stays until the next tap, so
 * the reader sees what they tried). The page holds no answer key; this never guesses.
 */
export function slotFill(input: {
  pending?: string | null;
  correct?: string | null;
  wrong?: string | null;
}): SlotFill | null {
  if (input.pending) return { text: input.pending, state: 'picked' };
  if (input.correct) return { text: input.correct, state: 'right' };
  if (input.wrong) return { text: input.wrong, state: 'wrong' };
  return null;
}

function Slot({
  label,
  fill,
  trailing,
  scripture,
}: {
  label: string;
  fill: SlotFill | null;
  trailing?: boolean;
  scripture?: boolean;
}) {
  return (
    <div
      className="rx-rail__slot"
      data-filled={fill ? '' : undefined}
      data-state={fill?.state}
      data-scripture={scripture ? '' : undefined}
    >
      <p className="rx-rail__label">{label}</p>
      <p className="rx-rail__text">
        {fill ? (trailing ? trailOff(fill.text) : fill.text) : ' '}
      </p>
    </div>
  );
}

export function Rail({
  fromLabel,
  from,
  scripture = false,
  slotLabel,
  fill,
  join = 'next',
  trailing = false,
  slotScripture = false,
}: {
  fromLabel: string;
  /** The known item: a verse, or a line of the reader's note. */
  from: ReactNode;
  /** The reading face for the known item, only where it is Scripture. */
  scripture?: boolean;
  slotLabel: string;
  fill: SlotFill | null;
  /** An arrow for "what follows", a link for a relationship that has no direction. */
  join?: 'next' | 'link';
  /** The options are openings of something longer, so a filled slot trails off too. */
  trailing?: boolean;
  /** The answer is Scripture (a verse opening), so it reads in the reading face. */
  slotScripture?: boolean;
}) {
  return (
    <div className="rx-rail">
      <div className="rx-rail__card" data-scripture={scripture ? '' : undefined}>
        <p className="rx-rail__label">{fromLabel}</p>
        <div className="rx-rail__text">{from}</div>
      </div>
      <span className="rx-rail__join" data-join={join} aria-hidden>
        <Icon name={join === 'link' ? 'link' : 'arrow-right'} size={12} />
      </span>
      <Slot label={slotLabel} fill={fill} trailing={trailing} scripture={slotScripture} />
    </div>
  );
}

/**
 * "Which comes first": no known item, two places. The pick takes the first place and the other
 * option the second, so the answer reads as an order rather than as one of two buttons.
 */
export function PairRail({
  options,
  fill,
}: {
  options: readonly string[];
  fill: SlotFill | null;
}) {
  const other = fill && options.length === 2 ? options.find((option) => option !== fill.text) ?? null : null;
  return (
    <div className="rx-rail">
      <Slot label="Comes first" fill={fill} trailing scripture />
      <span className="rx-rail__join" data-join="next" aria-hidden>
        <Icon name="arrow-right" size={12} />
      </span>
      <Slot
        label="Then"
        fill={other ? { text: other, state: 'placed' } : null}
        trailing
        scripture
      />
    </div>
  );
}

/**
 * "How it begins": the reference as the eyebrow, and the verse's first words as a gap at the start
 * of a line that trails off — the rest is withheld, because it would answer the question.
 */
export function OpeningLine({ reference, fill }: { reference: string; fill: SlotFill | null }) {
  return (
    <>
      <p className="rx-eyebrow">{reference}</p>
      <p className="rx-hero" data-scripture="" data-size="lg">
        <span
          className="rx-opening"
          data-filled={fill ? '' : undefined}
          data-state={fill?.state}
        >
          {fill ? fill.text : ' '}
        </span>
        {' …'}
      </p>
    </>
  );
}
