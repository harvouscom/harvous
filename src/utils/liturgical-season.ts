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
  | 'pentecost'
  /** Catholic only: the weeks between the seasons, which the Church counts. */
  | 'ordinary'
  /** Catholic only: a solemnity or holy day that names the day itself. */
  | 'solemnity';

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
  // 11th–13th, then 21st, 22nd, 23rd: Ordinary Time counts past ten.
  const teen = n % 100 >= 11 && n % 100 <= 13;
  if (!teen && n % 10 === 1) return `${n}st`;
  if (!teen && n % 10 === 2) return `${n}nd`;
  if (!teen && n % 10 === 3) return `${n}rd`;
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
 *
 * With `catholic` (the reader's tradition, src/utils/tradition.ts), the Roman calendar's names:
 * see `catholicLiturgicalSeason`.
 */
export function currentLiturgicalSeason(
  date: Date,
  options?: { catholic?: boolean },
): LiturgicalSeason | null {
  if (options?.catholic) return catholicLiturgicalSeason(date);
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

// ─── The Roman calendar (Catholic readers) ───────────────────────────────────

const WEEKDAY_SUNDAY = 0;

/** Epiphany as US dioceses keep it: the Sunday between January 2 and 8. */
function epiphanySundayIndex(year: number): number {
  const jan2 = dayIndex(year, 1, 2);
  const dow = new Date(year, 0, 2).getDay();
  return jan2 + ((7 - dow) % 7);
}

/**
 * The Baptism of the Lord ends the Christmas season: the Sunday after Epiphany, or the Monday
 * after it when Epiphany falls on January 7 or 8.
 */
function baptismOfTheLordIndex(year: number): number {
  const epiphany = epiphanySundayIndex(year);
  return epiphany >= dayIndex(year, 1, 7) ? epiphany + 1 : epiphany + 7;
}

/** Days the US keeps as solemnities by date; they name the day, whatever the season. */
const FIXED_SOLEMNITIES: Array<[month: number, day: number, label: string]> = [
  [1, 1, 'Mary, Mother of God'],
  [3, 19, 'St. Joseph'],
  [3, 25, 'The Annunciation'],
  [6, 29, 'Sts. Peter and Paul'],
  [8, 15, 'The Assumption'],
  [11, 1, 'All Saints'],
  [11, 2, 'All Souls'],
  [12, 8, 'The Immaculate Conception'],
];

/**
 * The Catholic calendar's name for `date` — never null, because the Church counts the weeks
 * between the seasons too ("28th week in Ordinary Time").
 *
 * Differences from the Protestant labels: Holy Thursday rather than Maundy Thursday; Christmas
 * runs to the Baptism of the Lord; Epiphany on its US Sunday; Trinity Sunday, Corpus Christi
 * (its US Sunday) and Christ the King; and the fixed-date solemnities above. Feasts that move
 * when they collide (St. Joseph in Holy Week, say) keep their date here: a greeting, not an Ordo.
 */
export function catholicLiturgicalSeason(date: Date): LiturgicalSeason {
  const year = date.getFullYear();
  const today = localDayIndex(date);
  const isSunday = date.getDay() === WEEKDAY_SUNDAY;

  const easter = computeEaster(year);
  const easterIdx = dayIndex(year, easter.month, easter.day);
  const ashWednesday = easterIdx - 46;
  const palmSunday = easterIdx - 7;
  const pentecost = easterIdx + 49;
  const adventStart = adventStartIndex(year);

  // Holy Week and the Triduum outrank everything.
  if (today >= palmSunday && today <= easterIdx) {
    if (today === palmSunday) return { key: 'holy-week', label: 'Palm Sunday' };
    if (today === easterIdx - 3) return { key: 'holy-week', label: 'Holy Thursday' };
    if (today === easterIdx - 2) return { key: 'holy-week', label: 'Good Friday' };
    if (today === easterIdx - 1) return { key: 'holy-week', label: 'Holy Saturday' };
    if (today === easterIdx) return { key: 'easter', label: 'Easter Sunday' };
    return { key: 'holy-week', label: 'Holy Week' };
  }

  if (date.getMonth() === 11 && date.getDate() === 25) return { key: 'christmas', label: 'Christmas Day' };

  // Fixed-date solemnities (not on a Sunday of Advent, Lent or Easter, which outrank them).
  const fixed = FIXED_SOLEMNITIES.find(([m, d]) => date.getMonth() + 1 === m && date.getDate() === d);
  const inPrivilegedSeason = (today >= adventStart && today < dayIndex(year, 12, 25)) ||
    (today >= ashWednesday && today < pentecost);
  if (fixed && !(isSunday && inPrivilegedSeason)) return { key: 'solemnity', label: fixed[2] };

  // Christmas season: Dec 25 – the Baptism of the Lord.
  if (today >= dayIndex(year, 12, 25)) return { key: 'christmas', label: 'Christmas season' };
  const epiphany = epiphanySundayIndex(year);
  const baptism = baptismOfTheLordIndex(year);
  if (today === epiphany) return { key: 'epiphany', label: 'Epiphany' };
  if (today === baptism) return { key: 'christmas', label: 'The Baptism of the Lord' };
  if (today < baptism) return { key: 'christmas', label: 'Christmas season' };

  // Lent.
  if (today >= ashWednesday && today < palmSunday) {
    if (today === ashWednesday) return { key: 'lent', label: 'Ash Wednesday' };
    const week = today < ashWednesday + 4 ? 0 : Math.floor((today - (ashWednesday + 4)) / 7) + 1;
    return { key: 'lent', label: week === 0 ? 'Lent' : `${ordinal(week)} week of Lent` };
  }

  // Easter season, to Pentecost.
  if (today > easterIdx && today <= pentecost) {
    if (today === easterIdx + 7) return { key: 'easter', label: 'Divine Mercy Sunday' };
    if (today === easterIdx + 39) return { key: 'easter', label: 'Ascension' };
    if (today === pentecost) return { key: 'pentecost', label: 'Pentecost' };
    const week = Math.floor((today - easterIdx) / 7) + 1;
    return { key: 'easter', label: `${ordinal(week)} week of Easter` };
  }

  // Advent.
  if (today >= adventStart) {
    const week = Math.min(4, Math.floor((today - adventStart) / 7) + 1);
    return { key: 'advent', label: `${ordinal(week)} week of Advent` };
  }

  // Ordinary Time, part one (after the Baptism) and part two (after Pentecost).
  if (today === pentecost + 7) return { key: 'solemnity', label: 'Trinity Sunday' };
  if (today === pentecost + 14) return { key: 'solemnity', label: 'Corpus Christi' };
  if (today === adventStart - 7) return { key: 'solemnity', label: 'Christ the King' };

  let week: number;
  if (today < ashWednesday) {
    // Week 1 begins the day after the Baptism; its Sunday anchor is the Baptism Sunday, or the
    // Epiphany Sunday when the Baptism moved to Monday.
    const anchor = baptism === epiphany + 7 ? baptism : epiphany;
    week = Math.floor((today - anchor) / 7) + 1;
  } else {
    // Counted back from Advent: the last week before it is the 34th.
    week = 34 - Math.floor((adventStart - today - 1) / 7);
  }
  return {
    key: 'ordinary',
    label: isSunday ? `${ordinal(week)} Sunday in Ordinary Time` : `${ordinal(week)} week in Ordinary Time`,
  };
}

