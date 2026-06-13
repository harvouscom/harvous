/**
 * Liturgical season for the Home greeting — pure, date-driven, no integration.
 * Returns a notable season/day or null (Ordinary Time renders nothing), so the
 * greeting stays quiet unless the church calendar has something to mark.
 */

export type LiturgicalKey =
  | 'advent'
  | 'christmas'
  | 'epiphany'
  | 'lent'
  | 'holy-week'
  | 'easter'
  | 'pentecost';

export interface LiturgicalSeason {
  key: LiturgicalKey;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(year: number, month1: number, day: number): number {
  // month1 is 1-based; build at local midnight so comparisons are calendar-day exact.
  return Math.floor(new Date(year, month1 - 1, day).getTime() / DAY_MS);
}

function localDayIndex(date: Date): number {
  return Math.floor(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / DAY_MS,
  );
}

/** Easter Sunday (Gregorian) via the Anonymous Gregorian "computus". */
export function computeEaster(year: number): { month: number; day: number } {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

/** Advent begins on the 4th Sunday before Christmas Day. */
function adventStartIndex(year: number): number {
  const christmasDow = new Date(year, 11, 25).getDay(); // 0 = Sunday
  // 4th Advent Sunday is the Sunday strictly before Christmas (Dec 18 when Dec 25 is Sunday).
  const fourthAdventSunday = dayIndex(year, 12, 25) - (christmasDow === 0 ? 7 : christmasDow);
  return fourthAdventSunday - 21;
}

/**
 * The notable season/day for `date`, or null during Ordinary Time.
 * Christmas season spans the year boundary; Easter-derived seasons use the
 * Easter of the date's own year (Lent/Easter never cross New Year).
 */
export function currentLiturgicalSeason(date: Date): LiturgicalSeason | null {
  const year = date.getFullYear();
  const today = localDayIndex(date);

  // ── Christmas / Epiphany (fixed dates, span the year boundary) ──
  if (date.getMonth() === 11 && date.getDate() === 25) {
    return { key: 'christmas', label: 'Christmas Day' };
  }
  const dec25 = dayIndex(year, 12, 25);
  const dec31 = dayIndex(year, 12, 31);
  if (today >= dec25 && today <= dec31) return { key: 'christmas', label: 'Christmas season' };
  const jan1 = dayIndex(year, 1, 1);
  const jan5 = dayIndex(year, 1, 5);
  if (today >= jan1 && today <= jan5) return { key: 'christmas', label: 'Christmas season' };
  if (today === dayIndex(year, 1, 6)) return { key: 'epiphany', label: 'Epiphany' };

  // ── Easter-derived seasons (Lent → Holy Week → Eastertide → Pentecost) ──
  const easter = computeEaster(year);
  const easterIdx = dayIndex(year, easter.month, easter.day);
  const ashWednesday = easterIdx - 46;
  const palmSunday = easterIdx - 7;
  const pentecost = easterIdx + 49;

  if (today >= ashWednesday && today < palmSunday) {
    if (today === ashWednesday) return { key: 'lent', label: 'Ash Wednesday' };
    return { key: 'lent', label: 'Lent' };
  }
  if (today >= palmSunday && today < easterIdx) {
    if (today === palmSunday) return { key: 'holy-week', label: 'Palm Sunday' };
    if (today === easterIdx - 3) return { key: 'holy-week', label: 'Maundy Thursday' };
    if (today === easterIdx - 2) return { key: 'holy-week', label: 'Good Friday' };
    return { key: 'holy-week', label: 'Holy Week' };
  }
  if (today === easterIdx) return { key: 'easter', label: 'Easter Sunday' };
  if (today > easterIdx && today < pentecost) {
    if (today === easterIdx + 39) return { key: 'easter', label: 'Ascension' };
    return { key: 'easter', label: 'Easter season' };
  }
  if (today === pentecost) return { key: 'pentecost', label: 'Pentecost' };

  // ── Advent (Christmas's run-up; computed near year end) ──
  const adventStart = adventStartIndex(year);
  const dec24 = dayIndex(year, 12, 24);
  if (today >= adventStart && today <= dec24) {
    const week = Math.min(4, Math.floor((today - adventStart) / 7) + 1);
    return { key: 'advent', label: `${ordinal(week)} week of Advent` };
  }

  return null;
}
