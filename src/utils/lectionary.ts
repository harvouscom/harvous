/**
 * Today's readings for a Catholic reader: which day of the Lectionary a date is, and its
 * readings as citations Harvous can open.
 *
 * Every day of the year (src/data/lectionary/): Sundays, solemnities and feasts of the Lord;
 * the saints' feasts; the weekdays of the seasons and of Ordinary Time (Years I and II). Holy
 * Saturday, which has no Mass during the day, returns null, and Home shows Today's passage. The
 * calendar is the US one: Epiphany and Ascension on Sundays, Corpus Christi on the
 * Sunday after Trinity, as most US dioceses keep them. Ascension Thursday provinces see the
 * Ascension readings on the Sunday after (docs/future/LECTIONARY_SOURCE.md).
 */
import {
  SUNDAYS_AND_SOLEMNITIES,
  type LectionaryEntry,
  type LectionarySlot,
  type SundayCycle,
} from '@/data/lectionary/sundays-and-solemnities';
import { SEASONAL_WEEKDAYS } from '@/data/lectionary/weekdays-seasons';
import { ORDINARY_WEEKDAYS } from '@/data/lectionary/weekdays-ordinary';
import { SAINTS_FEASTS } from '@/data/lectionary/saints';
import NABRE_PRINTED from '@/data/printed-verse-numbers/NABRE.json';
import type { PrintedVerseMap } from './printed-verse-number';
import {
  adventStartIndex,
  baptismOfTheLordIndex,
  computeEaster,
  dayIndex,
  epiphanySundayIndex,
  localDayIndex,
  ordinal,
} from './liturgical-season';

export type { LectionarySlot, SundayCycle };
export type WeekdayCycle = 'I' | 'II';

export interface LectionaryDay {
  /** Key into the readings table: `ordinary-29`, `advent-2`, `assumption`. */
  key: string;
  /** "29th Sunday in Ordinary Time", "The Assumption". */
  title: string;
  /** The Sunday cycle of the liturgical year the date falls in (Year A begins Advent 2025). */
  cycle: SundayCycle;
  /** The weekday cycle in Ordinary Time: Year I in odd years, Year II in even. */
  weekdayCycle: WeekdayCycle;
}

export interface LectionaryReading {
  slot: LectionarySlot;
  /** "First reading", "Responsorial Psalm", "Second reading", "Gospel". */
  label: string;
  /** As the Lectionary prints it: "Psalm 51:3-4, 12-13". What a missal says. */
  citation: string;
  /**
   * The same verses in Harvous's numbering, as one reference the reader and a pill can open:
   * "Psalms 51:1-2, 10-11". For a reading that skips between chapters it is the part holding most
   * of it (Luke 4:14-21 of "Luke 1:1-4; 4:14-21"), since a Harvous reference can't skip chapters.
   */
  reference: string;
  /**
   * Every part of the reading, one reference per run of verses: `[reference]` for most readings,
   * `["Luke 1:1-4", "Luke 4:14-21"]` for one that skips chapters. The card's words are these,
   * joined — never the whole span between them.
   */
  segments: string[];
}

export interface TodaysReadings extends LectionaryDay {
  readings: LectionaryReading[];
}

// ─── The calendar ───────────────────────────────────────────────────────────

const CYCLES: SundayCycle[] = ['C', 'A', 'B'];

