/**
 * Accent tokens aligned with native `StudyHighlightAccentToken` raw values
 * (see native/Harvous/Editor/EditorStudyHighlight.swift).
 */

export const STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL = [
  'warmAmber',
  'skyBlue',
  'violet',
  'mintGreen',
  'coralRose',
] as const;

export const STUDY_HIGHLIGHT_SWATCHES_WITH_NEUTRAL = ['neutral', ...STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL] as const;

export type StudyHighlightAccentKey = (typeof STUDY_HIGHLIGHT_SWATCHES_WITH_NEUTRAL)[number];

export function isStudyHighlightAccentKey(s: string | null | undefined): s is StudyHighlightAccentKey {
  if (!s) return false;
  return (STUDY_HIGHLIGHT_SWATCHES_WITH_NEUTRAL as readonly string[]).includes(s);
}

/** Native `StudyHighlightAccentToken.label` (EditorStudyHighlight.swift). */
export const STUDY_HIGHLIGHT_ACCENT_LABELS: Record<StudyHighlightAccentKey, string> = {
  neutral: 'Neutral',
  warmAmber: 'Amber',
  skyBlue: 'Sky',
  violet: 'Violet',
  mintGreen: 'Mint',
  coralRose: 'Coral',
};

/** CSS custom property for dock swatch fills (see study-highlight-accent-colors.css). */
export function studyDockAccentCssVar(token: StudyHighlightAccentKey): string {
  return `var(--study-dock-accent-${token})`;
}

/** Scripture dock card chrome when accent is unset or neutral (native `accentTint`). */
export const SCRIPTURE_DOCK_PILL_NEUTRAL_CHROME = 'var(--study-dock-scripture-pill-neutral)';

export function scriptureDockChromeAccent(pillAccent: StudyHighlightAccentKey | null | undefined): string {
  if (!pillAccent || pillAccent === 'neutral') {
    return SCRIPTURE_DOCK_PILL_NEUTRAL_CHROME;
  }
  return studyDockAccentCssVar(pillAccent);
}
