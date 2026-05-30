/** Per-character keycap row — matches native `SettingsShortcutKeycapsRow`. */
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

  return (
    <span className={mods}>
      {chars.map((symbol, index) => (
        <kbd key={`${keys}-${index}-${symbol}`} className={`proto-kbd${compact ? ' proto-kbd--compact' : ''}`}>
          {symbol}
        </kbd>
      ))}
    </span>
  );
}
