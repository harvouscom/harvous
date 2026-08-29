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

export function useLibraryPanelMorph(enabled: boolean): {
  ref: React.RefObject<HTMLDivElement | null>;
  /** True once the opening frame has been released — gates the content's delayed fade. */
  settled: boolean;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [settled, setSettled] = useState(!enabled);

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!enabled || !panel) {
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

    /* Suppress the transition for the collapsed frame, or the panel would animate *into*
       the chip's box on the way to animating out of it. */
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${dy}px) scale(${sx}, ${sy})`;
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
      /* Leave nothing inline behind — the exiting class owns the outbound move, and a
         stale inline transform would win over it. */
      panel.style.transition = '';
      panel.style.transform = '';
      panel.style.opacity = '';
    };
  }, [enabled]);

  return { ref, settled };
}
