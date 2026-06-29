import { useHardwareKeyboard } from '@/hooks/useHardwareKeyboard';
import PrototypePaneEmptyState from './PrototypePaneEmptyState';

/** Admin detail empty state — pick a section from the sidebar (mirrors PrototypeEditorEmptyState). */
export default function PrototypeAdminEmptyState() {
  const showKeyboardShortcuts = useHardwareKeyboard();

  return (
    <PrototypePaneEmptyState
      icon="user-shield"
      title="Pick a section to open"
      description={
        showKeyboardShortcuts ? (
          <p className="proto-editor-empty-state__line">
            Choose Usage, Pulse, Publish, and more in the sidebar.
          </p>
        ) : (
          <p className="proto-editor-empty-state__line">Choose a section in the list to open it.</p>
        )
      }
    />
  );
}
