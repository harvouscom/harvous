/**
 * The panel's morph out of the toolbar chip.
 *
 * FLIP, on `transform` and `opacity` only. The panel lays out at its final size; this
 * measures it against the chip's box, writes the transform that maps one onto the other,
 * forces the browser to commit that frame, then removes it so the CSS transition carries
 * the panel to rest. Two composited states, no layout pass, nothing reflowed.
 *
 * That is the point of the rewrite. The first version animated `width` and
 * `grid-template-rows` in keyframes: a layout pass per frame, and — worse — a keyframe
 * restarts from its `from` value, so reopening mid-close snapped back to the chip's width
 * and replayed. A transition retargets from wherever the property currently is, so
 * open → close → open is one continuous move.
 *
 * ## Why this writes to the node instead of setting React state
 *
 * A FLIP needs the browser to *commit* the collapsed frame before the resting value is
 * applied, or there is no pair of values to interpolate between and the transform simply
 * snaps. Routing both values through React state does not guarantee that: the two updates
 * can land in one style recalculation, and then `getAnimations()` on the panel comes back
 * empty — which is exactly how this was caught. Writing the property directly and reading
 * `offsetWidth` between the two writes forces the commit, and is the ordinary way a FLIP is
 * done for this reason.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { readLibraryChipRect } from './library-chip-rect';

/**
 * Whether the reader has asked for less movement.
 *
 * Checked in JS as well as in CSS because this hook writes `transform` *inline*, and an
 * inline value outranks the stylesheet — the reduced-motion block's `transform: none` had
 * no say over the one property it was written to stop. Bailing here is what actually makes
 * the panel a plain fade; the CSS rule then only has to describe the resting state.
 */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function useLibraryPanelMorph(
  enabled: boolean,
  exiting: boolean,
): {
  ref: React.RefObject<HTMLDivElement | null>;
  /** True once the opening frame has been released — gates the content's delayed fade. */
  settled: boolean;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [settled, setSettled] = useState(!enabled);
  /** The transform that maps the panel onto the chip, computed on the way in. */
  const collapsedRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!enabled || !panel || prefersReducedMotion()) {
      setSettled(true);
      return undefined;
    }

    /*
     * Interrupting a close, rather than starting an open.
     *
     * The exit leaves its transform inline, so a panel carrying one is somewhere between
     * its own box and the chip's. Releasing that value lets the transition retarget from
     * wherever it actually is; re-running the FLIP would write the collapsed frame again
     * and replay the open from the chip — a visible snap backwards, and precisely the
     * restart that moving off keyframes was meant to end. Nothing else here needs to run:
     * the measurement it would take is the one already stored in `collapsedRef`.
     */
    if (panel.style.transform) {
      panel.style.transform = '';
      setSettled(true);
      return undefined;
    }

    const chip = readLibraryChipRect();
    const panelRect = panel.getBoundingClientRect();
    /*
     * No chip to grow from — a chord opened this, or the chip had not painted — or a panel
     * with no box to measure. Either way, degrade to the resting state and let the panel's
     * own fade carry it, rather than scaling out of a rectangle nobody clicked.
     */
    if (!chip || panelRect.width <= 0 || panelRect.height <= 0) {
      setSettled(true);
      return undefined;
    }

    /* `transform-origin: top center` keeps the top edge and the horizontal centre fixed,
       and the panel and chip already share that centre — so there is a dy term and no dx. */
    const dy = Math.round(chip.top - panelRect.top);
    const sx = chip.width / panelRect.width;
    const sy = chip.height / panelRect.height;
    const collapsed = `translateY(${dy}px) scale(${sx}, ${sy})`;

    /*
     * Kept for the exit, rather than measured again on the way out.
     *
     * `getBoundingClientRect()` reports the *visual* box, so re-measuring while a close
     * interrupts an open would read a half-grown panel and compute a transform to
     * somewhere it never was. This value was taken with the panel at its layout box, which
     * is the only frame where the arithmetic is meaningful — and reusing it makes the two
     * directions exact mirrors by construction rather than by two calculations agreeing.
     */
    collapsedRef.current = collapsed;

    /* Suppress the transition for the collapsed frame, or the panel would animate *into*
       the chip's box on the way to animating out of it. */
    panel.style.transition = 'none';
    panel.style.transform = collapsed;
    /*
     * Fully transparent at the chip, not partly.
     *
     * The panel's fill is opaque paper, so at the collapsed frame it is a small solid
     * rectangle sitting exactly where the chip is — which read as a white box flashing in
     * before the panel grew. Starting at zero means the first thing that happens is the
     * chip dissolving, and the panel only becomes visible once it has somewhere to be.
     */
    panel.style.opacity = '0';

    /* Read to force the style commit. Without this the two writes collapse into one
       recalculation and the transform snaps rather than transitioning. */
    void panel.offsetWidth;

    panel.style.transition = '';
    panel.style.transform = '';
    panel.style.opacity = '';
    setSettled(true);

    return () => {
      /* Leave nothing inline behind — the exiting class owns the outbound move, and the
         resting inline values would otherwise be what it transitions from. */
      panel.style.transition = '';
      panel.style.transform = '';
      panel.style.opacity = '';
    };
  }, [enabled]);

  /*
   * The way out: the same transform, applied rather than removed.
   *
   * The exit used to be opacity alone. It declared a `transform` transition and never gave
   * it a value, so a panel that had *grown* out of the chip simply faded where it stood —
   * the open was a morph and the close was a dissolve, and the chip reappearing after it
   * finished read as the pill popping into place rather than the panel becoming it.
   *
   * No `offsetWidth` flush here, unlike the entrance. The transition is declared by the
   * same `--exiting` class that changes the values, which is the ordinary way a class
   * toggle animates; the entrance needs the flush only because it writes and then clears
   * the same property, and those two writes would otherwise collapse into one recalc.
   *
   * A panel with no stored transform was opened by a chord with no chip to grow from. It
   * faded in and it fades out — leaving `transform` alone is what keeps that symmetric.
   */
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!exiting || !panel || !collapsedRef.current || prefersReducedMotion()) return;
    panel.style.transform = collapsedRef.current;
  }, [exiting]);

  return { ref, settled };
}
