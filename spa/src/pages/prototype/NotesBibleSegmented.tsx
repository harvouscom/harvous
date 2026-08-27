/**
 * Note / Bible — the two things you start here, as one switch.
 *
 * These were the toolbar's two adjacent buttons: compose and the reader. Separate, they
 * read as "two more actions" in a row that already had four. Joined, they say "writing or
 * reading, and here is which one you are in" — and the reader gains a visible state it
 * never had as a plain button.
 *
 * The Note half carries both jobs, resolved by where you already are — the same shape the
 * space and list orbs use, and for the same reason: neither job should cost two clicks.
 * Away in the reader, it takes you back to what you were reading. Already on the notes
 * side, it starts a new one. Only the second job needs write permission, which is why the
 * disabled test differs by half rather than sitting on the control.
 *
 * Glyphs only, at every width. The pair distinguishes itself, and the words were costing
 * the center folder chip room it has never had to spare.
 */
import type { CSSProperties } from 'react';
import Icon from '@/components/react/Icon';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import { PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';

export default function NotesBibleSegmented({
  isOnReadPage,
  onBackToNotes,
  onCompose,
  onOpenReader,
  canCompose,
  disabled,
  showShortcuts,
  composeLabel,
}: {
  isOnReadPage: boolean;
  onBackToNotes: () => void;
  onCompose: () => void;
  onOpenReader: () => void;
  /** Write permission for the current space — blocks composing, never reading or returning. */
  canCompose: boolean;
  /** No home space yet: nothing here can act. */
  disabled?: boolean;
  showShortcuts: boolean;
  composeLabel: string;
}) {
  const noteLabel = isOnReadPage
    ? 'Back to notes'
    : canCompose
      ? composeLabel
      : 'Composing is not available in this channel yet';

  return (
    <div
      className="proto-toolbar-seg proto-seg-track"
      role="group"
      aria-label="Note or Bible"
      /* Both halves always render here, so the thumb always has somewhere to be. */
      style={{ '--proto-seg-index': isOnReadPage ? 1 : 0 } as CSSProperties}
    >
      {/* N stays "new note" from anywhere, so it is only advertised on the half that is
          actually composing — a keycap reading N under a button labelled "Back to notes"
          would be claiming something the click does not do. */}
      <PrototypeToolbarShortcutItem
        shortcut={isOnReadPage ? undefined : 'N'}
        showShortcut={showShortcuts}
      >
        <button
          type="button"
          className="proto-toolbar-seg__btn"
          data-active={!isOnReadPage}
          aria-current={!isOnReadPage ? 'page' : undefined}
          title={noteLabel}
          aria-label={noteLabel}
          disabled={disabled || (!isOnReadPage && !canCompose)}
          onClick={() => {
            if (isOnReadPage) onBackToNotes();
            else onCompose();
          }}
        >
          <Icon name="pen-to-square" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
        </button>
      </PrototypeToolbarShortcutItem>
      {/* No space permission, unlike its other half — a chapter is not written to. */}
      <PrototypeToolbarShortcutItem shortcut="R" showShortcut={showShortcuts}>
        <button
          type="button"
          className="proto-toolbar-seg__btn"
          data-active={isOnReadPage}
          aria-current={isOnReadPage ? 'page' : undefined}
          title={isOnReadPage ? 'Bible' : 'Read the Bible'}
          aria-label={isOnReadPage ? 'Bible' : 'Read the Bible'}
          disabled={disabled}
          onClick={() => {
            if (!isOnReadPage) onOpenReader();
          }}
        >
          <Icon name="book-open" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
        </button>
      </PrototypeToolbarShortcutItem>
    </div>
  );
}
