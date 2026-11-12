/**
 * The Home compose dock's prompt follows the note it starts.
 *
 * Clicking "Still thinking about God's love?" used to open a blank note with the question gone.
 * Now the line rides the new-note event as the compose seed's `prompt`, and the note page shows
 * it through the purpose register — a dismissible heads-up, never part of the note's body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { notePurposeModel } from '../../../lib/compose-purpose';

const mod = await import('../PrototypeFeedComposePrompt');
const PrototypeFeedComposePrompt = mod.default;
const { composeDetailForPrompt } = mod;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the compose dock passes its prompt to the new note', () => {
  it('dispatches the line on screen as the seed prompt, with no title or body', () => {
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener('prototypeShortcutNewNote', listener);
    try {
      render(<PrototypeFeedComposePrompt prompts={["Still thinking about God's love?", 'Adding to Prayer?']} />);
      // Mid-typing on purpose: the reader clicked the question, not the letters drawn so far.
      act(() => {
        vi.advanceTimersByTime(100);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Write a note' }));
    } finally {
      window.removeEventListener('prototypeShortcutNewNote', listener);
    }
    expect(seen).toEqual([{ seed: { prompt: "Still thinking about God's love?" } }]);
  });

  it('sends no seed for an empty line, so the note opens plainly blank', () => {
    expect(composeDetailForPrompt('   ')).toEqual({});
  });
});

describe('the new note shows the prompt as a heads-up', () => {
  it('becomes the purpose register', () => {
    expect(
      notePurposeModel({ composePurpose: null, composePrompt: "Still thinking about God's love?" }),
    ).toEqual({ kind: 'prompt', label: "Still thinking about God's love?", actionLabel: null });
  });

  it('is gone once dismissed or when there is no prompt', () => {
    expect(notePurposeModel({ composePurpose: null, composePrompt: 'Adding to Prayer?', dismissed: true })).toBeNull();
    expect(notePurposeModel({ composePurpose: null, composePrompt: '  ' })).toBeNull();
    expect(notePurposeModel({ composePurpose: null, composePrompt: null })).toBeNull();
  });

  it('gives way to a template purpose, which is the more deliberate intention', () => {
    expect(
      notePurposeModel({ composePurpose: 'template', composePrompt: 'Adding to Prayer?' })?.kind,
    ).toBe('template');
  });
});
