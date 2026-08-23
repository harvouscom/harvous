/**
 * Sheet or popover — one answer, in one place.
 *
 * Every prototype overlay that can appear either as a bottom sheet or as an anchored popover
 * was deciding this for itself, with the same line copied fifteen times:
 *
 *   const shouldUseSheetPresentation =
 *     isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
 *
 * Two problems with that, beyond the repetition. It reads `matchMedia` during render and never
 * subscribes, so the answer is frozen at whatever was true when the component first rendered —
 * an iPad that gains a trackpad, or a window dragged across the mobile breakpoint, keeps the
 * old presentation until something else happens to re-render it. And fifteen copies means the
 * rule cannot actually be changed: it can only be changed fourteen times and missed once.
 *
 * `useCoarsePointer` already subscribes properly; this pairs it with the shell's breakpoint so
 * callers ask one question and get a reactive answer.
 */
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { useCoarsePointer } from '../../../lib/use-coarse-pointer';

export interface SheetPresentation {
  /** Render as a bottom sheet — a touch device at the mobile breakpoint. */
  asSheet: boolean;
  /** Render as an anchored popover. The exact inverse; named so call sites read as prose. */
  asPopover: boolean;
}

/**
 * Both signals matter, and neither is sufficient alone. A narrow desktop window is still
 * driven by a cursor, where a popover anchored to its trigger is the better shape. A tablet
 * in landscape is a touch device with room for one, and dragging a sheet up over a wide
 * layout wastes most of it.
 */
export function useSheetPresentation(): SheetPresentation {
  const { isMobileSidebar } = useProtoShell();
  const isCoarse = useCoarsePointer();
  const asSheet = isMobileSidebar && isCoarse;
  return { asSheet, asPopover: !asSheet };
}
