/**
 * A run, named and coloured in one object.
 *
 * This started as a bare colour square beside the series' name. A square and
 * its label are two things the eye has to associate; a pill is one thing that
 * already says what it is — and it can carry the run's colour at a size where
 * colour actually reads, which a 9px chip never quite did.
 *
 * The colour is the icon block's, not a new one. `--space-icon-accent` is the
 * soft tile fill every space, channel and series face already wears, and the
 * label takes the darkened, saturated derivation of that same hue that those
 * tiles use for their glyph. So a series' pill and its face in the Series view
 * are the same colour by construction rather than by two recipes agreeing.
 *
 * Never colour alone: the run's name is inside the pill, so nothing here asks
 * anyone to decode a hue.
 */
import { useSyncExternalStore } from 'react';
import { spaceIconAccentHex } from '@/utils/space-cover';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../../lib/prototype-background';

export default function ProtoSeriesPill({
  accent,
  name,
  compact = false,
}: {
  /** Null renders nothing — a standalone week has no run to name. */
  accent: string | null | undefined;
  name: string;
  /** Calendar chips and dense rows: smaller type, tighter padding. */
  compact?: boolean;
}) {
  const colorScheme = useSyncExternalStore(
    subscribeColorScheme,
    getColorSchemeSnapshot,
    () => 'light' as const,
  );
  if (!accent) return null;

  return (
    <span
      className={`proto-series-pill${compact ? ' proto-series-pill--compact' : ''}${
        colorScheme === 'dark' ? ' proto-series-pill--on-dark' : ''
      }`}
      style={{ ['--space-icon-accent' as string]: spaceIconAccentHex(accent, colorScheme) }}
      title={name}
    >
      {name}
    </span>
  );
}
