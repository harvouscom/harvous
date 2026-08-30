/**
 * The exit transform, which is the half of the morph a stylesheet cannot hold.
 *
 * The panel's collapsed box is measured, so its value lives in JS. The CSS guards in
 * `library-panel-morph.test.ts` assert that `--exiting` still *asks* for a transform
 * transition; these assert that something still supplies one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { useLibraryPanelMorph } from '../use-library-panel-morph';
import { clearLibraryChipRect, publishLibraryChipRect } from '../library-chip-rect';

/** The panel's resting box. jsdom measures everything as zero, and a zero box degrades. */
const PANEL = { top: 100, left: 40, width: 800, height: 600 } as DOMRect;

function stubPanelBox() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(PANEL);
}

/** jsdom ships no `matchMedia`, so the hook's check has to be given an answer. */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

function Panel({ exiting }: { exiting: boolean }) {
  const morph = useLibraryPanelMorph(!exiting, exiting);
  return createElement('div', { ref: morph.ref, 'data-testid': 'panel' });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearLibraryChipRect();
});

describe('the panel retracts into the chip it grew from', () => {
  it('applies the entrance transform again on the way out', () => {
    stubPanelBox();
    publishLibraryChipRect({ width: 200, height: 40, top: 12, left: 340 });

    const view = render(createElement(Panel, { exiting: false }));
    const panel = view.getByTestId('panel');

    /* At rest the entrance has cleared everything it wrote — nothing inline survives it. */
    expect(panel.style.transform).toBe('');

    view.rerender(createElement(Panel, { exiting: true }));

    /*
     * The same numbers the entrance used, not a second measurement: dy is the chip's top
     * less the panel's, and the scales are the two ratios. Re-deriving them here rather
     * than asserting a literal string is deliberate — it documents the arithmetic.
     */
    const dy = Math.round(12 - PANEL.top);
    expect(panel.style.transform).toBe(
      `translateY(${dy}px) scale(${200 / PANEL.width}, ${40 / PANEL.height})`,
    );
  });

  it('leaves the transform alone when there was no chip to grow from', () => {
    /*
     * A chord opens the panel with the rect cleared, so the entrance is a plain fade. The
     * exit has to be a plain fade too — scaling out to a box the reader never clicked is
     * worse than not animating, which is why this is a guard and not an oversight.
     */
    stubPanelBox();
    clearLibraryChipRect();

    const view = render(createElement(Panel, { exiting: false }));
    view.rerender(createElement(Panel, { exiting: true }));

    expect(view.getByTestId('panel').style.transform).toBe('');
  });

  it('does not scale out of a chip that never painted', () => {
    /* `readLibraryChipRect` rejects a zero box; the exit must inherit that judgement. */
    stubPanelBox();
    publishLibraryChipRect({ width: 0, height: 0, top: 12, left: 340 });

    const view = render(createElement(Panel, { exiting: false }));
    view.rerender(createElement(Panel, { exiting: true }));

    expect(view.getByTestId('panel').style.transform).toBe('');
  });
});

describe('reduced motion is honoured where it actually has to be', () => {
  /*
   * The stylesheet's reduced-motion block sets `transform: none` on the panel, and on its
   * own that was decorative: this hook writes `transform` inline, and inline wins. The one
   * property the rule existed to stop was the one property it could not reach. So the check
   * lives in JS too, and these are the assertions that keep it there.
   */
  it('does not scale the panel out on the way in', () => {
    stubPanelBox();
    stubReducedMotion(true);
    publishLibraryChipRect({ width: 200, height: 40, top: 12, left: 340 });

    const view = render(createElement(Panel, { exiting: false }));

    expect(view.getByTestId('panel').style.transform).toBe('');
  });

  it('does not retract the panel on the way out', () => {
    stubPanelBox();
    publishLibraryChipRect({ width: 200, height: 40, top: 12, left: 340 });

    /* Motion allowed on the way in, so a collapsed transform is genuinely on hand — this
       has to fail closed on the preference, not on having nothing to apply. */
    stubReducedMotion(false);
    const view = render(createElement(Panel, { exiting: false }));
    stubReducedMotion(true);
    view.rerender(createElement(Panel, { exiting: true }));

    expect(view.getByTestId('panel').style.transform).toBe('');
  });
});
