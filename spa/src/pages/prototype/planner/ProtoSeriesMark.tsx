/**
 * The one mark that says "this belongs to that run".
 *
 * The planner used to say it four different ways: a bridging band on the
 * board, a rule across the top of a calendar cell, a tinted border on the
 * list's date tile, and a filled colour block in the Series view. Four idioms
 * for one fact, which is why the plan never read as one thing — and why three
 * of them read as trim rather than as identity.
 *
 * The filled block won because it is the only one that survives being small:
 * a 2px border and a 3px rule both disappear against a warm canvas, while a
 * filled square holds its hue at 10px. It also already existed, as the face
 * the Series view leads with.
 *
 * Colour comes from `data-series-accent` on this element, which resolves
 * `--pds-series-accent` — the same token every other accented surface reads,
 * so a series cannot end up two colours in two views.
 *
 * Never the only thing carrying the meaning: every place this renders, the
 * series' own name sits beside it. Colour is the scan, the name is the answer.
 */
import type { SpaceCoverPickerColor } from '@/utils/space-cover';

export default function ProtoSeriesMark({
  accent,
  title,
}: {
  /** Null renders nothing — a standalone week has no run to mark. */
  accent: SpaceCoverPickerColor | null | undefined;
  /** The run's name, for the tooltip. The visible name sits beside this. */
  title?: string | null;
}) {
  if (!accent) return null;
  return (
    <span
      className="proto-series-mark"
      data-series-accent={accent}
      title={title ?? undefined}
      aria-hidden
    />
  );
}
