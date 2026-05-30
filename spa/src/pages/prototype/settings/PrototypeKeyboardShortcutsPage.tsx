import React from 'react';
import { getPrototypeKeyboardShortcutsReference } from '@/utils/keyboard-shortcuts';
import { SettingsShell } from './SettingsShell';

export default function PrototypeKeyboardShortcutsPage() {
  const shortcutGroups = getPrototypeKeyboardShortcutsReference();

  return (
    <SettingsShell title="Keyboard shortcuts">
      <p className="pds-caption" style={{ margin: '0 0 16px', color: 'var(--pds-text-secondary)' }}>
        Prototype shortcuts use Shift plus a letter or symbol. Hold Shift alone for a moment to see letter hints
        on toolbar buttons (Shift is implied). In the editor, Shift+letter still types as usual — use shortcuts
        when focus is outside the note body.
      </p>
      <div className="proto-shortcuts-page">
        {shortcutGroups.map((group, groupIndex) => (
          <React.Fragment key={group.heading}>
            {groupIndex > 0 ? <div className="proto-shortcuts-page__divider" aria-hidden="true" /> : null}
            <p className="proto-shortcuts-page__heading">{group.heading}</p>
            <ul className="proto-shortcuts-page__list">
              {group.items.map((row) => (
                <li key={row.action} className="proto-shortcuts-page__item">
                  <span className="proto-shortcuts-page__action">{row.action}</span>
                  <span className="proto-kbd-chord" aria-label={row.keyParts.join(' + ')}>
                    {row.keyParts.map((part, i) => (
                      <React.Fragment key={`${row.action}-${i}-${part}`}>
                        {i > 0 ? <span className="proto-kbd-chord__sep">+</span> : null}
                        <kbd className="proto-kbd">{part}</kbd>
                      </React.Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </React.Fragment>
        ))}
      </div>
    </SettingsShell>
  );
}
