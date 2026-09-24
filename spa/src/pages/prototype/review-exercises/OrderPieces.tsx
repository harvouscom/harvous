/**
 * Put in order: the numbered places are the verse being rebuilt, the tray under them is what is
 * left to place.
 *
 * Tap a piece to put it in the next place, tap a placed one to send it back. No drag library,
 * which would be a dependency and a touch-target problem for a puzzle of three or four pieces.
 * The places are the scene and the tray is the work, so the stage lays them out; the order built
 * so far (`placed`, display indices in the order they were placed) stays in the dock.
 */
type PartState = 'right' | 'wrong' | undefined;

export function OrderSlots({
  phrases,
  placed,
  partState,
  disabled,
  onRemove,
}: {
  phrases: readonly string[];
  placed: readonly number[];
  /** The order built is the answer, so each place wears its own verdict. */
  partState: (position: number) => PartState;
  disabled: boolean;
  onRemove: (position: number) => void;
}) {
  return (
    <ol className="rx-slots">
      {phrases.map((_, position) => {
        const index = placed[position];
        return (
          <li key={position}>
            {index === undefined ? (
              /* An empty place is an outline the size of a piece, so the card shows how many are
                 left without a number. */
              <span className="rx-slot" aria-hidden />
            ) : (
              <button
                type="button"
                className="rx-slot"
                data-filled=""
                data-state={partState(position)}
                disabled={disabled}
                onClick={() => onRemove(position)}
                aria-label={`${position + 1}: ${phrases[index]}, tap to take it back`}
              >
                {phrases[index]}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function OrderTray({
  phrases,
  placed,
  disabled,
  onPlace,
}: {
  phrases: readonly string[];
  placed: readonly number[];
  disabled: boolean;
  onPlace: (index: number) => void;
}) {
  if (placed.length >= phrases.length) return null;
  return (
    <div className="rx-tray" role="group" aria-label="Pieces to place">
      {phrases.map((phrase, index) => {
        const used = placed.includes(index);
        return (
          /* A placed piece leaves its outline, so the tray keeps its shape as it empties. */
          <button
            key={index}
            type="button"
            className="rx-tile"
            data-used={used ? '' : undefined}
            disabled={disabled || used}
            aria-hidden={used ? true : undefined}
            tabIndex={used ? -1 : undefined}
            onClick={() => onPlace(index)}
          >
            {phrase}
          </button>
        );
      })}
    </div>
  );
}
