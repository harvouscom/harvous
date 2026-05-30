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
