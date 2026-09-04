import { useAuth } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuthReady } from '../useAuthReady';
import { api } from '../../lib/api';
import { updateCachedProfileData } from '@/utils/profile-cache';
import {
  HARVOUS_PROFILE_CACHE_KEY,
  HARVOUS_USER_COLOR_KEY,
  HARVOUS_USER_NAMES_KEY,
  HARVOUS_XP_CACHE_KEY,
} from '@/utils/user-cache-keys';

function getCachedXP(): XPData | undefined {
  try {
    const raw = sessionStorage.getItem(HARVOUS_XP_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function setCachedXP(data: XPData) {
  try {
    sessionStorage.setItem(HARVOUS_XP_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function getCachedUserColor(): string | null {
  try {
    return localStorage.getItem(HARVOUS_USER_COLOR_KEY);
  } catch {
    return null;
  }
}

export function setCachedUserColor(color: string) {
  try {
    localStorage.setItem(HARVOUS_USER_COLOR_KEY, color);
  } catch {
    /* ignore */
  }
}

export function getCachedUserNames(): { firstName: string; lastName: string } | null {
  try {
    const raw = localStorage.getItem(HARVOUS_USER_NAMES_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedUserNames(firstName: string | null, lastName: string | null) {
  try {
    localStorage.setItem(
      HARVOUS_USER_NAMES_KEY,
      JSON.stringify({ firstName: firstName ?? '', lastName: lastName ?? '' }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * What the sessionStorage profile snapshot actually guarantees — which is much less than
 * a `UserProfile`.
 *
 * Three writers fill this key and they disagree about how much they carry: the queryFn
 * stores the whole get-profile payload, `seedProfileNamesAfterSignUp` stores only the
 * identity fields it can know before the first fetch ever runs, and a snapshot left by an
 * older build carries whatever `UserProfile` happened to hold on the day it was written.
 * So the only fields that are always present are the core below; everything else is
 * `Partial`.
 *
 * Typing this as a full `UserProfile` is what let a half-filled snapshot pass for a
 * complete profile — see the `placeholderData` note in `useProfile`.
 */
export type CachedSessionProfile = Pick<
  UserProfile,
  'id' | 'firstName' | 'lastName' | 'email' | 'profileImageUrl' | 'displayName' | 'userColor' | 'church'
> &
  Partial<UserProfile>;

function getCachedProfile(): CachedSessionProfile | undefined {
  try {
    const raw = sessionStorage.getItem(HARVOUS_PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** True when Clerk session cookies suggest a signed-in browser session (before Clerk JS finishes loading). */
export function hasClerkSessionCookieHint(): boolean {
  if (typeof document === 'undefined') return false;
  const cookies = document.cookie;
  if (/(?:^|;\s*)__client_uat=[1-9]/.test(cookies)) return true;
  if (/(?:^|;\s*)__session=/.test(cookies)) return true;
  return false;
}

/**
 * Clerk user id from the same sources as UserIdSync / offline paths — available before useAuth().userId hydrates.
 */
export function readClerkUserIdForProfileCache(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const w = (window as unknown as { __harvous_userId?: string }).__harvous_userId;
    if (typeof w === 'string' && w.length > 0) return w;
    const a = localStorage.getItem('harvous-user-id');
    if (a) return a;
    const b = localStorage.getItem('harvous_userId');
    if (b) return b;
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Synchronous cached profile for the active session user (sessionStorage), for instant nav
 * before the RQ fetch lands. Returns a `CachedSessionProfile`, not a `UserProfile`: treat
 * every field outside the core as "not known yet", never as "has no value".
 */
export function getCachedProfileForSessionUser(
  clerkUserId?: string | null,
): CachedSessionProfile | undefined {
  if (!clerkUserId || typeof window === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(HARVOUS_PROFILE_CACHE_KEY);
    if (!raw) return undefined;
    const p = JSON.parse(raw) as CachedSessionProfile;
    return p.id === clerkUserId ? p : undefined;
  } catch {
    return undefined;
  }
}

function setCachedProfile(profile: CachedSessionProfile) {
  try {
    sessionStorage.setItem(HARVOUS_PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

export function updateCachedProfile(updates: Partial<UserProfile>) {
  const existing = getCachedProfile();
  if (existing) setCachedProfile({ ...existing, ...updates });
  if (updates.userColor) setCachedUserColor(updates.userColor);
}

/**
 * Optimistic profile names after sign-up — before get-profile backfills UserMetadata.
 *
 * Writes a deliberately partial snapshot: none of the church, lock-PIN, or switcher-order
 * fields are knowable yet. It is the main reason the snapshot is only a
 * `CachedSessionProfile`, and the reason `useProfile` seeds it as a placeholder that a
 * fetch replaces rather than as `initialData` that suppresses one.
 */
export function seedProfileNamesAfterSignUp(
  userId: string,
  names: { firstName: string; lastName: string; email?: string },
) {
  const firstName = names.firstName.trim();
  const lastName = names.lastName.trim();
  const email = names.email?.trim() ?? '';
  setCachedUserNames(firstName, lastName);
  const displayName = `${firstName} ${lastName.charAt(0)}`.trim() || firstName || 'User';
  setCachedProfile({
    id: userId,
    firstName,
    lastName,
    email,
    profileImageUrl: null,
    displayName,
    userColor: getCachedUserColor() ?? 'blue',
    church: null,
    defaultTranslation: 'NET',
  });
  updateCachedProfileData({
    firstName,
    lastName,
    email,
    userColor: getCachedUserColor() ?? 'blue',
    profileImageUrl: null,
    emailVerified: false,
    churchName: null,
    churchCity: null,
    churchState: null,
    defaultTranslation: 'NET',
  });
}

export interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  profileImageUrl: string | null;
  displayName: string;
  userColor: string;
  church: string | null;
  /** Structured church fields from UserMetadata via get-profile. */
  hmcChurchId?: string | null;
  churchName?: string | null;
  churchCity?: string | null;
  churchState?: string | null;
  churchCountry?: string | null;
  /** Home church (Churches.id) — temporary singular home until ChurchMemberships. */
  connectedChurchId?: string | null;
  /** Denormalized Clerk org id for My Church mode (home church). */
  connectedOrgId?: string | null;
  connectedChurchAt?: string | null;
  /** True when the viewer is staff for their connected home church org. */
  isHomeChurchStaff?: boolean;
  /** Whether an account lock PIN is set (the hash itself is never sent to clients). */
  hasLockPinSet?: boolean;
  /** Preferred Bible translation (e.g. ESV, NET); from UserMetadata via get-profile */
  defaultTranslation?: string;
  /** Per-user My Home switcher order for personal Shared Spaces (hosted + joined). */
  sharedSpaceSwitcherOrder?: string[] | null;
  /**
   * Where the reader was last, as the raw JSON string from the account. Parse with
   * `parseLastReadPosition` — it is stored as text so an older or newer client's value
   * degrades to "no saved position" rather than breaking the profile load.
   */
  lastReadPosition?: string | null;
  /**
   * Appearance and onboarding, as the raw JSON strings from the account.
   *
   * Neither is read through `useProfile` — the prototype shell hydrates them into their own
   * stores on mount. They are typed here because that hydration shares this query rather than
   * fetching the same profile a second time, so the shape it receives has to say they exist.
   */
  appearanceSettings?: string | null;
  onboardingState?: string | null;
}

export interface XPData {
  seasonalXP: number; // current season XP (matches /api/user/xp response)
  lifetimeXP: number;
  totalXP: number; // legacy alias for lifetimeXP
  season: string;
  seasonName: string;
  breakdown?: Record<string, number>;
  backfilled?: boolean;
}

/**
 * Widen the snapshot for React Query's placeholder slot.
 *
 * Sound only because it is a *placeholder*: React Query keeps it out of the query cache and
 * still fetches on mount, so whatever the snapshot is missing arrives with the response
 * instead of reading `undefined` for the length of `staleTime`. Consumers that care about a
 * field the snapshot may not carry should check `isPlaceholderData` before concluding it
 * has no value. Do not reuse this to pass a snapshot off as a profile anywhere else.
 */
function asPlaceholderProfile(snapshot: CachedSessionProfile | undefined): UserProfile | undefined {
  return snapshot as UserProfile | undefined;
}

/**
 * The profile fetch itself, outside the hook so `profileQueryOptions` and `useProfile` run the
 * same code. `userId` is the caller's, because `id` is the one field the response does not send.
 */
function fetchProfile(userId: string): Promise<UserProfile> {
  return api
    .get<
      Omit<UserProfile, 'displayName' | 'defaultTranslation'> & {
        displayName?: string;
        emailVerified?: boolean;
        hmcChurchId?: string | null;
        churchName?: string | null;
        churchCity?: string | null;
        churchState?: string | null;
        churchCountry?: string | null;
        connectedChurchId?: string | null;
        connectedOrgId?: string | null;
        connectedChurchAt?: string | null;
        isHomeChurchStaff?: boolean;
        hasLockPinSet?: boolean;
        defaultTranslation?: string;
        sharedSpaceSwitcherOrder?: string[] | null;
        lastReadPosition?: string | null;
      }
    >('/api/user/get-profile')
    .then((data) => {
      if (data.userColor) setCachedUserColor(data.userColor);
      setCachedUserNames(data.firstName ?? null, data.lastName ?? null);
      const defaultTranslation = data.defaultTranslation ?? 'NET';
      updateCachedProfileData({
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        userColor: data.userColor ?? 'blue',
        email: data.email ?? '',
        profileImageUrl: data.profileImageUrl ?? null,
        emailVerified: data.emailVerified ?? false,
        churchName: data.churchName ?? null,
        churchCity: data.churchCity ?? null,
        churchState: data.churchState ?? null,
        hasLockPinSet: data.hasLockPinSet,
        defaultTranslation,
      });
      // hmcChurchId / connected* live on React Query profile; localStorage cache stays denorm-only.
      const profile = {
        ...data,
        id: userId,
        connectedChurchId: data.connectedChurchId ?? null,
        connectedOrgId: data.connectedOrgId ?? null,
        connectedChurchAt: data.connectedChurchAt ?? null,
        isHomeChurchStaff: Boolean(data.isHomeChurchStaff),
        sharedSpaceSwitcherOrder: Array.isArray(data.sharedSpaceSwitcherOrder)
          ? data.sharedSpaceSwitcherOrder
          : null,
        defaultTranslation,
        displayName:
          (data.displayName ?? `${data.firstName ?? ''} ${(data.lastName ?? '').charAt(0)}`.trim()) || 'User',
      } as UserProfile;
      setCachedProfile(profile);
      return profile;
    });
}

/** The one key the profile lives under. Anything that reads it must use this. */
export function profileQueryKey(userId: string | null | undefined) {
  return ['profile', userId ?? 'none'] as const;
}

/**
 * Options for the profile query, shared rather than re-declared.
 *
 * `SimplifiedPrototypeLayout` also needs this payload on mount — it hydrates appearance and
 * onboarding out of it — and fetching it there made `get-profile` the one request an Activity
 * load asked for twice. Going through the query cache with the same key means the second caller
 * joins the first's request instead of opening its own, whichever of them arrives first.
 *
 * `id` is filled from the argument because the response does not carry it.
 */
export function profileQueryOptions(userId: string) {
  return {
    queryKey: profileQueryKey(userId),
    queryFn: () => fetchProfile(userId),
    staleTime: 5 * 60_000,
  };
}

export function useProfile() {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const sessionHint = hasClerkSessionCookieHint();
  const effectiveUserId =
    userId ?? (sessionHint ? readClerkUserIdForProfileCache() : undefined);
  // Memoized for reference stability, which the placeholder slot needs:
  // getCachedProfileForSessionUser re-parses the snapshot on every call, and React Query
  // only reuses a placeholder it can compare by reference. A fresh object each render
  // would hand every consumer a new `profile` on every render until the fetch lands,
  // re-firing their effects and blowing their memos.
  const cachedForSessionUser = useMemo(
    () =>
      effectiveUserId && sessionHint ? getCachedProfileForSessionUser(effectiveUserId) : undefined,
    [effectiveUserId, sessionHint],
  );

  return useQuery({
    queryKey: profileQueryKey(userId ?? effectiveUserId),
    enabled: authReady && !!userId,
    queryFn: () => fetchProfile(userId!),
    staleTime: 5 * 60_000,
    // Placeholder, deliberately — not `initialData`.
    //
    // The snapshot can be missing anything (see CachedSessionProfile). As `initialData` it
    // was parked in the query cache as a complete and — with `initialDataUpdatedAt` set 30s
    // in the past — *fresh* profile, so React Query skipped the fetch for the rest of the
    // 5-minute staleTime. Any field the snapshot didn't carry then read `undefined` for up
    // to ~4.5 minutes after a load, with no error and no loading state: `hasLockPinSet`
    // showing neither Set nor Not set, `sharedSpaceSwitcherOrder` losing the user's order,
    // `connectedOrgId` making a connected church look disconnected. It reads exactly like
    // the feature being broken.
    //
    // A placeholder paints just as fast — synchronously on first render, so no avatar/name
    // flash — but stays out of the cache and lets the mount fetch run, so the response
    // fills in the rest. `isPlaceholderData` marks the window where a field may be missing.
    placeholderData: asPlaceholderProfile(cachedForSessionUser),
  });
}

export function useXP() {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const cachedXP = userId ? getCachedXP() : undefined;

  return useQuery({
    queryKey: ['xp', userId],
    enabled: authReady && !!userId,
    queryFn: () =>
      api.get<XPData>('/api/user/xp').then((data) => {
        setCachedXP(data);
        return data;
      }),
    staleTime: 60_000,
    initialData: cachedXP,
    initialDataUpdatedAt: cachedXP ? Date.now() - 30_000 : undefined,
  });
}

export function useUserLimits() {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['limits', userId],
    enabled: authReady && !!userId,
    queryFn: () =>
      api.get<{ tier: string; limits: Record<string, number>; usage: Record<string, number> }>('/api/user/limits'),
    staleTime: 5 * 60_000,
  });
}
