/**
 * The date as a tile, in the slot a Church tools row fills with an icon.
 *
 * "Aug 9" on one line needed 44px where an icon block takes 26, so sermon
 * titles started 18px right of series titles and the two lanes read as two
 * different lists stacked on each other. Stacking month over day fits the same
 * square, which is what puts every title on one edge.
 *
 * Shared rather than copied: the plan pane, the series sheet and the expanded
 * planner list are the same row anatomy, and the whole point of the tile is
 * that they agree on where a title starts. Three copies could not stay agreed
 * — the expanded list is proof, since it kept a 104px text column while the
 * other two moved to the square.
 */
export default function ProtoServiceDateTile({
  iso,
  unwritten,
}: {
  iso: string | null;
  /**
   * Nothing written into this week yet. Hollows the tile, so a run's unfilled
   * slots read straight down a list — the same "held open" language the board
   * and calendar draw with a dashed card.
   */
  unwritten?: boolean;
}) {
  const className = `proto-church-tools__row-date${
    unwritten ? ' proto-church-tools__row-date--unwritten' : ''
  }`;
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!match) {
    /* An undated idea still needs the slot filled — an empty tile reads as a
       rendering bug where a dash reads as "not yet". */
    return (
      <span className={className} aria-label="No date yet">
        <span className="proto-church-tools__row-date-day">—</span>
      </span>
    );
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const spoken = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  return (
    <span
      className={className}
      /* The state is said, not only drawn — a hollow tile is invisible to a
         screen reader otherwise. */
      aria-label={unwritten ? `${spoken}, nothing written yet` : spoken}
    >
      <span className="proto-church-tools__row-date-month" aria-hidden>
        {date.toLocaleDateString(undefined, { month: 'short' })}
      </span>
      <span className="proto-church-tools__row-date-day" aria-hidden>
        {date.getDate()}
      </span>
    </span>
  );
}
