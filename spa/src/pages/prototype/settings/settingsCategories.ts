/**
 * Single source of truth for the prototype Settings categories.
 * Used by both the wide two-pane sidebar (PrototypeSettingsLayout) and the
 * narrow drilldown list (PrototypeSettingsIndex) so the two never drift.
 *
 * Order aligns with native `HarvousSettingsSidebarItem.allSettingsRows()` in
 * HarvousSettingsRoute.swift (Account, Study, Appearance, Sharing, …).
 */
import type { IconName } from '@/components/react/Icon';
import { prototypeHref } from '@/lib/prototype-path';

export interface SettingsCategory {
  key: string;
  title: string;
  /** Absolute route for the detail pane. */
  route: string;
  icon: IconName;
  /** One-line description for narrow drilldown rows (mobile settings list). */
  footnote: string;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    key: 'account',
    title: 'Account',
    route: prototypeHref('settings/account'),
    icon: 'circle-user',
    footnote: 'Your name, email, and password.',
  },
  {
    key: 'translation',
    title: 'Default translation',
    route: prototypeHref('settings/translation'),
    icon: 'book-open',
    footnote: 'The translation used across the app.',
  },
  {
    key: 'church',
    title: 'My Church',
    route: prototypeHref('settings/church'),
    icon: 'church',
    footnote: 'Your church details, synced across your devices.',
  },
  {
    key: 'appearance',
    title: 'Appearance',
    route: prototypeHref('settings/appearance'),
    icon: 'paintbrush',
    footnote: 'Background color or image behind the app.',
  },
  // lockPin temporarily hidden while note lock is disabled in the prototype.
  {
    key: 'sharing',
    title: 'Sharing',
    route: prototypeHref('settings/sharing'),
    icon: 'share',
    footnote: 'See what you have shared and stop sharing.',
  },
  {
    key: 'data',
    title: 'My Data',
    route: prototypeHref('settings/data'),
    icon: 'cloud-arrow-up',
    footnote: 'Export, import, or delete your data.',
  },
  {
    key: 'support',
    title: 'Get Support',
    route: prototypeHref('settings/support'),
    icon: 'circle-info',
    footnote: 'Reach Derek directly.',
  },
  {
    key: 'keyboardShortcuts',
    title: 'Keyboard shortcuts',
    route: prototypeHref('settings/keyboard-shortcuts'),
    icon: 'keyboard',
    footnote: 'On Mac and iPad.',
  },
];
