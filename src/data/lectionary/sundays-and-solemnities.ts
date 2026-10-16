/**
 * The Lectionary for Mass (USA, 1998/2002): citations for Sundays, solemnities and feasts of the
 * Lord. Citations only — the words come from Harvous's own corpus, in the reader's translation.
 *
 * Written from the Lectionary's order of readings (citations are facts), not copied from any
 * site's table; checked against the Lectionary indexes and the NABRE text. See
 * docs/future/LECTIONARY_SOURCE.md for why, and for what is not here yet (weekdays).
 *
 * Each citation is as the Lectionary prints it: NAB numbering, with the a/b/c of half-verses. The
 * Psalms count their titles (Ps 51:3 is the English 51:1), Malachi has three chapters, Joel four.
 * `src/utils/lectionary.ts` turns them into Harvous's English numbering through the NABRE's
 * printed-number map. Where the Lectionary's 1970 Old Testament numbers a verse differently from
 * the NABRE that map describes (Sirach, mostly), `text` gives the Harvous address outright.
 *
 * Where the Lectionary offers a choice ("or"), the first is here: the one most parishes read.
 */

export type LectionarySlot = 'first' | 'psalm' | 'second' | 'gospel';
export type SundayCycle = 'A' | 'B' | 'C';

export interface LectionaryEntry {
  /** The Lectionary's number for the day, for checking against a printed copy. */
  n: number;
  first: string;
  psalm: string;
  second?: string;
  gospel: string;
  /** Harvous addresses for citations the automatic renumbering would place wrongly. */
  text?: Partial<Record<LectionarySlot, string>>;
}

/** Keyed by day, then by Sunday cycle; `all` when every year reads the same. */
export type LectionaryDayReadings = { all: LectionaryEntry } | Record<SundayCycle, LectionaryEntry>;

const e = (
  n: number,
  first: string,
  psalm: string,
  second: string | null,
  gospel: string,
  text?: LectionaryEntry['text'],
): LectionaryEntry => ({ n, first, psalm, ...(second ? { second } : {}), gospel, ...(text ? { text } : {}) });

