/** Session/local keys used for SPA profile, nav, and XP bootstrap — clear on sign-out / account switch. */
export const HARVOUS_PROFILE_CACHE_KEY = 'harvous-profile-cache';
export const HARVOUS_NAV_CACHE_KEY = 'harvous-nav-cache';
export const HARVOUS_XP_CACHE_KEY = 'harvous-xp-cache';
export const HARVOUS_USER_COLOR_KEY = 'harvous-user-color';
/** Last successful My Inbox (dismissed featured) list — { userId, items } for instant panel paint. */
export const HARVOUS_FEATURED_DISMISSED_CACHE_KEY = 'harvous-featured-dismissed-cache';
/** User first/last name — localStorage so initials survive tab close and don't flash "U" on reload. */
export const HARVOUS_USER_NAMES_KEY = 'harvous-user-names';
/** Prefix for per-space sidebar notes snapshots (sessionStorage); clear all on sign-out. */
export const HARVOUS_SPACE_NOTES_CACHE_PREFIX = 'harvous-space-notes-';
/** Prefix for per-note study-dock carousel stacks (localStorage); keyed by note id. Clear all on sign-out. */
export const HARVOUS_STUDY_DOCK_STACK_PREFIX = 'harvous-study-dock-';
/**
 * "Not today" on today's passage (localStorage), suffixed `:<userId>`.
 *
 * Here rather than beside the rest of the passage code so sign-out can clear it without the
 * shared cleanup importing a screen's module. The bare name is the pre-3.10 key, still read once
 * so a dismissal made before it was scoped is honoured for the day it was made; both forms are
 * removed by prefix on sign-out.
 */
export const VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY = 'votd_passage_card_dismissed_day';
