import { useHardwareKeyboard } from '@/hooks/useHardwareKeyboard';
import PrototypePaneEmptyState from './PrototypePaneEmptyState';
import ProtoKbdChord from './ProtoKbdChord';
import { useActiveSpace } from '../../hooks/useActiveSpace';

/** Editor detail empty state — Mac-like on desktop; touch-first copy on mobile (native parity). */
export default function PrototypeEditorEmptyState() {
  const showKeyboardShortcuts = useHardwareKeyboard();
  const { isSharedSpace, spaceTitle } = useActiveSpace();
  // Naming the space matters right after a space switch closed a note the new
  // space can't hold — otherwise the empty pane reads as a note that went missing.
  const title =
    isSharedSpace && spaceTitle?.trim()
      ? `Nothing open in ${spaceTitle.trim()}`
      : 'Pick a note to open';

  return (
    <PrototypePaneEmptyState
      icon="note-sticky"
      title={title}
      /* Dispatches the same event ⇧N fires rather than resolving a compose target
         of its own — the shortcut's owner already knows which space to write into,
         closes the mobile drawer, and navigates. Sharing the seam is also what
         keeps this button and the "or press ⇧N" line beside it from drifting. */
      action={{
        label: 'New note',
        onClick: () => window.dispatchEvent(new Event('prototypeShortcutNewNote')),
      }}
      description={
        showKeyboardShortcuts ? (
          <>
            <p className="proto-editor-empty-state__line">Choose a note in the sidebar,</p>
            <p className="proto-editor-empty-state__line proto-editor-empty-state__line--shortcut">
              <span>or press </span>
              <ProtoKbdChord keys="⇧N" />
              <span> to start writing.</span>
            </p>
          </>
        ) : (
          <p className="proto-editor-empty-state__line">Choose a note in the list to open it.</p>
        )
      }
    />
  );
}
