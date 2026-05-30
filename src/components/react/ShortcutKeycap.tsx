import React from 'react';
import Icon from '@/components/react/Icon';

const KEYCAP_ACCESSIBILITY: Record<string, string> = {
  '⇧': 'Shift',
  '⌘': 'Command',
  '⌥': 'Option',
  '⌃': 'Control',
};

export function keycapAccessibilityLabel(symbol: string): string {
  return KEYCAP_ACCESSIBILITY[symbol] ?? symbol;
}

/** Single shortcut key cap — Font Awesome `circle-up` for Shift (⇧). */
export default function ShortcutKeycap({
  symbol,
  compact = false,
  className = '',
}: {
  symbol: string;
  compact?: boolean;
  className?: string;
}) {
  const mods = ['proto-kbd', compact ? 'proto-kbd--compact' : '', symbol === '⇧' ? 'proto-kbd--modifier' : '', className]
    .filter(Boolean)
    .join(' ');

  if (symbol === '⇧') {
    return (
      <kbd className={mods} aria-label={keycapAccessibilityLabel(symbol)}>
        <Icon name="circle-up" size={compact ? 9 : 11} className="proto-kbd__modifier-icon" aria-hidden />
      </kbd>
    );
  }

  return (
    <kbd className={mods} aria-label={keycapAccessibilityLabel(symbol)}>
      {symbol}
    </kbd>
  );
}
