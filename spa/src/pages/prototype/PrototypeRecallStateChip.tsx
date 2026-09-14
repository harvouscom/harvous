/**
 * How well the reader holds something: three small segments beside the title.
 *
 * **It was two words, and before that a pill.** The pill went when the state moved to the title
 * line, because border, fill and weight were paying for a separation that position already made.
 * The words went when the row filled up: an exercise label arrived on the meta line, titles
 * already marquee at narrow widths, and "You're learning this" beside every title was the same
 * sentence repeated down the whole list. A mark says it once, in the space of a word.
 *
 * **Three segments, because the copy makes three distinctions and not five.** `fragile` and
 * `forming` share a label on purpose, so they share a fill; `new` is never rendered at all. The
 * mark is deliberately not a scale over `RECALL_STATES` — that would expose a split the words
 * were written to hide, and turn an observation into a score.
 *
 * `slipping` is the one that cannot be a lower rung. It is a fall *from* holding, so it shows
 * as reduced-from-full in the warning tone rather than as an early step: a row that has slipped
 * has more history behind it than one being learned, not less, and drawing it as "barely
 * started" would be a lie about the reader's own past.
 *
 * **This does add colour, and that is a reversal.** The note that stood here said a tinted marker
 * at the end of every row would be a scoreboard, and that the one thing this feature refuses is
 * to grade someone's grasp of Scripture at a glance. The trade taken instead: the mark carries no
 * number, no percentage and no ranking between rows, and its three steps say exactly what the
 * three labels said — nothing finer. What it buys is a row you can read down without meeting the
 * same sentence at every line.
 *
 * The words are still the accessible name, so nothing is lost to a reader who is listening
 * rather than looking. See `RECALL_STATE_LABELS`.
 */
import type { ReactNode } from 'react';
import { RECALL_STATE_LABELS, type RecallState } from '@/utils/review-item-kinds';
import { reviewRowRecallLabel } from '@/utils/review-row-subtitle';

export default function PrototypeRecallStateChip({
  state,
  label,
}: {
  state: RecallState;
  label: string;
}) {
  /*
   * `data-state` carries the raw state for tests and screenshots — fragile and forming are
   * indistinguishable in both the label and the fill, so this is the only thing that tells them
   * apart. `data-hold` is what the CSS actually draws, and it is the three-way the copy makes.
   */
  const hold = state === 'durable' ? 'held' : state === 'slipping' ? 'slipped' : 'learning';
  return (
    <span
      className="proto-recall-mark"
      data-state={state}
      data-hold={hold}
      role="img"
      aria-label={label}
      title={label}
    >
      {/* Three segments, filled by `data-hold`. Decorative: the label above is the real text. */}
      <span className="proto-recall-mark__seg" aria-hidden />
      <span className="proto-recall-mark__seg" aria-hidden />
      <span className="proto-recall-mark__seg" aria-hidden />
    </span>
  );
}

/**
 * The chip for one review row, or nothing.
 *
 * The rule for *whether* to say anything lives in `reviewRowRecallLabel` — nothing on a first
 * asking, nothing where the framing line already said it — and the three row surfaces share
 * this so they cannot drift on either the rule or the shape.
 */
export function recallChip(item: {
  recallState?: string | null;
  framing?: { template: string } | null;
}): ReactNode {
  const label = reviewRowRecallLabel(item, RECALL_STATE_LABELS);
  if (!label || !item.recallState) return null;
  return <PrototypeRecallStateChip state={item.recallState as RecallState} label={label} />;
}
