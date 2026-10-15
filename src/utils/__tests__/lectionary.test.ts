import { describe, expect, it } from 'vitest';
import BIBLE_CHAPTERS from '@/data/bible-chapters.json';
import DEUTERO_CHAPTERS from '@/data/deuterocanon-chapters.json';
import { SUNDAYS_AND_SOLEMNITIES, type LectionaryEntry } from '@/data/lectionary/sundays-and-solemnities';
import { SEASONAL_WEEKDAYS } from '@/data/lectionary/weekdays-seasons';
import { ORDINARY_WEEKDAYS } from '@/data/lectionary/weekdays-ordinary';
import { SAINTS_FEASTS } from '@/data/lectionary/saints';
import {
  dateForCalendarDay,
  harvousReferenceForCitation,
  harvousSegmentsForCitation,
  lectionaryDayFor,
  parseLectionaryCitation,
  todaysReadingsFor,
} from '../lectionary';
import { englishCandidates } from '../../../server/data/versification/remap.mjs';

const on = (day: string) => dateForCalendarDay(day)!;
const keyOn = (day: string) => lectionaryDayFor(on(day))?.key ?? null;

const chapterEnds = new Map<string, number>();
for (const r of [...BIBLE_CHAPTERS, ...DEUTERO_CHAPTERS] as Array<{ book: string; chapter: number; endVerse: number }>) {
  const k = `${r.book}|${r.chapter}`;
  chapterEnds.set(k, Math.max(chapterEnds.get(k) ?? 0, r.endVerse));
}

function allEntries(): Array<[string, string, LectionaryEntry]> {
  const days: Array<[string, Record<string, LectionaryEntry>]> = [
    ...Object.entries(SUNDAYS_AND_SOLEMNITIES),
    ...Object.entries(SEASONAL_WEEKDAYS),
    ...Object.entries(ORDINARY_WEEKDAYS),
    ...Object.entries(SAINTS_FEASTS).map(([date, f]) => [date, f.readings] as [string, Record<string, LectionaryEntry>]),
  ] as Array<[string, Record<string, LectionaryEntry>]>;
  return days.flatMap(([key, day]) =>
    Object.entries(day).map(([cycle, entry]) => [key, cycle, entry] as [string, string, LectionaryEntry]),
  );
}

