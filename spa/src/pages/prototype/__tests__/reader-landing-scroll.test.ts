/**
 * Landing on a passage you were sent to.
 *
 * The complaint this came from: expanding a scripture dock into the reader put you in the
 * chapter with nothing saying which verses you had asked for, and moved the page even when
 * those verses were already on screen. The second half is what these cover — the first is the
 * arrival mark in the margin.
 */
import { describe, expect, it } from 'vitest';
import {
  landingScrollTop,
  READER_LANDING_COMFORT,
  READER_LANDING_LEAD_MAX,
  READER_LANDING_LEAD_RATIO,
} from '../reader-landing-scroll';

/** A desktop-ish pane: 600px tall, scrolled to the top of a long chapter. */
const pane = {
  scrollTop: 0,
  clientHeight: 600,
  scrollHeight: 4000,
  viewportTop: 100,
};

describe('landing does not move a passage that is already there to be read', () => {
  it('stays put when the whole range sits comfortably inside the viewport', () => {
    // John 3:1-3 at the top of a freshly opened chapter — the case that used to scroll the
    // chapter heading away to centre verse 1.
    expect(
      landingScrollTop({ ...pane, startTop: 200, endBottom: 300 }),
    ).toBeNull();
  });

  it('still lands when the range only just clears the fold', () => {
    // Bottom is 10px above the viewport's last pixel: technically visible, flush against the
    // edge, and precisely where a small scroll helps.
    const target = landingScrollTop({ ...pane, startTop: 300, endBottom: 690 });
    expect(target).not.toBeNull();
  });

  it('always lands a passage taller than the viewport, because it can never be fully in view', () => {
    expect(landingScrollTop({ ...pane, startTop: 150, endBottom: 1400 })).not.toBeNull();
  });
});

describe('landing aligns to the start of the passage, not its middle', () => {
  it('puts the first verse a lead-in below the top of the viewport', () => {
    // 18% of 600 = 108, under the 140 ceiling.
    const lead = READER_LANDING_LEAD_RATIO * pane.clientHeight;
    const target = landingScrollTop({ ...pane, scrollTop: 0, startTop: 1200, endBottom: 1320 });
    // The verse is 1100px below the viewport top; scrolling by that much minus the lead-in
    // leaves it `lead` from the top rather than centred at 300.
    expect(target).toBe(1100 - lead);
  });

  it('caps the lead-in on a tall pane, so the start never sinks toward the middle', () => {
    const tall = { ...pane, clientHeight: 1200, scrollHeight: 6000 };
    const target = landingScrollTop({ ...tall, startTop: 2000, endBottom: 2100 });
    // 18% of 1200 would be 216; the ceiling holds it at 140.
    expect(target).toBe(1900 - READER_LANDING_LEAD_MAX);
  });

  it('keeps a minimum lead-in on a very short pane', () => {
    const short = { ...pane, clientHeight: 100, scrollHeight: 4000 };
    const target = landingScrollTop({ ...short, startTop: 600, endBottom: 640 });
    // 18% of 100 is 18, below the comfort floor.
    expect(target).toBe(500 - READER_LANDING_COMFORT);
  });
});

describe('landing stays inside the scroller', () => {
  it('clamps a passage at the end of a chapter to the last scrollable pixel', () => {
    const target = landingScrollTop({
      scrollTop: 3000,
      clientHeight: 600,
      scrollHeight: 4000,
      viewportTop: 100,
      startTop: 3000,
      endBottom: 3100,
    });
    expect(target).toBe(3400); // scrollHeight - clientHeight
  });

  it('never returns a negative scrollTop for a passage above the current position', () => {
    const target = landingScrollTop({
      scrollTop: 20,
      clientHeight: 600,
      scrollHeight: 4000,
      viewportTop: 100,
      startTop: 90,
      endBottom: 140,
    });
    expect(target).toBe(0);
  });
});
