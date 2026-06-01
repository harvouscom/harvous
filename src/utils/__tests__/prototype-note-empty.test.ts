import { describe, expect, it } from 'vitest';
import { isEffectivelyEmptyPrototypeNote, isTiptapBodyEmpty } from '../prototype-note-empty';

describe('isTiptapBodyEmpty', () => {
  it('treats empty and paragraph-only HTML as empty', () => {
    expect(isTiptapBodyEmpty('')).toBe(true);
    expect(isTiptapBodyEmpty('<p></p>')).toBe(true);
    expect(isTiptapBodyEmpty('<p><br></p>')).toBe(true);
  });

  it('detects non-empty body text', () => {
    expect(isTiptapBodyEmpty('<p>Hello</p>')).toBe(false);
  });
});

describe('isEffectivelyEmptyPrototypeNote', () => {
  it('treats server untitled pattern with empty body as empty', () => {
    expect(isEffectivelyEmptyPrototypeNote('Untitled Note 3', '<p></p>')).toBe(true);
  });

  it('is not empty when title or body has user content', () => {
    expect(isEffectivelyEmptyPrototypeNote('', '<p>Notes</p>')).toBe(false);
    expect(isEffectivelyEmptyPrototypeNote('My study', '<p></p>')).toBe(false);
  });
});
