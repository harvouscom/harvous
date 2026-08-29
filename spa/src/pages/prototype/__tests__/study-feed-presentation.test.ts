import { describe, expect, it } from 'vitest';
import type { StudyFeedItem } from '@/utils/study-feed-items';
import {
  formatChapterRange,
  studyFeedItemIcon,
  studyFeedRowCopy,
} from '../study-feed-presentation';

const revisit = (
  title: string,
  noteType?: string | null,
  folder?: string | null,
): StudyFeedItem => ({
  id: `revisit-${title}`,
  kind: 'note-revisited',
  at: '2026-08-27T15:09:00.000Z',
  noteId: `note-${title}`,
  title,
  noteType: noteType ?? null,
  folder: folder ?? null,
  visitCount: 1,
});

const reading: StudyFeedItem = {
  id: 'reading',
  kind: 'passage-read',
  at: '2026-08-27T14:43:00.000Z',
  book: 'John',
  bookOrder: 42,
  chapters: [3],
  translation: 'NLT',
  dwellBucket: 'study',
};

describe('studyFeedRowCopy', () => {
  it('leads with the subject and demotes the verb', () => {
    // Not "You returned to Adoption" — a column of those reads as one repeated action.
    expect(studyFeedRowCopy(revisit('Adoption'))).toMatchObject({
      title: 'Adoption',
      verb: 'Returned to',
    });
    expect(studyFeedRowCopy(reading)).toMatchObject({ title: 'John 3', verb: 'Studied' });
  });

  it('names the folder a note lives in, as part of the phrase', () => {
    // Not a separate `detail`: the row joins meta with a middot, and "Returned to ·
    // Romans" cuts a verb from its object. Peers take a middot; a clause does not.
    expect(studyFeedRowCopy(revisit('Adoption', null, 'Romans'))).toMatchObject({
      verb: 'Returned to Romans',
      detail: undefined,
    });
  });

  it('quotes a highlight, since the title is words rather than a name', () => {
    const copy = studyFeedRowCopy({
      id: 'h',
      kind: 'highlight-scripture',
      at: '2026-08-27T14:00:00.000Z',
      entryId: 'e',
      accent: 'warmAmber',
      excerpt: 'hate the light',
      reference: 'John 3:20',
    });
    expect(copy).toMatchObject({ title: 'hate the light', quoted: true, detail: 'John 3:20' });
  });
});

describe('studyFeedItemIcon', () => {
  it('wears the glyph of the thing it opens', () => {
    expect(studyFeedItemIcon(revisit('Adoption'))).toBe('note-sticky');
    expect(studyFeedItemIcon(revisit('Romans 8', 'scripture'))).toBe('scroll');
    expect(studyFeedItemIcon(reading)).toBe('book-open');
  });
});

describe('formatChapterRange', () => {
  it('reads a run as a range and a gap as a list', () => {
    expect(formatChapterRange('John', [15, 16, 17])).toBe('John 15–17');
    expect(formatChapterRange('John', [15])).toBe('John 15');
    expect(formatChapterRange('John', [15, 17])).toBe('John 15, 17');
  });
});
