/**
 * The Lectionary for Mass (USA, 2002): feasts of the saints, which have their own readings and
 * replace the weekday's. Memorials are not here: most take the weekday readings, and a reader
 * whose parish keeps one hears the weekday's anyway as often as not. Conventions as in
 * `sundays-and-solemnities.ts`; where the Lectionary offers a choice, the first.
 *
 * Keyed by date, `MM-DD`. A feast on a Sunday, in Holy Week or in the Easter Octave is not kept
 * that year (`src/utils/lectionary.ts`).
 */
import type { LectionaryDayReadings } from './sundays-and-solemnities';

const f = (n: number, title: string, first: string, psalm: string, gospel: string) => ({
  title,
  readings: { all: { n, first, psalm, gospel } } as LectionaryDayReadings,
});

export const SAINTS_FEASTS: Record<string, { title: string; readings: LectionaryDayReadings }> = {
  '01-25': f(519, 'The Conversion of St. Paul', 'Acts 22:3-16', 'Psalm 117:1bc, 2', 'Mark 16:15-18'),
  '02-22': f(535, 'The Chair of St. Peter', '1 Peter 5:1-4', 'Psalm 23:1-3a, 4, 5, 6', 'Matthew 16:13-19'),
  '04-25': f(555, 'St. Mark', '1 Peter 5:5b-14', 'Psalm 89:2-3, 6-7, 16-17', 'Mark 16:15-20'),
  '05-03': f(561, 'Sts. Philip and James', '1 Corinthians 15:1-8', 'Psalm 19:2-3, 4-5', 'John 14:6-14'),
  '05-14': f(564, 'St. Matthias', 'Acts 1:15-17, 20-26', 'Psalm 113:1-2, 3-4, 5-6, 7-8', 'John 15:9-17'),
  '05-31': f(572, 'The Visitation', 'Zephaniah 3:14-18a', 'Isaiah 12:2-3, 4bcd, 5-6', 'Luke 1:39-56'),
  '07-03': f(593, 'St. Thomas', 'Ephesians 2:19-22', 'Psalm 117:1bc, 2', 'John 20:24-29'),
  '07-22': f(603, 'St. Mary Magdalene', 'Song of Solomon 3:1-4b', 'Psalm 63:2, 3-4, 5-6, 8-9', 'John 20:1-2, 11-18'),
  '07-25': f(605, 'St. James', '2 Corinthians 4:7-15', 'Psalm 126:1bc-2ab, 2cd-3, 4-5, 6', 'Matthew 20:20-28'),
  '08-10': f(618, 'St. Lawrence', '2 Corinthians 9:6-10', 'Psalm 112:1-2, 5-6, 7-8, 9', 'John 12:24-26'),
  '08-24': f(629, 'St. Bartholomew', 'Revelation 21:9b-14', 'Psalm 145:10-11, 12-13, 17-18', 'John 1:45-51'),
  '09-08': f(636, 'The Nativity of Mary', 'Micah 5:1-4a', 'Psalm 13:6ab, 6c', 'Matthew 1:1-16, 18-23'),
  '09-21': f(643, 'St. Matthew', 'Ephesians 4:1-7, 11-13', 'Psalm 19:2-3, 4-5', 'Matthew 9:9-13'),
  '09-29': f(647, 'Sts. Michael, Gabriel and Raphael', 'Daniel 7:9-10, 13-14', 'Psalm 138:1-2ab, 2cde-3, 4-5', 'John 1:47-51'),
  '10-18': f(661, 'St. Luke', '2 Timothy 4:10-17b', 'Psalm 145:10-11, 12-13, 17-18', 'Luke 10:1-9'),
  '10-28': f(666, 'Sts. Simon and Jude', 'Ephesians 2:19-22', 'Psalm 19:2-3, 4-5', 'Luke 6:12-16'),
  '11-30': f(684, 'St. Andrew', 'Romans 10:9-18', 'Psalm 19:8, 9, 10, 11', 'Matthew 4:18-22'),
  '12-26': f(696, 'St. Stephen', 'Acts 6:8-10; 7:54-59', 'Psalm 31:3cd-4, 6, 8ab, 16bc, 17', 'Matthew 10:17-22'),
  '12-27': f(697, 'St. John', '1 John 1:1-4', 'Psalm 97:1-2, 5-6, 11-12', 'John 20:1a, 2-8'),
  '12-28': f(698, 'The Holy Innocents', '1 John 1:5—2:2', 'Psalm 124:2-3, 4-5, 7b-8', 'Matthew 2:13-18'),
};