describe('the calendar', () => {
  it.each([
    // Checked against the USCCB's daily readings for those days.
    ['2023-02-12', 'ordinary-6', 'A'],
    ['2023-04-23', 'easter-3', 'A'],
    ['2024-09-15', 'ordinary-24', 'B'],
    ['2025-03-02', 'ordinary-8', 'C'],
    ['2025-11-23', 'christ-the-king', 'C'],
    // Year A began with Advent 2025.
    ['2026-10-18', 'ordinary-29', 'A'],
    ['2026-11-29', 'advent-1', 'B'],
  ])('%s is %s, year %s', (day, key, cycle) => {
    expect(lectionaryDayFor(on(day))).toMatchObject({ key, cycle });
  });

  it('gives weekdays their season, week and Year I/II', () => {
    expect(lectionaryDayFor(on('2026-10-15'))).toMatchObject({ key: 'ordinary-28-thu', weekdayCycle: 'II' });
    expect(lectionaryDayFor(on('2025-01-13'))).toMatchObject({ key: 'ordinary-1-mon', weekdayCycle: 'I' });
    // The Baptism on Monday, January 8: Tuesday is still the first week.
    expect(keyOn('2024-01-09')).toBe('ordinary-1-tue');
    expect(keyOn('2026-12-16')).toBe('advent-3-wed');
    expect(keyOn('2026-12-17')).toBe('advent-dec-17');
    expect(keyOn('2026-01-02')).toBe('christmas-jan-2');
    expect(keyOn('2026-01-05')).toBe('after-epiphany-mon');
    expect(keyOn('2026-02-19')).toBe('lent-0-thu');
    expect(keyOn('2026-02-23')).toBe('lent-1-mon');
    expect(keyOn('2026-03-30')).toBe('holy-mon');
    expect(keyOn('2026-04-06')).toBe('easter-1-mon');
    expect(keyOn('2026-05-25')).toBe('mary-mother-of-the-church');
    expect(keyOn('2026-05-26')).toBe('ordinary-8-tue');
  });

  it('has nothing for Holy Saturday, which has no Mass of the day', () => {
    expect(keyOn('2026-04-04')).toBeNull();
  });

  it("keeps a saint's feast over the weekday, but not on a Sunday or in the Easter Octave", () => {
    expect(keyOn('2026-05-14')).toBe('saint-05-14'); // St. Matthias over Thursday of the 6th week of Easter
    expect(keyOn('2026-09-21')).toBe('saint-09-21');
    expect(keyOn('2025-09-21')).toBe('ordinary-25'); // St. Matthew on a Sunday
    expect(keyOn('2025-04-25')).toBe('easter-1-fri'); // St. Mark in the Octave
    expect(keyOn('2025-12-26')).toBe('saint-12-26');
  });

  it('keeps Epiphany and Ascension on their US Sundays, and moves the Baptism when Epiphany is late', () => {
    expect(keyOn('2025-01-05')).toBe('epiphany');
    expect(keyOn('2025-01-12')).toBe('baptism-of-the-lord');
    expect(keyOn('2024-01-07')).toBe('epiphany');
    expect(keyOn('2024-01-08')).toBe('baptism-of-the-lord');
    expect(keyOn('2024-01-14')).toBe('ordinary-2');
    expect(keyOn('2024-05-12')).toBe('ascension');
    expect(keyOn('2024-05-09')).toBe('easter-6-thu');
  });

  it('puts the Holy Family on December 30 when Christmas is a Sunday', () => {
    expect(keyOn('2022-12-25')).toBe('christmas');
    expect(keyOn('2022-12-30')).toBe('holy-family');
    expect(keyOn('2023-12-31')).toBe('holy-family');
  });

  it('moves solemnities off the days that outrank them', () => {
    // Immaculate Conception on the Second Sunday of Advent → Monday.
    expect(keyOn('2024-12-08')).toBe('advent-2');
    expect(keyOn('2024-12-09')).toBe('immaculate-conception');
    // Annunciation in Holy Week → Monday after Divine Mercy Sunday.
    expect(keyOn('2024-03-25')).toBe('holy-mon');
    expect(keyOn('2024-04-08')).toBe('annunciation');
    // St. Joseph on a Sunday of Lent → Monday.
    expect(keyOn('2023-03-19')).toBe('lent-4');
    expect(keyOn('2023-03-20')).toBe('st-joseph');
    // The Sacred Heart and St. John the Baptist, June 24 2022.
    expect(keyOn('2022-06-24')).toBe('sacred-heart');
    expect(keyOn('2022-06-23')).toBe('birth-of-john-the-baptist');
  });

  it('lets feasts of the Lord and solemnities replace a Sunday in Ordinary Time', () => {
    expect(keyOn('2026-08-15')).toBe('assumption');
    expect(keyOn('2025-11-09')).toBe('dedication-of-the-lateran');
    expect(keyOn('2026-11-01')).toBe('all-saints');
    expect(keyOn('2025-11-02')).toBe('all-souls');
  });

  it('gives every day from 2025 to 2040 readings, except Holy Saturday', () => {
    for (let d = on('2025-01-01'); d < on('2041-01-01'); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const readings = todaysReadingsFor(d);
      const day = lectionaryDayFor(d);
      if (day === null) {
        const easter = lectionaryDayFor(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
        expect(easter?.key, d.toDateString()).toBe('easter');
        continue;
      }
      expect(readings?.readings.at(-1)?.slot, `${d.toDateString()} → ${day.key}`).toBe('gospel');
    }
  });

  it('gives every Sunday from 2025 to 2040 a day the table has', () => {
    for (let d = on('2025-01-05'); d < on('2041-01-01'); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
      const day = lectionaryDayFor(d);
      expect(day, d.toDateString()).not.toBeNull();
      expect(SUNDAYS_AND_SOLEMNITIES[day!.key], `${d.toDateString()} → ${day!.key}`).toBeDefined();
    }
  });
});

describe('citations', () => {
  it('parses the shapes the Lectionary prints', () => {
    expect(parseLectionaryCitation('Isaiah 63:16b-17, 19b; 64:2-7')?.spans).toHaveLength(3);
    expect(harvousReferenceForCitation('Philemon 9-10, 12-17')).toBe('Philemon 1:9-10, 12-17');
    expect(harvousReferenceForCitation('1 Corinthians 12:31—13:13')).toBe('1 Corinthians 12:31-13:13');
  });

  it('renumbers into Harvous numbering', () => {
    expect(harvousReferenceForCitation('Psalm 51:3-4, 12-13')).toBe('Psalms 51:1-2, 10-11');
    expect(harvousReferenceForCitation('Malachi 3:19-20a')).toBe('Malachi 4:1-2');
    expect(harvousReferenceForCitation('Daniel 3:52, 53, 54, 55, 56')).toBe('Prayer of Azariah 1:29-33');
    expect(harvousReferenceForCitation('Isaiah 8:23—9:3')).toBe('Isaiah 9:1-4');
    expect(harvousReferenceForCitation('Joel 2:12-18')).toBe('Joel 2:12-18');
  });

  it('keeps the gap in a reading that skips between chapters', () => {
    expect(harvousSegmentsForCitation('Luke 1:1-4; 4:14-21')).toEqual(['Luke 1:1-4', 'Luke 4:14-21']);
    expect(harvousSegmentsForCitation('Revelation 11:19a; 12:1-6a, 10ab')).toEqual([
      'Revelation 11:19',
      'Revelation 12:1-6, 10',
    ]);
    expect(harvousSegmentsForCitation('Isaiah 63:16b-17, 19b; 64:2-7')).toEqual([
      'Isaiah 63:16-17, 19',
      'Isaiah 64:3-8',
    ]);
    // One reference opens where most of the reading is.
    expect(harvousReferenceForCitation('Luke 1:1-4; 4:14-21')).toBe('Luke 4:14-21');
    // A span that runs on across a chapter is not a skip: one reference, which Harvous can open.
    expect(harvousSegmentsForCitation('2 Corinthians 5:20—6:2')).toEqual(['2 Corinthians 5:20-6:2']);
  });

  it('never turns a skip in the table into the chapters between', () => {
    for (const [key, cycle, entry] of allEntries()) {
      for (const slot of ['first', 'psalm', 'second', 'gospel'] as const) {
        const citation = entry[slot];
        if (!citation?.includes(';') || entry.text?.[slot]) continue;
        const segments = harvousSegmentsForCitation(citation);
        expect(segments?.length, `${key} ${cycle} ${slot}: ${citation}`).toBeGreaterThan(1);
      }
    }
  });

  it('agrees with the import tables on every psalm verse the table cites', () => {
    for (const [, , entry] of allEntries()) {
      const parsed = parseLectionaryCitation(entry.psalm);
      if (parsed?.book !== 'Psalms') continue;
      for (const { start } of parsed.spans) {
        const english = englishCandidates('PSA', start.chapter, start.verse, 'org').find((c) => c.verse > 0);
        if (!english) continue; // a title verse
        const ref = harvousReferenceForCitation(`Psalm ${start.chapter}:${start.verse}`);
        expect(ref, entry.psalm).toBe(`Psalms ${english.chapter}:${english.verse}`);
      }
    }
  });

  it('lands every reading in the table on verses that exist', () => {
    for (const [key, cycle, entry] of allEntries()) {
      for (const slot of ['first', 'psalm', 'second', 'gospel'] as const) {
        const citation = entry[slot];
        if (!citation) continue;
        const reference = entry.text?.[slot] ?? harvousReferenceForCitation(citation);
        const where = `${key} ${cycle} ${slot}: ${citation}`;
        expect(reference, where).toBeTruthy();
        const m = /^(.+?) (\d+):(\d+)(.*)$/.exec(reference!)!;
        const [book, chapter] = [m[1]!, Number(m[2])];
        expect(chapterEnds.get(`${book}|${chapter}`), where).toBeGreaterThanOrEqual(Number(m[3]));
        for (const tail of m[4]!.matchAll(/(?:(\d+):)?(\d+)/g)) {
          const c = tail[1] ? Number(tail[1]) : chapter;
          expect(chapterEnds.get(`${book}|${c}`) ?? 0, where).toBeGreaterThanOrEqual(Number(tail[2]));
        }
      }
    }
  });

  it("gives a Sunday's readings in order, Gospel last", () => {
    const readings = todaysReadingsFor(on('2026-10-18'))!;
    expect(readings.title).toBe('29th Sunday in Ordinary Time');
    expect(readings.readings.map((r) => [r.label, r.citation])).toEqual([
      ['First reading', 'Isaiah 45:1, 4-6'],
      ['Responsorial Psalm', 'Psalm 96:1, 3, 4-5, 7-8, 9-10'],
      ['Second reading', '1 Thessalonians 1:1-5b'],
      ['Gospel', 'Matthew 22:15-21'],
    ]);
  });
});
