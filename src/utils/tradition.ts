/**
 * Which Bible a reader reads: the one setting behind every Catholic difference in Harvous.
 *
 * Catholic turns on, together: the 73-book canon in book lists, pickers and search (in Catholic
 * order), Today's readings from the Mass lectionary, and Catholic season names. It never changes
 * which translation someone reads — switching only offers the NABRE — and it never decides
 * whether a translation *carries* a book: a Protestant reading the NABRE still sees Tobit,
 * because the NABRE has it.
 *
 * One switch, no sub-settings, by design: a Catholic reader wants all of it or none of it.
 * A union rather than a boolean so an Orthodox canon can join without another column.
 */
export type Tradition = 'protestant' | 'catholic';

export const TRADITIONS: readonly Tradition[] = ['protestant', 'catholic'];

export const DEFAULT_TRADITION: Tradition = 'protestant';

/** Anything stored or sent, read as a tradition. Unknown and missing values are Protestant. */
export function normalizeTradition(value: unknown): Tradition {
  return value === 'catholic' ? 'catholic' : DEFAULT_TRADITION;
}

export function isTradition(value: unknown): value is Tradition {
  return value === 'protestant' || value === 'catholic';
}
