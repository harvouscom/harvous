import type { MarginAnchorNoteLike } from '@/utils/scripture-margin-anchors';

/** Beyond this the gutter stops counting and just reads as "several" — the label carries the number. */
const MAX_VISIBLE_DOTS = 3;

function label(count: number, verse: number): string {
  return `${count === 1 ? '1 note' : `${count} notes`} on verse ${verse}`;
}

/**
 * The left-margin note notifier.
 *
 * One dot beside a verse someone has written about; a capsule of stacked dots
 * where a verse carries more than one note. It stays a marker rather than a
 * count — a reading margin that tallies things stops being a reading margin —
 * so the dots cap at three and the exact number lives in the label.
 *
 * Renders nothing when a verse has no notes, so the reader can mount one of
 * these per verse without branching at every row.
 */
export default function PrototypeReaderMarginNotifier({
  verse,
  notes,
  onOpen,
  active = false,
  inline = false,
}: {
  verse: number;
  notes: MarginAnchorNoteLike[];
  onOpen: (verse: number, notes: MarginAnchorNoteLike[]) => void;
  active?: boolean;
  /**
   * Sit in the text beside the verse number instead of in the gutter. Prose runs verses
   * together in one block, so there is no per-verse row to sit beside — and several marked
   * verses can land on one line, where gutter dots would stack on each other.
   */
  inline?: boolean;
}) {
  const count = notes.length;
  if (count === 0) return null;

  const dots = Math.min(count, MAX_VISIBLE_DOTS);
  const text = label(count, verse);

  return (
    <button
      type="button"
      className="proto-reader-margin"
      data-inline={inline ? 'true' : undefined}
      data-multi={count > 1 ? 'true' : undefined}
      data-active={active ? 'true' : undefined}
      aria-label={text}
      title={text}
      onClick={() => onOpen(verse, notes)}
    >
      <span className="proto-reader-margin__stack" aria-hidden>
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} className="proto-reader-margin__dot" />
        ))}
      </span>
    </button>
  );
}
