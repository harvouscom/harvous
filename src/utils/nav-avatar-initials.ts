import { HARVOUS_USER_NAMES_KEY } from '@/utils/user-cache-keys';

/**
 * Initials for the nav avatar. Clerk's user.name fields often hydrate after first paint;
 * profile from React Query can supply cached first/last immediately on repeat visits.
 */
export type NavAvatarProfileSlice = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  displayName?: string | null;
};

export type NavAvatarUserSlice = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string } | null;
};

function initialsFromNames(first?: string | null, last?: string | null): string {
  return `${first?.charAt(0) ?? ''}${last?.charAt(0) ?? ''}`.trim().toUpperCase();
}

function initialsFromAlphanumeric(s: string, maxLen: 2 | 1): string {
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, '');
  if (cleaned.length >= 2 && maxLen === 2) return cleaned.slice(0, 2).toUpperCase();
  if (cleaned.length >= 1) return cleaned.slice(0, maxLen).toUpperCase();
  return '';
}

export function getNavAvatarInitials(
  user: NavAvatarUserSlice | null | undefined,
  profile: NavAvatarProfileSlice | null | undefined,
): string {
  const fromClerk = initialsFromNames(user?.firstName, user?.lastName);
  if (fromClerk) return fromClerk;

  const fromProfile = initialsFromNames(profile?.firstName, profile?.lastName);
  if (fromProfile) return fromProfile;

  const fromUsername = initialsFromAlphanumeric(user?.username ?? '', 2);
  if (fromUsername) return fromUsername;

  const email = user?.primaryEmailAddress?.emailAddress ?? profile?.email ?? '';
  const local = email.split('@')[0] ?? '';
  const fromEmail = initialsFromAlphanumeric(local, 2);
  if (fromEmail) return fromEmail;

  return 'U';
}

/**
 * Matches server `generateDisplayName` (user-cache): "First L" so nav does not flash
 * full name from Clerk and then switch to abbreviated when profile loads.
 */
export function formatNavDisplayFromNames(first?: string | null, last?: string | null): string | null {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (!f && !l) return null;
  const out = `${f} ${l.charAt(0)}`.trim();
  return out || null;
}

/** Label for desktop nav profile strip — stable "First L" whenever names exist; then fallbacks. */
export function getNavDisplayName(
  user: NavAvatarUserSlice | null | undefined,
  profile: NavAvatarProfileSlice | null | undefined,
): string {
  const fromProfileNames = formatNavDisplayFromNames(profile?.firstName, profile?.lastName);
  if (fromProfileNames) return fromProfileNames;

  const fromClerkNames = formatNavDisplayFromNames(user?.firstName, user?.lastName);
  if (fromClerkNames) return fromClerkNames;

  const fromProfileDisplay = profile?.displayName?.trim();
  if (fromProfileDisplay) return fromProfileDisplay;

  const u = user?.username?.trim();
  if (u) return u;

  const email = user?.primaryEmailAddress?.emailAddress ?? profile?.email;
  if (email) {
    const local = email.split('@')[0]?.trim();
    if (local) return local;
  }

  return 'User';
}

function readCachedUserNames(): { firstName: string; lastName: string } | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(HARVOUS_USER_NAMES_KEY);
    return raw ? (JSON.parse(raw) as { firstName: string; lastName: string }) : null;
  } catch {
    return null;
  }
}

function pickFirstName(
  user: NavAvatarUserSlice | null | undefined,
  profile: NavAvatarProfileSlice | null | undefined,
): string {
  const fromProfile = profile?.firstName?.trim();
  if (fromProfile && fromProfile !== 'User') return fromProfile;

  const fromDisplay = profile?.displayName?.split(' ')[0]?.trim();
  if (fromDisplay && fromDisplay !== 'User') return fromDisplay;

  const fromClerk = user?.firstName?.trim();
  if (fromClerk) return fromClerk;

  return readCachedUserNames()?.firstName?.trim() ?? '';
}

function pickLastName(
  user: NavAvatarUserSlice | null | undefined,
  profile: NavAvatarProfileSlice | null | undefined,
): string {
  const fromProfile = profile?.lastName?.trim();
  if (fromProfile) return fromProfile;

  const fromClerk = user?.lastName?.trim();
  if (fromClerk) return fromClerk;

  return readCachedUserNames()?.lastName?.trim() ?? '';
}

/** First name for home greeting — profile API, then Clerk, then localStorage cache. */
export function resolveProfileFirstName(
  user: NavAvatarUserSlice | null | undefined,
  profile: NavAvatarProfileSlice | null | undefined,
): string {
  return pickFirstName(user, profile);
}

/** Full name for account menu — profile API, then Clerk, then localStorage cache. */
export function resolveProfileFullName(
  user: NavAvatarUserSlice | null | undefined,
  profile: NavAvatarProfileSlice | null | undefined,
): string {
  const first = pickFirstName(user, profile);
  const last = pickLastName(user, profile);
  const full = [first, last].filter(Boolean).join(' ').trim();
  if (full) return full;

  const abbreviated = getNavDisplayName(user, profile);
  if (abbreviated !== 'User') return abbreviated;

  return 'Your account';
}
