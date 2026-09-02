import { describe, it, expect } from 'vitest';
import { reviewRowSource, reviewRowSubtitle, writtenAtLabel } from '@/utils/review-row-subtitle';

const NOW = new Date('2026-09-02T12:00:00Z');

describe('reviewRowSubtitle', () => {
  it('names the note when the question does not', () => {
    expect(
      reviewRowSubtitle(
        { prompt: 'What in the text itself led you to write this?', noteLabel: 'This is cool' },
        NOW,
      ),
    ).toBe('This is cool');
  });

  it('stays quiet when the question already names it', () => {
    // "What did you observe in My journey?" does not need "My journey" underneath.
    expect(
      reviewRowSubtitle(
        { prompt: 'Before opening it, what did you observe in My journey?', noteLabel: 'My journey' },
        NOW,
      ),
    ).toBeNull();
  });

  it('takes whatever identity the server resolved — an opening line, or a passage', () => {
    expect(
      reviewRowSubtitle(
        {
          prompt: 'What in the text itself led you to write this note?',
          noteLabel: 'The first book Lets type more content here.',
        },
        NOW,
      ),
    ).toBe('The first book Lets type more content here.');
    expect(
      reviewRowSubtitle(
        { prompt: 'What in the text itself led you to write this note?', noteLabel: 'Romans 8:15' },
        NOW,
      ),
    ).toBe('Romans 8:15');
  });

  it('places a note in time only when nothing else names it at all', () => {
    // The regression this file exists for: a row about "Untitled Note 4" said "this note"
    // and nothing more, and the reader could not tell which note it meant.
    expect(
      reviewRowSubtitle(
        {
          prompt: 'What in the text itself led you to write this note?',
          noteLabel: null,
          noteWrittenAt: '2026-08-09T10:00:00Z',
        },
        NOW,
      ),
    ).toMatch(/^Written /);
  });

  it('never leaves a note row with no identity at all', () => {
    for (const item of [
      { prompt: 'What in the text itself led you to write this note?', noteLabel: 'A title' },
      { prompt: 'What in the text itself led you to write this note?', noteLabel: 'John 15:5' },
      {
        prompt: 'What in the text itself led you to write this note?',
        noteWrittenAt: '2026-08-09T10:00:00Z',
      },
    ]) {
      expect(reviewRowSubtitle(item, NOW)).not.toBeNull();
    }
  });

  it('has nothing to say about a Thread the question already names', () => {
    expect(
      reviewRowSubtitle(
        { prompt: 'What central idea is taking shape across your Covenant Thread?', noteLabel: 'Covenant' },
        NOW,
      ),
    ).toBeNull();
  });

  it('prefers the resolved label over a raw title', () => {
    expect(
      reviewRowSubtitle({ prompt: 'A question', noteLabel: 'Romans 8:15', noteTitle: null }, NOW),
    ).toBe('Romans 8:15');
  });

  it('shrugs at a date it cannot read rather than rendering an invalid one', () => {
    expect(reviewRowSubtitle({ prompt: 'A question', noteWrittenAt: 'not a date' }, NOW)).toBeNull();
  });
});

describe('writtenAtLabel', () => {
  it('elides the year within the current one and keeps it otherwise', () => {
    expect(writtenAtLabel('2026-08-09T10:00:00Z', NOW)).not.toMatch(/2026/);
    expect(writtenAtLabel('2024-08-09T10:00:00Z', NOW)).toMatch(/2024/);
  });

  it('returns null for an unparseable date', () => {
    expect(writtenAtLabel('nonsense', NOW)).toBeNull();
  });
});

describe('reviewRowSource', () => {
  it('drops the reason when the identity line already gave it', () => {
    // "Written 10 Jul · You wrote this" is one fact wearing two labels.
    expect(reviewRowSource({ sourceLabel: 'You wrote this' }, 'Written 10 Jul')).toBeNull();
  });

  it('keeps a reason that says something the identity does not', () => {
    expect(reviewRowSource({ sourceLabel: 'You opened this again' }, 'Written 10 Jul')).toBe(
      'You opened this again',
    );
    expect(reviewRowSource({ sourceLabel: 'You wrote this' }, 'This is cool')).toBe(
      'You wrote this',
    );
  });

  it('passes a reason through when there is no identity line at all', () => {
    expect(reviewRowSource({ sourceLabel: 'Marked Romans 1:7 in a note' }, null)).toBe(
      'Marked Romans 1:7 in a note',
    );
  });
});
