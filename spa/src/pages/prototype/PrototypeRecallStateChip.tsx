/**
 * How well the reader holds something, as a chip rather than a bare word at the end of a line.
 *
 * The shared-spaces people row is the pattern: a small round disc where a face would go, and a
 * quiet label beside it, in the neutral pill language `.proto-shared-people-row__tag` already
 * uses. Here the disc carries an icon for the state instead of someone's initial — a seedling
 * for something being learned, a check for something known, a turned-back clock for something
 * being lost.
 *
 * Why a chip at all. The state was the third `·`-separated fragment on a caption line, sitting
 * after a sentence and reading as another clause of it — "Cross-referenced 28 times · Needs
 * work" parses as one thought when it is two, and the second one is about the reader rather
 * than the verse. A chip separates them by shape, so the eye takes the sentence as provenance
 * and the chip as status without reading either twice.
 *
 * The colour is on the disc and nowhere else. The label stays the caption's own grey, because a
 * fully tinted pill at the end of every row would be a scoreboard, and the one thing this
 * feature refuses to do is grade someone's grasp of Scripture at a glance.
 */
import type { ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import type { IconName } from '@/components/react/Icon';
import { RECALL_STATE_LABELS, type RecallState } from '@/utils/review-item-kinds';
import { reviewRowRecallLabel } from '@/utils/review-row-subtitle';

/**
 * A glyph per state, and only three of them, because `fragile` and `forming` are one thing to
 * a reader — see `RECALL_STATE_LABELS`.
 */
export const RECALL_STATE_ICONS: Record<RecallState, IconName> = {
  // Never rendered: a row being asked for the first time carries no state at all.
  new: 'seedling',
  fragile: 'seedling',
  forming: 'seedling',
  durable: 'check',
  slipping: 'clock-rotate-left',
};

export default function PrototypeRecallStateChip({
  state,
  label,
}: {
  state: RecallState;
  label: string;
}) {
  return (
    <span className="proto-recall-chip" data-state={state}>
      <span className="proto-recall-chip__mark" aria-hidden>
        <Icon name={RECALL_STATE_ICONS[state]} size={9} />
      </span>
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
