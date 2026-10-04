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
import { isFeatureWithheld } from '@/lib/billing-plans';
import { useSubscriptionStatus } from '../../../hooks/queries/useSubscriptionStatus';

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
  // Web-only for now: the native apps have no push plumbing (that is APNs, a separate
  // build), so `HarvousSettingsRoute.swift` deliberately has no matching row and the two
  // lists are allowed to differ by exactly this one entry until native catches up.
  {
    key: 'reminders',
    title: 'Reminders',
    route: prototypeHref('settings/reminders'),
    icon: 'bell',
    footnote: 'A Sunday and midweek nudge to come back.',
  },
  /*
   * Also web-only, and for a different reason: Review itself is. The row is listed for everyone
   * rather than gated on the subscription, because a settings list that changes shape with what
   * you have bought is harder to learn than one that does not — and the page reads as a
   * description of the feature to someone who has not got it yet.
   */
  {
    key: 'reviewExercises',
    title: 'Review exercises',
    route: prototypeHref('settings/review-exercises'),
    icon: 'arrows-rotate',
    footnote: 'Which kinds of question Review asks you.',
  },
  /*
   * Web-only as well: the sounds are synthesized in the browser (`src/utils/sounds.ts`), and the
   * native apps have none. A third entry the native list does not carry until they do.
   */
  {
    key: 'sounds',
    title: 'Sounds',
    route: prototypeHref('settings/sounds'),
    icon: 'volume-low',
    footnote: 'When the app plays a sound, on this device.',
  },
  /*
   * Web-only for now. Native shows a locked note's title but can't open it yet — no
   * decryption or PIN entry in the Swift app (`SettingsLockPINView` is a stub and
   * `.lockNote` is a no-op in ContentView / iPadRootView). That is its own piece of work.
   */
  {
    key: 'lockPin',
    title: 'Lock PIN',
    route: prototypeHref('settings/lock-pin'),
    icon: 'lock',
    footnote: 'One PIN for every locked note.',
  },
  {
    key: 'sharing',
    title: 'Sharing',
    route: prototypeHref('settings/sharing'),
    icon: 'share',
    footnote: 'Public links, shared spaces, and what you have offered to Discover.',
  },
  {
    key: 'addons',
    title: 'Plan',
    route: prototypeHref('settings/addons'),
    icon: 'id-card',
    footnote: 'Your plan and what it includes.',
  },
  /*
   * Web-only, like Reminders. Listed for everyone once launched (the page describes the
   * feature to someone without Plus). While `connector` is withheld it is listed only for
   * preview accounts — see `useSettingsCategories`.
   */
  {
    key: 'connector',
    title: 'Connector',
    route: prototypeHref('settings/connector'),
    icon: 'puzzle-piece',
    footnote: 'Use your study in Claude, ChatGPT, and other AI apps.',
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

/**
 * The categories this account sees. Static except for one row: while `connector` is
 * withheld, Connector appears only for preview accounts (`connectorPreview`, from
 * the subscription status); after launch it is listed for everyone, as the rest are.
 */
export function useSettingsCategories(): SettingsCategory[] {
  const { data } = useSubscriptionStatus();
  const showConnector = !isFeatureWithheld('connector') || Boolean(data?.connectorPreview);
  return showConnector ? SETTINGS_CATEGORIES : SETTINGS_CATEGORIES.filter((cat) => cat.key !== 'connector');
}