export const SUNDAYS_AND_SOLEMNITIES: Record<string, LectionaryDayReadings> = {
  // ── Advent ────────────────────────────────────────────────────────────────
  'advent-1': {
    A: e(1, 'Isaiah 2:1-5', 'Psalm 122:1-2, 3-4, 4-5, 6-7, 8-9', 'Romans 13:11-14', 'Matthew 24:37-44'),
    B: e(2, 'Isaiah 63:16b-17, 19b; 64:2-7', 'Psalm 80:2-3, 15-16, 18-19', '1 Corinthians 1:3-9', 'Mark 13:33-37'),
    C: e(3, 'Jeremiah 33:14-16', 'Psalm 25:4-5, 8-9, 10, 14', '1 Thessalonians 3:12—4:2', 'Luke 21:25-28, 34-36'),
  },
  'advent-2': {
    A: e(4, 'Isaiah 11:1-10', 'Psalm 72:1-2, 7-8, 12-13, 17', 'Romans 15:4-9', 'Matthew 3:1-12'),
    B: e(5, 'Isaiah 40:1-5, 9-11', 'Psalm 85:9-10, 11-12, 13-14', '2 Peter 3:8-14', 'Mark 1:1-8'),
    C: e(6, 'Baruch 5:1-9', 'Psalm 126:1-2, 2-3, 4-5, 6', 'Philippians 1:4-6, 8-11', 'Luke 3:1-6'),
  },
  'advent-3': {
    A: e(7, 'Isaiah 35:1-6a, 10', 'Psalm 146:6-7, 8-9, 9-10', 'James 5:7-10', 'Matthew 11:2-11'),
    B: e(8, 'Isaiah 61:1-2a, 10-11', 'Luke 1:46-48, 49-50, 53-54', '1 Thessalonians 5:16-24', 'John 1:6-8, 19-28'),
    C: e(9, 'Zephaniah 3:14-18a', 'Isaiah 12:2-3, 4, 5-6', 'Philippians 4:4-7', 'Luke 3:10-18'),
  },
  'advent-4': {
    A: e(10, 'Isaiah 7:10-14', 'Psalm 24:1-2, 3-4, 5-6', 'Romans 1:1-7', 'Matthew 1:18-24'),
    B: e(11, '2 Samuel 7:1-5, 8b-12, 14a, 16', 'Psalm 89:2-3, 4-5, 27, 29', 'Romans 16:25-27', 'Luke 1:26-38'),
    C: e(12, 'Micah 5:1-4a', 'Psalm 80:2-3, 15-16, 18-19', 'Hebrews 10:5-10', 'Luke 1:39-45'),
  },

  // ── Christmas ─────────────────────────────────────────────────────────────
  /** Mass during the Day. */
  christmas: { all: e(16, 'Isaiah 52:7-10', 'Psalm 98:1, 2-3, 3-4, 5-6', 'Hebrews 1:1-6', 'John 1:1-18') },
  'holy-family': {
    A: e(17, 'Sirach 3:2-6, 12-14', 'Psalm 128:1-2, 3, 4-5', 'Colossians 3:12-21', 'Matthew 2:13-15, 19-23'),
    B: e(17, 'Sirach 3:2-6, 12-14', 'Psalm 128:1-2, 3, 4-5', 'Colossians 3:12-21', 'Luke 2:22-40'),
    C: e(17, 'Sirach 3:2-6, 12-14', 'Psalm 128:1-2, 3, 4-5', 'Colossians 3:12-21', 'Luke 2:41-52'),
  },
  'mary-mother-of-god': {
    all: e(18, 'Numbers 6:22-27', 'Psalm 67:2-3, 5, 6, 8', 'Galatians 4:4-7', 'Luke 2:16-21'),
  },
  epiphany: {
    all: e(20, 'Isaiah 60:1-6', 'Psalm 72:1-2, 7-8, 10-11, 12-13', 'Ephesians 3:2-3a, 5-6', 'Matthew 2:1-12'),
  },
  'baptism-of-the-lord': {
    A: e(21, 'Isaiah 42:1-4, 6-7', 'Psalm 29:1-2, 3-4, 3, 9-10', 'Acts 10:34-38', 'Matthew 3:13-17'),
    B: e(21, 'Isaiah 42:1-4, 6-7', 'Psalm 29:1-2, 3-4, 3, 9-10', 'Acts 10:34-38', 'Mark 1:7-11'),
    C: e(21, 'Isaiah 42:1-4, 6-7', 'Psalm 29:1-2, 3-4, 3, 9-10', 'Acts 10:34-38', 'Luke 3:15-16, 21-22'),
  },

  // ── Lent ──────────────────────────────────────────────────────────────────
  'ash-wednesday': {
    all: e(219, 'Joel 2:12-18', 'Psalm 51:3-4, 5-6ab, 12-13, 14, 17', '2 Corinthians 5:20—6:2', 'Matthew 6:1-6, 16-18'),
  },
  'lent-1': {
    A: e(22, 'Genesis 2:7-9; 3:1-7', 'Psalm 51:3-4, 5-6, 12-13, 14, 17', 'Romans 5:12-19', 'Matthew 4:1-11'),
    B: e(23, 'Genesis 9:8-15', 'Psalm 25:4-5, 6-7, 8-9', '1 Peter 3:18-22', 'Mark 1:12-15'),
    C: e(24, 'Deuteronomy 26:4-10', 'Psalm 91:1-2, 10-11, 12-13, 14-15', 'Romans 10:8-13', 'Luke 4:1-13'),
  },
  'lent-2': {
    A: e(25, 'Genesis 12:1-4a', 'Psalm 33:4-5, 18-19, 20, 22', '2 Timothy 1:8b-10', 'Matthew 17:1-9'),
    B: e(26, 'Genesis 22:1-2, 9a, 10-13, 15-18', 'Psalm 116:10, 15, 16-17, 18-19', 'Romans 8:31b-34', 'Mark 9:2-10'),
    C: e(27, 'Genesis 15:5-12, 17-18', 'Psalm 27:1, 7-8, 8-9, 13-14', 'Philippians 3:17—4:1', 'Luke 9:28b-36'),
  },
  'lent-3': {
    A: e(28, 'Exodus 17:3-7', 'Psalm 95:1-2, 6-7, 8-9', 'Romans 5:1-2, 5-8', 'John 4:5-42'),
    B: e(29, 'Exodus 20:1-17', 'Psalm 19:8, 9, 10, 11', '1 Corinthians 1:22-25', 'John 2:13-25'),
    C: e(30, 'Exodus 3:1-8a, 13-15', 'Psalm 103:1-2, 3-4, 6-7, 8, 11', '1 Corinthians 10:1-6, 10-12', 'Luke 13:1-9'),
  },
  'lent-4': {
    A: e(31, '1 Samuel 16:1b, 6-7, 10-13a', 'Psalm 23:1-3a, 3b-4, 5, 6', 'Ephesians 5:8-14', 'John 9:1-41'),
    B: e(32, '2 Chronicles 36:14-16, 19-23', 'Psalm 137:1-2, 3, 4-5, 6', 'Ephesians 2:4-10', 'John 3:14-21'),
    C: e(33, 'Joshua 5:9a, 10-12', 'Psalm 34:2-3, 4-5, 6-7', '2 Corinthians 5:17-21', 'Luke 15:1-3, 11-32'),
  },
  'lent-5': {
    A: e(34, 'Ezekiel 37:12-14', 'Psalm 130:1-2, 3-4, 5-6, 7-8', 'Romans 8:8-11', 'John 11:1-45'),
    B: e(35, 'Jeremiah 31:31-34', 'Psalm 51:3-4, 12-13, 14-15', 'Hebrews 5:7-9', 'John 12:20-33'),
    C: e(36, 'Isaiah 43:16-21', 'Psalm 126:1-2, 2-3, 4-5, 6', 'Philippians 3:8-14', 'John 8:1-11'),
  },

  // ── Holy Week and the Triduum ─────────────────────────────────────────────
  /** At the Mass; the Gospel is the Passion. */
  'palm-sunday': {
    A: e(37, 'Isaiah 50:4-7', 'Psalm 22:8-9, 17-18, 19-20, 23-24', 'Philippians 2:6-11', 'Matthew 26:14—27:66'),
    B: e(38, 'Isaiah 50:4-7', 'Psalm 22:8-9, 17-18, 19-20, 23-24', 'Philippians 2:6-11', 'Mark 14:1—15:47'),
    C: e(38, 'Isaiah 50:4-7', 'Psalm 22:8-9, 17-18, 19-20, 23-24', 'Philippians 2:6-11', 'Luke 22:14—23:56'),
  },
  /** Evening Mass of the Lord's Supper. */
  'holy-thursday': {
    all: e(39, 'Exodus 12:1-8, 11-14', 'Psalm 116:12-13, 15-16bc, 17-18', '1 Corinthians 11:23-26', 'John 13:1-15'),
  },
  'good-friday': {
    all: e(40, 'Isaiah 52:13—53:12', 'Psalm 31:2, 6, 12-13, 15-16, 17, 25', 'Hebrews 4:14-16; 5:7-9', 'John 18:1—19:42'),
  },

  // ── Easter ────────────────────────────────────────────────────────────────
  /** Mass during the Day. */
  easter: {
    all: e(42, 'Acts 10:34a, 37-43', 'Psalm 118:1-2, 16-17, 22-23', 'Colossians 3:1-4', 'John 20:1-9'),
  },
  'easter-2': {
    A: e(43, 'Acts 2:42-47', 'Psalm 118:2-4, 13-15, 22-24', '1 Peter 1:3-9', 'John 20:19-31'),
    B: e(44, 'Acts 4:32-35', 'Psalm 118:2-4, 13-15, 22-24', '1 John 5:1-6', 'John 20:19-31'),
    C: e(45, 'Acts 5:12-16', 'Psalm 118:2-4, 13-15, 22-24', 'Revelation 1:9-11a, 12-13, 17-19', 'John 20:19-31'),
  },
  'easter-3': {
    A: e(46, 'Acts 2:14, 22-33', 'Psalm 16:1-2, 5, 7-8, 9-10, 11', '1 Peter 1:17-21', 'Luke 24:13-35'),
    B: e(47, 'Acts 3:13-15, 17-19', 'Psalm 4:2, 4, 7-8, 9', '1 John 2:1-5a', 'Luke 24:35-48'),
    C: e(48, 'Acts 5:27-32, 40b-41', 'Psalm 30:2, 4, 5-6, 11-12, 13', 'Revelation 5:11-14', 'John 21:1-19'),
  },
  'easter-4': {
    A: e(49, 'Acts 2:14a, 36-41', 'Psalm 23:1-3a, 3b-4, 5, 6', '1 Peter 2:20b-25', 'John 10:1-10'),
    B: e(50, 'Acts 4:8-12', 'Psalm 118:1, 8-9, 21-23, 26, 28, 29', '1 John 3:1-2', 'John 10:11-18'),
    C: e(51, 'Acts 13:14, 43-52', 'Psalm 100:1-2, 3, 5', 'Revelation 7:9, 14b-17', 'John 10:27-30'),
  },
  'easter-5': {
    A: e(52, 'Acts 6:1-7', 'Psalm 33:1-2, 4-5, 18-19', '1 Peter 2:4-9', 'John 14:1-12'),
    B: e(53, 'Acts 9:26-31', 'Psalm 22:26-27, 28, 30, 31-32', '1 John 3:18-24', 'John 15:1-8'),
    C: e(54, 'Acts 14:21-27', 'Psalm 145:8-9, 10-11, 12-13', 'Revelation 21:1-5a', 'John 13:31-33a, 34-35'),
  },
  'easter-6': {
    A: e(55, 'Acts 8:5-8, 14-17', 'Psalm 66:1-3, 4-5, 6-7, 16, 20', '1 Peter 3:15-18', 'John 14:15-21'),
    B: e(56, 'Acts 10:25-26, 34-35, 44-48', 'Psalm 98:1, 2-3, 3-4', '1 John 4:7-10', 'John 15:9-17'),
    C: e(57, 'Acts 15:1-2, 22-29', 'Psalm 67:2-3, 5, 6, 8', 'Revelation 21:10-14, 22-23', 'John 14:23-29'),
  },
  /** On the Seventh Sunday of Easter, as most US provinces keep it. */
  ascension: {
    A: e(58, 'Acts 1:1-11', 'Psalm 47:2-3, 6-7, 8-9', 'Ephesians 1:17-23', 'Matthew 28:16-20'),
    B: e(58, 'Acts 1:1-11', 'Psalm 47:2-3, 6-7, 8-9', 'Ephesians 1:17-23', 'Mark 16:15-20'),
    C: e(58, 'Acts 1:1-11', 'Psalm 47:2-3, 6-7, 8-9', 'Ephesians 1:17-23', 'Luke 24:46-53'),
  },
  /** Mass during the Day. */
  pentecost: {
    all: e(63, 'Acts 2:1-11', 'Psalm 104:1, 24, 29-30, 31, 34', '1 Corinthians 12:3b-7, 12-13', 'John 20:19-23'),
  },

  // ── Solemnities of the Lord in Ordinary Time ──────────────────────────────
  trinity: {
    A: e(164, 'Exodus 34:4b-6, 8-9', 'Daniel 3:52, 53, 54, 55, 56', '2 Corinthians 13:11-13', 'John 3:16-18'),
    B: e(165, 'Deuteronomy 4:32-34, 39-40', 'Psalm 33:4-5, 6, 9, 18-19, 20, 22', 'Romans 8:14-17', 'Matthew 28:16-20'),
    C: e(166, 'Proverbs 8:22-31', 'Psalm 8:4-5, 6-7, 8-9', 'Romans 5:1-5', 'John 16:12-15'),
  },
  'corpus-christi': {
    A: e(167, 'Deuteronomy 8:2-3, 14b-16a', 'Psalm 147:12-13, 14-15, 19-20', '1 Corinthians 10:16-17', 'John 6:51-58'),
    B: e(168, 'Exodus 24:3-8', 'Psalm 116:12-13, 15-16, 17-18', 'Hebrews 9:11-15', 'Mark 14:12-16, 22-26'),
    C: e(169, 'Genesis 14:18-20', 'Psalm 110:1, 2, 3, 4', '1 Corinthians 11:23-26', 'Luke 9:11b-17'),
  },
  'sacred-heart': {
    A: e(170, 'Deuteronomy 7:6-11', 'Psalm 103:1-2, 3-4, 6-7, 8, 10', '1 John 4:7-16', 'Matthew 11:25-30'),
    B: e(171, 'Hosea 11:1, 3-4, 8c-9', 'Isaiah 12:2-3, 4, 5-6', 'Ephesians 3:8-12, 14-19', 'John 19:31-37'),
    C: e(172, 'Ezekiel 34:11-16', 'Psalm 23:1-3a, 3b-4, 5, 6', 'Romans 5:5b-11', 'Luke 15:3-7'),
  },
  'christ-the-king': {
    A: e(160, 'Ezekiel 34:11-12, 15-17', 'Psalm 23:1-2, 2-3, 5-6', '1 Corinthians 15:20-26, 28', 'Matthew 25:31-46'),
    B: e(161, 'Daniel 7:13-14', 'Psalm 93:1, 1-2, 5', 'Revelation 1:5-8', 'John 18:33b-37'),
    C: e(162, '2 Samuel 5:1-3', 'Psalm 122:1-2, 3-4, 4-5', 'Colossians 1:12-20', 'Luke 23:35-43'),
  },

  // ── Sundays in Ordinary Time ──────────────────────────────────────────────
  'ordinary-2': {
    A: e(64, 'Isaiah 49:3, 5-6', 'Psalm 40:2, 4, 7-8, 8-9, 10', '1 Corinthians 1:1-3', 'John 1:29-34'),
    B: e(65, '1 Samuel 3:3b-10, 19', 'Psalm 40:2, 4, 7-8, 8-9, 10', '1 Corinthians 6:13c-15a, 17-20', 'John 1:35-42'),
    C: e(66, 'Isaiah 62:1-5', 'Psalm 96:1-2, 2-3, 7-8, 9-10', '1 Corinthians 12:4-11', 'John 2:1-11'),
  },
  'ordinary-3': {
    A: e(67, 'Isaiah 8:23—9:3', 'Psalm 27:1, 4, 13-14', '1 Corinthians 1:10-13, 17', 'Matthew 4:12-23'),
    B: e(68, 'Jonah 3:1-5, 10', 'Psalm 25:4-5, 6-7, 8-9', '1 Corinthians 7:29-31', 'Mark 1:14-20'),
    C: e(69, 'Nehemiah 8:2-4a, 5-6, 8-10', 'Psalm 19:8, 9, 10, 15', '1 Corinthians 12:12-30', 'Luke 1:1-4; 4:14-21'),
  },
  'ordinary-4': {
    A: e(70, 'Zephaniah 2:3; 3:12-13', 'Psalm 146:6-7, 8-9, 9-10', '1 Corinthians 1:26-31', 'Matthew 5:1-12a'),
    B: e(71, 'Deuteronomy 18:15-20', 'Psalm 95:1-2, 6-7, 7-9', '1 Corinthians 7:32-35', 'Mark 1:21-28'),
    C: e(72, 'Jeremiah 1:4-5, 17-19', 'Psalm 71:1-2, 3-4, 5-6, 15, 17', '1 Corinthians 12:31—13:13', 'Luke 4:21-30'),
  },
  'ordinary-5': {
    A: e(73, 'Isaiah 58:7-10', 'Psalm 112:4-5, 6-7, 8-9', '1 Corinthians 2:1-5', 'Matthew 5:13-16'),
    B: e(74, 'Job 7:1-4, 6-7', 'Psalm 147:1-2, 3-4, 5-6', '1 Corinthians 9:16-19, 22-23', 'Mark 1:29-39'),
    C: e(75, 'Isaiah 6:1-2a, 3-8', 'Psalm 138:1-2, 2-3, 4-5, 7-8', '1 Corinthians 15:1-11', 'Luke 5:1-11'),
  },
  'ordinary-6': {
    A: e(76, 'Sirach 15:15-20', 'Psalm 119:1-2, 4-5, 17-18, 33-34', '1 Corinthians 2:6-10', 'Matthew 5:17-37'),
    B: e(77, 'Leviticus 13:1-2, 44-46', 'Psalm 32:1-2, 5, 11', '1 Corinthians 10:31—11:1', 'Mark 1:40-45'),
    C: e(78, 'Jeremiah 17:5-8', 'Psalm 1:1-2, 3, 4, 6', '1 Corinthians 15:12, 16-20', 'Luke 6:17, 20-26'),
  },
  'ordinary-7': {
    A: e(79, 'Leviticus 19:1-2, 17-18', 'Psalm 103:1-2, 3-4, 8, 10, 12-13', '1 Corinthians 3:16-23', 'Matthew 5:38-48'),
    B: e(80, 'Isaiah 43:18-19, 21-22, 24b-25', 'Psalm 41:2-3, 4-5, 13-14', '2 Corinthians 1:18-22', 'Mark 2:1-12'),
    C: e(81, '1 Samuel 26:2, 7-9, 12-13, 22-23', 'Psalm 103:1-2, 3-4, 8, 10, 12-13', '1 Corinthians 15:45-49', 'Luke 6:27-38'),
  },
  'ordinary-8': {
    A: e(82, 'Isaiah 49:14-15', 'Psalm 62:2-3, 6-7, 8-9', '1 Corinthians 4:1-5', 'Matthew 6:24-34'),
    B: e(83, 'Hosea 2:16b, 17b, 21-22', 'Psalm 103:1-2, 3-4, 8, 10, 12-13', '2 Corinthians 3:1b-6', 'Mark 2:18-22'),
    C: e(84, 'Sirach 27:4-7', 'Psalm 92:2-3, 13-14, 15-16', '1 Corinthians 15:54-58', 'Luke 6:39-45'),
  },
  'ordinary-9': {
    A: e(85, 'Deuteronomy 11:18, 26-28, 32', 'Psalm 31:2-3, 3-4, 17, 25', 'Romans 3:21-25, 28', 'Matthew 7:21-27'),
    B: e(86, 'Deuteronomy 5:12-15', 'Psalm 81:3-4, 5-6, 6-8, 10-11', '2 Corinthians 4:6-11', 'Mark 2:23—3:6'),
    C: e(87, '1 Kings 8:41-43', 'Psalm 117:1, 2', 'Galatians 1:1-2, 6-10', 'Luke 7:1-10'),
  },
  'ordinary-10': {
    A: e(88, 'Hosea 6:3-6', 'Psalm 50:1, 8, 12-13, 14-15', 'Romans 4:18-25', 'Matthew 9:9-13'),
    B: e(89, 'Genesis 3:9-15', 'Psalm 130:1-2, 3-4, 5-6, 7-8', '2 Corinthians 4:13—5:1', 'Mark 3:20-35'),
    C: e(90, '1 Kings 17:17-24', 'Psalm 30:2, 4, 5-6, 11, 12, 13', 'Galatians 1:11-19', 'Luke 7:11-17'),
  },
  'ordinary-11': {
    A: e(91, 'Exodus 19:2-6a', 'Psalm 100:1-2, 3, 5', 'Romans 5:6-11', 'Matthew 9:36—10:8'),
    B: e(92, 'Ezekiel 17:22-24', 'Psalm 92:2-3, 13-14, 15-16', '2 Corinthians 5:6-10', 'Mark 4:26-34'),
    C: e(93, '2 Samuel 12:7-10, 13', 'Psalm 32:1-2, 5, 7, 11', 'Galatians 2:16, 19-21', 'Luke 7:36—8:3'),
  },
  'ordinary-12': {
    A: e(94, 'Jeremiah 20:10-13', 'Psalm 69:8-10, 14, 17, 33-35', 'Romans 5:12-15', 'Matthew 10:26-33'),
    B: e(95, 'Job 38:1, 8-11', 'Psalm 107:23-24, 25-26, 28-29, 30-31', '2 Corinthians 5:14-17', 'Mark 4:35-41'),
    C: e(96, 'Zechariah 12:10-11; 13:1', 'Psalm 63:2, 3-4, 5-6, 8-9', 'Galatians 3:26-29', 'Luke 9:18-24'),
  },
  'ordinary-13': {
    A: e(97, '2 Kings 4:8-11, 14-16a', 'Psalm 89:2-3, 16-17, 18-19', 'Romans 6:3-4, 8-11', 'Matthew 10:37-42'),
    B: e(98, 'Wisdom 1:13-15; 2:23-24', 'Psalm 30:2, 4, 5-6, 11, 12, 13', '2 Corinthians 8:7, 9, 13-15', 'Mark 5:21-43'),
    C: e(99, '1 Kings 19:16b, 19-21', 'Psalm 16:1-2, 5, 7-8, 9-10, 11', 'Galatians 5:1, 13-18', 'Luke 9:51-62'),
  },
  'ordinary-14': {
    A: e(100, 'Zechariah 9:9-10', 'Psalm 145:1-2, 8-9, 10-11, 13-14', 'Romans 8:9, 11-13', 'Matthew 11:25-30'),
    B: e(101, 'Ezekiel 2:2-5', 'Psalm 123:1-2, 2, 3-4', '2 Corinthians 12:7-10', 'Mark 6:1-6a'),
    C: e(102, 'Isaiah 66:10-14c', 'Psalm 66:1-3, 4-5, 6-7, 16, 20', 'Galatians 6:14-18', 'Luke 10:1-12, 17-20'),
  },
  'ordinary-15': {
    A: e(103, 'Isaiah 55:10-11', 'Psalm 65:10, 11, 12-13, 14', 'Romans 8:18-23', 'Matthew 13:1-23'),
    B: e(104, 'Amos 7:12-15', 'Psalm 85:9-10, 11-12, 13-14', 'Ephesians 1:3-14', 'Mark 6:7-13'),
    C: e(105, 'Deuteronomy 30:10-14', 'Psalm 69:14, 17, 30-31, 33-34, 36, 37', 'Colossians 1:15-20', 'Luke 10:25-37'),
  },
  'ordinary-16': {
    A: e(106, 'Wisdom 12:13, 16-19', 'Psalm 86:5-6, 9-10, 15-16', 'Romans 8:26-27', 'Matthew 13:24-43'),
    B: e(107, 'Jeremiah 23:1-6', 'Psalm 23:1-3, 3-4, 5, 6', 'Ephesians 2:13-18', 'Mark 6:30-34'),
    C: e(108, 'Genesis 18:1-10a', 'Psalm 15:2-3, 3-4, 5', 'Colossians 1:24-28', 'Luke 10:38-42'),
  },
  'ordinary-17': {
    A: e(109, '1 Kings 3:5, 7-12', 'Psalm 119:57, 72, 76-77, 127-128, 129-130', 'Romans 8:28-30', 'Matthew 13:44-52'),
    B: e(110, '2 Kings 4:42-44', 'Psalm 145:10-11, 15-16, 17-18', 'Ephesians 4:1-6', 'John 6:1-15'),
    C: e(111, 'Genesis 18:20-32', 'Psalm 138:1-2, 2-3, 6-7, 7-8', 'Colossians 2:12-14', 'Luke 11:1-13'),
  },
  'ordinary-18': {
    A: e(112, 'Isaiah 55:1-3', 'Psalm 145:8-9, 15-16, 17-18', 'Romans 8:35, 37-39', 'Matthew 14:13-21'),
    B: e(113, 'Exodus 16:2-4, 12-15', 'Psalm 78:3-4, 23-24, 25, 54', 'Ephesians 4:17, 20-24', 'John 6:24-35'),
    C: e(114, 'Ecclesiastes 1:2; 2:21-23', 'Psalm 90:3-4, 5-6, 12-13, 14, 17', 'Colossians 3:1-5, 9-11', 'Luke 12:13-21'),
  },
  'ordinary-19': {
    A: e(115, '1 Kings 19:9a, 11-13a', 'Psalm 85:9, 10, 11-12, 13-14', 'Romans 9:1-5', 'Matthew 14:22-33'),
    B: e(116, '1 Kings 19:4-8', 'Psalm 34:2-3, 4-5, 6-7, 8-9', 'Ephesians 4:30—5:2', 'John 6:41-51'),
    C: e(117, 'Wisdom 18:6-9', 'Psalm 33:1, 12, 18-19, 20-22', 'Hebrews 11:1-2, 8-19', 'Luke 12:32-48'),
  },
  'ordinary-20': {
    A: e(118, 'Isaiah 56:1, 6-7', 'Psalm 67:2-3, 5, 6, 8', 'Romans 11:13-15, 29-32', 'Matthew 15:21-28'),
    B: e(119, 'Proverbs 9:1-6', 'Psalm 34:2-3, 4-5, 6-7', 'Ephesians 5:15-20', 'John 6:51-58'),
    C: e(120, 'Jeremiah 38:4-6, 8-10', 'Psalm 40:2, 3, 4, 18', 'Hebrews 12:1-4', 'Luke 12:49-53'),
  },
  'ordinary-21': {
    A: e(121, 'Isaiah 22:19-23', 'Psalm 138:1-2, 2-3, 6, 8', 'Romans 11:33-36', 'Matthew 16:13-20'),
    B: e(122, 'Joshua 24:1-2a, 15-17, 18b', 'Psalm 34:2-3, 16-17, 18-19, 20-21', 'Ephesians 5:21-32', 'John 6:60-69'),
    C: e(123, 'Isaiah 66:18-21', 'Psalm 117:1, 2', 'Hebrews 12:5-7, 11-13', 'Luke 13:22-30'),
  },
  'ordinary-22': {
    A: e(124, 'Jeremiah 20:7-9', 'Psalm 63:2, 3-4, 5-6, 8-9', 'Romans 12:1-2', 'Matthew 16:21-27'),
    B: e(125, 'Deuteronomy 4:1-2, 6-8', 'Psalm 15:2-3, 3-4, 4-5', 'James 1:17-18, 21b-22, 27', 'Mark 7:1-8, 14-15, 21-23'),
    C: e(126, 'Sirach 3:17-18, 20, 28-29', 'Psalm 68:4-5, 6-7, 10-11', 'Hebrews 12:18-19, 22-24a', 'Luke 14:1, 7-14'),
  },
  'ordinary-23': {
    A: e(127, 'Ezekiel 33:7-9', 'Psalm 95:1-2, 6-7, 8-9', 'Romans 13:8-10', 'Matthew 18:15-20'),
    B: e(128, 'Isaiah 35:4-7a', 'Psalm 146:6-7, 8-9, 9-10', 'James 2:1-5', 'Mark 7:31-37'),
    C: e(129, 'Wisdom 9:13-18b', 'Psalm 90:3-4, 5-6, 12-13, 14, 17', 'Philemon 9-10, 12-17', 'Luke 14:25-33'),
  },
  'ordinary-24': {
    A: e(130, 'Sirach 27:30—28:7', 'Psalm 103:1-2, 3-4, 9-10, 11-12', 'Romans 14:7-9', 'Matthew 18:21-35'),
    B: e(131, 'Isaiah 50:5-9a', 'Psalm 116:1-2, 3-4, 5-6, 8-9', 'James 2:14-18', 'Mark 8:27-35'),
    C: e(132, 'Exodus 32:7-11, 13-14', 'Psalm 51:3-4, 12-13, 17, 19', '1 Timothy 1:12-17', 'Luke 15:1-32'),
  },
  'ordinary-25': {
    A: e(133, 'Isaiah 55:6-9', 'Psalm 145:2-3, 8-9, 17-18', 'Philippians 1:20c-24, 27a', 'Matthew 20:1-16a'),
    B: e(134, 'Wisdom 2:12, 17-20', 'Psalm 54:3-4, 5, 6-8', 'James 3:16—4:3', 'Mark 9:30-37'),
    C: e(135, 'Amos 8:4-7', 'Psalm 113:1-2, 4-6, 7-8', '1 Timothy 2:1-8', 'Luke 16:1-13'),
  },
  'ordinary-26': {
    A: e(136, 'Ezekiel 18:25-28', 'Psalm 25:4-5, 6-7, 8-9', 'Philippians 2:1-11', 'Matthew 21:28-32'),
    B: e(137, 'Numbers 11:25-29', 'Psalm 19:8, 10, 12-13, 14', 'James 5:1-6', 'Mark 9:38-43, 45, 47-48'),
    C: e(138, 'Amos 6:1a, 4-7', 'Psalm 146:7, 8-9, 9-10', '1 Timothy 6:11-16', 'Luke 16:19-31'),
  },
  'ordinary-27': {
    A: e(139, 'Isaiah 5:1-7', 'Psalm 80:9, 12, 13-14, 15-16, 19-20', 'Philippians 4:6-9', 'Matthew 21:33-43'),
    B: e(140, 'Genesis 2:18-24', 'Psalm 128:1-2, 3, 4-5, 6', 'Hebrews 2:9-11', 'Mark 10:2-16'),
    C: e(141, 'Habakkuk 1:2-3; 2:2-4', 'Psalm 95:1-2, 6-7, 8-9', '2 Timothy 1:6-8, 13-14', 'Luke 17:5-10'),
  },
  'ordinary-28': {
    A: e(142, 'Isaiah 25:6-10a', 'Psalm 23:1-3a, 3b-4, 5, 6', 'Philippians 4:12-14, 19-20', 'Matthew 22:1-14'),
    B: e(143, 'Wisdom 7:7-11', 'Psalm 90:12-13, 14-15, 16-17', 'Hebrews 4:12-13', 'Mark 10:17-30'),
    C: e(144, '2 Kings 5:14-17', 'Psalm 98:1, 2-3, 3-4', '2 Timothy 2:8-13', 'Luke 17:11-19'),
  },
  'ordinary-29': {
    A: e(145, 'Isaiah 45:1, 4-6', 'Psalm 96:1, 3, 4-5, 7-8, 9-10', '1 Thessalonians 1:1-5b', 'Matthew 22:15-21'),
    B: e(146, 'Isaiah 53:10-11', 'Psalm 33:4-5, 18-19, 20, 22', 'Hebrews 4:14-16', 'Mark 10:35-45'),
    C: e(147, 'Exodus 17:8-13', 'Psalm 121:1-2, 3-4, 5-6, 7-8', '2 Timothy 3:14—4:2', 'Luke 18:1-8'),
  },
  'ordinary-30': {
    A: e(148, 'Exodus 22:20-26', 'Psalm 18:2-3, 3-4, 47, 51', '1 Thessalonians 1:5c-10', 'Matthew 22:34-40'),
    B: e(149, 'Jeremiah 31:7-9', 'Psalm 126:1-2, 2-3, 4-5, 6', 'Hebrews 5:1-6', 'Mark 10:46-52'),
    C: e(150, 'Sirach 35:12-14, 16-18', 'Psalm 34:2-3, 17-18, 19, 23', '2 Timothy 4:6-8, 16-18', 'Luke 18:9-14', {
      // The Lectionary's 1970 numbering; the NABRE reflowed Sirach 35.
      first: 'Sirach 35:15-17, 20-22',
    }),
  },
  'ordinary-31': {
    A: e(151, 'Malachi 1:14b—2:2b, 8-10', 'Psalm 131:1, 2, 3', '1 Thessalonians 2:7b-9, 13', 'Matthew 23:1-12'),
    B: e(152, 'Deuteronomy 6:2-6', 'Psalm 18:2-3, 3-4, 47, 51', 'Hebrews 7:23-28', 'Mark 12:28b-34'),
    C: e(153, 'Wisdom 11:22—12:2', 'Psalm 145:1-2, 8-9, 10-11, 13, 14', '2 Thessalonians 1:11—2:2', 'Luke 19:1-10'),
  },
  'ordinary-32': {
    A: e(154, 'Wisdom 6:12-16', 'Psalm 63:2, 3-4, 5-6, 7-8', '1 Thessalonians 4:13-18', 'Matthew 25:1-13'),
    B: e(155, '1 Kings 17:10-16', 'Psalm 146:7, 8-9, 9-10', 'Hebrews 9:24-28', 'Mark 12:38-44'),
    C: e(156, '2 Maccabees 7:1-2, 9-14', 'Psalm 17:1, 5-6, 8, 15', '2 Thessalonians 2:16—3:5', 'Luke 20:27-38'),
  },
  'ordinary-33': {
    A: e(157, 'Proverbs 31:10-13, 19-20, 30-31', 'Psalm 128:1-2, 3, 4-5', '1 Thessalonians 5:1-6', 'Matthew 25:14-30'),
    B: e(158, 'Daniel 12:1-3', 'Psalm 16:5, 8, 9-10, 11', 'Hebrews 10:11-14, 18', 'Mark 13:24-32'),
    C: e(159, 'Malachi 3:19-20a', 'Psalm 98:5-6, 7-8, 9', '2 Thessalonians 3:7-12', 'Luke 21:5-19'),
  },

  // ── Solemnities and feasts by date ────────────────────────────────────────
  presentation: {
    all: e(524, 'Malachi 3:1-4', 'Psalm 24:7, 8, 9, 10', 'Hebrews 2:14-18', 'Luke 2:22-40'),
  },
  'st-joseph': {
    all: e(543, '2 Samuel 7:4-5a, 12-14a, 16', 'Psalm 89:2-3, 4-5, 27, 29', 'Romans 4:13, 16-18, 22', 'Matthew 1:16, 18-21, 24a'),
  },
  annunciation: {
    all: e(545, 'Isaiah 7:10-14; 8:10', 'Psalm 40:7-8a, 8b-9, 10, 11', 'Hebrews 10:4-10', 'Luke 1:26-38'),
  },
  /** Mass during the Day. */
  'birth-of-john-the-baptist': {
    all: e(587, 'Isaiah 49:1-6', 'Psalm 139:1b-3, 13-14ab, 14c-15', 'Acts 13:22-26', 'Luke 1:57-66, 80'),
  },
  /** Mass during the Day. */
  'peter-and-paul': {
    all: e(591, 'Acts 12:1-11', 'Psalm 34:2-3, 4-5, 6-7, 8-9', '2 Timothy 4:6-8, 17-18', 'Matthew 16:13-19'),
  },
  transfiguration: {
    A: e(614, 'Daniel 7:9-10, 13-14', 'Psalm 97:1-2, 5-6, 9', '2 Peter 1:16-19', 'Matthew 17:1-9'),
    B: e(614, 'Daniel 7:9-10, 13-14', 'Psalm 97:1-2, 5-6, 9', '2 Peter 1:16-19', 'Mark 9:2-10'),
    C: e(614, 'Daniel 7:9-10, 13-14', 'Psalm 97:1-2, 5-6, 9', '2 Peter 1:16-19', 'Luke 9:28b-36'),
  },
  /** Mass during the Day. */
  assumption: {
    all: e(622, 'Revelation 11:19a; 12:1-6a, 10ab', 'Psalm 45:10, 11, 12, 16', '1 Corinthians 15:20-27', 'Luke 1:39-56'),
  },
  'exaltation-of-the-cross': {
    all: e(638, 'Numbers 21:4b-9', 'Psalm 78:1bc-2, 34-35, 36-37, 38', 'Philippians 2:6-11', 'John 3:13-17'),
  },
  'all-saints': {
    all: e(667, 'Revelation 7:2-4, 9-14', 'Psalm 24:1bc-2, 3-4ab, 5-6', '1 John 3:1-3', 'Matthew 5:1-12a'),
  },
  /** The Lectionary offers a choice for each reading; these are the first of each. */
  'all-souls': {
    all: e(668, 'Wisdom 3:1-9', 'Psalm 23:1-3a, 3b-4, 5, 6', 'Romans 5:5-11', 'John 6:37-40'),
  },
  'dedication-of-the-lateran': {
    all: e(671, 'Ezekiel 47:1-2, 8-9, 12', 'Psalm 46:2-3, 5-6, 8-9', '1 Corinthians 3:9c-11, 16-17', 'John 2:13-22'),
  },
  'immaculate-conception': {
    all: e(689, 'Genesis 3:9-15, 20', 'Psalm 98:1, 2-3ab, 3cd-4', 'Ephesians 1:3-6, 11-12', 'Luke 1:26-38'),
  },
  /** A feast of the US calendar. No second reading. */
  'our-lady-of-guadalupe': {
    all: e(690, 'Zechariah 2:14-17', 'Judith 13:18bcde, 19', null, 'Luke 1:26-38'),
  },
};
