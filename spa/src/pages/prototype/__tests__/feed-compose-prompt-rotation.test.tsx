/**
 * Where a pass of the compose prompt comes to rest.
 *
 * The rotation is built from `prompts`, most specific first, but a pass must not end back on
 * the most specific line — "Still in Romans 8?" was right for the moment it arrived, not for
 * the rest of the visit. It settles on a plain, generic line instead (`FEED_COMPOSE_FILLERS[0]`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FEED_COMPOSE_FILLERS } from '../feed-compose-prompts';

const PrototypeFeedComposePrompt = (await import('../PrototypeFeedComposePrompt')).default;

/** Long enough to read twice, short enough that it feels alive. — mirrors the component's own. */
const ROTATE_MS = 4500;

/*
 * One `act()` per tick, not one big `advanceTimersByTime`: each rotation's next timer is only
 * scheduled once React flushes the effect from the *previous* tick's state update, and that
 * flush happens when `act()`'s callback returns — not mid-callback. A single large advance
 * fires the one timer already pending and stops there, however far past it the clock moves.
 */
function tick() {
  act(() => {
    vi.advanceTimersByTime(ROTATE_MS);
  });
}

/* Each line types itself out; this is comfortably longer than any line takes to write. */
function finishTyping() {
  act(() => {
    vi.advanceTimersByTime(3000);
  });
}

const caret = () => document.querySelector('.proto-feed-compose__caret');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the compose prompt rotation', () => {
  it('settles on the generic anchor line, not the most specific one it started on', () => {
    const prompts = ['Still in Romans 8?', 'Still thinking about grace?', 'Adding to Prayer?'];
    render(<PrototypeFeedComposePrompt prompts={prompts} />);
    finishTyping();
    expect(screen.getByText(prompts[0])).toBeTruthy();

    // One tick per line finishes the pass; a couple more prove it does not run past the end.
    for (let i = 0; i < prompts.length + 2; i++) tick();
    finishTyping();

    expect(screen.queryByText(prompts[0])).toBeNull();
    expect(screen.getByText(FEED_COMPOSE_FILLERS[0])).toBeTruthy();
  });

  it('types each line out behind a caret', () => {
    const prompts = ['Still in Romans 8?', 'Adding to Prayer?'];
    render(<PrototypeFeedComposePrompt prompts={prompts} />);
    // Nothing written yet, and the caret solid while it types.
    expect(screen.queryByText(prompts[0])).toBeNull();
    expect(caret()?.hasAttribute('data-blink')).toBe(false);

    finishTyping();
    // Written in full, and the caret blinking where the writing stopped.
    expect(screen.getByText(prompts[0])).toBeTruthy();
    expect(caret()?.hasAttribute('data-blink')).toBe(true);
  });

  it('takes the caret away once the pass settles', () => {
    const prompts = ['Still in Romans 8?', 'Adding to Prayer?'];
    render(<PrototypeFeedComposePrompt prompts={prompts} />);
    for (let i = 0; i < prompts.length + 1; i++) tick();
    finishTyping();
    expect(screen.getByText(FEED_COMPOSE_FILLERS[0])).toBeTruthy();
    expect(caret()).toBeNull();
  });

  it('never rotates or settles when there is only one line', () => {
    render(<PrototypeFeedComposePrompt prompts={['Write your first note']} />);
    // Shown, not typed: a line that never rotates has nothing to announce.
    expect(screen.getByText('Write your first note')).toBeTruthy();
    for (let i = 0; i < 5; i++) tick();
    expect(screen.getByText('Write your first note')).toBeTruthy();
    expect(caret()).toBeNull();
  });

  it('stays put on the anchor line once a pass has settled, even as more time passes', () => {
    const prompts = ['Still in Romans 8?', 'Adding to Prayer?'];
    render(<PrototypeFeedComposePrompt prompts={prompts} />);
    for (let i = 0; i < prompts.length + 4; i++) tick();
    finishTyping();
    expect(screen.getByText(FEED_COMPOSE_FILLERS[0])).toBeTruthy();
  });
});