const FIXED_TITLES: Record<string, string> = {
  christmas: 'Christmas Day',
  'holy-family': 'The Holy Family',
  'mary-mother-of-god': 'Mary, Mother of God',
  epiphany: 'The Epiphany of the Lord',
  'baptism-of-the-lord': 'The Baptism of the Lord',
  'ash-wednesday': 'Ash Wednesday',
  'palm-sunday': 'Palm Sunday',
  'holy-thursday': 'Holy Thursday',
  'good-friday': 'Good Friday',
  easter: 'Easter Sunday',
  ascension: 'The Ascension of the Lord',
  pentecost: 'Pentecost',
  trinity: 'The Most Holy Trinity',
  'corpus-christi': 'The Body and Blood of Christ',
  'sacred-heart': 'The Sacred Heart of Jesus',
  'christ-the-king': 'Christ the King',
  presentation: 'The Presentation of the Lord',
  'st-joseph': 'St. Joseph',
  annunciation: 'The Annunciation',
  'birth-of-john-the-baptist': 'The Nativity of St. John the Baptist',
  'peter-and-paul': 'Sts. Peter and Paul',
  transfiguration: 'The Transfiguration of the Lord',
  assumption: 'The Assumption',
  'exaltation-of-the-cross': 'The Exaltation of the Holy Cross',
  'all-saints': 'All Saints',
  'all-souls': 'All Souls',
  'dedication-of-the-lateran': 'The Dedication of the Lateran Basilica',
  'immaculate-conception': 'The Immaculate Conception',
  'our-lady-of-guadalupe': 'Our Lady of Guadalupe',
};

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function weekdayTitle(key: string): string | null {
  const day = (k: string) => DAY_NAMES[DAY_KEYS.indexOf(k as (typeof DAY_KEYS)[number])];
  let m = /^(advent|lent|easter|ordinary)-(\d+)-([a-z]{3})$/.exec(key);
  if (m) {
    const [, season, n, d] = m;
    if (season === 'lent' && n === '0') return `${day(d!)} after Ash Wednesday`;
    if (season === 'easter' && n === '1') return `${day(d!)} in the Octave of Easter`;
    if (season === 'ordinary') return `${day(d!)} of the ${ordinal(Number(n))} week in Ordinary Time`;
    const name = season === 'advent' ? 'Advent' : season === 'lent' ? 'Lent' : 'Easter';
    return `${day(d!)} of the ${ordinal(Number(n))} week of ${name}`;
  }
  m = /^(?:advent|christmas)-(dec|jan)-(\d+)$/.exec(key);
  if (m) return `${m[1] === 'dec' ? 'December' : 'January'} ${m[2]}`;
  m = /^(after-epiphany|holy)-([a-z]{3})$/.exec(key);
  if (m) return m[1] === 'holy' ? `${day(m[2]!)} of Holy Week` : `${day(m[2]!)} after the Epiphany`;
  if (key === 'mary-mother-of-the-church') return 'Mary, Mother of the Church';
  m = /^saint-(\d{2})-(\d{2})$/.exec(key);
  if (m) return SAINTS_FEASTS[`${m[1]}-${m[2]}`]?.title ?? `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}`;
  return null;
}

function titleFor(key: string): string {
  const weekday = weekdayTitle(key);
  if (weekday) return weekday;
  const numbered = /^(advent|lent|easter|ordinary)-(\d+)$/.exec(key);
  if (!numbered) return FIXED_TITLES[key] ?? key;
  const [, season, n] = numbered;
  if (season === 'ordinary') return `${ordinal(Number(n))} Sunday in Ordinary Time`;
  const name = season === 'advent' ? 'Advent' : season === 'lent' ? 'Lent' : 'Easter';
  return `${ordinal(Number(n))} Sunday of ${name}`;
}

/**
 * Solemnities and feasts kept by date, on the day they land in `year` once moved off the days
 * that outrank them:
 * - St. Joseph in Holy Week goes to the Saturday before Palm Sunday; on a Sunday of Lent, Monday.
 * - The Annunciation in Holy Week or the Easter Octave goes to the Monday after Divine Mercy
 *   Sunday; on a Sunday of Lent, Monday.
 * - The Immaculate Conception on the Second Sunday of Advent goes to Monday.
 * - St. John the Baptist and Sts. Peter and Paul yield to the Sacred Heart (to the day before,
 *   as in 2022) and to Trinity Sunday or Corpus Christi (to Monday).
 * - Our Lady of Guadalupe on the Third Sunday of Advent is not kept that year.
 * Feasts of the Lord (Presentation, Transfiguration, Holy Cross, the Lateran) on a Sunday in
 * Ordinary Time replace it; All Souls does too.
 */
