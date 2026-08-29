/**
 * Activity / Note / Read — the three things you can be doing, as one switch.
 *
 * Was two halves (compose and the reader) and gained Activity when the feed became the
 * app's first screen. The switch is the shell's whole primary navigation now, which is why
 * it earns the toolbar's leading position: everything else in that row acts on whatever
 * this one selected.
 *
 * The Note half carries two jobs resolved by where you already are, the way it always has:
 * it resumes the note you had open, and starts one when there is nothing to resume. Only
 * the second needs write permission, which is why the disabled test differs by half rather
 * than sitting on the control.
 *
 * Glyphs only, at every width. Three labelled halves would take the center folder chip's
 * room, which it has never had to spare — and the trio distinguishes itself.
 */
import type { CSSProperties, ReactNode, Ref } from 'react';
import Icon from '@/components/react/Icon';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import { PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';
import type { ShellMode } from '../../hooks/useShellModeNav';

/* Reading sits beside Activity; composing is the far end of the row. */
const MODE_INDEX: Record<ShellMode, number> = { activity: 0, reader: 1, note: 2 };

export default function ShellModeSegmented({
  mode,
  hasNoteToResume,
  onOpenActivity,
  onOpenNote,
  onOpenReader,
  canCompose,
  disabled,
  showShortcuts,
  composeLabel,
  spaceGlyph,
  spaceLabel,
  spaceMenuOpen = false,
  onOpenSpaceMenu = () => {},
  spaceMenuTriggerRef,
}: {
  mode: ShellMode;
  /** Decides whether the Note half offers to resume or to start. */
  hasNoteToResume: boolean;
  onOpenActivity: () => void;
  onOpenNote: () => void;
  onOpenReader: () => void;
  /** Write permission for the current space — blocks composing, never reading or returning. */
  canCompose: boolean;
  /** No home space yet: nothing here can act. */
  disabled?: boolean;
  showShortcuts: boolean;
  composeLabel: string;
  /** The active space's colour tile, when in one. Replaces the Activity glyph. */
  spaceGlyph?: ReactNode;
  /** The active space's name, for the Activity half's label. */
  spaceLabel?: string | null;
  spaceMenuOpen?: boolean;
  onOpenSpaceMenu?: () => void;
  spaceMenuTriggerRef?: Ref<HTMLButtonElement>;
}) {
  /*
   * The Activity half says what it will do, which changes with where you are. On Activity
   * the click opens the spaces menu, and a button still labelled "Activity" would be
   * describing the job it no longer has.
   */
  const activityLabel =
    mode === 'activity' ? `${spaceLabel ?? 'My Home'} — switch space` : 'Activity';
  const noteLabel = hasNoteToResume
    ? 'Back to your note'
    : canCompose
      ? composeLabel
      : 'Composing is not available in this channel yet';

  /* Resuming needs no write permission — reopening a note you already have is not a write.
     Only starting a new one does. */
  const noteDisabled = disabled || (!hasNoteToResume && !canCompose);

  return (
    <div
      className="proto-toolbar-seg proto-seg-track"
      role="group"
      aria-label="Activity, note, or Bible"
      /* All three halves always render, so the thumb always has somewhere to be. */
      style={
        {
          '--proto-seg-index': MODE_INDEX[mode],
          '--proto-seg-count': 3,
        } as CSSProperties
      }
    >
      <PrototypeToolbarShortcutItem shortcut="H" showShortcut={showShortcuts}>
        <button
          ref={spaceMenuTriggerRef}
          type="button"
          className="proto-toolbar-seg__btn"
          data-active={mode === 'activity'}
          aria-current={mode === 'activity' ? 'page' : undefined}
          /* Names the second job, or only the people who click twice ever find it. */
          title={activityLabel}
          aria-label={activityLabel}
          aria-haspopup="menu"
          aria-expanded={spaceMenuOpen}
          disabled={disabled}
          /*
           * Two jobs, resolved by where you already are — the same bargain the space
           * switcher's own trigger strikes in the sidebar, and for the same reason:
           * neither job should ever cost two clicks. Off Activity this takes you there.
           * On Activity, where the click used to be a no-op, it opens the spaces menu.
           */
          onClick={() => {
            if (mode !== 'activity') {
              onOpenActivity();
              return;
            }
            onOpenSpaceMenu();
          }}
        >
          {/*
            The space's colour tile replaces the glyph rather than joining it. The
            seg-track's thumb is sized `track / count` and offset by whole thumb-widths, so
            it assumes three equal segments — a label here, or any extra width, would put
            the thumb under the wrong half of the control.
          */}
          {spaceGlyph ?? <Icon name="layer-group" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />}
        </button>
      </PrototypeToolbarShortcutItem>

      {/* No space permission, unlike its neighbour — a chapter is not written to. */}
      <PrototypeToolbarShortcutItem shortcut="R" showShortcut={showShortcuts}>
        <button
          type="button"
          className="proto-toolbar-seg__btn"
          data-active={mode === 'reader'}
          aria-current={mode === 'reader' ? 'page' : undefined}
          title={mode === 'reader' ? 'Bible' : 'Read the Bible'}
          aria-label={mode === 'reader' ? 'Bible' : 'Read the Bible'}
          disabled={disabled}
          onClick={() => {
            if (mode !== 'reader') onOpenReader();
          }}
        >
          <Icon name="book-open" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
        </button>
      </PrototypeToolbarShortcutItem>
      {/* N stays "new note" from anywhere, so it is only advertised on the half that would
          actually compose — a keycap reading N under a button labelled "Back to your note"
          would be claiming something the click does not do. */}
      <PrototypeToolbarShortcutItem
        shortcut={hasNoteToResume ? undefined : 'N'}
        showShortcut={showShortcuts}
      >
        <button
          type="button"
          className="proto-toolbar-seg__btn"
          data-active={mode === 'note'}
          aria-current={mode === 'note' ? 'page' : undefined}
          title={noteLabel}
          aria-label={noteLabel}
          disabled={noteDisabled}
          onClick={onOpenNote}
        >
          <Icon name="pen-to-square" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
        </button>
      </PrototypeToolbarShortcutItem>

    </div>
  );
}
