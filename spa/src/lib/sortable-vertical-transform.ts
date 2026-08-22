/**
 * The drag transform for a vertical sortable row, with sideways movement removed.
 *
 * `CSS.Transform.toString(transform)` applies whatever dnd-kit measured on both axes. In a list
 * using `verticalListSortingStrategy` the x component is never meaningful — nothing can be
 * reordered sideways — but it is still non-zero while you drag, so a row follows the pointer
 * horizontally and drifts out of its own menu. Reported on the space switcher; the thread trail
 * had it too, identically, because both wrote the transform out the same way.
 *
 * Zeroed here rather than by adding `@dnd-kit/modifiers` and `restrictToVerticalAxis`: that
 * package is not a dependency, and pulling one in to constrain one axis costs bundle budget for
 * something a single line expresses.
 *
 * Kept as a helper rather than inlined twice so the next vertical sortable does not have to
 * rediscover it — the failure is subtle enough that nobody noticed it in two lists.
 */
import { CSS, type Transform } from '@dnd-kit/utilities';

export function verticalDragTransform(transform: Transform | null): string | undefined {
  if (!transform) return undefined;
  // Scale is preserved: dnd-kit sets it to 1 for these lists today, and dropping it would be a
  // second, unrelated change riding along with an axis fix.
  return CSS.Transform.toString({ ...transform, x: 0 });
}
