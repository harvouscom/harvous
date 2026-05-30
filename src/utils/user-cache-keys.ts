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
