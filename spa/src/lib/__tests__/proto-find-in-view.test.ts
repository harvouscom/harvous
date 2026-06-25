import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProtoFind, runProtoFind } from '../proto-find-in-view';

/**
 * jsdom has no layout engine and no CSS Custom Highlight API, so we stub both:
 *  - getBoundingClientRect: non-zero for everything EXCEPT nodes inside a
 *    [data-collapsed] subtree (mimics a collapsed dock body at grid 0fr).
 *  - CSS.highlights / Highlight: a minimal registry that records the ranges so
 *    we can assert what would be painted.
 */

interface FakeHighlight {
  ranges: Range[];
  priority: number;
}

const highlightRegistry = new Map<string, FakeHighlight>();

beforeEach(() => {
  highlightRegistry.clear();

  // Minimal Highlight + CSS.highlights stubs.
  (globalThis as any).Highlight = class {
    ranges: Range[];
    priority = 0;
    constructor(...ranges: Range[]) {
      this.ranges = ranges;
    }
  };
  (globalThis as any).CSS = {
    highlights: {
      set: (name: string, hl: FakeHighlight) => highlightRegistry.set(name, hl),
      delete: (name: string) => highlightRegistry.delete(name),
    },
  };

  // Layout stub: zero box for collapsed content, non-zero otherwise.
  Range.prototype.getBoundingClientRect = function (this: Range) {
    const node = this.startContainer;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    const collapsed = el?.closest('[data-collapsed="true"]');
    return collapsed
      ? ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect)
      : ({ width: 100, height: 16, top: 0, left: 0, right: 100, bottom: 16, x: 0, y: 0 } as DOMRect);
  };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function setupDom() {
  document.body.innerHTML = `
    <div class="proto-editor-surface">
      <div class="ProseMirror">
        <p>Trust in the Lord. <span class="scripture-pill">Proverbs 3:5</span> teaches trust.</p>
      </div>
    </div>
    <div class="proto-shell__study-dock-layer">
      <div class="study-dock-card__body" data-collapsed="false">
        <p class="excerpt">Lean not on your own understanding but trust him.</p>
      </div>
      <div class="study-dock-card__body" data-collapsed="true">
        <p class="excerpt">This collapsed card also says trust but is hidden.</p>
      </div>
    </div>
  `;
}

describe('runProtoFind', () => {
  it('returns empty for a blank query and clears highlights', () => {
    setupDom();
    const res = runProtoFind('   ', 0);
    expect(res).toEqual({ count: 0, index: 0 });
    expect(highlightRegistry.size).toBe(0);
  });

  it('counts matches across editor body, scripture pills, and visible dock content', () => {
    setupDom();
    // "trust": editor body "Trust", pill-adjacent "trust", visible dock "trust"
    // (collapsed dock match excluded). Case-insensitive.
    const res = runProtoFind('trust', 0);
    expect(res.count).toBe(3);
    expect(res.index).toBe(0);
  });

  it('highlights a match whose text lives inside a scripture pill', () => {
    setupDom();
    const res = runProtoFind('Proverbs 3:5', 0);
    expect(res.count).toBe(1);
    const active = highlightRegistry.get('proto-find-active');
    expect(active).toBeTruthy();
    const range = active!.ranges[0];
    const container = range.startContainer.parentElement;
    expect(container?.classList.contains('scripture-pill')).toBe(true);
  });

  it('excludes text inside collapsed (zero-box) dock cards', () => {
    setupDom();
    // "collapsed" appears only in the hidden card → no matches.
    const res = runProtoFind('collapsed', 0);
    expect(res.count).toBe(0);
  });

  it('wraps the active index and gives the active highlight higher priority', () => {
    setupDom();
    const res = runProtoFind('trust', 4); // 4 % 3 === 1
    expect(res.index).toBe(1);
    const match = highlightRegistry.get('proto-find-match');
    const active = highlightRegistry.get('proto-find-active');
    expect(match!.ranges.length).toBe(3);
    expect(active!.ranges.length).toBe(1);
    expect(active!.priority).toBeGreaterThan(match!.priority);
  });

  it('clearProtoFind removes both highlight layers', () => {
    setupDom();
    runProtoFind('trust', 0);
    expect(highlightRegistry.size).toBeGreaterThan(0);
    clearProtoFind();
    expect(highlightRegistry.size).toBe(0);
  });
});
