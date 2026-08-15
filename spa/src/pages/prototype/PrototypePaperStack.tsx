/**
 * A sheet stacked over the paper it came from.
 *
 * The origin is the base paper and stays mounted; the sheet slides over it, leaving the
 * origin's top edge visible as the way back — the affordance Basecamp uses for a card opened
 * over its parent. The edge is the base paper's *own* edge: its rounded corners, its surface,
 * with the sheet's shadow falling on it. It says why you are here (a chapter, a Home card, the
 * note whose dock you expanded) and tapping it takes you back there.
 *
 * Nothing unmounts on flip, which is the whole point: reading position and note draft both
 * survive, so this is a move rather than a navigation. The exception is a `noteDock` origin,
 * where the edge *collapses* rather than parks — the dock is the reader's parked form already,
 * and keeping a second copy below the note would be the same paper in two places.
 *
 * Design + motion: `/__dev/design-system` → ds-15-paper-stack.
 * Timing is `PROTO_PAPER_STACK_MS` ↔ `--pds-duration-paper-stack`; the noteDock morph is
 * `PROTO_RESOURCE_MORPH_MS` ↔ `--pds-duration-morph`.
 */
import { type ReactNode } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import type { PaperStackState } from '../../layouts/proto-shell-context';
import PrototypeBibleReaderPane from './PrototypeBibleReaderPane';

export default function PrototypePaperStack({
  stack,
  exiting = false,
  onFlipDown,
  onFlipUp,
  children,
}: {
  stack: PaperStackState;
  /** The sheet is on its way out — plays the reverse morph before the stack clears. */
  exiting?: boolean;
  onFlipDown: () => void;
  onFlipUp: () => void;
  children: ReactNode;
}) {
  const { origin } = stack;
  const collapses = origin.kind === 'noteDock';

  return (
    <div className="pds-paper-stack" data-origin-kind={origin.kind} data-exiting={exiting ? 'true' : undefined}>
      <div className="pds-paper-stack__base">
        {origin.base.type === 'reader' ? (
          // A background layer, seen for its top edge and during a flip-down pause — the
          // plain chapter is enough. Highlights and margin markers belong to the live reader.
          <PrototypeBibleReaderPane
            book={origin.base.book}
            chapter={origin.base.chapter}
            translation={origin.base.translation}
            focusVerse={origin.base.fromVerse}
          />
        ) : (
          // Home has no main-pane document to stand behind a note, and a note whose dock
          // expanded is itself the origin. Either way the base restates the card that sent
          // you, so flipping down lands on "this is why you were here" and not on a blank.
          <div className="pds-paper-stack__origin-card" aria-hidden>
            <span className="proto-home-card__icon-orb pds-paper-stack__origin-orb">
              <Icon name={origin.base.icon as IconName} size={13} />
            </span>
            {origin.base.eyebrow ? (
              <p className="proto-caption pds-paper-stack__origin-eyebrow">{origin.base.eyebrow}</p>
            ) : null}
            <p className="pds-list-title pds-paper-stack__origin-title">{origin.base.title}</p>
            {origin.base.meta ? (
              <p className="pds-caption pds-paper-stack__origin-meta">{origin.base.meta}</p>
            ) : null}
          </div>
        )}
      </div>

      {stack.open ? (
        <button
          type="button"
          className="pds-paper-stack__edge"
          onClick={onFlipDown}
          aria-label={collapses ? `Back to ${origin.label}` : `Show ${origin.label}`}
        >
          <Icon name={origin.icon as IconName} size={12} aria-hidden />
          <span className="pds-caption">{origin.label}</span>
        </button>
      ) : (
        // The parked sheet is still there, its top edge showing above the pane's bottom —
        // the mirror of the base peeking above it when it is up. Its edge is the way back,
        // the same gesture at the other end of the pane; a floating "back to your note"
        // button would say the sheet had gone somewhere, and it has not.
        <button
          type="button"
          className="pds-paper-stack__edge pds-paper-stack__edge--parked"
          onClick={onFlipUp}
          aria-label="Bring your note back up"
        >
          <Icon name="note-sticky" size={12} aria-hidden />
          <span className="pds-caption">Your note</span>
        </button>
      )}

      {/* Stays mounted either way — that is what makes this a flip and not a navigation:
          the draft, its selection, and the editor's undo history all survive. */}
      <div className="pds-paper-stack__sheet" data-stacked={stack.open ? 'true' : 'false'}>
        {children}
      </div>
    </div>
  );
}
