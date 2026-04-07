/**
 * Calendar-mapped VOTD verses — Christian liturgical + secular meaningful days.
 * Resolution (dates → verse) lives in server/utils/votd-calendar.ts
 */

export type CalendarVerse = {
  reference: string;
  label: string;
};

/** Month 1–12, day 1–31 (civil calendar, America-oriented secular dates) */
export type FixedCalendarEntry = {
  month: number;
  day: number;
  verses: CalendarVerse[];
};

/** Days relative to Easter Sunday (0 = Easter); negative = before */
export type EasterRelativeEntry = {
  offsetFromEaster: number;
  verses: CalendarVerse[];
};

export const VOTD_FIXED_DATES: FixedCalendarEntry[] = [
  {
    month: 1,
    day: 1,
    verses: [
      { reference: 'Lamentations 3:22-23', label: "New Year's Day" },
      { reference: 'Isaiah 43:18-19', label: "New Year's Day" },
    ],
  },
  {
    month: 2,
    day: 14,
    verses: [{ reference: '1 Corinthians 13:4-7', label: "Valentine's Day" }],
  },
  {
    month: 5,
    day: 1,
    verses: [{ reference: 'Proverbs 31:28', label: "May Day" }],
  },
  {
    month: 7,
    day: 4,
    verses: [{ reference: 'Psalm 33:12', label: 'Independence Day (US)' }],
  },
  {
    month: 11,
    day: 1,
    verses: [{ reference: 'Psalm 100:1-5', label: 'All Saints / November' }],
  },
  {
    month: 12,
    day: 25,
    verses: [
      { reference: 'Luke 2:10-11', label: 'Christmas Day' },
      { reference: 'John 1:14', label: 'Christmas Day' },
    ],
  },
  {
    month: 12,
    day: 26,
    verses: [{ reference: 'Matthew 2:10-11', label: 'Christmas week' }],
  },
  {
    month: 12,
    day: 31,
    verses: [{ reference: 'Psalm 90:12', label: "New Year's Eve" }],
  },
];

/** Thanksgiving = 4th Thursday in November — handled in utils, verses here */
export const VOTD_THANKSGIVING_VERSES: CalendarVerse[] = [
  { reference: '1 Thessalonians 5:16-18', label: 'Thanksgiving' },
  { reference: 'Psalm 100:4-5', label: 'Thanksgiving' },
  { reference: 'Philippians 4:6', label: 'Thanksgiving' },
];

/** Mother's Day = 2nd Sunday May — handled in utils */
export const VOTD_MOTHERS_DAY_VERSES: CalendarVerse[] = [
  { reference: 'Proverbs 31:25-26', label: "Mother's Day" },
  { reference: 'Isaiah 66:13', label: "Mother's Day" },
];

/** US Memorial Day = last Monday in May */
export const VOTD_MEMORIAL_DAY_VERSES: CalendarVerse[] = [
  { reference: 'John 15:13', label: 'Memorial Day (US)' },
  { reference: 'Psalm 116:15', label: 'Memorial Day (US)' },
];

/** US Labor Day = first Monday in September */
export const VOTD_LABOR_DAY_VERSES: CalendarVerse[] = [
  { reference: 'Ecclesiastes 3:1', label: 'Labor Day (US)' },
  { reference: 'Colossians 3:23-24', label: 'Labor Day (US)' },
];

/** Father's Day = 3rd Sunday June */
export const VOTD_FATHERS_DAY_VERSES: CalendarVerse[] = [
  { reference: 'Proverbs 20:7', label: "Father's Day" },
  { reference: 'Psalm 128:3-4', label: "Father's Day" },
];

export const VOTD_EASTER_RELATIVE: EasterRelativeEntry[] = [
  { offsetFromEaster: -46, verses: [{ reference: 'Joel 2:12-13', label: 'Ash Wednesday' }] },
  { offsetFromEaster: -7, verses: [{ reference: 'Matthew 21:9', label: 'Palm Sunday' }] },
  { offsetFromEaster: -3, verses: [{ reference: 'Matthew 26:26-28', label: 'Maundy Thursday' }] },
  { offsetFromEaster: -2, verses: [{ reference: 'John 13:34-35', label: 'Good Friday eve' }] },
  { offsetFromEaster: -1, verses: [{ reference: 'Isaiah 53:5', label: 'Good Friday' }] },
  { offsetFromEaster: 0, verses: [{ reference: 'Matthew 28:5-6', label: 'Easter Sunday' }, { reference: '1 Corinthians 15:3-4', label: 'Easter Sunday' }] },
  { offsetFromEaster: 1, verses: [{ reference: 'Luke 24:32', label: 'Easter Monday' }] },
  { offsetFromEaster: 39, verses: [{ reference: 'Acts 1:8', label: 'Ascension Day' }] },
  { offsetFromEaster: 49, verses: [{ reference: 'Acts 2:1-4', label: 'Pentecost' }, { reference: 'Acts 2:17-18', label: 'Pentecost' }] },
];

/** One verse per Advent day (Dec 1–24); Dec 25 is Christmas above */
export const VOTD_ADVENT_VERSES: CalendarVerse[] = [
  { reference: 'Isaiah 9:2', label: 'Advent' },
  { reference: 'Isaiah 11:1-2', label: 'Advent' },
  { reference: 'Isaiah 40:3', label: 'Advent' },
  { reference: 'Micah 5:2', label: 'Advent' },
  { reference: 'Zechariah 9:9', label: 'Advent' },
  { reference: 'Malachi 3:1', label: 'Advent' },
  { reference: 'Luke 1:30-31', label: 'Advent' },
  { reference: 'Luke 1:46-47', label: 'Advent' },
  { reference: 'Matthew 1:21', label: 'Advent' },
  { reference: 'John 1:9', label: 'Advent' },
  { reference: 'Isaiah 7:14', label: 'Advent' },
  { reference: 'Isaiah 60:1', label: 'Advent' },
  { reference: 'Psalm 130:5-6', label: 'Advent' },
  { reference: 'Romans 13:12', label: 'Advent' },
  { reference: 'Isaiah 52:7', label: 'Advent' },
  { reference: 'Isaiah 61:1', label: 'Advent' },
  { reference: 'Luke 2:10', label: 'Advent' },
  { reference: 'Isaiah 42:1', label: 'Advent' },
  { reference: 'Isaiah 49:6', label: 'Advent' },
  { reference: 'Isaiah 55:1', label: 'Advent' },
  { reference: 'Psalm 72:1', label: 'Advent' },
  { reference: 'Jeremiah 33:14-15', label: 'Advent' },
  { reference: 'Zechariah 6:12', label: 'Advent' },
  { reference: 'Haggai 2:9', label: 'Advent' },
];

/** Lent: Ash Wednesday + spread; Holy Week gets easter-relative above */
export const VOTD_LENT_VERSES: CalendarVerse[] = [
  { reference: 'Psalm 51:1-2', label: 'Lent' },
  { reference: 'Matthew 4:17', label: 'Lent' },
  { reference: 'Joel 2:12', label: 'Lent' },
  { reference: 'Isaiah 58:6-7', label: 'Lent' },
  { reference: 'Romans 12:1', label: 'Lent' },
  { reference: 'Psalm 139:23-24', label: 'Lent' },
  { reference: 'Hosea 6:1', label: 'Lent' },
  { reference: '2 Corinthians 7:10', label: 'Lent' },
  { reference: 'James 4:8-10', label: 'Lent' },
  { reference: '1 Peter 5:6', label: 'Lent' },
];
