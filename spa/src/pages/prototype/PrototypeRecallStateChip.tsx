/**
 * How well the reader holds something: two quiet words beside the title.
 *
 * **It was a pill, and the pill was doing a job the position now does.** The state used to be
 * the third `·`-separated fragment of the caption — "Cross-referenced 28 times · Needs work" —
 * where it read as another clause of a sentence about the verse when it is really a sentence
 * about the reader. A chip separated the two by shape. Then the state moved to the *title* line,
 * which separates them by position, and the chip's border, fill, weight and glyph were all
 * paying for a problem that had already been solved somewhere else.
 *
 * What tipped it was the exercise label arriving on the meta line: two glyphs and two labels on
 * one row, none of them the thing the reader came to read. So the row keeps one icon — the
 * subject's — and the state is words alone.
 *
 * No colour, still. A tinted marker at the end of every row would be a scoreboard, and the one
 * thing this feature refuses to do is grade someone's grasp of Scripture at a glance. The words
 * carry it on their own — and they describe the passage's hold rather than the reader's
 * performance, which is why they read as an observation instead of a mark. See
 * `RECALL_STATE_LABELS`.
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
  // `data-state` is kept though nothing styles it: it is what a test and a screenshot read to
  // tell a fragile row from a forming one, since the two share a label.
  return (
    <span className="proto-recall-mark" data-state={state}>
      {label}
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
