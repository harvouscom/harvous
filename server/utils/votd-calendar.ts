/**
 * Liturgical + secular calendar resolution for VOTD.
 * All dates use UTC calendar components (aligns with publish-daily todayStr).
 */

import type { CalendarVerse } from '../constants/votd-calendar';
import {
  VOTD_FIXED_DATES,
  VOTD_THANKSGIVING_VERSES,
  VOTD_MOTHERS_DAY_VERSES,
  VOTD_FATHERS_DAY_VERSES,
  VOTD_LABOR_DAY_VERSES,
  VOTD_MEMORIAL_DAY_VERSES,
  VOTD_EASTER_RELATIVE,
  VOTD_ADVENT_VERSES,
  VOTD_LENT_VERSES,
} from '../constants/votd-calendar';
import { clampReferenceToMaxVerseSpan } from './votd-reference-bounds';

/** Anonymous Gregorian algorithm — Easter Sunday (UTC date at noon to avoid TZ drift) */
export function computeEasterSundayUtc(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function utcYmd(d: Date): { y: number; m: number; day: number } {
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function ymdToUtcDate(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
}

function daysBetweenUtc(a: Date, b: Date): number {
  const ms = 86400000;
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((ub - ua) / ms);
}

/** 4th Thursday in November (US) */
export function thanksgivingDateUtc(year: number): Date {
  const nov1 = ymdToUtcDate(year, 11, 1);
  const dow = nov1.getUTCDay(); // 0 Sun
  const firstThuOffset = (4 - dow + 7) % 7;
  const firstThu = 1 + firstThuOffset;
  const fourthThu = firstThu + 21;
  return ymdToUtcDate(year, 11, fourthThu);
}

/** 2nd Sunday in May */
export function mothersDayDateUtc(year: number): Date {
  const may1 = ymdToUtcDate(year, 5, 1);
  const dow = may1.getUTCDay();
  const firstSunOffset = (7 - dow) % 7;
  const secondSun = 1 + firstSunOffset + 7;
  return ymdToUtcDate(year, 5, secondSun);
}

/** 3rd Sunday in June */
export function fathersDayDateUtc(year: number): Date {
  const jun1 = ymdToUtcDate(year, 6, 1);
  const dow = jun1.getUTCDay();
  const firstSunOffset = (7 - dow) % 7;
  const thirdSun = 1 + firstSunOffset + 14;
  return ymdToUtcDate(year, 6, thirdSun);
}

/** First Monday in September (US Labor Day) */
export function laborDayDateUtc(year: number): Date {
  const sep1 = ymdToUtcDate(year, 9, 1);
  const dow = sep1.getUTCDay();
  const daysUntilMon = (8 - dow) % 7;
  return ymdToUtcDate(year, 9, 1 + daysUntilMon);
}

/** Last Monday in May (US Memorial Day) */
export function memorialDayDateUtc(year: number): Date {
  const may31 = ymdToUtcDate(year, 5, 31);
  const dow = may31.getUTCDay();
  const back = (dow + 6) % 7;
  return ymdToUtcDate(year, 5, 31 - back);
}

function clampCal(v: CalendarVerse): CalendarVerse {
  const ref = clampReferenceToMaxVerseSpan(v.reference, 2) ?? v.reference;
  return { ...v, reference: ref };
}

function pickFromVerses(verses: CalendarVerse[], seed: number): CalendarVerse {
  const v = verses[Math.abs(seed) % verses.length]!;
  return clampCal(v);
}

/**
 * Returns a calendar-mapped verse for this UTC date, or null → use general pool.
 */
export function getCalendarVerseForDate(dateUtc: Date): CalendarVerse | null {
  const { y, m, day } = utcYmd(dateUtc);
  const easter = computeEasterSundayUtc(y);
  const d0 = dateUtc;

  // Fixed month/day (not Dec 1–24 — advent below)
  for (const block of VOTD_FIXED_DATES) {
    if (block.month === m && block.day === day) {
      const seed = y * 10000 + m * 100 + day;
      return pickFromVerses(block.verses, seed);
    }
  }

  // Thanksgiving
  const tg = thanksgivingDateUtc(y);
  if (utcYmd(tg).m === m && utcYmd(tg).day === day) {
    return pickFromVerses(VOTD_THANKSGIVING_VERSES, y + day);
  }

  // Mother's / Father's Day
  const md = mothersDayDateUtc(y);
  if (utcYmd(md).m === m && utcYmd(md).day === day) {
    return pickFromVerses(VOTD_MOTHERS_DAY_VERSES, y);
  }
  const fd = fathersDayDateUtc(y);
  if (utcYmd(fd).m === m && utcYmd(fd).day === day) {
    return pickFromVerses(VOTD_FATHERS_DAY_VERSES, y);
  }

  const mem = memorialDayDateUtc(y);
  if (utcYmd(mem).m === m && utcYmd(mem).day === day) {
    return pickFromVerses(VOTD_MEMORIAL_DAY_VERSES, y);
  }

  const lb = laborDayDateUtc(y);
  if (utcYmd(lb).m === m && utcYmd(lb).day === day) {
    return pickFromVerses(VOTD_LABOR_DAY_VERSES, y);
  }

  // Easter-relative (includes Good Friday, Palm Sunday, Pentecost, etc.)
  const offset = daysBetweenUtc(easter, d0);
  for (const row of VOTD_EASTER_RELATIVE) {
    if (row.offsetFromEaster === offset) {
      return pickFromVerses(row.verses, offset + y);
    }
  }

  // Advent Dec 1–24
  if (m === 12 && day >= 1 && day <= 24) {
    const idx = day - 1;
    const verse = VOTD_ADVENT_VERSES[idx % VOTD_ADVENT_VERSES.length]!;
    const c = clampCal(verse);
    return {
      reference: c.reference,
      label: `Advent — Dec ${day}`,
    };
  }

  // Lent: day after Ash Wednesday through day before Palm Sunday (exclusive of Holy Week handled by easter-relative)
  const ashWednesday = new Date(easter);
  ashWednesday.setUTCDate(easter.getUTCDate() - 46);
  const lentStart = new Date(ashWednesday);
  lentStart.setUTCDate(ashWednesday.getUTCDate() + 1); // day after Ash Wed (Ash Wed uses easter-relative)
  const palmSunday = new Date(easter);
  palmSunday.setUTCDate(easter.getUTCDate() - 7);
  const t = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate());
  if (t >= Date.UTC(lentStart.getUTCFullYear(), lentStart.getUTCMonth(), lentStart.getUTCDate()) &&
      t < Date.UTC(palmSunday.getUTCFullYear(), palmSunday.getUTCMonth(), palmSunday.getUTCDate())) {
    const lentDays = daysBetweenUtc(lentStart, d0);
    const verse = VOTD_LENT_VERSES[lentDays % VOTD_LENT_VERSES.length]!;
    const c = clampCal(verse);
    return {
      reference: c.reference,
      label: 'Lent',
    };
  }

  return null;
}

/** True if getCalendarVerseForDate would return non-null */
export function isCalendarHolidayDate(dateUtc: Date): boolean {
  return getCalendarVerseForDate(dateUtc) !== null;
}
