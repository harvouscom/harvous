/**
 * The Lectionary for Mass (USA, 2002): weekdays in Ordinary Time, weeks 1–34. The first reading
 * and psalm follow a two-year cycle (Year I in odd years, Year II in even); the Gospel is the
 * same in both. Conventions as in `sundays-and-solemnities.ts`; where the Lectionary offers a
 * choice, the first.
 *
 * Keys: `ordinary-<week>-<day>`, day one of mon…sat. Lectionary numbers run 305 (Monday of
 * Week 1) to 508, six to a week.
 */
import type { LectionaryDayReadings, LectionaryEntry } from './sundays-and-solemnities';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type Year = [first: string, psalm: string, text?: LectionaryEntry['text']];

/** One week: six days of [Year I, Year II, Gospel]. */
type Week = Array<[Year, Year, string]>;

const WEEKS: Record<number, Week> = {
  1: [
    [['Hebrews 1:1-6', 'Psalm 97:1, 2b, 6, 7c, 9'], ['1 Samuel 1:1-8', 'Psalm 116:12-13, 14-17, 18-19'], 'Mark 1:14-20'],
    [['Hebrews 2:5-12', 'Psalm 8:2ab, 5, 6-7, 8-9'], ['1 Samuel 1:9-20', '1 Samuel 2:1, 4-5, 6-7, 8abcd'], 'Mark 1:21-28'],
    [['Hebrews 2:14-18', 'Psalm 105:1-2, 3-4, 6-7, 8-9'], ['1 Samuel 3:1-10, 19-20', 'Psalm 40:2, 5, 7-8a, 8b-9, 10'], 'Mark 1:29-39'],
    [['Hebrews 3:7-14', 'Psalm 95:6-7c, 8-9, 10-11'], ['1 Samuel 4:1-11', 'Psalm 44:10-11, 14-15, 24-25'], 'Mark 1:40-45'],
    [['Hebrews 4:1-5, 11', 'Psalm 78:3, 4bc, 6c-7, 8'], ['1 Samuel 8:4-7, 10-22a', 'Psalm 89:16-17, 18-19'], 'Mark 2:1-12'],
    [['Hebrews 4:12-16', 'Psalm 19:8, 9, 10, 15'], ['1 Samuel 9:1-4, 17-19; 10:1', 'Psalm 21:2-3, 4-5, 6-7'], 'Mark 2:13-17'],
  ],
  2: [
    [['Hebrews 5:1-10', 'Psalm 110:1, 2, 3, 4'], ['1 Samuel 15:16-23', 'Psalm 50:8-9, 16bc-17, 21, 23'], 'Mark 2:18-22'],
    [['Hebrews 6:10-20', 'Psalm 111:1-2, 4-5, 9, 10c'], ['1 Samuel 16:1-13', 'Psalm 89:20, 21-22, 27-28'], 'Mark 2:23-28'],
    [['Hebrews 7:1-3, 15-17', 'Psalm 110:1, 2, 3, 4'], ['1 Samuel 17:32-33, 37, 40-51', 'Psalm 144:1b, 2, 9-10'], 'Mark 3:1-6'],
    [['Hebrews 7:25—8:6', 'Psalm 40:7-8a, 8b-9, 10, 17'], ['1 Samuel 18:6-9; 19:1-7', 'Psalm 56:2-3, 9-10a, 10b-11, 12-13'], 'Mark 3:7-12'],
    [['Hebrews 8:6-13', 'Psalm 85:8, 10, 11-12, 13-14'], ['1 Samuel 24:3-21', 'Psalm 57:2, 3-4, 6, 11'], 'Mark 3:13-19'],
    [['Hebrews 9:2-3, 11-14', 'Psalm 47:2-3, 6-7, 8-9'], ['2 Samuel 1:1-4, 11-12, 19, 23-27', 'Psalm 80:2-3, 5-7'], 'Mark 3:20-21'],
  ],
  3: [
    [['Hebrews 9:15, 24-28', 'Psalm 98:1, 2-3ab, 3cd-4, 5-6'], ['2 Samuel 5:1-7, 10', 'Psalm 89:20, 21-22, 25-26'], 'Mark 3:22-30'],
    [['Hebrews 10:1-10', 'Psalm 40:2, 4ab, 7-8a, 10, 11'], ['2 Samuel 6:12b-15, 17-19', 'Psalm 24:7, 8, 9, 10'], 'Mark 3:31-35'],
    [['Hebrews 10:11-18', 'Psalm 110:1, 2, 3, 4'], ['2 Samuel 7:4-17', 'Psalm 89:4-5, 27-28, 29-30'], 'Mark 4:1-20'],
    [['Hebrews 10:19-25', 'Psalm 24:1-2, 3-4ab, 5-6'], ['2 Samuel 7:18-19, 24-29', 'Psalm 132:1-2, 3-5, 11, 12, 13-14'], 'Mark 4:21-25'],
    [['Hebrews 10:32-39', 'Psalm 37:3-4, 5-6, 23-24, 39-40'], ['2 Samuel 11:1-4a, 5-10a, 13-17', 'Psalm 51:3-4, 5-6a, 6bcd-7, 10-11'], 'Mark 4:26-34'],
    [['Hebrews 11:1-2, 8-19', 'Luke 1:69-70, 71-72, 73-75'], ['2 Samuel 12:1-7a, 10-17', 'Psalm 51:12-13, 14-15, 16-17'], 'Mark 4:35-41'],
  ],
  4: [
    [['Hebrews 11:32-40', 'Psalm 31:20, 21, 22, 23, 24'], ['2 Samuel 15:13-14, 30; 16:5-13', 'Psalm 3:2-3, 4-5, 6-7'], 'Mark 5:1-20'],
    [['Hebrews 12:1-4', 'Psalm 22:26b-27, 28, 30, 31-32'], ['2 Samuel 18:9-10, 14b, 24-25a, 30—19:3', 'Psalm 86:1-2, 3-4, 5-6'], 'Mark 5:21-43'],
    [['Hebrews 12:4-7, 11-15', 'Psalm 103:1-2, 13-14, 17-18a'], ['2 Samuel 24:2, 9-17', 'Psalm 32:1-2, 5, 6, 7'], 'Mark 6:1-6'],
    [['Hebrews 12:18-19, 21-24', 'Psalm 48:2-3ab, 3cd-4, 9, 10-11'], ['1 Kings 2:1-4, 10-12', '1 Chronicles 29:10, 11ab, 11d-12a, 12bcd'], 'Mark 6:7-13'],
    [['Hebrews 13:1-8', 'Psalm 27:1, 3, 5, 8b-9abc'], ['Sirach 47:2-11', 'Psalm 18:31, 47, 50, 51'], 'Mark 6:14-29'],
    [['Hebrews 13:15-17, 20-21', 'Psalm 23:1-3a, 3b-4, 5, 6'], ['1 Kings 3:4-13', 'Psalm 119:9, 10, 11, 12, 13, 14'], 'Mark 6:30-34'],
  ],
  5: [
    [['Genesis 1:1-19', 'Psalm 104:1-2a, 5-6, 10, 12, 24, 35c'], ['1 Kings 8:1-7, 9-13', 'Psalm 132:6-7, 8-10'], 'Mark 6:53-56'],
    [['Genesis 1:20—2:4a', 'Psalm 8:4-5, 6-7, 8-9'], ['1 Kings 8:22-23, 27-30', 'Psalm 84:3, 4, 5, 10, 11'], 'Mark 7:1-13'],
    [['Genesis 2:4b-9, 15-17', 'Psalm 104:1-2a, 27-28, 29bc-30'], ['1 Kings 10:1-10', 'Psalm 37:5-6, 30-31, 39-40'], 'Mark 7:14-23'],
    [['Genesis 2:18-25', 'Psalm 128:1-2, 3, 4-5'], ['1 Kings 11:4-13', 'Psalm 106:3-4, 35-36, 37, 40'], 'Mark 7:24-30'],
    [['Genesis 3:1-8', 'Psalm 32:1-2, 5, 6, 7'], ['1 Kings 11:29-32; 12:19', 'Psalm 81:10-11ab, 12-13, 14-15'], 'Mark 7:31-37'],
    [['Genesis 3:9-24', 'Psalm 90:2, 3-4abc, 5-6, 12-13'], ['1 Kings 12:26-32; 13:33-34', 'Psalm 106:6, 7ab, 19-20, 21-22'], 'Mark 8:1-10'],
  ],
  6: [
    [['Genesis 4:1-15, 25', 'Psalm 50:1, 8, 16bc-17, 20-21'], ['James 1:1-11', 'Psalm 119:67, 68, 71, 72, 75, 76'], 'Mark 8:11-13'],
    [['Genesis 6:5-8; 7:1-5, 10', 'Psalm 29:1a, 2, 3ac-4, 3b, 9c-10'], ['James 1:12-18', 'Psalm 94:12-13a, 14-15, 18-19'], 'Mark 8:14-21'],
    [['Genesis 8:6-13, 20-22', 'Psalm 116:12-13, 14-15, 18-19'], ['James 1:19-27', 'Psalm 15:2-3a, 3bc-4ab, 5'], 'Mark 8:22-26'],
    [['Genesis 9:1-13', 'Psalm 102:16-18, 19-21, 29, 22-23'], ['James 2:1-9', 'Psalm 34:2-3, 4-5, 6-7'], 'Mark 8:27-33'],
    [['Genesis 11:1-9', 'Psalm 33:10-11, 12-13, 14-15'], ['James 2:14-24, 26', 'Psalm 112:1-2, 3-4, 5-6'], 'Mark 8:34—9:1'],
    [['Hebrews 11:1-7', 'Psalm 145:2-3, 4-5, 10-11'], ['James 3:1-10', 'Psalm 12:2-3, 4-5, 7-8'], 'Mark 9:2-13'],
  ],
  7: [
    [['Sirach 1:1-10', 'Psalm 93:1ab, 1cd-2, 5'], ['James 3:13-18', 'Psalm 19:8, 9, 10, 15'], 'Mark 9:14-29'],
    [['Sirach 2:1-11', 'Psalm 37:3-4, 18-19, 27-28, 39-40'], ['James 4:1-10', 'Psalm 55:7-8, 9-10a, 10b-11a, 23'], 'Mark 9:30-37'],
    [['Sirach 4:11-19', 'Psalm 119:165, 168, 171, 172, 174, 175'], ['James 4:13-17', 'Psalm 49:2-3, 6-7, 8-10, 11'], 'Mark 9:38-40'],
    [['Sirach 5:1-8', 'Psalm 1:1-2, 3, 4, 6'], ['James 5:1-6', 'Psalm 49:14-15ab, 15cd-16, 17-18, 19-20'], 'Mark 9:41-50'],
    [['Sirach 6:5-17', 'Psalm 119:12, 16, 18, 27, 34, 35'], ['James 5:9-12', 'Psalm 103:1-2, 3-4, 8-9, 11-12'], 'Mark 10:1-12'],
    [['Sirach 17:1-15', 'Psalm 103:13-14, 15-16, 17-18'], ['James 5:13-20', 'Psalm 141:1-2, 3, 8'], 'Mark 10:13-16'],
  ],
  8: [
    [['Sirach 17:20-24', 'Psalm 32:1-2, 5, 6, 7'], ['1 Peter 1:3-9', 'Psalm 111:1-2, 5-6, 9, 10c'], 'Mark 10:17-27'],
    [['Sirach 35:1-12', 'Psalm 50:5-6, 7-8, 14, 23'], ['1 Peter 1:10-16', 'Psalm 98:1, 2-3ab, 3cd-4'], 'Mark 10:28-31'],
    [['Sirach 36:1, 4-5a, 10-17', 'Psalm 79:8, 9, 11, 13'], ['1 Peter 1:18-25', 'Psalm 147:12-13, 14-15, 19-20'], 'Mark 10:32-45'],
    [['Sirach 42:15-25', 'Psalm 33:2-3, 4-5, 6-7, 8-9'], ['1 Peter 2:2-5, 9-12', 'Psalm 100:2, 3, 4, 5'], 'Mark 10:46-52'],
    [['Sirach 44:1, 9-13', 'Psalm 149:1b-2, 3-4, 5-6a, 9b'], ['1 Peter 4:7-13', 'Psalm 96:10, 11-12, 13'], 'Mark 11:11-26'],
    [['Sirach 51:12cd-20', 'Psalm 19:8, 9, 10, 11'], ['Jude 17, 20b-25', 'Psalm 63:2, 3-4, 5-6'], 'Mark 11:27-33'],
  ],
  9: [
    [['Tobit 1:3; 2:1a-8', 'Psalm 112:1b-2, 3b-4, 5-6'], ['2 Peter 1:2-7', 'Psalm 91:1-2, 14-15b, 15c-16'], 'Mark 12:1-12'],
    [['Tobit 2:9-14', 'Psalm 112:1-2, 7-8, 9'], ['2 Peter 3:12-15a, 17-18', 'Psalm 90:2, 3-4, 10, 14, 16'], 'Mark 12:13-17'],
    [['Tobit 3:1-11a, 16-17a', 'Psalm 25:2-3, 4-5ab, 6, 7bc, 8-9'], ['2 Timothy 1:1-3, 6-12', 'Psalm 123:1b-2ab, 2cdef'], 'Mark 12:18-27'],
    [['Tobit 6:10-11; 7:1bcde, 9-17; 8:4-9a', 'Psalm 128:1-2, 3, 4-5'], ['2 Timothy 2:8-15', 'Psalm 25:4-5ab, 8-9, 10, 14'], 'Mark 12:28-34'],
    [['Tobit 11:5-17', 'Psalm 146:1b-2, 6c-7, 8-9a, 9bc-10'], ['2 Timothy 3:10-17', 'Psalm 119:157, 160, 161, 165, 166, 168'], 'Mark 12:35-37'],
    [['Tobit 12:1, 5-15, 20', 'Tobit 13:2, 6efgh, 7, 8'], ['2 Timothy 4:1-8', 'Psalm 71:8-9, 14-15ab, 16-17, 22'], 'Mark 12:38-44'],
  ],
  10: [
    [['2 Corinthians 1:1-7', 'Psalm 34:2-3, 4-5, 6-7, 8-9'], ['1 Kings 17:1-6', 'Psalm 121:1bc-2, 3-4, 5-6, 7-8'], 'Matthew 5:1-12'],
    [['2 Corinthians 1:18-22', 'Psalm 119:129, 130, 131, 132, 133, 135'], ['1 Kings 17:7-16', 'Psalm 4:2-3, 4-5, 7b-8'], 'Matthew 5:13-16'],
    [['2 Corinthians 3:4-11', 'Psalm 99:5, 6, 7, 8, 9'], ['1 Kings 18:20-39', 'Psalm 16:1b-2ab, 4, 5ab, 8, 11'], 'Matthew 5:17-19'],
    [['2 Corinthians 3:15—4:1, 3-6', 'Psalm 85:9ab, 10, 11-12, 13-14'], ['1 Kings 18:41-46', 'Psalm 65:10, 11, 12-13'], 'Matthew 5:20-26'],
    [['2 Corinthians 4:7-15', 'Psalm 116:10-11, 15-16, 17-18'], ['1 Kings 19:9a, 11-16', 'Psalm 27:7-8a, 8b-9abc, 13-14'], 'Matthew 5:27-32'],
    [['2 Corinthians 5:14-21', 'Psalm 103:1-2, 3-4, 9-10, 11-12'], ['1 Kings 19:19-21', 'Psalm 16:1b-2a, 5, 7-8, 9-10'], 'Matthew 5:33-37'],
  ],
  11: [
    [['2 Corinthians 6:1-10', 'Psalm 98:1, 2b, 3ab, 3cd-4'], ['1 Kings 21:1-16', 'Psalm 5:2-3ab, 4b-6a, 6b-7'], 'Matthew 5:38-42'],
    [['2 Corinthians 8:1-9', 'Psalm 146:2, 5-6ab, 6c-7, 8-9a'], ['1 Kings 21:17-29', 'Psalm 51:3-4, 5-6ab, 11, 16'], 'Matthew 5:43-48'],
    [['2 Corinthians 9:6-11', 'Psalm 112:1bc-2, 3-4, 9'], ['2 Kings 2:1, 6-14', 'Psalm 31:20, 21, 24'], 'Matthew 6:1-6, 16-18'],
    [['2 Corinthians 11:1-11', 'Psalm 111:1b-2, 3-4, 7-8'], ['Sirach 48:1-14', 'Psalm 97:1-2, 3-4, 5-6, 7'], 'Matthew 6:7-15'],
    [['2 Corinthians 11:18, 21-30', 'Psalm 34:2-3, 4-5, 6-7'], ['2 Kings 11:1-4, 9-18, 20', 'Psalm 132:11, 12, 13-14, 17-18'], 'Matthew 6:19-23'],
    [['2 Corinthians 12:1-10', 'Psalm 34:8-9, 10-11, 12-13'], ['2 Chronicles 24:17-25', 'Psalm 89:4-5, 29-30, 31-32, 33-34'], 'Matthew 6:24-34'],
  ],
  12: [
    [['Genesis 12:1-9', 'Psalm 33:12-13, 18-19, 20, 22'], ['2 Kings 17:5-8, 13-15a, 18', 'Psalm 60:3, 4-5, 12-13'], 'Matthew 7:1-5'],
    [['Genesis 13:2, 5-18', 'Psalm 15:2-3a, 3bc-4ab, 5'], ['2 Kings 19:9b-11, 14-21, 31-35a, 36', 'Psalm 48:2-3ab, 3cd-4, 10-11'], 'Matthew 7:6, 12-14'],
    [['Genesis 15:1-12, 17-18', 'Psalm 105:1-2, 3-4, 6-7, 8-9'], ['2 Kings 22:8-13; 23:1-3', 'Psalm 119:33, 34, 35, 36, 37, 40'], 'Matthew 7:15-20'],
    [['Genesis 16:1-12, 15-16', 'Psalm 106:1b-2, 3-4a, 4b-5'], ['2 Kings 24:8-17', 'Psalm 79:1b-2, 3-5, 8, 9'], 'Matthew 7:21-29'],
    [['Genesis 17:1, 9-10, 15-22', 'Psalm 128:1-2, 3, 4-5'], ['2 Kings 25:1-12', 'Psalm 137:1-2, 3, 4-5, 6'], 'Matthew 8:1-4'],
    [['Genesis 18:1-15', 'Luke 1:46-47, 48-49, 50, 53, 54-55'], ['Lamentations 2:2, 10-14, 18-19', 'Psalm 74:1b-2, 3-5, 6-7, 20-21'], 'Matthew 8:5-17'],
  ],
  13: [
    [['Genesis 18:16-33', 'Psalm 103:1b-2, 3-4, 8-9, 10-11'], ['Amos 2:6-10, 13-16', 'Psalm 50:16bc-17, 18-19, 20-21, 22-23'], 'Matthew 8:18-22'],
    [['Genesis 19:15-29', 'Psalm 26:2-3, 9-10, 11-12'], ['Amos 3:1-8; 4:11-12', 'Psalm 5:4b-6a, 6b-7, 8'], 'Matthew 8:23-27'],
    [['Genesis 21:5, 8-20a', 'Psalm 34:7-8, 10-11, 12-13'], ['Amos 5:14-15, 21-24', 'Psalm 50:7, 8-9, 10-11, 12-13, 16bc-17'], 'Matthew 8:28-34'],
    [['Genesis 22:1b-19', 'Psalm 115:1-2, 3-4, 5-6, 8-9'], ['Amos 7:10-17', 'Psalm 19:8, 9, 10, 11'], 'Matthew 9:1-8'],
    [['Genesis 23:1-4, 19; 24:1-8, 62-67', 'Psalm 106:1b-2, 3-4a, 4b-5'], ['Amos 8:4-6, 9-12', 'Psalm 119:2, 10, 20, 30, 40, 131'], 'Matthew 9:9-13'],
    [['Genesis 27:1-5, 15-29', 'Psalm 135:1b-2, 3-4, 5-6'], ['Amos 9:11-15', 'Psalm 85:9ab, 10, 11-12, 13-14'], 'Matthew 9:14-17'],
  ],
  14: [
    [['Genesis 28:10-22a', 'Psalm 91:1-2, 3-4, 14-15ab'], ['Hosea 2:16, 17b-18, 21-22', 'Psalm 145:2-3, 4-5, 6-7, 8-9'], 'Matthew 9:18-26'],
    [['Genesis 32:23-33', 'Psalm 17:1b, 2-3, 6-7ab, 8b, 15'], ['Hosea 8:4-7, 11-13', 'Psalm 115:3-4, 5-6, 7ab-8, 9-10'], 'Matthew 9:32-38'],
    [['Genesis 41:55-57; 42:5-7a, 17-24a', 'Psalm 33:2-3, 10-11, 18-19'], ['Hosea 10:1-3, 7-8, 12', 'Psalm 105:2-3, 4-5, 6-7'], 'Matthew 10:1-7'],
    [['Genesis 44:18-21, 23b-29; 45:1-5', 'Psalm 105:16-17, 18-19, 20-21'], ['Hosea 11:1-4, 8e-9', 'Psalm 80:2ac, 3b, 15-16'], 'Matthew 10:7-15'],
    [['Genesis 46:1-7, 28-30', 'Psalm 37:3-4, 18-19, 27-28, 39-40'], ['Hosea 14:2-10', 'Psalm 51:3-4, 8-9, 12-13, 14, 17'], 'Matthew 10:16-23'],
    [['Genesis 49:29-32; 50:15-26a', 'Psalm 105:1-2, 3-4, 6-7'], ['Isaiah 6:1-8', 'Psalm 93:1ab, 1cd-2, 5'], 'Matthew 10:24-33'],
  ],
  15: [
    [['Exodus 1:8-14, 22', 'Psalm 124:1b-3, 4-6, 7-8'], ['Isaiah 1:10-17', 'Psalm 50:8-9, 16bc-17, 21, 23'], 'Matthew 10:34—11:1'],
    [['Exodus 2:1-15a', 'Psalm 69:3, 14, 30-31, 33-34'], ['Isaiah 7:1-9', 'Psalm 48:2-3a, 3b-4, 5-6, 7-8'], 'Matthew 11:20-24'],
    [['Exodus 3:1-6, 9-12', 'Psalm 103:1b-2, 3-4, 6-7'], ['Isaiah 10:5-7, 13b-16', 'Psalm 94:5-6, 7-8, 9-10, 14-15'], 'Matthew 11:25-27'],
    [['Exodus 3:13-20', 'Psalm 105:1, 5, 8-9, 24-25, 26-27'], ['Isaiah 26:7-9, 12, 16-19', 'Psalm 102:13-14ab, 15, 16-18, 19-21'], 'Matthew 11:28-30'],
    [['Exodus 11:10—12:14', 'Psalm 116:12-13, 15, 16bc, 17-18'], ['Isaiah 38:1-6, 21-22, 7-8', 'Isaiah 38:10, 11, 12abcd, 16'], 'Matthew 12:1-8'],
    [['Exodus 12:37-42', 'Psalm 136:1, 23-24, 10-12, 13-15'], ['Micah 2:1-5', 'Psalm 10:1-2, 3-4, 7-8, 14'], 'Matthew 12:14-21'],
  ],
  16: [
    [['Exodus 14:5-18', 'Exodus 15:1bc-2, 3-4, 5-6'], ['Micah 6:1-4, 6-8', 'Psalm 50:5-6, 8-9, 16bc-17, 21, 23'], 'Matthew 12:38-42'],
    [['Exodus 14:21—15:1', 'Exodus 15:8-9, 10, 12, 17'], ['Micah 7:14-15, 18-20', 'Psalm 85:2-4, 5-6, 7-8'], 'Matthew 12:46-50'],
    [['Exodus 16:1-5, 9-15', 'Psalm 78:18-19, 23-24, 25-26, 27-28'], ['Jeremiah 1:1, 4-10', 'Psalm 71:1-2, 3-4a, 5-6ab, 15, 17'], 'Matthew 13:1-9'],
    [['Exodus 19:1-2, 9-11, 16-20b', 'Daniel 3:52, 53, 54, 55, 56'], ['Jeremiah 2:1-3, 7-8, 12-13', 'Psalm 36:6-7ab, 8-9, 10-11'], 'Matthew 13:10-17'],
    [['Exodus 20:1-17', 'Psalm 19:8, 9, 10, 11'], ['Jeremiah 3:14-17', 'Jeremiah 31:10, 11-12abcd, 13'], 'Matthew 13:18-23'],
    [['Exodus 24:3-8', 'Psalm 50:1b-2, 5-6, 14-15'], ['Jeremiah 7:1-11', 'Psalm 84:3, 4, 5-6a, 8a, 11'], 'Matthew 13:24-30'],
  ],
  17: [
    [['Exodus 32:15-24, 30-34', 'Psalm 106:19-20, 21-22, 23'], ['Jeremiah 13:1-11', 'Deuteronomy 32:18-19, 20, 21'], 'Matthew 13:31-35'],
    [['Exodus 33:7-11; 34:5b-9, 28', 'Psalm 103:6-7, 8-9, 10-11, 12-13'], ['Jeremiah 14:17-22', 'Psalm 79:8, 9, 11, 13'], 'Matthew 13:36-43'],
    [['Exodus 34:29-35', 'Psalm 99:5, 6, 7, 9'], ['Jeremiah 15:10, 16-21', 'Psalm 59:2-3, 4, 10-11, 17, 18'], 'Matthew 13:44-46'],
    [['Exodus 40:16-21, 34-38', 'Psalm 84:3, 4, 5-6a, 8a, 11'], ['Jeremiah 18:1-6', 'Psalm 146:1b-2, 3-4, 5-6ab'], 'Matthew 13:47-53'],
    [['Leviticus 23:1, 4-11, 15-16, 27, 34b-37', 'Psalm 81:3-4, 5-6ab, 10-11ab'], ['Jeremiah 26:1-9', 'Psalm 69:5, 8-10, 14'], 'Matthew 13:54-58'],
    [['Leviticus 25:1, 8-17', 'Psalm 67:2-3, 5, 7-8'], ['Jeremiah 26:11-16, 24', 'Psalm 69:15-16, 30-31, 33-34'], 'Matthew 14:1-12'],
  ],
  18: [
    [['Numbers 11:4b-15', 'Psalm 81:12-13, 14-15, 16-17'], ['Jeremiah 28:1-17', 'Psalm 119:29, 43, 79, 80, 95, 102'], 'Matthew 14:13-21'],
    [['Numbers 12:1-13', 'Psalm 51:3-4, 5-6ab, 6cd-7, 12-13'], ['Jeremiah 30:1-2, 12-15, 18-22', 'Psalm 102:16-18, 19-21, 29, 22-23'], 'Matthew 14:22-36'],
    [['Numbers 13:1-2, 25—14:1, 26-29a, 34-35', 'Psalm 106:6-7ab, 13-14, 21-22, 23'], ['Jeremiah 31:1-7', 'Jeremiah 31:10, 11-12ab, 13'], 'Matthew 15:21-28'],
    [['Numbers 20:1-13', 'Psalm 95:1-2, 6-7, 8-9'], ['Jeremiah 31:31-34', 'Psalm 51:12-13, 14-15, 18-19'], 'Matthew 16:13-23'],
    [['Deuteronomy 4:32-40', 'Psalm 77:12-13, 14-15, 16, 21'], ['Nahum 2:1, 3; 3:1-3, 6-7', 'Deuteronomy 32:35cd-36ab, 39abcd, 41'], 'Matthew 16:24-28'],
    [['Deuteronomy 6:4-13', 'Psalm 18:2-3a, 3bc-4, 47, 51'], ['Habakkuk 1:12—2:4', 'Psalm 9:8-9, 10-11, 12-13'], 'Matthew 17:14-20'],
  ],
  19: [
    [['Deuteronomy 10:12-22', 'Psalm 147:12-13, 14-15, 19-20'], ['Ezekiel 1:2-5, 24-28c', 'Psalm 148:1-2, 11-12, 13, 14'], 'Matthew 17:22-27'],
    [['Deuteronomy 31:1-8', 'Deuteronomy 32:3-4ab, 7, 8, 9, 12'], ['Ezekiel 2:8—3:4', 'Psalm 119:14, 24, 72, 103, 111, 131'], 'Matthew 18:1-5, 10, 12-14'],
    [['Deuteronomy 34:1-12', 'Psalm 66:1-3a, 5, 8, 16-17'], ['Ezekiel 9:1-7; 10:18-22', 'Psalm 113:1-2, 3-4, 5-6'], 'Matthew 18:15-20'],
    [['Joshua 3:7-10a, 11, 13-17', 'Psalm 114:1-2, 3-4, 5-6'], ['Ezekiel 12:1-12', 'Psalm 78:56-57, 58-59, 61-62'], 'Matthew 18:21—19:1'],
    [['Joshua 24:1-13', 'Psalm 136:1-3, 16-18, 21-22, 24'], ['Ezekiel 16:1-15, 60, 63', 'Isaiah 12:2-3, 4bcd, 5-6'], 'Matthew 19:3-12'],
    [['Joshua 24:14-29', 'Psalm 16:1-2a, 5, 7-8, 11'], ['Ezekiel 18:1-10, 13b, 30-32', 'Psalm 51:12-13, 14-15, 18-19'], 'Matthew 19:13-15'],
  ],
  20: [
    [['Judges 2:11-19', 'Psalm 106:34-35, 36-37, 39-40, 43ab, 44'], ['Ezekiel 24:15-23', 'Deuteronomy 32:18-19, 20, 21'], 'Matthew 19:16-22'],
    [['Judges 6:11-24a', 'Psalm 85:9, 11-12, 13-14'], ['Ezekiel 28:1-10', 'Deuteronomy 32:26-27ab, 27cd-28, 30, 35cd-36ab'], 'Matthew 19:23-30'],
    [['Judges 9:6-15', 'Psalm 21:2-3, 4-5, 6-7'], ['Ezekiel 34:1-11', 'Psalm 23:1-3a, 3b-4, 5, 6'], 'Matthew 20:1-16'],
    [['Judges 11:29-39a', 'Psalm 40:5, 7-8a, 8b-9, 10'], ['Ezekiel 36:23-28', 'Psalm 51:12-13, 14-15, 18-19'], 'Matthew 22:1-14'],
    [['Ruth 1:1, 3-6, 14b-16, 22', 'Psalm 146:5-6ab, 6c-7, 8-9a, 9bc-10'], ['Ezekiel 37:1-14', 'Psalm 107:2-3, 4-5, 6-7, 8-9'], 'Matthew 22:34-40'],
    [['Ruth 2:1-3, 8-11; 4:13-17', 'Psalm 128:1b-2, 3, 4, 5'], ['Ezekiel 43:1-7ab', 'Psalm 85:9ab, 10, 11-12, 13-14'], 'Matthew 23:1-12'],
  ],
  21: [
    [['1 Thessalonians 1:1-5, 8b-10', 'Psalm 149:1b-2, 3-4, 5-6a, 9b'], ['2 Thessalonians 1:1-5, 11-12', 'Psalm 96:1-2a, 2b-3, 4-5'], 'Matthew 23:13-22'],
    [['1 Thessalonians 2:1-8', 'Psalm 139:1-3, 4-6'], ['2 Thessalonians 2:1-3a, 14-17', 'Psalm 96:10, 11-12, 13'], 'Matthew 23:23-26'],
    [['1 Thessalonians 2:9-13', 'Psalm 139:7-8, 9-10, 11-12ab'], ['2 Thessalonians 3:6-10, 16-18', 'Psalm 128:1-2, 4-5'], 'Matthew 23:27-32'],
    [['1 Thessalonians 3:7-13', 'Psalm 90:3-4, 12-13, 14, 17'], ['1 Corinthians 1:1-9', 'Psalm 145:2-3, 4-5, 6-7'], 'Matthew 24:42-51'],
    [['1 Thessalonians 4:1-8', 'Psalm 97:1, 2b, 5-6, 10, 11-12'], ['1 Corinthians 1:17-25', 'Psalm 33:1-2, 4-5, 10-11'], 'Matthew 25:1-13'],
    [['1 Thessalonians 4:9-11', 'Psalm 98:1, 7-8, 9'], ['1 Corinthians 1:26-31', 'Psalm 33:12-13, 18-19, 20-21'], 'Matthew 25:14-30'],
  ],
  22: [
    [['1 Thessalonians 4:13-18', 'Psalm 96:1, 3, 4-5, 11-12, 13'], ['1 Corinthians 2:1-5', 'Psalm 119:97, 98, 99, 100, 101, 102'], 'Luke 4:16-30'],
    [['1 Thessalonians 5:1-6, 9-11', 'Psalm 27:1, 4, 13-14'], ['1 Corinthians 2:10b-16', 'Psalm 145:8-9, 10-11, 12-13ab, 13cd-14'], 'Luke 4:31-37'],
    [['Colossians 1:1-8', 'Psalm 52:10, 11'], ['1 Corinthians 3:1-9', 'Psalm 33:12-13, 14-15, 20-21'], 'Luke 4:38-44'],
    [['Colossians 1:9-14', 'Psalm 98:2-3ab, 3cd-4, 5-6'], ['1 Corinthians 3:18-23', 'Psalm 24:1bc-2, 3-4ab, 5-6'], 'Luke 5:1-11'],
    [['Colossians 1:15-20', 'Psalm 100:1b-2, 3, 4, 5'], ['1 Corinthians 4:1-5', 'Psalm 37:3-4, 5-6, 27-28, 39-40'], 'Luke 5:33-39'],
    [['Colossians 1:21-23', 'Psalm 54:3-4, 6, 8'], ['1 Corinthians 4:6b-15', 'Psalm 145:17-18, 19-20, 21'], 'Luke 6:1-5'],
  ],
  23: [
    [['Colossians 1:24—2:3', 'Psalm 62:6-7, 9'], ['1 Corinthians 5:1-8', 'Psalm 5:5-6, 7, 12'], 'Luke 6:6-11'],
    [['Colossians 2:6-15', 'Psalm 145:1b-2, 8-9, 10-11'], ['1 Corinthians 6:1-11', 'Psalm 149:1b-2, 3-4, 5-6a, 9b'], 'Luke 6:12-19'],
    [['Colossians 3:1-11', 'Psalm 145:2-3, 10-11, 12-13ab'], ['1 Corinthians 7:25-31', 'Psalm 45:11-12, 14-15, 16-17'], 'Luke 6:20-26'],
    [['Colossians 3:12-17', 'Psalm 150:1b-2, 3-4, 5-6'], ['1 Corinthians 8:1b-7, 11-13', 'Psalm 139:1b-3, 13-14ab, 23-24'], 'Luke 6:27-38'],
    [['1 Timothy 1:1-2, 12-14', 'Psalm 16:1b-2a, 5, 7-8, 11'], ['1 Corinthians 9:16-19, 22b-27', 'Psalm 84:3, 4, 5-6, 12'], 'Luke 6:39-42'],
    [['1 Timothy 1:15-17', 'Psalm 113:1b-2, 3-4, 5a, 6-7'], ['1 Corinthians 10:14-22', 'Psalm 116:12-13, 17-18'], 'Luke 6:43-49'],
  ],
  24: [
    [['1 Timothy 2:1-8', 'Psalm 28:2, 7, 8-9'], ['1 Corinthians 11:17-26, 33', 'Psalm 40:7-8a, 8b-9, 10, 17'], 'Luke 7:1-10'],
    [['1 Timothy 3:1-13', 'Psalm 101:1b-2ab, 2cd-3ab, 5, 6'], ['1 Corinthians 12:12-14, 27-31a', 'Psalm 100:1b-2, 3, 4, 5'], 'Luke 7:11-17'],
    [['1 Timothy 3:14-16', 'Psalm 111:1-2, 3-4, 5-6'], ['1 Corinthians 12:31—13:13', 'Psalm 33:2-3, 4-5, 12, 22'], 'Luke 7:31-35'],
    [['1 Timothy 4:12-16', 'Psalm 111:7-8, 9, 10'], ['1 Corinthians 15:1-11', 'Psalm 118:1b-2, 16ab-17, 28'], 'Luke 7:36-50'],
    [['1 Timothy 6:2c-12', 'Psalm 49:6-7, 8-10, 17-18, 19-20'], ['1 Corinthians 15:12-20', 'Psalm 17:1bcd, 6-7, 8b, 15'], 'Luke 8:1-3'],
    [['1 Timothy 6:13-16', 'Psalm 100:1b-2, 3, 4, 5'], ['1 Corinthians 15:35-37, 42-49', 'Psalm 56:10c-12, 13-14'], 'Luke 8:4-15'],
  ],
  25: [
    [['Ezra 1:1-6', 'Psalm 126:1b-2ab, 2cd-3, 4-5, 6'], ['Proverbs 3:27-34', 'Psalm 15:2-3a, 3bc-4ab, 5'], 'Luke 8:16-18'],
    [['Ezra 6:7-8, 12b, 14-20', 'Psalm 122:1-2, 3-4ab, 4cd-5'], ['Proverbs 21:1-6, 10-13', 'Psalm 119:1, 27, 30, 34, 35, 44'], 'Luke 8:19-21'],
    [['Ezra 9:5-9', 'Tobit 13:2, 3-4a, 4befghn, 7-8'], ['Proverbs 30:5-9', 'Psalm 119:29, 72, 89, 101, 104, 163'], 'Luke 9:1-6'],
    [['Haggai 1:1-8', 'Psalm 149:1b-2, 3-4, 5-6a, 9b'], ['Ecclesiastes 1:2-11', 'Psalm 90:3-4, 5-6, 12-13, 14, 17bc'], 'Luke 9:7-9'],
    [['Haggai 2:1-9', 'Psalm 43:1, 2, 3, 4'], ['Ecclesiastes 3:1-11', 'Psalm 144:1b, 2abc, 3-4'], 'Luke 9:18-22'],
    [['Zechariah 2:5-9, 14-15a', 'Jeremiah 31:10, 11-12ab, 13'], ['Ecclesiastes 11:9—12:8', 'Psalm 90:3-4, 5-6, 12-13, 14, 17'], 'Luke 9:43b-45'],
  ],
  26: [
    [['Zechariah 8:1-8', 'Psalm 102:16-18, 19-21, 29, 22-23'], ['Job 1:6-22', 'Psalm 17:1bcd, 2-3, 6-7'], 'Luke 9:46-50'],
    [['Zechariah 8:20-23', 'Psalm 87:1b-3, 4-5, 6-7'], ['Job 3:1-3, 11-17, 20-23', 'Psalm 88:2-3, 4-5, 6, 7-8'], 'Luke 9:51-56'],
    [['Nehemiah 2:1-8', 'Psalm 137:1-2, 3, 4-5, 6'], ['Job 9:1-12, 14-16', 'Psalm 88:10bc-11, 12-13, 14-15'], 'Luke 9:57-62'],
    [['Nehemiah 8:1-4a, 5-6, 7b-12', 'Psalm 19:8, 9, 10, 11'], ['Job 19:21-27', 'Psalm 27:7-8a, 8b-9abc, 13-14'], 'Luke 10:1-12'],
    [['Baruch 1:15-22', 'Psalm 79:1b-2, 3-5, 8, 9'], ['Job 38:1, 12-21; 40:3-5', 'Psalm 139:1-3, 7-8, 9-10, 13-14ab'], 'Luke 10:13-16'],
    [['Baruch 4:5-12, 27-29', 'Psalm 69:33-35, 36-37'], ['Job 42:1-3, 5-6, 12-17', 'Psalm 119:66, 71, 75, 91, 125, 130'], 'Luke 10:17-24'],
  ],
  27: [
    [['Jonah 1:1—2:2, 11', 'Jonah 2:3, 4, 5, 8'], ['Galatians 1:6-12', 'Psalm 111:1b-2, 7-8, 9, 10c'], 'Luke 10:25-37'],
    [['Jonah 3:1-10', 'Psalm 130:1b-2, 3-4ab, 7-8'], ['Galatians 1:13-24', 'Psalm 139:1b-3, 13-14ab, 14c-15'], 'Luke 10:38-42'],
    [['Jonah 4:1-11', 'Psalm 86:3-4, 5-6, 9-10'], ['Galatians 2:1-2, 7-14', 'Psalm 117:1bc, 2'], 'Luke 11:1-4'],
    [['Malachi 3:13-20b', 'Psalm 1:1-2, 3, 4, 6'], ['Galatians 3:1-5', 'Luke 1:69-70, 71-72, 73-75'], 'Luke 11:5-13'],
    [['Joel 1:13-15; 2:1-2', 'Psalm 9:2-3, 6, 16, 8-9'], ['Galatians 3:7-14', 'Psalm 111:1b-2, 3-4, 5-6'], 'Luke 11:15-26'],
    [['Joel 4:12-21', 'Psalm 97:1-2, 5-6, 11-12'], ['Galatians 3:22-29', 'Psalm 105:2-3, 4-5, 6-7'], 'Luke 11:27-28'],
  ],
  28: [
    [['Romans 1:1-7', 'Psalm 98:1bcde, 2-3ab, 3cd-4'], ['Galatians 4:22-24, 26-27, 31—5:1', 'Psalm 113:1b-2, 3-4, 5a, 6-7'], 'Luke 11:29-32'],
    [['Romans 1:16-25', 'Psalm 19:2-3, 4-5'], ['Galatians 5:1-6', 'Psalm 119:41, 43, 44, 45, 47, 48'], 'Luke 11:37-41'],
    [['Romans 2:1-11', 'Psalm 62:2-3, 6-7, 9'], ['Galatians 5:18-25', 'Psalm 1:1-2, 3, 4, 6'], 'Luke 11:42-46'],
    [['Romans 3:21-30', 'Psalm 130:1b-2, 3-4, 5-6ab'], ['Ephesians 1:1-10', 'Psalm 98:1, 2-3ab, 3cd-4, 5-6'], 'Luke 11:47-54'],
    [['Romans 4:1-8', 'Psalm 32:1b-2, 5, 11'], ['Ephesians 1:11-14', 'Psalm 33:1-2, 4-5, 12-13'], 'Luke 12:1-7'],
    [['Romans 4:13, 16-18', 'Psalm 105:6-7, 8-9, 42-43'], ['Ephesians 1:15-23', 'Psalm 8:2-3ab, 4-5, 6-7'], 'Luke 12:8-12'],
  ],
  29: [
    [['Romans 4:20-25', 'Luke 1:69-70, 71-72, 73-75'], ['Ephesians 2:1-10', 'Psalm 100:1b-2, 3, 4ab, 4c-5'], 'Luke 12:13-21'],
    [['Romans 5:12, 15b, 17-19, 20b-21', 'Psalm 40:7-8a, 8b-9, 10, 17'], ['Ephesians 2:12-22', 'Psalm 85:9ab-10, 11-12, 13-14'], 'Luke 12:35-38'],
    [['Romans 6:12-18', 'Psalm 124:1b-3, 4-6, 7-8'], ['Ephesians 3:2-12', 'Isaiah 12:2-3, 4bcd, 5-6'], 'Luke 12:39-48'],
    [['Romans 6:19-23', 'Psalm 1:1-2, 3, 4, 6'], ['Ephesians 3:14-21', 'Psalm 33:1-2, 4-5, 11-12, 18-19'], 'Luke 12:49-53'],
    [['Romans 7:18-25a', 'Psalm 119:66, 68, 76, 77, 93, 94'], ['Ephesians 4:1-6', 'Psalm 24:1-2, 3-4ab, 5-6'], 'Luke 12:54-59'],
    [['Romans 8:1-11', 'Psalm 24:1b-2, 3-4ab, 5-6'], ['Ephesians 4:7-16', 'Psalm 122:1-2, 3-4ab, 4cd-5'], 'Luke 13:1-9'],
  ],
  30: [
    [['Romans 8:12-17', 'Psalm 68:2, 4, 6-7ab, 20-21'], ['Ephesians 4:32—5:8', 'Psalm 1:1-2, 3, 4, 6'], 'Luke 13:10-17'],
    [['Romans 8:18-25', 'Psalm 126:1b-2ab, 2cd-3, 4-5, 6'], ['Ephesians 5:21-33', 'Psalm 128:1-2, 3, 4-5'], 'Luke 13:18-21'],
    [['Romans 8:26-30', 'Psalm 13:4-5, 6'], ['Ephesians 6:1-9', 'Psalm 145:10-11, 12-13ab, 13cd-14'], 'Luke 13:22-30'],
    [['Romans 8:31b-39', 'Psalm 109:21-22, 26-27, 30-31'], ['Ephesians 6:10-20', 'Psalm 144:1b, 2, 9-10'], 'Luke 13:31-35'],
    [['Romans 9:1-5', 'Psalm 147:12-13, 14-15, 19-20'], ['Philippians 1:1-11', 'Psalm 111:1-2, 3-4, 5-6'], 'Luke 14:1-6'],
    [['Romans 11:1-2a, 11-12, 25-29', 'Psalm 94:12-13a, 14-15, 17-18'], ['Philippians 1:18b-26', 'Psalm 42:2, 3, 5cdef'], 'Luke 14:1, 7-11'],
  ],
  31: [
    [['Romans 11:29-36', 'Psalm 69:30-31, 33-34, 36-37'], ['Philippians 2:1-4', 'Psalm 131:1bcde, 2, 3'], 'Luke 14:12-14'],
    [['Romans 12:5-16b', 'Psalm 131:1bcde, 2, 3'], ['Philippians 2:5-11', 'Psalm 22:26b-27, 28-30ab, 30e, 31-32'], 'Luke 14:15-24'],
    [['Romans 13:8-10', 'Psalm 112:1b-2, 4-5, 9'], ['Philippians 2:12-18', 'Psalm 27:1, 4, 13-14'], 'Luke 14:25-33'],
    [['Romans 14:7-12', 'Psalm 27:1bcde, 4, 13-14'], ['Philippians 3:3-8a', 'Psalm 105:2-3, 4-5, 6-7'], 'Luke 15:1-10'],
    [['Romans 15:14-21', 'Psalm 98:1, 2-3ab, 3cd-4'], ['Philippians 3:17—4:1', 'Psalm 122:1-2, 3-4ab, 4cd-5'], 'Luke 16:1-8'],
    [['Romans 16:3-9, 16, 22-27', 'Psalm 145:2-3, 4-5, 10-11'], ['Philippians 4:10-19', 'Psalm 112:1b-2, 5-6, 8a, 9'], 'Luke 16:9-15'],
  ],
  32: [
    [['Wisdom 1:1-7', 'Psalm 139:1b-3, 4-6, 7-8, 9-10'], ['Titus 1:1-9', 'Psalm 24:1b-2, 3-4ab, 5-6'], 'Luke 17:1-6'],
    [['Wisdom 2:23—3:9', 'Psalm 34:2-3, 16-17, 18-19'], ['Titus 2:1-8, 11-14', 'Psalm 37:3-4, 18, 23, 27, 29'], 'Luke 17:7-10'],
    [['Wisdom 6:1-11', 'Psalm 82:3-4, 6-7'], ['Titus 3:1-7', 'Psalm 23:1b-3a, 3bc-4, 5, 6'], 'Luke 17:11-19'],
    [['Wisdom 7:22b—8:1', 'Psalm 119:89, 90, 91, 130, 135, 175'], ['Philemon 7-20', 'Psalm 146:7, 8-9a, 9bc-10'], 'Luke 17:20-25'],
    [['Wisdom 13:1-9', 'Psalm 19:2-3, 4-5ab'], ['2 John 4-9', 'Psalm 119:1, 2, 10, 11, 17, 18'], 'Luke 17:26-37'],
    [['Wisdom 18:14-16; 19:6-9', 'Psalm 105:2-3, 36-37, 42-43'], ['3 John 5-8', 'Psalm 112:1-2, 3-4, 5-6'], 'Luke 18:1-8'],
  ],
  33: [
    [['1 Maccabees 1:10-15, 41-43, 54-57, 62-63', 'Psalm 119:53, 61, 134, 150, 155, 158'], ['Revelation 1:1-4; 2:1-5', 'Psalm 1:1-2, 3, 4, 6'], 'Luke 18:35-43'],
    [['2 Maccabees 6:18-31', 'Psalm 3:2-3, 4-5, 6-7'], ['Revelation 3:1-6, 14-22', 'Psalm 15:2-3a, 3bc-4ab, 5'], 'Luke 19:1-10'],
    [['2 Maccabees 7:1, 20-31', 'Psalm 17:1bcd, 5-6, 8b, 15'], ['Revelation 4:1-11', 'Psalm 150:1b-2, 3-4, 5-6'], 'Luke 19:11-28'],
    [['1 Maccabees 2:15-29', 'Psalm 50:1b-2, 5-6, 14-15'], ['Revelation 5:1-10', 'Psalm 149:1b-2, 3-4, 5-6a, 9b'], 'Luke 19:41-44'],
    [['1 Maccabees 4:36-37, 52-59', '1 Chronicles 29:10bcd, 11abc, 11d-12a, 12bcd'], ['Revelation 10:8-11', 'Psalm 119:14, 24, 72, 103, 111, 131'], 'Luke 19:45-48'],
    [['1 Maccabees 6:1-13', 'Psalm 9:2-3, 4, 6, 16, 19'], ['Revelation 11:4-12', 'Psalm 144:1, 2, 9-10'], 'Luke 20:27-40'],
  ],
  34: [
    [['Daniel 1:1-6, 8-20', 'Daniel 3:52, 53, 54, 55, 56'], ['Revelation 14:1-3, 4b-5', 'Psalm 24:1bc-2, 3-4ab, 5-6'], 'Luke 21:1-4'],
    [['Daniel 2:31-45', 'Daniel 3:57, 58, 59, 60, 61'], ['Revelation 14:14-19', 'Psalm 96:10, 11-12, 13'], 'Luke 21:5-11'],
    [['Daniel 5:1-6, 13-14, 16-17, 23-28', 'Daniel 3:62, 63, 64, 65, 66, 67'], ['Revelation 15:1-4', 'Psalm 98:1, 2-3ab, 7-8, 9'], 'Luke 21:12-19'],
    [['Daniel 6:12-28', 'Daniel 3:68, 69, 70, 71, 72, 73, 74'], ['Revelation 18:1-2, 21-23; 19:1-3, 9a', 'Psalm 100:1b-2, 3, 4, 5'], 'Luke 21:20-28'],
    [['Daniel 7:2-14', 'Daniel 3:75, 76, 77, 78, 79, 80, 81'], ['Revelation 20:1-4, 11—21:2', 'Psalm 84:3, 4, 5-6a, 8a'], 'Luke 21:29-33'],
    [['Daniel 7:15-27', 'Daniel 3:82, 83, 84, 85, 86, 87'], ['Revelation 22:1-7', 'Psalm 95:1-2, 3-5, 6-7ab'], 'Luke 21:34-36'],
  ],
};

export type OrdinaryWeekdayReadings = { I: LectionaryEntry; II: LectionaryEntry };

export const ORDINARY_WEEKDAYS: Record<string, OrdinaryWeekdayReadings> = Object.fromEntries(
  Object.entries(WEEKS).flatMap(([week, days]) =>
    days.map(([one, two, gospel], i) => {
      const n = 305 + (Number(week) - 1) * 6 + i;
      const entry = ([first, psalm, text]: Year): LectionaryEntry => ({
        n,
        first,
        psalm,
        gospel,
        ...(text ? { text } : {}),
      });
      return [`ordinary-${week}-${DAYS[i]}`, { I: entry(one), II: entry(two) }];
    }),
  ),
);
