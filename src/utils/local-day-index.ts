/**
 * Calendar-day index in the viewer's own timezone — the unit recall cooldowns are counted in.
 *
 * Its own module because of who needs it. It is one line, and it used to live in
 * `prototype-home-trends`, which is two thousand lines of Home's derivations. The shell's
 * layout began needing it for the recall edge's "ignore", and importing it from there put
 * that whole module on the initial chunk — 7KB over budget for a `Math.floor`.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export function localDayIndex(date: Date): number {
  return Math.floor(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / DAY_MS,
  );
}
