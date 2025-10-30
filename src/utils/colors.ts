// Thread color mapping utility (new simple names with legacy alias support)
export const THREAD_COLORS = [
  'paper',
  'blue',
  'yellow',
  'orange',
  'pink',
  'purple',
  'green',
] as const;

export type NewThreadColor = typeof THREAD_COLORS[number];
export type LegacyThreadColor =
  | 'blessed-blue'
  | 'graceful-gold'
  | 'pleasant-peach'
  | 'caring-coral'
  | 'peaceful-pink'
  | 'lovely-lavender'
  | 'mindful-mint';

export type ThreadColor = NewThreadColor | LegacyThreadColor;

const LEGACY_TO_NEW: Record<LegacyThreadColor, NewThreadColor> = {
  'blessed-blue': 'blue',
  'graceful-gold': 'yellow',
  'pleasant-peach': 'orange',
  'caring-coral': 'orange',
  'peaceful-pink': 'pink',
  'lovely-lavender': 'purple',
  'mindful-mint': 'green',
};

const COLOR_TO_VAR: Record<NewThreadColor, string> = {
  paper: 'var(--color-paper)',
  blue: 'var(--color-blessed-blue)',
  yellow: 'var(--color-graceful-gold)',
  orange: 'var(--color-pleasant-peach)',
  pink: 'var(--color-peaceful-pink)',
  purple: 'var(--color-lovely-lavender)',
  green: 'var(--color-mindful-mint)',
};

// Convert thread color name to CSS variable
export function getThreadColorCSS(color: ThreadColor | string | null | undefined): string {
  if (!color) return COLOR_TO_VAR.paper;

  const value = String(color);
  const normalized: NewThreadColor =
    (value in LEGACY_TO_NEW
      ? LEGACY_TO_NEW[value as LegacyThreadColor]
      : (THREAD_COLORS as readonly string[]).includes(value)
        ? (value as NewThreadColor)
        : 'paper');

  return COLOR_TO_VAR[normalized];
}

// Convert thread color name to gradient for SpaceButton
export function getThreadGradientCSS(color: ThreadColor | string | null | undefined): string {
  const baseColor = getThreadColorCSS(color);
  return `linear-gradient(180deg, ${baseColor} 0%, ${baseColor} 100%)`;
}

// Get a random thread color (useful for new threads)
export function getRandomThreadColor(): ThreadColor {
  const randomIndex = Math.floor(Math.random() * THREAD_COLORS.length);
  return THREAD_COLORS[randomIndex];
}
