/**
 * Loads onboarding notes from generated data (see scripts/generate-onboarding-notes.ts).
 * The generated file is built from src/data/onboarding/*.md so dev and API bundle
 * both have the same content without a runtime .md loader.
 */

import { onboardingNotesGenerated } from './onboarding-notes.generated';

export interface OnboardingNote {
  title: string;
  content: string; // HTML content
  order: number;
}

/**
 * Loads onboarding notes. Uses pre-generated content so it works in both
 * dev (tsx) and production (esbuild bundle) without .md file loading.
 */
export function loadOnboardingNotes(): OnboardingNote[] {
  return [...onboardingNotesGenerated];
}
