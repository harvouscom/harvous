import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STUDY_DOCK_BAND_HEIGHT_VAR,
  observeStudyDockBandHeight,
  syncStudyDockBandHeight,
} from '../study-dock-layout';

/**
 * How much of the screen the study dock band is covering.
 *
 * The band is `position: absolute; bottom: 100%` in a grid row that collapses to nothing, so it
 * takes zero layout height and floats over the page. Nothing underneath knew it was there, and
 * the last part of every scrollable surface — most visibly the end of a chapter in the reader —
 * sat behind an expanded card with no way to scroll to it.
 */
function mockRect(el: HTMLElement, height: number) {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 800,
      height,
      top: 0,
      left: 0,
      right: 800,
      bottom: height,
      toJSON: () => ({}),
    }) as DOMRect;
}

function buildBand(slotHeights: number[], { paddingTop = 16, rowGap = 8 } = {}) {
  document.body.innerHTML = '';
  const layer = document.createElement('div');
  layer.className = 'proto-shell__study-dock-layer';
  // The layer's own rect is the space it *may* use — it is flex-end over a fixed area with
  // padding for the card's shadow — so the measurement sums the slots instead.
  mockRect(layer, 600);
  for (const height of slotHeights) {
    const slot = document.createElement('div');
    slot.className = 'proto-shell__study-dock-layer__slot';
    mockRect(slot, height);
    layer.appendChild(slot);
  }
  document.body.appendChild(layer);

  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () => ({ rowGap: `${rowGap}px`, paddingTop: `${paddingTop}px` }) as CSSStyleDeclaration,
  );
  return layer;
}

const readVar = () => document.documentElement.style.getPropertyValue(STUDY_DOCK_BAND_HEIGHT_VAR);

afterEach(() => {
  document.documentElement.style.removeProperty(STUDY_DOCK_BAND_HEIGHT_VAR);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('syncStudyDockBandHeight', () => {
  it('publishes one open dock plus the band padding', () => {
    buildBand([120, 0]);
    expect(syncStudyDockBandHeight()).toBe(136);
    expect(readVar()).toBe('136px');
  });

  it('adds the gap between two open docks, and only between them', () => {
    // A question above a highlight on the same note: 120 + 90 + one 8px gap + 16px padding.
    buildBand([120, 90]);
    expect(syncStudyDockBandHeight()).toBe(234);
  });

  it('reserves nothing at all when the band is empty', () => {
    /*
     * The whole point of summing the slots. The layer's own rect is 600px of space it is
     * entitled to; reading that would have reserved 600px of dead room on every route where no
     * dock is open, which is most of them.
     */
    buildBand([0, 0]);
    expect(syncStudyDockBandHeight()).toBe(0);
    // Removed, not set to `0px`, so every consumer's `var(..., 0px)` fallback is the one
    // definition of "no dock".
    expect(readVar()).toBe('');
  });

  it('reserves nothing when the band is not mounted', () => {
    document.body.innerHTML = '';
    document.documentElement.style.setProperty(STUDY_DOCK_BAND_HEIGHT_VAR, '200px');
    expect(syncStudyDockBandHeight()).toBe(0);
    expect(readVar()).toBe('');
  });

  it('collapses when the band is hidden, as it is under the mobile keyboard', () => {
    const layer = buildBand([120, 0]);
    syncStudyDockBandHeight();
    expect(readVar()).toBe('136px');
    // `display: none` while the keyboard is up — every rect reports 0.
    for (const slot of layer.children) mockRect(slot as HTMLElement, 0);
    expect(syncStudyDockBandHeight()).toBe(0);
    expect(readVar()).toBe('');
  });
});

describe('observeStudyDockBandHeight', () => {
  function stubResizeObserver() {
    const instances: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        constructor() {
          instances.push(this as never);
        }
      },
    );
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    return instances;
  }

  it('measures once on bind, so the first paint is not a beat behind', () => {
    stubResizeObserver();
    const layer = buildBand([120, 0]);
    const stop = observeStudyDockBandHeight(layer);
    expect(readVar()).toBe('136px');
    stop();
  });

  it('watches the slots as well as the layer', () => {
    // A dock growing inside a slot does not change the layer's own box, so observing only the
    // layer would miss every expand and collapse.
    const instances = stubResizeObserver();
    const layer = buildBand([120, 90]);
    const stop = observeStudyDockBandHeight(layer);
    expect(instances[0].observe).toHaveBeenCalledTimes(3);
    stop();
  });

  it('stops watching and gives the room back on cleanup', () => {
    const instances = stubResizeObserver();
    const layer = buildBand([120, 0]);
    observeStudyDockBandHeight(layer)();
    expect(instances[0].disconnect).toHaveBeenCalled();
    expect(readVar()).toBe('');
  });

  it('does nothing rather than throwing where there is no band or no observer', () => {
    stubResizeObserver();
    expect(() => observeStudyDockBandHeight(null)()).not.toThrow();
    vi.stubGlobal('ResizeObserver', undefined);
    const layer = buildBand([120, 0]);
    expect(() => observeStudyDockBandHeight(layer)()).not.toThrow();
  });
});

describe('the surfaces underneath reserve it', () => {
  it('is read by every scroller and by the two chips outside the band', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

    const editor = css('spa/src/styles/prototype-editor.css');
    const shell = css('spa/src/styles/prototype-shell.css');
    const components = css('spa/src/styles/prototype-components.css');

    // The note, the reader, Home and everything else, the study feed.
    expect(editor).toContain('--proto-study-dock-band-height');
    expect(shell).toContain('--proto-study-dock-band-height');
    expect(components).toContain('--proto-study-dock-band-height');
    // Both fixed-to-body chips, which the scrollers' reserve cannot move.
    expect(components.match(/--proto-study-dock-band-height/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