function fixedDays(year: number, movable: Map<number, string>): Map<number, string> {
  const easter = computeEaster(year);
  const easterIdx = dayIndex(year, easter.month, easter.day);
  const palmSunday = easterIdx - 7;
  const adventStart = adventStartIndex(year);
  const isSunday = (idx: number) => new Date(year, 0, 1 + idx - dayIndex(year, 1, 1)).getDay() === 0;
  const days = new Map<number, string>();

  const set = (month: number, day: number, key: string, move: (idx: number) => number | null = (i) => i) => {
    const moved = move(dayIndex(year, month, day));
    if (moved != null) days.set(moved, key);
  };

  set(2, 2, 'presentation');
  set(3, 19, 'st-joseph', (i) => (i >= palmSunday && i <= easterIdx ? palmSunday - 1 : isSunday(i) ? i + 1 : i));
  set(3, 25, 'annunciation', (i) =>
    i >= palmSunday && i <= easterIdx + 7 ? easterIdx + 8 : isSunday(i) ? i + 1 : i,
  );
  const yieldToLord = (i: number) => {
    const lord = movable.get(i);
    if (lord === 'sacred-heart') return i - 1;
    if (lord === 'trinity' || lord === 'corpus-christi') return i + 1;
    return i;
  };
  set(6, 24, 'birth-of-john-the-baptist', yieldToLord);
  set(6, 29, 'peter-and-paul', yieldToLord);
  set(8, 6, 'transfiguration');
  set(8, 15, 'assumption');
  set(9, 14, 'exaltation-of-the-cross');
  set(11, 1, 'all-saints');
  set(11, 2, 'all-souls');
  set(11, 9, 'dedication-of-the-lateran');
  set(12, 8, 'immaculate-conception', (i) => (isSunday(i) ? i + 1 : i));
  set(12, 12, 'our-lady-of-guadalupe', (i) => (isSunday(i) && i >= adventStart ? null : i));
  set(12, 25, 'christmas');
  set(1, 1, 'mary-mother-of-god');
  return days;
}

/** The days the seasons and Easter decide, which outrank everything kept by date. */
function movableDays(year: number): Map<number, string> {
  const easter = computeEaster(year);
  const easterIdx = dayIndex(year, easter.month, easter.day);
  const ashWednesday = easterIdx - 46;
  const pentecost = easterIdx + 49;
  const adventStart = adventStartIndex(year);
  const days = new Map<number, string>();

  days.set(epiphanySundayIndex(year), 'epiphany');
  days.set(baptismOfTheLordIndex(year), 'baptism-of-the-lord');
  days.set(ashWednesday, 'ash-wednesday');
  for (let k = 1; k <= 5; k++) days.set(ashWednesday + 4 + 7 * (k - 1), `lent-${k}`);
  days.set(easterIdx - 7, 'palm-sunday');
  days.set(easterIdx - 3, 'holy-thursday');
  days.set(easterIdx - 2, 'good-friday');
  days.set(easterIdx, 'easter');
  for (let k = 2; k <= 6; k++) days.set(easterIdx + 7 * (k - 1), `easter-${k}`);
  days.set(easterIdx + 42, 'ascension');
  days.set(pentecost, 'pentecost');
  days.set(pentecost + 7, 'trinity');
  days.set(pentecost + 14, 'corpus-christi');
  days.set(pentecost + 19, 'sacred-heart');
  days.set(adventStart - 7, 'christ-the-king');
  for (let k = 1; k <= 4; k++) days.set(adventStart + 7 * (k - 1), `advent-${k}`);

  // The Holy Family: the Sunday after Christmas, or December 30 when Christmas is a Sunday.
  const christmas = dayIndex(year, 12, 25);
  const christmasDow = new Date(year, 11, 25).getDay();
  days.set(christmasDow === 0 ? dayIndex(year, 12, 30) : christmas + (7 - christmasDow), 'holy-family');
  return days;
}

