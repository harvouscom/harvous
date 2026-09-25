/**
 * Match the pairs — a church's question (docs/CHURCH_V2_ROADMAP.md §B).
 *
 * The same hands as putting pieces in order, so there is nothing new to learn: each left item
 * has a place beside it, the right-hand items wait in the tray under them (`OrderTray`), a tap
 * puts one into the first empty place, and a tap on a placed one sends it back. Marked per pair.
 *
 * The page holds no key. `picks[row]` is the index into `right` the reader put beside `left[row]`,
 * and the server says which of those were right.
 */
type PartState = 'right' | 'wrong' | undefined;

export function MatchRows({
  left,
  right,
  picks,
  partState,
  disabled,
  onClear,
}: {
  left: readonly string[];
  right: readonly string[];
  picks: readonly (number | null)[];
  partState: (row: number) => PartState;
  disabled: boolean;
  onClear: (row: number) => void;
}) {
  return (
    <ol className="rx-match">
      {left.map((label, row) => {
        const pick = picks[row];
        return (
          <li key={row} className="rx-match__row">
            <span className="rx-match__left">{label}</span>
            {pick == null ? (
              <span className="rx-slot rx-match__slot" aria-hidden />
            ) : (
              <button
                type="button"
                className="rx-slot rx-match__slot"
                data-filled=""
                data-state={partState(row)}
                disabled={disabled}
                onClick={() => onClear(row)}
                aria-label={`${label}: ${right[pick]}, tap to take it back`}
              >
                {right[pick]}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Pure: put a right-hand item in the first empty place. */
export function placeMatch(picks: readonly (number | null)[], index: number): (number | null)[] {
  const next = [...picks];
  const empty = next.findIndex((pick) => pick == null);
  if (empty !== -1 && !next.includes(index)) next[empty] = index;
  return next;
}
