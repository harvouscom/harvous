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
