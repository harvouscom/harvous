import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  findPersistedDailyPassageNote,
  getVotdDismissedDay,
  hasDailyPassageNote,
  isPersistedNoteId,
  isVotdPassageCardDismissedToday,
  noteMatchesDailyPassage,
  setVotdDismissedToday,
  todayCalendarDayKey,
  VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY,
} from '../../../spa/src/lib/votd-today';
import type { SpaceNoteRow } from '../../../spa/src/hooks/queries/useSpace';
import type { ScriptureIndexBookLike } from '@/utils/scripture-passage-drill';

function note(
  id: string,
  overrides: Partial<Pick<SpaceNoteRow, 'title' | 'content'>> = {},
): SpaceNoteRow {
  return {
    id,
    title: overrides.title ?? '',
    content: overrides.content ?? '<p></p>',
    createdAt: new Date().toISOString(),
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
  it('ignores optimistic local notes', () => {
    const notes = [
      note('local_1', { content: pillContent('Romans 8:28') }),
      note('note_real', { content: pillContent('Romans 8:28') }),
    ];
    expect(findPersistedDailyPassageNote(notes, 'Romans 8:28')?.id).toBe('note_real');
  });
});

describe('hasDailyPassageNote', () => {
  const indexWithNotes: ScriptureIndexBookLike[] = [
    {
      bookOrder: 44,
      passages: [
        {
          passageKey: '44:8:28:28',
          displayRef: 'Romans 8:28',
          bookOrder: 44,
          noteCount: 1,
        },
      ],
    },
  ];

  it('returns true when scripture index has notes for passage', () => {
    expect(hasDailyPassageNote([], indexWithNotes, 'Romans 8:28')).toBe(true);
  });

  it('returns false when only optimistic note matches', () => {
    const notes = [note('local_1', { content: pillContent('Romans 8:28') })];
    expect(hasDailyPassageNote(notes, [], 'Romans 8:28')).toBe(false);
  });

  it('returns true from persisted note when index is stale', () => {
    const notes = [note('note_1', { content: pillContent('Romans 8:28') })];
    expect(hasDailyPassageNote(notes, [], 'Romans 8:28')).toBe(true);
  });

  it('returns false when index passage has zero notes and no persisted match', () => {
    const emptyIndex: ScriptureIndexBookLike[] = [
      {
        bookOrder: 44,
        passages: [
          {
            passageKey: '44:8:28:28',
            displayRef: 'Romans 8:28',
            bookOrder: 44,
            noteCount: 0,
          },
        ],
      },
    ];
    expect(hasDailyPassageNote([], emptyIndex, 'Romans 8:28')).toBe(false);
  });
});
