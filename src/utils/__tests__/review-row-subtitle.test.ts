import { describe, it, expect } from 'vitest';
import { reviewRowSource, reviewRowSubtitle, writtenAtLabel } from '@/utils/review-row-subtitle';
import { VERSE_LOCATE_STEP, VERSE_SEQUENCE_STEP } from '@/utils/review-prompts';

const NOW = new Date('2026-09-02T12:00:00Z');

describe('reviewRowSubtitle', () => {
  it('shows the note own words first, the way a verse row shows a fragment of the verse', () => {
    expect(
      reviewRowSubtitle(
        {
          prompt: 'What is clearer to you in Adoption now?',
          noteTitle: 'Adoption',
          noteContext: 'God chose us before the foundation',
        },
        NOW,
      ),
    ).toBe('God chose us before the foundation');
  });

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
  it('drops "You wrote this" beside the reader own sentence, which already says so', () => {
    expect(reviewRowSource({ sourceLabel: 'You wrote this' }, 'God chose us before')).toBeNull();
    expect(reviewRowSource({ sourceLabel: 'You wrote this' }, 'Written 10 Jul')).toBeNull();
  });

  it('keeps every reason that says something the context line does not', () => {
    for (const source of ['You opened this again', 'Marked Romans 1:7 in a note', 'You linked these notes']) {
      expect(reviewRowSource({ sourceLabel: source }, 'God chose us before')).toBe(source);
    }
  });

  it('passes a reason through when there is no identity line at all', () => {
    expect(reviewRowSource({ sourceLabel: 'Marked Romans 1:7 in a note' }, null)).toBe(
      'Marked Romans 1:7 in a note',
    );
  });
});

describe('which rungs hide the identity line', () => {
  /*
   * The first cut suppressed the subtitle on every graded rung, which read as "What did you link
   * this to?" above nothing at all — a question with a right answer, about a note the reader was
   * never told the name of. A right answer is not a reason to withhold the question.
   */
  const note = {
    prompt: 'What did you link this to?',
    kind: 'note',
    noteContext: 'God chose us before the foundation of the world',
  };

  it('shows which note is being asked about on the rungs whose answer is something else', () => {
    expect(reviewRowSubtitle({ ...note, ladderStep: 1 })).toBe(note.noteContext);
    expect(reviewRowSubtitle({ ...note, ladderStep: 2 })).toBe(note.noteContext);
  });

  it('hides it where the note itself is the answer', () => {
    expect(
      reviewRowSubtitle({ ...note, prompt: 'Which of your notes says this?', ladderStep: 0 }),
    ).toBeNull();
  });

  it('hides the reference on "where is this from?" and nowhere else on the verse ladder', () => {
    const verse = { prompt: 'Where is this from?', kind: 'verse', scriptureReference: 'John 15:5' };
    expect(reviewRowSubtitle({ ...verse, ladderStep: VERSE_LOCATE_STEP })).toBeNull();
    // Putting the words back in order is not made easier by knowing the address.
    expect(reviewRowSubtitle({ ...verse, prompt: 'Put these back in order', ladderStep: VERSE_SEQUENCE_STEP })).toBe(
      'John 15:5',
    );
  });
});
