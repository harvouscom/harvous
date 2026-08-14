/**
 * A note sheet stacked over the Bible reader.
 *
 * The reader is the base paper and stays mounted with its scroll position; the note slides
 * over it, leaving the reader's top edge visible as the way back — the affordance Basecamp
 * uses for a card opened over its parent. Nothing here unmounts on flip, which is the whole
 * point: reading position and note draft both survive, so this is a move rather than a
 * navigation.
 *
 * Design + motion: `/__dev/design-system` → ds-15-paper-stack.
 * Timing is `PROTO_PAPER_STACK_MS` ↔ `--pds-duration-paper-stack`.
 */
import { type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import type { ReaderStackState } from '../../layouts/proto-shell-context';
import PrototypeBibleReaderPane from './PrototypeBibleReaderPane';

export default function PrototypeReaderPaperStack({
  stack,
  onFlipDown,
  onFlipUp,
  children,
}: {
  stack: ReaderStackState;
  onFlipDown: () => void;
  onFlipUp: () => void;
  children: ReactNode;
}) {
  return (
    <div className="pds-reader-stack">
      <div className="pds-reader-stack__base">
        <PrototypeBibleReaderPane
          book={stack.book}
          chapter={stack.chapter}
          translation={stack.translation}
          focusVerse={stack.fromVerse}
        />
      </div>

      {stack.open ? (
        <button type="button" className="pds-reader-stack__peek" onClick={onFlipDown}>
          <Icon name="chevron-down" size={12} aria-hidden />
          <span className="pds-caption">
            {stack.book} {stack.chapter}
          </span>
        </button>
      ) : (
        // The note is still there, just below the fold. Without a way back it would be a
        // draft the reader can see no trace of.
        <button type="button" className="pds-reader-stack__resume" onClick={onFlipUp}>
          <Icon name="note-sticky" size={13} aria-hidden />
          <span>Back to your note</span>
        </button>
      )}

      {/* Stays mounted either way — that is what makes this a flip and not a navigation:
          the draft, its selection, and the editor's undo history all survive. */}
      <div className="pds-reader-stack__sheet" data-stacked={stack.open ? 'true' : 'false'}>
        {children}
      </div>
    </div>
  );
}
