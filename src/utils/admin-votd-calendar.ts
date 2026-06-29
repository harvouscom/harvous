const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export type UtcMonthBounds = {
  month: string;
  year: number;
  monthIndex: number;
  startDate: string;
  endDate: string;
  dayCount: number;
};

export type MonthGridCell = {
  date: string | null;
  inMonth: boolean;
};

export function utcTodayMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function utcTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseUtcMonth(month: string): { year: number; monthIndex: number } | null {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1]!, 10);
  const monthIndex = parseInt(m[2]!, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}

export function utcMonthBounds(month: string): UtcMonthBounds | null {
  const parsed = parseUtcMonth(month);
  if (!parsed) return null;
  const { year, monthIndex } = parsed;
  const start = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0));
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const dayCount = end.getUTCDate();
  return { month, year, monthIndex, startDate, endDate, dayCount };
}

export function shiftUtcMonth(month: string, delta: -1 | 1): string | null {
  const parsed = parseUtcMonth(month);
  if (!parsed) return null;
  const d = new Date(Date.UTC(parsed.year, parsed.monthIndex + delta, 1, 12, 0, 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatUtcMonthLabel(month: string): string {
  const parsed = parseUtcMonth(month);
  if (!parsed) return month;
  return `${MONTHS_LONG[parsed.monthIndex]} ${parsed.year}`;
}

/** Sunday-start month grid with leading/trailing padding cells (6 rows max). */
export function buildMonthGrid(month: string): MonthGridCell[] {
  const bounds = utcMonthBounds(month);
  if (!bounds) return [];

  const firstDay = new Date(`${bounds.startDate}T12:00:00.000Z`);
  const leadingEmpty = firstDay.getUTCDay();
  const cells: MonthGridCell[] = [];

  for (let i = 0; i < leadingEmpty; i++) {
    cells.push({ date: null, inMonth: false });
  }

  for (let day = 1; day <= bounds.dayCount; day++) {
    const date = `${bounds.month}-${String(day).padStart(2, '0')}`;
    cells.push({ date, inMonth: true });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, inMonth: false });
  }

  return cells;
}

/** Abbreviate scripture reference for calendar cell (e.g. Psalm 23:1-3 → Ps 23:1-3). */
export function abbreviateScriptureReference(reference: string): string {
  const bookAbbrevs: Record<string, string> = {
    Genesis: 'Gen',
    Exodus: 'Ex',
    Leviticus: 'Lev',
    Numbers: 'Num',
    Deuteronomy: 'Deut',
    Joshua: 'Josh',
    Judges: 'Judg',
    Ruth: 'Ruth',
    '1 Samuel': '1 Sam',
    '2 Samuel': '2 Sam',
    '1 Kings': '1 Kgs',
    '2 Kings': '2 Kgs',
    '1 Chronicles': '1 Chr',
    '2 Chronicles': '2 Chr',
    Ezra: 'Ezra',
    Nehemiah: 'Neh',
    Esther: 'Esth',
    Job: 'Job',
    Psalms: 'Ps',
    Psalm: 'Ps',
    Proverbs: 'Prov',
    Ecclesiastes: 'Eccl',
    'Song of Solomon': 'Song',
    Isaiah: 'Isa',
    Jeremiah: 'Jer',
    Lamentations: 'Lam',
    Ezekiel: 'Ezek',
    Daniel: 'Dan',
    Hosea: 'Hos',
    Joel: 'Joel',
    Amos: 'Amos',
    Obadiah: 'Obad',
    Jonah: 'Jonah',
    Micah: 'Mic',
    Nahum: 'Nah',
    Habakkuk: 'Hab',
    Zephaniah: 'Zeph',
    Haggai: 'Hag',
    Zechariah: 'Zech',
    Malachi: 'Mal',
    Matthew: 'Matt',
    Mark: 'Mark',
    Luke: 'Luke',
    John: 'John',
    Acts: 'Acts',
    Romans: 'Rom',
    '1 Corinthians': '1 Cor',
    '2 Corinthians': '2 Cor',
    Galatians: 'Gal',
    Ephesians: 'Eph',
    Philippians: 'Phil',
    Colossians: 'Col',
    '1 Thessalonians': '1 Thess',
    '2 Thessalonians': '2 Thess',
    '1 Timothy': '1 Tim',
    '2 Timothy': '2 Tim',
    Titus: 'Titus',
    Philemon: 'Phlm',
    Hebrews: 'Heb',
    James: 'Jas',
    '1 Peter': '1 Pet',
    '2 Peter': '2 Pet',
    '1 John': '1 John',
    '2 John': '2 John',
    '3 John': '3 John',
    Jude: 'Jude',
    Revelation: 'Rev',
  };

  for (const [book, abbr] of Object.entries(bookAbbrevs)) {
    if (reference.startsWith(`${book} `)) {
      return `${abbr} ${reference.slice(book.length + 1)}`;
    }
  }
  return reference;
}

export const VOTD_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