/** The Lectionary day for `date`, or null on Holy Saturday. */
export function lectionaryDayFor(date: Date): LectionaryDay | null {
  const year = date.getFullYear();
  const today = localDayIndex(date);
  const adventStart = adventStartIndex(year);
  const cycle = CYCLES[(today >= adventStart ? year + 1 : year) % 3]!;
  const weekdayCycle: WeekdayCycle = year % 2 === 1 ? 'I' : 'II';

  const movable = movableDays(year);
  const key =
    movable.get(today) ??
    fixedDays(year, movable).get(today) ??
    ordinarySunday(date, today) ??
    saintsFeast(date, today) ??
    weekdayKey(date, today);
  return key ? { key, title: titleFor(key), cycle, weekdayCycle } : null;
}

/**
 * A saint's feast, which outranks the weekday it falls on — except a Sunday, Holy Week and the
 * Easter Octave, where it is not kept that year.
 */
function saintsFeast(date: Date, today: number): string | null {
  if (date.getDay() === 0) return null;
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (!SAINTS_FEASTS[mmdd]) return null;
  const easter = computeEaster(date.getFullYear());
  const easterIdx = dayIndex(date.getFullYear(), easter.month, easter.day);
  if (today >= easterIdx - 7 && today <= easterIdx + 7) return null;
  return `saint-${mmdd}`;
}

/** The weekday of whichever season `date` falls in. Sundays never reach here. */
function weekdayKey(date: Date, today: number): string | null {
  const year = date.getFullYear();
  const dow = DAY_KEYS[date.getDay()]!;
  const easter = computeEaster(year);
  const easterIdx = dayIndex(year, easter.month, easter.day);
  const ashWednesday = easterIdx - 46;
  const pentecost = easterIdx + 49;
  const adventStart = adventStartIndex(year);
  const epiphany = epiphanySundayIndex(year);
  const baptism = baptismOfTheLordIndex(year);
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Advent: by week to December 16, by date after.
  if (today > adventStart && today < dayIndex(year, 12, 25)) {
    if (month === 12 && day >= 17) return `advent-dec-${day}`;
    return `advent-${Math.floor((today - adventStart) / 7) + 1}-${dow}`;
  }
  // Christmas: the last days of December, then January by date until the Epiphany, by weekday after it.
  if (month === 12 && day >= 29) return `christmas-dec-${day}`;
  if (today < epiphany && month === 1 && day >= 2) return `christmas-jan-${day}`;
  if (today > epiphany && today < baptism) return `after-epiphany-${dow}`;
  // Lent and Holy Week (Holy Saturday has no Mass of the day).
  if (today > ashWednesday && today < easterIdx - 7) {
    if (today < ashWednesday + 4) return `lent-0-${dow}`;
    return `lent-${Math.floor((today - (ashWednesday + 4)) / 7) + 1}-${dow}`;
  }
  if (today > easterIdx - 7 && today < easterIdx) {
    return today < easterIdx - 3 ? `holy-${dow}` : null;
  }
  // Easter, to Pentecost; the Monday after is Mary, Mother of the Church.
  if (today > easterIdx && today < pentecost) return `easter-${Math.floor((today - easterIdx) / 7) + 1}-${dow}`;
  if (today === pentecost + 1) return 'mary-mother-of-the-church';
  // Ordinary Time.
  let week: number;
  if (today > baptism && today < ashWednesday) {
    const anchor = baptism === epiphany + 7 ? baptism : epiphany;
    week = Math.floor((today - anchor) / 7) + 1;
  } else if (today > pentecost && today < adventStart) {
    week = 34 - Math.floor((adventStart - today - 1) / 7);
  } else {
    return null;
  }
  return `ordinary-${week}-${dow}`;
}

function ordinarySunday(date: Date, today: number): string | null {
  if (date.getDay() !== 0) return null;
  const year = date.getFullYear();
  const easter = computeEaster(year);
  const easterIdx = dayIndex(year, easter.month, easter.day);
  const adventStart = adventStartIndex(year);
  const epiphany = epiphanySundayIndex(year);
  const baptism = baptismOfTheLordIndex(year);

  let week: number;
  if (today > baptism && today < easterIdx - 46) {
    // Week 1 starts the day after the Baptism, whose Sunday anchor is the Epiphany when the
    // Baptism moved to Monday (the same count `catholicLiturgicalSeason` uses).
    const anchor = baptism === epiphany + 7 ? baptism : epiphany;
    week = Math.floor((today - anchor) / 7) + 1;
  } else if (today > easterIdx + 49 && today < adventStart) {
    week = 34 - Math.floor((adventStart - today - 1) / 7);
  } else {
    return null;
  }
  return week >= 2 && week <= 33 ? `ordinary-${week}` : null;
}

