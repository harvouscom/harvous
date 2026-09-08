/**
 * Where the notes you arrived already holding sit in the picker.
 *
 * A suggestion that proposes threading three notes opens the picker with those three ticked.
 * They used to land wherever the pool's own order put them, which on a shelf of thirty notes
 * is usually below the fold — so the Create button lighting up was the only sign the selection
 * had come across at all, and checking what you were about to make meant hunting for your own
 * ticks.
 *
 * Pulled out of the picker's memo because it is a rule about order rather than a step in
 * building a list, and because the one thing it must not do — reorder anything else — is
 * exactly the thing that is invisible until it goes wrong.
 */

/**
 * The arriving selection first, everything else untouched.
 *
 * Stable: `Array.prototype.sort` has been required to be stable since ES2019, and this
 * comparator returns 0 for any two rows on the same side of the line, so the pool's own order
 * survives within both groups.
 *
 * `arrived` is deliberately not the *live* selection. Sorting on that would reflow the list
 * under the pointer every time someone ticked a row — the version of this that feels broken
 * rather than helpful. The caller freezes it when the picker opens.
 */
export function hoistArrivedSelection<T extends { id: string }>(
  pool: readonly T[],
  arrived: ReadonlySet<string>,
): T[] {
  if (arrived.size === 0) return [...pool];
  return [...pool].sort((a, b) => Number(arrived.has(b.id)) - Number(arrived.has(a.id)));
}
