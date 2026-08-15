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
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import type { PaperStackState } from '../../layouts/proto-shell-context';
import PrototypeBibleReaderPane from './PrototypeBibleReaderPane';

export default function PrototypePaperStack({
  stack,
  exiting = false,
  retiring = false,
  onFlipDown,
  onFlipUp,
  onDismiss,
  children,
}: {
  stack: PaperStackState;
  /** The sheet is on its way out — plays the reverse morph before the stack clears. */
  exiting?: boolean;
  /**
   * The origin is retiring itself — the sheet settles to where an unstacked page sits and
   * the edge fades, then the stack clears. Only Home does this; see the layout for why.
   */
  retiring?: boolean;
  onFlipDown: () => void;
  onFlipUp: () => void;
  /** Put the origin down: the stack clears and the sheet becomes an ordinary page. */
  onDismiss: () => void;
  children: ReactNode;
}) {
  const { origin } = stack;
  const collapses = origin.kind === 'noteDock';
  /** `New Note` is what every other surface calls a note with no title yet — rows, search,
      the mention picker. The edge is one more of those, so it uses the same word. */
  const parkedLabel = stripServerAutoUntitledNoteTitleForDisplay(stack.noteTitle ?? '') || 'New Note';

  return (
    <div
      className="pds-paper-stack"
      data-origin-kind={origin.kind}
      data-exiting={exiting ? 'true' : undefined}
      data-retiring={retiring ? 'true' : undefined}
    >
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
        ) : collapses ? (
          // The note whose dock expanded shows exactly as much of itself as any base does:
          // the top band of its paper, never a word of its content. So the layer behind is
          // that — the note's own paper, at the note's own width and lip, empty because
          // nothing more is ever on screen. Restating it as a card put a second copy of the
          // note in the middle of the pane, ghosting up through the chapter text.
          <div className="proto-editor-surface pds-paper-stack__origin-paper" aria-hidden>
            <div className="proto-editor-scroll">
              <div className="proto-editor-content-wrap">
                <div className="proto-editor-paper" />
              </div>
            </div>
          </div>
        ) : (
          // Home has no main-pane document to stand behind a note, so the base restates the
          // card that sent you: flipping down lands on "this is why you were here", not a blank.
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
        <div className="pds-paper-stack__edge-row">
          <button
            type="button"
            className="pds-paper-stack__edge"
            onClick={onFlipDown}
            aria-label={collapses ? `Back to ${origin.label}` : `Show ${origin.label}`}
          >
            <Icon name={origin.icon as IconName} size={12} aria-hidden />
            <span className="pds-caption">{origin.label}</span>
          </button>
          {/*
            Put the origin down for good.

            Automatic teardown already handles the cases that are stale by definition — a
            different note, a different space, off to Settings. What it cannot know is
            whether you are finished with where you came from, and no rule guesses that
            well: it would either clear the edge while you still wanted it or leave it up
            long after you did not. So the answer is a gesture, not a heuristic.

            Only on the origin edge, never on a parked note: dismissing the paper you came
            from puts a breadcrumb down, while dismissing a parked note would throw away a
            mounted draft. Those are not the same act and must not share a control.
          */}
          <button
            type="button"
            className="pds-paper-stack__edge-dismiss"
            onClick={onDismiss}
            aria-label={`Stop showing ${origin.label} behind this`}
          >
            <Icon name="xmark" size={11} aria-hidden />
          </button>
        </div>
      ) : (
        // The parked sheet is still there, its top edge showing above the pane's bottom —
        // the mirror of the base peeking above it when it is up. Its edge is the way back,
        // the same gesture at the other end of the pane; a floating "back to your note"
        // button would say the sheet had gone somewhere, and it has not.
        //
        // Labelled with the note's own title, like every other row that stands for a note.
        // "Your note" was the same words over every note you ever parked, which told you
        // which pane you were looking at and nothing about which note was in it.
        <div className="pds-paper-stack__edge-row pds-paper-stack__edge-row--parked">
          <button
            type="button"
            className="pds-paper-stack__edge"
            onClick={onFlipUp}
            aria-label={`Bring ${parkedLabel} back up`}
          >
            <Icon name="note-sticky" size={12} aria-hidden />
            <span className="pds-caption">{parkedLabel}</span>
          </button>
        </div>
      )}

      {/* Stays mounted either way — that is what makes this a flip and not a navigation:
          the draft, its selection, and the editor's undo history all survive. */}
      <div className="pds-paper-stack__sheet" data-stacked={stack.open ? 'true' : 'false'}>
        {children}
      </div>
    </div>
  );
}
