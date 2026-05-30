import ShortcutKeycap, { keycapAccessibilityLabel } from '@/components/react/ShortcutKeycap';

/** Per-character keycap row — matches native `HarvousShortcutKeycapsRow`. */
export default function ProtoKbdChord({
  keys,
  compact = false,
  stacked = false,
  className = '',
}: {
  keys: string;
  compact?: boolean;
  /** Vertical stack for multi-key chords in tight layouts. */
  stacked?: boolean;
  className?: string;
}) {
  const chars = [...keys];
  if (chars.length === 0) return null;

  const mods = [
    'proto-kbd-chord',
    compact ? 'proto-kbd-chord--compact' : '',
    stacked ? 'proto-kbd-chord--stacked' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const ariaLabel = chars.map(keycapAccessibilityLabel).join(' ');

  return (
    <span className={mods} aria-label={ariaLabel}>
      {chars.map((symbol, index) => (
        <ShortcutKeycap key={`${keys}-${index}-${symbol}`} symbol={symbol} compact={compact} />
      ))}
    </span>
  );
}
