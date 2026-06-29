import { useHardwareKeyboard } from '@/hooks/useHardwareKeyboard';
import PrototypePaneEmptyState from './PrototypePaneEmptyState';
import ProtoKbdChord from './ProtoKbdChord';

/** Editor detail empty state — Mac-like on desktop; touch-first copy on mobile (native parity). */
export default function PrototypeEditorEmptyState() {
  const showKeyboardShortcuts = useHardwareKeyboard();

  return (
    <PrototypePaneEmptyState
      icon="note-sticky"
      title="Pick a note to open"
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