// ─── Citations to Harvous references ────────────────────────────────────────

const SLOTS: Array<[LectionarySlot, string]> = [
  ['first', 'First reading'],
  ['psalm', 'Responsorial Psalm'],
  ['second', 'Second reading'],
  ['gospel', 'Gospel'],
];

interface Address {
  book: string;
  chapter: number;
  verse: number;
}

/** Printed NABRE address → Harvous address, from the import's printed-number runs, inverted. */
let printedIndex: Map<string, Array<{ book: string; chapter: number; from: number; to: number; offset: number }>> | null = null;

function printedRunsFor(book: string, chapter: number) {
  if (!printedIndex) {
    printedIndex = new Map();
    for (const [harvousBook, runs] of Object.entries(NABRE_PRINTED as PrintedVerseMap)) {
      for (const run of runs) {
        const key = `${run.printedBook ?? harvousBook}|${run.printedChapter}`;
        const list = printedIndex.get(key) ?? [];
        list.push({
          book: harvousBook,
          chapter: run.chapter,
          from: run.from + run.offset,
          to: run.printedTo ?? run.to + run.offset,
          offset: run.offset,
        });
        printedIndex.set(key, list);
      }
    }
  }
  return printedIndex.get(`${book}|${chapter}`) ?? [];
}

export function harvousAddressForPrinted(book: string, chapter: number, verse: number): Address {
  const run = printedRunsFor(book, chapter).find((r) => r.from <= verse && verse <= r.to);
  if (!run) return { book, chapter, verse };
  return { book: run.book, chapter: run.chapter, verse: Math.max(1, verse - run.offset) };
}

const BOOK_ALIASES: Record<string, string> = { Psalm: 'Psalms' };

interface Span {
  start: Address;
  end: Address;
}

/**
 * Parse a Lectionary citation into verse spans, in its own numbering:
 * "Isaiah 63:16b-17, 19b; 64:2-7", "1 Thessalonians 3:12—4:2", "Philemon 9-10, 12-17".
 * Half-verse letters are dropped: Harvous opens whole verses.
 */
export function parseLectionaryCitation(citation: string): { book: string; spans: Span[] } | null {
  const match = /^(.+?)\s+(\d.*)$/.exec(citation.trim());
  if (!match) return null;
  const book = BOOK_ALIASES[match[1]!] ?? match[1]!;
  const spec = match[2]!.replace(/(\d)[a-z]+/g, '$1');
  const spans: Span[] = [];
  let chapter = 1;
  const point = (text: string): Address | null => {
    const m = /^(?:(\d+):)?(\d+)$/.exec(text.trim());
    if (!m) return null;
    if (m[1]) chapter = Number(m[1]);
    return { book, chapter, verse: Number(m[2]) };
  };
  for (const part of spec.split(/[;,]/)) {
    const [from, to] = part.split(/[—–-]/);
    const start = point(from ?? '');
    if (!start) return null;
    const end = to ? point(to) : start;
    if (!end) return null;
    spans.push({ start, end });
  }
  return spans.length ? { book, spans } : null;
}

/** One chapter's verse groups as a reference: adjacent printed groups ("2-3, 3-4") join into one run. */
function chapterReference(book: string, chapter: number, ranges: Array<[number, number]>): string {
  const groups: Array<[number, number]> = [];
  for (const [a, b] of ranges) {
    const prev = groups[groups.length - 1];
    if (prev && a <= prev[1] + 1) prev[1] = Math.max(prev[1], b);
    else groups.push([a, b]);
  }
  return `${book} ${chapter}:${groups.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ')}`;
}

