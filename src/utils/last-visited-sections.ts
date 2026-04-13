/**
 * Section breaks for organized content by lastVisited age.
 * Used by OrganizedContentList (My Home) and SpaceContentList (spaces).
 */

import { normalizeDate } from '@/utils/sorting';

export const SECTION_KEYS = {
  recent: 'recent',
  moreThan3Days: 'moreThan3Days',
  moreThan1Week: 'moreThan1Week',
  moreThan2Weeks: 'moreThan2Weeks',
  moreThan1Month: 'moreThan1Month',
  moreThan6Months: 'moreThan6Months',
  moreThan1Year: 'moreThan1Year',
} as const;

export type SectionKey = (typeof SECTION_KEYS)[keyof typeof SECTION_KEYS];

/** Display order (newest first). First group has no label in UI by default. */
export const SECTION_ORDER: SectionKey[] = [
  SECTION_KEYS.recent,
  SECTION_KEYS.moreThan3Days,
  SECTION_KEYS.moreThan1Week,
  SECTION_KEYS.moreThan2Weeks,
  SECTION_KEYS.moreThan1Month,
  SECTION_KEYS.moreThan6Months,
  SECTION_KEYS.moreThan1Year,
];

export const SECTION_LABELS: Record<SectionKey, string> = {
  [SECTION_KEYS.recent]: '', // No label for first group
  [SECTION_KEYS.moreThan3Days]: 'More than 3 days ago',
  [SECTION_KEYS.moreThan1Week]: 'More than a week ago',
  [SECTION_KEYS.moreThan2Weeks]: 'More than 2 weeks ago',
  [SECTION_KEYS.moreThan1Month]: 'More than a month ago',
  [SECTION_KEYS.moreThan6Months]: 'More than 6 months ago',
  [SECTION_KEYS.moreThan1Year]: 'More than a year ago',
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * MS_PER_DAY;
const ONE_WEEK_MS = 7 * MS_PER_DAY;
const TWO_WEEKS_MS = 14 * MS_PER_DAY;
const ONE_MONTH_MS = 30 * MS_PER_DAY;
const SIX_MONTHS_MS = 182 * MS_PER_DAY;
const ONE_YEAR_MS = 365 * MS_PER_DAY;

/**
 * Returns the section key for a given lastVisited value.
 * null/undefined → moreThan1Year (never visited).
 */
export function getLastVisitedSectionKey(
  lastVisited: Date | string | null | undefined
): SectionKey {
  const date = normalizeDate(lastVisited);
  if (!date) return SECTION_KEYS.moreThan1Year;

  const now = Date.now();
  const t = date.getTime();
  const age = now - t;

  if (age < THREE_DAYS_MS) return SECTION_KEYS.recent;
  if (age < ONE_WEEK_MS) return SECTION_KEYS.moreThan3Days;
  if (age < TWO_WEEKS_MS) return SECTION_KEYS.moreThan1Week;
  if (age < ONE_MONTH_MS) return SECTION_KEYS.moreThan2Weeks;
  if (age < SIX_MONTHS_MS) return SECTION_KEYS.moreThan1Month;
  if (age < ONE_YEAR_MS) return SECTION_KEYS.moreThan6Months;
  return SECTION_KEYS.moreThan1Year;
}

/** True if threadId is the onboarding thread for a user (`thread_onboarding_${userId}`). */
export function isOnboardingThread(threadId: string | null | undefined): boolean {
  return typeof threadId === 'string' && threadId.startsWith('thread_onboarding_');
}

/**
 * Section key for a content item (thread or note). Uses lastVisited when set.
 * For onboarding notes with no lastVisited, uses createdAt so they bucket by account-creation time.
 */
export function getSectionKeyForItem(item: {
  lastVisited?: Date | string | null;
  createdAt?: Date | string | null;
  threadId?: string | null;
}): SectionKey {
  const hasLastVisited = item.lastVisited != null && normalizeDate(item.lastVisited) != null;
  if (hasLastVisited) return getLastVisitedSectionKey(item.lastVisited);
  if (isOnboardingThread(item.threadId)) {
    const created = normalizeDate(item.createdAt);
    if (created) return getLastVisitedSectionKey(created);
  }
  return getLastVisitedSectionKey(item.lastVisited);
}
