import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STUDY_DOCK_BAND_HEIGHT_VAR,
  STUDY_DOCK_CORNER_HEIGHT_VAR,
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
  document.documentElement.style.removeProperty(STUDY_DOCK_CORNER_HEIGHT_VAR);
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

describe('the corner the feature callout floats in', () => {
  const readCorner = () => document.documentElement.style.getPropertyValue(STUDY_DOCK_CORNER_HEIGHT_VAR);

  /** Put a dock card in the first slot, spanning `left`..`right` in a 1440px window. */
  function placeCard(layer: HTMLElement, left: number, right: number) {
    vi.stubGlobal('innerWidth', 1440);
    const card = document.createElement('div');
    card.className = 'study-dock-card__outer';
    card.getBoundingClientRect = () =>
      ({ left, right, width: right - left, height: 120, top: 0, bottom: 120, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    layer.children[0]!.appendChild(card);
  }

  it('stays at the bottom when the dock sits on the paper, clear of the corner', () => {
    /* The reported case: a wide window, the dock centred on the sheet, the callout off to the
       right lifted over nothing. */
    const layer = buildBand([120, 0]);
    placeCard(layer, 300, 1000);
    expect(syncStudyDockBandHeight()).toBe(136);
    expect(readCorner()).toBe('');
  });

  it('rises over the dock when the card runs into the corner', () => {
    const layer = buildBand([120, 0]);
    placeCard(layer, 200, 1300);
    syncStudyDockBandHeight();
    expect(readCorner()).toBe('136px');
  });

  it('ignores a carousel neighbour parked off-screen', () => {
    const layer = buildBand([120, 0]);
    placeCard(layer, 300, 1000);
    placeCard(layer, 1500, 2200);
    syncStudyDockBandHeight();
    expect(readCorner()).toBe('');
  });

  it('falls back to the slot when there is no card to measure', () => {
    // The mocked slot spans 0..800; a 1000px window puts its corner column at 658.
    buildBand([120, 0]);
    vi.stubGlobal('innerWidth', 1000);
    syncStudyDockBandHeight();
    expect(readCorner()).toBe('136px');
  });

  it('clears when the dock closes', () => {
    const layer = buildBand([120, 0]);
    placeCard(layer, 200, 1300);
    syncStudyDockBandHeight();
    for (const slot of layer.children) mockRect(slot as HTMLElement, 0);
    syncStudyDockBandHeight();
    expect(readCorner()).toBe('');
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
  it('is reserved inside the paper, never by shrinking it', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

    const editor = css('spa/src/styles/prototype-editor.css');
    const shell = css('spa/src/styles/prototype-shell.css');
    const components = css('spa/src/styles/prototype-components.css');

    /*
     * The dock is a card on the page, so the room it needs is more page. Padding placed
     * outside the sheet took the room out of the sheet instead: on the main pane it cut the
     * note and the reader short and clipped the paper at the dock's top edge, and on the
     * editor's scroller it stopped a short note's paper there too. Both read as a split pane.
     */
    expect(editor).toMatch(/\.proto-editor-paper::after\s*\{[^}]*--proto-study-dock-band-height/);
    expect(components).toMatch(/\.pds-reader__column::after\s*\{[^}]*--proto-study-dock-band-height/);
    expect(shell).not.toContain('--proto-study-dock-band-height');
    // Both fixed-to-body chips, which the scrollers' reserve cannot move.
    expect(components.match(/--proto-study-dock-band-height/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
