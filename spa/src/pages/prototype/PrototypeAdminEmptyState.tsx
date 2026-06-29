import Icon from '@/components/react/Icon';
import { useHardwareKeyboard } from '@/hooks/useHardwareKeyboard';

/** Admin detail empty state — pick a section from the sidebar (mirrors PrototypeEditorEmptyState). */
export default function PrototypeAdminEmptyState() {
  const showKeyboardShortcuts = useHardwareKeyboard();

  return (
    <div className="proto-editor-empty-state" role="status">
      <Icon name="user-shield" size={40} className="proto-editor-empty-state__icon" aria-hidden />
      <h2 className="proto-editor-empty-state__title">Pick a section to open</h2>
      {showKeyboardShortcuts ? (
        <p className="proto-editor-empty-state__description proto-editor-empty-state__line">
          Choose Usage, Pulse, Publish, and more in the sidebar.
        </p>
      ) : (
        <p className="proto-editor-empty-state__description proto-editor-empty-state__line">
          Choose a section in the list to open it.
        </p>
      )}
    </div>
  );
}
