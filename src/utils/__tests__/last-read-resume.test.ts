import { describe, expect, it } from 'vitest';
import { destinationFromLastActivity } from '../last-read-resume';

describe('destinationFromLastActivity', () => {
  it('resumes the last chapter even when that chapter already counted as read', () => {
    expect(
      destinationFromLastActivity({
        book: 'Exodus',
        chapter: 12,
        translation: 'NLT',
        verse: 8,
      }),
    ).toEqual({
      book: 'Exodus',
      chapter: 12,
      verse: 8,
      translation: 'NLT',
      source: 'continue',
    });
  });

  it('keeps verse 1 when that is where activity stopped', () => {
    expect(destinationFromLastActivity({ book: 'Exodus', chapter: 5, verse: 1 })?.verse).toBe(1);
  });

  it('omits a verse when the position is chapter-only', () => {
    expect(destinationFromLastActivity({ book: 'John', chapter: 15 })?.verse).toBeNull();
  });

  it('returns null when nothing has been read', () => {
    expect(destinationFromLastActivity(null)).toBeNull();
  });
});
