import { dark } from '@clerk/themes';
import type { Appearance } from '@clerk/types';
import { classicClerkAuthAppearance } from '../components/auth/clerkAuthAppearance';

/** Map Clerk surfaces to prototype tokens so portaled modals match system light/dark. */
const pdsVariables: NonNullable<Appearance['variables']> = {
  colorBackground: 'var(--pds-bg-page, #ffffff)',
  colorText: 'var(--pds-text-primary, #1a1916)',
  colorTextSecondary: 'var(--pds-text-secondary, #5a584f)',
  colorInputBackground: 'var(--pds-bg-input, oklch(0% 0 0 / 0.055))',
  colorInputText: 'var(--pds-text-primary, #1a1916)',
  colorPrimary: 'var(--pds-accent, #3869e6)',
  colorForeground: 'var(--pds-text-primary, #1a1916)',
  colorInputForeground: 'var(--pds-text-primary, #1a1916)',
  colorNeutral: 'var(--pds-text-secondary, #5a584f)',
  borderRadius: '10px',
};

/**
 * ClerkProvider / openUserProfile() appearance — keeps account modal readable in dark mode.
 * Uses CSS variables so tokens track `@media (prefers-color-scheme: dark)` on :root.
 */
export function buildClerkAppearance(isDark: boolean): Appearance {
  const shared = { variables: pdsVariables };
  return {
    baseTheme: isDark ? dark : undefined,
    ...shared,
    signIn: classicClerkAuthAppearance,
    signUp: classicClerkAuthAppearance,
    userProfile: shared,
    userButton: shared,
  };
}