/**
 * A Lectionary citation in Harvous's numbering, as the references it takes to say it exactly:
 * "Psalm 51:3-4, 12-13" → ["Psalms 51:1-2, 10-11"]; "Genesis 2:7-9; 3:1-7" → ["Genesis 2:7-9",
 * "Genesis 3:1-7"]. A span that runs on across a chapter ("2 Corinthians 5:20—6:2") stays one
 * reference, which Harvous can open; only a skip between chapters splits it.
 */
export function harvousSegmentsForCitation(citation: string): string[] | null {
  const parsed = parseLectionaryCitation(citation);
  if (!parsed) return null;
  const segments: Array<{ book: string; chapter: number; ranges: Array<[number, number]> } | string> = [];
  for (const span of parsed.spans) {
    const start = harvousAddressForPrinted(span.start.book, span.start.chapter, span.start.verse);
    const end = harvousAddressForPrinted(span.end.book, span.end.chapter, span.end.verse);
    if (start.book !== end.book) return null;
    if (start.chapter !== end.chapter) {
      segments.push(`${start.book} ${start.chapter}:${start.verse}-${end.chapter}:${end.verse}`);
      continue;
    }
    const prev = segments[segments.length - 1];
    if (prev && typeof prev !== 'string' && prev.book === start.book && prev.chapter === start.chapter) {
      prev.ranges.push([start.verse, end.verse]);
    } else {
      segments.push({ book: start.book, chapter: start.chapter, ranges: [[start.verse, end.verse]] });
    }
  }
  const out = segments.map((seg) => (typeof seg === 'string' ? seg : chapterReference(seg.book, seg.chapter, seg.ranges)));
  return out.length ? out : null;
}

/** How many verses a one-chapter reference names, to find the part of a reading that is most of it. */
function verseCount(reference: string): number {
  const groups = reference.slice(reference.indexOf(':') + 1).split(',');
  return groups.reduce((n, g) => {
    const [a, b] = g.trim().split('-').map(Number);
    return n + (b && !Number.isNaN(b) ? b - a + 1 : 1);
  }, 0);
}

/**
 * Harvous's one reference for a Lectionary citation: the whole of it when it can be said in one
 * ("Psalms 51:1-2, 10-11"), else its largest part ("Genesis 2:7-9; 3:1-7" → "Genesis 3:1-7").
 * The words of every part are `harvousSegmentsForCitation`.
 */
export function harvousReferenceForCitation(citation: string): string | null {
  const segments = harvousSegmentsForCitation(citation);
  if (!segments) return null;
  if (segments.length === 1) return segments[0]!;
  return segments.reduce((best, seg) => (verseCount(seg) > verseCount(best) ? seg : best));
}

function readingsOf(entry: LectionaryEntry): LectionaryReading[] {
  const readings: LectionaryReading[] = [];
  for (const [slot, label] of SLOTS) {
    const citation = entry[slot];
    if (!citation) continue;
    const override = entry.text?.[slot];
    const segments = override ? [override] : harvousSegmentsForCitation(citation);
    const reference = override ?? harvousReferenceForCitation(citation);
    if (reference && segments) readings.push({ slot, label, citation, reference, segments });
  }
  return readings;
}

/** The table entry for a Lectionary day, whichever table it lives in. */
export function lectionaryEntryFor(day: LectionaryDay): LectionaryEntry | null {
  const ordinary = ORDINARY_WEEKDAYS[day.key];
  if (ordinary) return ordinary[day.weekdayCycle];
  const saint = /^saint-(.+)$/.exec(day.key);
  const readings = saint
    ? SAINTS_FEASTS[saint[1]!]?.readings
    : (SUNDAYS_AND_SOLEMNITIES[day.key] ?? SEASONAL_WEEKDAYS[day.key]);
  if (!readings) return null;
  return 'all' in readings ? readings.all : readings[day.cycle];
}

/** The day's readings for `date`, or null when there are none (Holy Saturday). */
export function todaysReadingsFor(date: Date): TodaysReadings | null {
  const day = lectionaryDayFor(date);
  if (!day) return null;
  const entry = lectionaryEntryFor(day);
  if (!entry) return null;
  return { ...day, readings: readingsOf(entry) };
}

/** A local calendar day ("2026-10-18") as a date, for the server, which knows only the string. */
export function dateForCalendarDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

