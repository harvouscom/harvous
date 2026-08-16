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
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import type { PaperStackState } from '../../layouts/proto-shell-context';
import PrototypeBibleReaderPane from './PrototypeBibleReaderPane';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import { morphFromIfStillPlaced, readPaperStackLayoutSignature } from './paper-stack-origins';

export default function PrototypePaperStack({
  stack,
  exiting = false,
  onFlipDown,
  onFlipUp,
  onDismiss,
  onSuggestionNevermind,
  onSuggestionIgnore,
  baseSlot,
  children,
}: {
  stack: PaperStackState;
  /** The sheet is on its way out — plays the reverse morph before the stack clears. */
  exiting?: boolean;
  onFlipDown: () => void;
  onFlipUp: () => void;
  /** Put the origin down: the stack clears and the sheet becomes an ordinary page. */
  onDismiss: () => void;
  /**
   * Answers to a suggestion, offered only when the origin carries one.
   *
   * `nevermind` goes back to the shelf and puts the row back on it — the undo for having
   * taken a suggestion you did not mean to. `ignore` is the opposite: rest it for good and
   * stay where you are. The plain × in between them keeps its usual meaning, which here is
   * "I am staying, and I do not need the way back" — it answers the breadcrumb, not the
   * suggestion.
   */
  onSuggestionNevermind?: () => void;
  onSuggestionIgnore?: () => void;
  /**
   * What to render as the paper behind, in place of the descriptor's own stand-in.
   *
   * Used when the sheet is parked and the paper behind has become the thing you are
   * actually using: the layout hands over the live route, so the chapter down there is the
   * real reader with all of its handlers rather than a chrome-less copy of one.
   */
  baseSlot?: ReactNode;
  children: ReactNode;
}) {
  const { origin } = stack;
  const collapses = origin.kind === 'noteDock';
  /** A row off Home's Suggested shelf — its edge answers the suggestion, not just the way back. */
  const suggestion = origin.suggestion;
  /** `New Note` is what every other surface calls a note with no title yet — rows, search,
      the mention picker. The edge is one more of those, so it uses the same word. */
  const parkedLabel = stripServerAutoUntitledNoteTitleForDisplay(stack.noteTitle ?? '') || 'New Note';

  /*
   * The chapter is revealed out of the dock's rectangle, not scaled up from it.
   *
   * A transform would have to squash a page of text to the shape of a dock card and stretch
   * it back, and the reader is the one surface where distorted words are unacceptable. A
   * clip-path costs nothing in layout: the chapter lays out once, at full size, and only the
   * visible region grows — which is what "growing out of the dock" actually looked like.
   *
   * The four insets are measured against the stack's own box because clip-path is relative
   * to the element, while the rect we captured is in viewport coordinates. Measured in a
   * layout effect rather than at render: the stack's position is not knowable until it is in
   * the document, and this runs before paint, so the first animated frame already has them.
   */
  /*
   * Recomputed on every render rather than captured, which is what makes the check land at
   * the right moment: the only render that matters here is the one that sets `data-exiting`,
   * and by then the pane is whatever it is now. The layout runs the same test in the same
   * click, so the hold and the animation never disagree.
   */
  const morph = collapses
    ? morphFromIfStillPlaced(origin.morphFrom, readPaperStackLayoutSignature())
    : undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || !morph) return;
    const box = el.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const top = Math.max(0, morph.top - box.top);
    const left = Math.max(0, morph.left - box.left);
    el.style.setProperty('--pds-morph-inset-top', `${top}px`);
    el.style.setProperty('--pds-morph-inset-left', `${left}px`);
    el.style.setProperty('--pds-morph-inset-right', `${Math.max(0, box.width - left - morph.width)}px`);
    el.style.setProperty('--pds-morph-inset-bottom', `${Math.max(0, box.height - top - morph.height)}px`);
  }, [morph]);

  return (
    <div
      className="pds-paper-stack"
      data-origin-kind={origin.kind}
      data-exiting={exiting ? 'true' : undefined}
      data-morph={morph ? 'true' : undefined}
      ref={rootRef}
    >
      <div className="pds-paper-stack__base">
        {baseSlot ? (
          /*
           * The live route, because this layer is no longer just a backdrop.
           *
           * While the sheet is up, the paper behind is scenery — a plain chapter is enough,
           * and that is what the descriptor renders. Flip the sheet down and that same layer
           * becomes the page you are reading, at which point a chrome-less copy is a trap:
           * selecting a verse offered one action out of four, because the pane had been
           * handed no handlers to offer the rest. The layout passes the real reader in for
           * exactly that state.
           */
          baseSlot
        ) : origin.base.type === 'reader' ? (
          // A background layer, seen for its top edge and during a flip-down pause — the
          // plain chapter is enough. Highlights and margin markers belong to the live reader.
          //
          // Wrapped in the same pane shell the route would give it, and that `baseSlot`
          // above already carries. Bare, this layer laid its column out against different
          // rules than the sheet's — so the stand-in chapter sat at a slightly different
          // width and height than the real one, and the swap on flip-down was visible as a
          // jump. Same wrapper, same measure, nothing moves.
          <PrototypeMainPaneShell>
            <PrototypeBibleReaderPane
              book={origin.base.book}
              chapter={origin.base.chapter}
              translation={origin.base.translation}
              focusVerse={origin.base.fromVerse}
            />
          </PrototypeMainPaneShell>
        ) : collapses ? (
          // Nothing. A dock expansion is a morph, not a stack: the chapter grows out of the
          // card that asked for it and fills the pane, so there is no paper behind it and no
          // band of one peeking. The note is not underneath — it is where you came from, and
          // the collapse control says so.
          null
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

      {collapses ? (
        /*
         * A corner control, not an edge.
         *
         * The edge means "the paper behind, tap to go back to it", and after the morph there
         * is no paper behind — the chapter is the page. Keeping the band would have promised
         * a layer that is not there, and put a second way to do what this button does. So the
         * noteDock origin trades it for the gesture its shape actually implies: close this,
         * go back to the note it came out of.
         */
        <button
          type="button"
          className="proto-side-panel__action-btn pds-paper-stack__collapse"
          onClick={onFlipDown}
          aria-label={`Back to ${origin.label}`}
          title={`Back to ${origin.label}`}
        >
          <Icon name="down-left-and-up-right-to-center" size={13} aria-hidden />
        </button>
      ) : stack.open && suggestion ? (
        /*
         * A suggestion's edge asks something the others do not.
         *
         * The reader and the note-dock edges are places: they hold state you will want back,
         * and the only question is whether you are going. A row off the Suggested shelf is a
         * proposal, and arriving somewhere because of one leaves you with three honest
         * answers — this was not what I meant, this was fine but I am done with the way back,
         * or do not offer me this again. None of them is a timer's to guess, which is why
         * nothing here expires: the edge waits.
         */
        <div className="pds-paper-stack__edge-row pds-paper-stack__edge-row--suggestion">
          <button
            type="button"
            className="pds-paper-stack__edge"
            onClick={onSuggestionNevermind ?? onFlipDown}
            aria-label={`Nevermind — back to ${origin.label} and keep suggesting it`}
            title="Nevermind"
          >
            <Icon name={origin.icon as IconName} size={12} aria-hidden />
            <span className="pds-caption">{origin.label}</span>
          </button>
          {onSuggestionIgnore ? (
            <button
              type="button"
              className="proto-side-panel__action-btn pds-paper-stack__edge-dismiss pds-paper-stack__edge-ignore"
              onClick={onSuggestionIgnore}
              aria-label={`Stop suggesting ${origin.label}`}
              title="Don't suggest this again"
            >
              <Icon name="eye-slash" size={12} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className="proto-side-panel__action-btn pds-paper-stack__edge-dismiss"
            onClick={onDismiss}
            aria-label={`Stop showing ${origin.label} behind this`}
            title="Put the way back down"
          >
            <Icon name="xmark" size={12} aria-hidden />
          </button>
        </div>
      ) : stack.open ? (
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
            // The shell's icon block, the same one every other dismiss in the app sits in —
            // side panels, toasts, the founder pill. Only placement and when it shows are
            // this component's business; the button itself is not a new kind of button.
            className="proto-side-panel__action-btn pds-paper-stack__edge-dismiss"
            onClick={onDismiss}
            aria-label={`Stop showing ${origin.label} behind this`}
          >
            <Icon name="xmark" size={12} aria-hidden />
          </button>
        </div>
      ) : (
        /*
         * The parked note's own edge, on the band at the top — the same gesture in the same
         * place as the edge that put it there.
         *
         * It carries the dismiss too. That was left off at first on the reasoning that
         * putting down a breadcrumb and throwing away a mounted draft are different acts,
         * but a draft cannot reach this state: parking requires a note id, and a compose
         * draft has none until it saves. By the time a note can be parked it is persisted,
         * so dismissing it drops the stack and leaves the note where it already lives.
         */
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
          <button
            type="button"
            className="proto-side-panel__action-btn pds-paper-stack__edge-dismiss"
            onClick={onDismiss}
            aria-label={`Stop showing ${parkedLabel} behind this`}
          >
            <Icon name="xmark" size={12} aria-hidden />
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
