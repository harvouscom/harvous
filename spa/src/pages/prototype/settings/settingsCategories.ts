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
    // Named for the subject, not for one of the two things done to it: the page sets the
    // default translation *and* decides which ones are kept for offline reading.
    title: 'Translations',
    route: prototypeHref('settings/translation'),
    // Scroll, matching how scripture is marked everywhere else in the app.
    icon: 'scroll',
    footnote: 'The translation used across the app, and which ones you keep offline.',
  },
  {
    key: 'church',
    title: 'My Church',
    route: prototypeHref('settings/church'),
    icon: 'church',
    footnote: 'Home church, other churches, and matching details.',
  },
  {
    key: 'appearance',
    title: 'Appearance',
    route: prototypeHref('settings/appearance'),
    icon: 'paintbrush',
    footnote: 'Background color or image behind the app.',
  },
  // lockPin temporarily hidden while note lock is disabled in the prototype.
  // The route itself is unregistered too (see spa/src/router.tsx — no
  // prototypeSettingsLockPinRoute) so it isn't reachable by direct URL either.
  // Full list of note-lock off-switches, none of which have been removed —
  // this can all be turned back on by re-adding the route:
  //   - spa/src/router.tsx: prototypeSettingsLockPinRoute (removed, not just unlisted)
  //   - spa/src/pages/prototype/PrototypePinPanels.tsx: returns null
  //   - spa/src/pages/prototype/PrototypeNoteMoreMenu.tsx: lock/unlock omitted
  //   - native/Harvous/ContentView.swift:501: `case .lockNote: break`
  //   - native/Harvous/Views/iPadRootView.swift:380: same
  // Retained and still wired: LockPinPanel, PinEntryPanel, InlinePinUnlock,
  // LockNoteButton, and the `contentEncrypted` read paths in server/routes/og.ts.
  {
    key: 'sharing',
    title: 'Sharing',
    route: prototypeHref('settings/sharing'),
    icon: 'share',
    footnote: 'See what you have shared and stop sharing.',
  },
  {
    key: 'addons',
    title: 'Plan & add-ons',
    route: prototypeHref('settings/addons'),
    icon: 'plus',
    footnote: 'Your plan, what it includes, and add-ons.',
  },
  {
    key: 'data',
    title: 'My Notes',
    route: prototypeHref('settings/data'),
    // Plain cloud, not cloud-arrow-up: the pane is import *and* export, so an
    // upload arrow only tells half of it.
    icon: 'cloud',
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
