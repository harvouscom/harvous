import Icon from '@/components/react/Icon';
import { useHardwareKeyboard } from '@/hooks/useHardwareKeyboard';
import ProtoKbdChord from './ProtoKbdChord';

/** Editor detail empty state — Mac-like on desktop; touch-first copy on mobile (native parity). */
export default function PrototypeEditorEmptyState() {
  const showKeyboardShortcuts = useHardwareKeyboard();

  return (
    <div className="proto-editor-empty-state" role="status">
      <Icon name="note-sticky" size={40} className="proto-editor-empty-state__icon" aria-hidden />
      <h2 className="proto-editor-empty-state__title">Pick a note to open</h2>
      {showKeyboardShortcuts ? (
        <div className="proto-editor-empty-state__description">
          <p className="proto-editor-empty-state__line">Choose a note in the sidebar,</p>
          <p className="proto-editor-empty-state__line proto-editor-empty-state__line--shortcut">
            <span>or press </span>
            <ProtoKbdChord keys="⇧N" />
            <span> to start writing.</span>
          </p>
        </div>
      ) : (
        <p className="proto-editor-empty-state__description proto-editor-empty-state__line">
          Choose a note in the list to open it.
        </p>
      )}
    </div>
  );
}
