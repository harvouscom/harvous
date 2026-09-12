import { describe, expect, it } from 'vitest';
import { DEFAULT_REVIEW_TRANSLATION, askedTranslation } from '../review-translation';

describe('askedTranslation', () => {
  it('asks in the wording the item was read in', () => {
    // A chapter noted while reading ESV is asked in ESV, whatever the account now defaults to.
    expect(askedTranslation({ translation: 'ESV' }, 'NLT')).toBe('ESV');
  });

  it('falls back to the account default when the item names none', () => {
    expect(askedTranslation({ translation: null }, 'NLT')).toBe('NLT');
    expect(askedTranslation({ translation: undefined }, 'NLT')).toBe('NLT');
    expect(askedTranslation({}, 'NLT')).toBe('NLT');
  });

  it('treats a blank column as naming none', () => {
    // Free text, and `EMPTY_CHAPTER_MATERIAL` carries '' as a sentinel rather than a resolution.
    expect(askedTranslation({ translation: '' }, 'NLT')).toBe('NLT');
    expect(askedTranslation({ translation: '   ' }, 'NLT')).toBe('NLT');
  });

  it('keeps an item wording that matches nothing the reader prefers', () => {
    // The precedence is item-first, not "item unless the reader disagrees".
    expect(askedTranslation({ translation: 'KJV' }, DEFAULT_REVIEW_TRANSLATION)).toBe('KJV');
  });

  it('never invents NET when a fallback was supplied', () => {
    /*
     * The bug this whole change exists for: 'NET' was the answer at twenty-six sites regardless of
     * what the reader had chosen. Nothing here may reach for it on its own.
     */
    expect(askedTranslation({ translation: null }, 'CSB')).not.toBe(DEFAULT_REVIEW_TRANSLATION);
    expect(askedTranslation({ translation: '  ' }, 'BSB')).toBe('BSB');
  });
});
