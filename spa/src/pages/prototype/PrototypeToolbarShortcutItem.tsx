import type { ReactNode } from 'react';

type PrototypeToolbarShortcutItemProps = {
  children: ReactNode;
  shortcut?: string;
  showShortcut: boolean;
};

/** Icon button + letter keycap badge at bottom center, straddling the button edge (Shift implied while hints are visible). */
export default function PrototypeToolbarShortcutItem({
  children,
  shortcut,
  showShortcut,
}: PrototypeToolbarShortcutItemProps) {
  return (
    <div className="proto-toolbar-item">
      {children}
      {showShortcut && shortcut ? (
        <span className="proto-toolbar-item__hint" aria-hidden="true">
          <kbd className="proto-kbd proto-kbd--hint">{shortcut}</kbd>
        </span>
      ) : null}
    </div>
  );
}
