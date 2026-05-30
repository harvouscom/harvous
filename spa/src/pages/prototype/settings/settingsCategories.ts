/**
 * Single source of truth for the prototype Settings categories.
 * Used by both the wide two-pane sidebar (PrototypeSettingsLayout) and the
 * narrow drilldown list (PrototypeSettingsIndex) so the two never drift.
 * Mirrors the native Mac sidebar items in HarvousSettingsRoute.swift.
 */
import type { IconName } from '@/components/react/Icon';

export interface SettingsCategory {
  key: string;
  title: string;
  /** Absolute route for the detail pane. */
  route: string;
  icon: IconName;
  /** One-line description shown under the title (native `.footnote`). */
  footnote: string;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    key: 'account',
    title: 'Account',
    route: '/prototype/settings/account',
    icon: 'circle-user',
    footnote: 'Your name, email, and password.',
  },
  {
    key: 'translation',
    title: 'Default Bible translation',
    route: '/prototype/settings/translation',
    icon: 'book-open',
    footnote: 'The translation used across the app.',
  },
  {
    key: 'appearance',
    title: 'Appearance',
    route: '/prototype/settings/appearance',
    icon: 'paintbrush',
    footnote: 'Background color or image behind the app.',
  },
  {
    key: 'church',
    title: 'My Church',
    route: '/prototype/settings/church',
    icon: 'church',
    footnote: 'Your church details, synced across your devices.',
  },
  // lockPin temporarily hidden while note lock is disabled in the prototype.
  {
    key: 'sharing',
    title: 'Sharing',
    route: '/prototype/settings/sharing',
    icon: 'share',
    footnote: 'See what you have shared and stop sharing.',
  },
  {
    key: 'data',
    title: 'My Data',
    route: '/prototype/settings/data',
    icon: 'cloud-arrow-up',
    footnote: 'Export, import, or delete your data.',
  },
  {
    key: 'support',
    title: 'Get Support',
    route: '/prototype/settings/support',
    icon: 'circle-info',
    footnote: 'Get help or contact us.',
  },
  {
    key: 'keyboardShortcuts',
    title: 'Keyboard shortcuts',
    route: '/prototype/settings/keyboard-shortcuts',
    icon: 'key',
    footnote: 'On Mac and iPad.',
  },
];
