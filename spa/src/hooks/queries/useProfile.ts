import { useAuth } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
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

function getCachedProfile(): UserProfile | undefined {
  try {
    const raw = sessionStorage.getItem(HARVOUS_PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** True when Clerk session cookie suggests a signed-in browser session (before Clerk JS finishes loading). */
function hasSessionCookieHint(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)__client_uat=[1-9]/.test(document.cookie);
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

/** Synchronous cached profile for the active session user (sessionStorage), for instant nav before RQ fetch. */
export function getCachedProfileForSessionUser(clerkUserId?: string | null): UserProfile | undefined {
  if (!clerkUserId || typeof window === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(HARVOUS_PROFILE_CACHE_KEY);
    if (!raw) return undefined;
    const p = JSON.parse(raw) as UserProfile;
    return p.id === clerkUserId ? p : undefined;
  } catch {
    return undefined;
  }
}

function setCachedProfile(profile: UserProfile) {
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
  churchName?: string | null;
  churchCity?: string | null;
  churchState?: string | null;
  churchCountry?: string | null;
  /** Whether an account lock PIN is set (the hash itself is never sent to clients). */
  hasLockPinSet?: boolean;
  /** Preferred Bible translation (e.g. ESV, NET); from UserMetadata via get-profile */
  defaultTranslation?: string;
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

export function useProfile() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const sessionHint = hasSessionCookieHint();
  const effectiveUserId =
    userId ?? (sessionHint ? readClerkUserIdForProfileCache() : undefined);
  const cachedForSessionUser =
    effectiveUserId && sessionHint ? getCachedProfileForSessionUser(effectiveUserId) : undefined;

  return useQuery({
    queryKey: ['profile', userId ?? effectiveUserId ?? 'none'],
    enabled: isLoaded && isSignedIn && !!userId,
    queryFn: () =>
      api
        .get<
          Omit<UserProfile, 'displayName' | 'defaultTranslation'> & {
            displayName?: string;
            emailVerified?: boolean;
            churchName?: string | null;
            churchCity?: string | null;
            churchState?: string | null;
            churchCountry?: string | null;
            hasLockPinSet?: boolean;
            defaultTranslation?: string;
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
            emailVerified: data.emailVerified ?? false,
            churchName: data.churchName ?? null,
            churchCity: data.churchCity ?? null,
            churchState: data.churchState ?? null,
            hasLockPinSet: data.hasLockPinSet,
            defaultTranslation,
          });
          const profile = {
            ...data,
            id: userId!,
            defaultTranslation,
            displayName:
              (data.displayName ?? `${data.firstName ?? ''} ${(data.lastName ?? '').charAt(0)}`.trim()) || 'User',
          } as UserProfile;
          setCachedProfile(profile);
          return profile;
        }),
    staleTime: 5 * 60_000,
    placeholderData: cachedForSessionUser,
    initialData: cachedForSessionUser,
    initialDataUpdatedAt: cachedForSessionUser ? Date.now() - 30_000 : undefined,
  });
}

export function useXP() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const cachedXP = userId ? getCachedXP() : undefined;

  return useQuery({
    queryKey: ['xp', userId],
    enabled: isLoaded && isSignedIn && !!userId,
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
  const { isLoaded, isSignedIn, userId } = useAuth();
  return useQuery({
    queryKey: ['limits', userId],
    enabled: isLoaded && isSignedIn && !!userId,
    queryFn: () =>
      api.get<{ tier: string; limits: Record<string, number>; usage: Record<string, number> }>('/api/user/limits'),
    staleTime: 5 * 60_000,
  });
}
