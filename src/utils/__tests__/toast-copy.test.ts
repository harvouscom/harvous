import { describe, expect, it } from 'vitest';
import { stripToastPunctuation } from '../toast-copy';
import { saveFailureMessage } from '../autosave-retry';

describe('stripToastPunctuation', () => {
  it('drops a terminal period', () => {
    expect(stripToastPunctuation('Could not save that resource.')).toBe('Could not save that resource');
  });

  it('drops a terminal exclamation mark', () => {
    expect(stripToastPunctuation('Saved!')).toBe('Saved');
  });

  it('drops trailing punctuation followed by whitespace', () => {
    expect(stripToastPunctuation('Saved. ')).toBe('Saved');
  });

  it('keeps the sentence break inside multi-sentence copy', () => {
    // The regression: a global /[.!]/g strip ran the two halves together on screen
    // as "Could not save Reload the note to pick your changes back up".
    expect(stripToastPunctuation('Could not save. Reload the note to pick your changes back up')).toBe(
      'Could not save. Reload the note to pick your changes back up',
    );
  });

  it('keeps interior punctuation while still dropping the terminal mark', () => {
    expect(stripToastPunctuation('This changed elsewhere. Your version is saved as a draft.')).toBe(
      'This changed elsewhere. Your version is saved as a draft',
    );
  });

  it('leaves copy with no terminal punctuation untouched', () => {
    expect(stripToastPunctuation("You can't edit this note")).toBe("You can't edit this note");
  });

  it('preserves every sentence break in the real save-failure copy', () => {
    // These are the strings users actually see, so assert against the source of truth
    // rather than restating them here.
    const kinds = ['conflict', 'rateLimited', 'fatal', 'transient'] as const;
    for (const kind of kinds) {
      for (const gaveUp of [false, true]) {
        const raw = saveFailureMessage(kind, gaveUp);
        const shown = stripToastPunctuation(raw);
        const interiorBreaks = (raw.match(/\.\s+\S/g) ?? []).length;
        expect((shown.match(/\.\s+\S/g) ?? []).length).toBe(interiorBreaks);
      }
    }
  });
});
