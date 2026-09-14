import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  findPersistedDailyPassageNote,
  getVotdDismissedDay,
  isPersistedNoteId,
  isVotdPassageCardDismissedToday,
  noteMatchesDailyPassage,
  setVotdDismissedToday,
  todayCalendarDayKey,
  VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY,
} from '../../../spa/src/lib/votd-today';
import type { SpaceNoteRow } from '../../../spa/src/hooks/queries/useSpace';

function note(
  id: string,
  overrides: Partial<Pick<SpaceNoteRow, 'title' | 'content' | 'createdAt' | 'updatedAt'>> = {},
): SpaceNoteRow {
  return {
    id,
    title: overrides.title ?? '',
    content: overrides.content ?? '<p></p>',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt,
  };
}

const pillContent = (ref: string) =>
  `<p><span data-scripture-reference="${ref}" class="scripture-pill">${ref}</span></p>`;

describe('votd passage card dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T15:00:00-05:00'));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('is not dismissed when localStorage is empty', () => {
    expect(isVotdPassageCardDismissedToday()).toBe(false);
  });

  it('persists dismissal for the local calendar day', () => {
    setVotdDismissedToday();
    expect(getVotdDismissedDay()).toBe(todayCalendarDayKey());
    expect(isVotdPassageCardDismissedToday()).toBe(true);
  });

  it('is not dismissed when stored day differs from today', () => {
    localStorage.setItem(VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY, '2026-06-25');
    expect(isVotdPassageCardDismissedToday()).toBe(false);
  });
});

describe('isPersistedNoteId', () => {
  it('rejects optimistic local ids', () => {
    expect(isPersistedNoteId('local_123_abc')).toBe(false);
    expect(isPersistedNoteId('note_abc')).toBe(true);
  });
});

describe('noteMatchesDailyPassage', () => {
  it('matches pill refs with normalized abbreviations', () => {
    expect(
      noteMatchesDailyPassage(
        { title: '', content: pillContent('Romans 8:28') },
        'Rom 8:28',
      ),
    ).toBe(true);
  });
});

describe('findPersistedDailyPassageNote', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T15:00:00-05:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores optimistic local notes', () => {
    const notes = [
      note('local_1', { content: pillContent('Romans 8:28') }),
      note('note_real', { content: pillContent('Romans 8:28') }),
    ];
    expect(findPersistedDailyPassageNote(notes, 'Romans 8:28')?.id).toBe('note_real');
  });

  /*
   * The daily passage rotates through a finite pool, so the same reference recurs months
   * later. Without a same-day scope, a note from that earlier occurrence would resurface as
   * "today's" note — the wrong content opening under today's invitation to write, instead of
   * a brand-new one.
   */
  it('ignores a note that cites the same reference from a different day', () => {
    const notes = [
      note('note_old', {
        content: pillContent('Romans 8:28'),
        createdAt: '2026-01-05T12:00:00.000Z',
        updatedAt: '2026-01-05T12:00:00.000Z',
      }),
    ];
    expect(findPersistedDailyPassageNote(notes, 'Romans 8:28')).toBeUndefined();
  });

  it('resumes a note started earlier today, even if not the most recent edit', () => {
    const notes = [
      note('note_today', {
        content: pillContent('Romans 8:28'),
        createdAt: '2026-06-26T09:00:00-05:00',
      }),
    ];
    expect(findPersistedDailyPassageNote(notes, 'Romans 8:28')?.id).toBe('note_today');
  });

  it('resumes a note only touched today via updatedAt, created on an earlier day', () => {
    const notes = [
      note('note_edited_today', {
        content: pillContent('Romans 8:28'),
        createdAt: '2026-06-20T09:00:00-05:00',
        updatedAt: '2026-06-26T09:00:00-05:00',
      }),
    ];
    expect(findPersistedDailyPassageNote(notes, 'Romans 8:28')?.id).toBe('note_edited_today');
  });
});
