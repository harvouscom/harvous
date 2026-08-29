/**
 * The fade follows the measurement, not the character count.
 *
 * `marqueePace` decides by length — 24 characters, tuned on a 304px sidebar rail. That guess
 * is wrong in one direction on every wider surface: a 29-character label on a 640px feed
 * sheet fits with room to spare, stayed above the threshold, and kept a `mask-image` with
 * nothing to hide. These pin the correction, including the sub-pixel slack, because a label
 * that fits exactly can measure a fraction wider than its box and fading it would be the
 * same bug one pixel smaller.
 */
import { describe, expect, it } from 'vitest';
import { syncMarqueeMasks } from '../marquee-overflow';

/** jsdom computes no layout, so the two widths are supplied directly. */
function label(cls: string, opts: { box: number; content: number }): HTMLElement {
  const el = document.createElement('span');
  el.className = cls;
  Object.defineProperty(el, 'clientWidth', { value: opts.box, configurable: true });
  if (cls.includes('proto-marquee-self')) {
    Object.defineProperty(el, 'scrollWidth', { value: opts.content, configurable: true });
  } else {
    const inner = document.createElement('span');
    Object.defineProperty(inner, 'scrollWidth', { value: opts.content, configurable: true });
    el.appendChild(inner);
  }
  return el;
}

function run(el: HTMLElement): string {
  const root = document.createElement('div');
  root.appendChild(el);
  syncMarqueeMasks(root);
  return el.style.getPropertyValue('--proto-marquee-mask') || '(unset)';
}

describe('a label that fits', () => {
  it('loses its mask, however long the string is', () => {
    expect(run(label('proto-marquee-self', { box: 400, content: 220 }))).toBe('none');
  });

  it('loses it on the wrapping variant too, which measures its child', () => {
    expect(run(label('proto-marquee', { box: 400, content: 220 }))).toBe('none');
  });

  it('is not faded when it fits to within a sub-pixel', () => {
    // Exactly one pixel over is rounding, not overflow.
    expect(run(label('proto-marquee-self', { box: 300, content: 301 }))).toBe('none');
  });
});

describe('a label that is cut off', () => {
  it('keeps its mask', () => {
    expect(run(label('proto-marquee-self', { box: 200, content: 460 }))).toBe('(unset)');
  });

  it('clears a stale "none" left by the estimate', () => {
    // The estimate runs at render, before the box is known; a later narrow layout has to be
    // able to put the fade back.
    const el = label('proto-marquee-self', { box: 200, content: 460 });
    el.style.setProperty('--proto-marquee-mask', 'none');
    expect(run(el)).toBe('(unset)');
  });

  it('is judged past the slack, not at it', () => {
    expect(run(label('proto-marquee-self', { box: 300, content: 302 }))).toBe('(unset)');
  });
});
