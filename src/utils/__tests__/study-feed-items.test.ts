import { describe, expect, it } from 'vitest';
import {
  buildStudyFeedDays,
  mergeStudyFeedPages,
  parseStudyFeedScope,
  serializeStudyFeedScope,
  studyFeedDayLabel,
  studyFeedItemWeight,
  type StudyFeedItem,
} from '../study-feed-items';

/** Local time, so the tests read in the same timezone the day model works in. */
function at(day: number, hour: number, minute = 0): string {
  return new Date(2026, 7, day, hour, minute, 0).toISOString();
}

function noteItem(id: string, when: string, noteId = 'note-1'): StudyFeedItem {
  return {
    id,
    kind: 'note-created',
    at: when,
    noteId,
    title: 'A note',
    snippet: 'Some words',
    scriptureRefs: [],
  };
}

function readingItem(id: string, when: string, bookOrder = 42): StudyFeedItem {
  return {
    id,
    kind: 'passage-read',
    at: when,
    book: 'John',
    bookOrder,
    chapters: [15],
    translation: 'ESV',
    dwellBucket: 'read',
  };
}

describe('studyFeedItemWeight', () => {
  it('gives original thought a card and the supporting trail a row', () => {
    expect(studyFeedItemWeight('note-created')).toBe('card');
    expect(studyFeedItemWeight('note-updated')).toBe('card');
    expect(studyFeedItemWeight('space-note')).toBe('card');
    expect(studyFeedItemWeight('highlight-scripture')).toBe('row');
    expect(studyFeedItemWeight('passage-read')).toBe('row');
    expect(studyFeedItemWeight('note-revisited')).toBe('row');
  });
});

describe('buildStudyFeedDays', () => {
  const now = new Date(2026, 7, 27, 12, 0, 0);

  it('returns a sheet per calendar day, newest first', () => {
    const days = buildStudyFeedDays(
      [noteItem('a', at(27, 9)), noteItem('b', at(26, 22), 'n2')],
      now,
    );
    expect(days.map((d) => d.dayKey)).toEqual(['2026-08-27', '2026-08-26']);
    expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday']);
  });

  it('keeps days with nothing in them — a rest day is part of the record', () => {
    // Aug 27 and Aug 24 hold study; the two days between them were rest days.
    const days = buildStudyFeedDays(
      [noteItem('a', at(27, 9)), noteItem('b', at(24, 9), 'n2')],
      now,
    );
    expect(days.map((d) => d.dayKey)).toEqual([
      '2026-08-27',
      '2026-08-26',
      '2026-08-25',
      '2026-08-24',
    ]);
    expect(days.map((d) => d.isEmpty)).toEqual([false, true, true, false]);
  });

  it('reaches back only as far as the loaded items', () => {
    expect(buildStudyFeedDays([noteItem('a', at(27, 9))], now)).toHaveLength(1);
  });

  it('still gives today a sheet when nothing is loaded at all', () => {
    const days = buildStudyFeedDays([], now);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ label: 'Today', isEmpty: true });
  });

  it('sections a day by part, newest first', () => {
    // The stack already reads backwards through time — today in front, older days behind.
    // A day that read forwards internally made the sheet change direction halfway down.
    const days = buildStudyFeedDays(
      [
        readingItem('evening', at(27, 20)),
        noteItem('afternoon', at(27, 14), 'n2'),
        readingItem('morning', at(27, 8), 18),
      ],
      now,
    );
    expect(days[0].parts.map((p) => p.part)).toEqual(['evening', 'afternoon', 'morning']);
    expect(days[0].parts.map((p) => p.label)).toEqual([
      'This evening',
      'This afternoon',
      'This morning',
    ]);
  });

  it('names parts without "This" on a day that is not today', () => {
    const days = buildStudyFeedDays([noteItem('a', at(26, 9))], now);
    const yesterday = days.find((d) => d.dayKey === '2026-08-26')!;
    expect(yesterday.parts[0].label).toBe('Morning');
  });

  it('reads a part newest first, like the parts themselves', () => {
    const days = buildStudyFeedDays(
      [noteItem('later', at(27, 10)), readingItem('earlier', at(27, 8))],
      now,
    );
    expect(days[0].parts[0].items.map((i) => i.id)).toEqual(['later', 'earlier']);
  });

  it('omits a part of the day that holds nothing', () => {
    const days = buildStudyFeedDays([noteItem('a', at(27, 20))], now);
    expect(days[0].parts.map((p) => p.part)).toEqual(['evening']);
  });

  it('drops moments with an unusable timestamp', () => {
    const days = buildStudyFeedDays(
      [noteItem('a', at(27, 9)), { ...noteItem('bad', at(27, 8)), at: 'not-a-date' }],
      now,
    );
    expect(days[0].parts[0].items.map((i) => i.id)).toEqual(['a']);
  });
});

describe('studyFeedDayLabel', () => {
  const now = new Date(2026, 7, 27, 12, 0, 0); // Thursday

  it('names every past day by its weekday, however far back', () => {
    /*
     * The label used to append the date past a week, so a header read "Thursday, August 13"
     * beside a `dateLabel` of "August 13" — the same date twice. The date is the neighbour's
     * job, and it carries the year whenever the year is not this one (see `studyFeedFullDate`),
     * so the pair stays unambiguous without the label helping.
     */
    expect(studyFeedDayLabel(new Date(2026, 7, 25, 9, 0), now)).toBe('Tuesday');
    expect(studyFeedDayLabel(new Date(2026, 7, 13, 9, 0), now)).toBe('Thursday');
    expect(studyFeedDayLabel(new Date(2025, 10, 4, 9, 0), now)).toBe('Tuesday');
  });
});

describe('mergeStudyFeedPages', () => {
  it('replaces a re-emitted item rather than duplicating it', () => {
    const first = [noteItem('a', at(27, 9))];
    const reEmitted = [{ ...noteItem('a', at(27, 9)), snippet: 'Longer span' } as StudyFeedItem];
    const merged = mergeStudyFeedPages([first, reEmitted]);
    expect(merged).toHaveLength(1);
    expect((merged[0] as { snippet: string }).snippet).toBe('Longer span');
  });

  it('orders the merged trail newest first', () => {
    const merged = mergeStudyFeedPages([
      [noteItem('older', at(26, 9), 'note-2')],
      [noteItem('newer', at(27, 9))],
    ]);
    expect(merged.map((i) => i.id)).toEqual(['newer', 'older']);
  });
});

describe('study feed scope', () => {
  it('round-trips through the wire format', () => {
    expect(serializeStudyFeedScope({ kind: 'all' })).toBe('all');
    expect(serializeStudyFeedScope({ kind: 'space', spaceId: 'sp_1' })).toBe('space:sp_1');
    expect(parseStudyFeedScope('space:sp_1')).toEqual({ kind: 'space', spaceId: 'sp_1' });
    expect(parseStudyFeedScope('home')).toEqual({ kind: 'home' });
  });

  it('falls back to all for anything unrecognised', () => {
    expect(parseStudyFeedScope('space:')).toEqual({ kind: 'all' });
    expect(parseStudyFeedScope(undefined)).toEqual({ kind: 'all' });
  });
});
