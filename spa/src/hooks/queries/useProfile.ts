import { useAuth } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { updateCachedProfileData } from '@/utils/profile-cache';

const USER_COLOR_KEY = 'harvous-user-color';
const PROFILE_CACHE_KEY = 'harvous-profile-cache';
const XP_CACHE_KEY = 'harvous-xp-cache';

function getCachedXP(): XPData | undefined {
  try {
    const raw = sessionStorage.getItem(XP_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function setCachedXP(data: XPData) {
  try {
    sessionStorage.setItem(XP_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function getCachedUserColor(): string | null {
  try { return localStorage.getItem(USER_COLOR_KEY); } catch { return null; }
}

export function setCachedUserColor(color: string) {
  try { localStorage.setItem(USER_COLOR_KEY, color); } catch { /* ignore */ }
}

function getCachedProfile(): UserProfile | undefined {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

function setCachedProfile(profile: UserProfile) {
  try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
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
  /** Preferred Bible translation (e.g. ESV, NET); from UserMetadata via get-profile */
  defaultTranslation?: string;
}

export interface XPData {
  seasonalXP: number;   // current season XP (matches /api/user/xp response)
  lifetimeXP: number;
  totalXP: number;      // legacy alias for lifetimeXP
  season: string;
  seasonName: string;
  breakdown?: Record<string, number>;
  backfilled?: boolean;
}

export function useProfile() {
  const { isLoaded, isSignedIn } = useAuth();
  const cachedProfile = getCachedProfile();
  return useQuery({
    queryKey: ['profile'],
    enabled: isLoaded && isSignedIn,
    queryFn: () =>
      api.get<
        Omit<UserProfile, 'displayName' | 'defaultTranslation'> & {
          displayName?: string;
          emailVerified?: boolean;
          churchName?: string | null;
          churchCity?: string | null;
          churchState?: string | null;
          hasLockPinSet?: boolean;
          defaultTranslation?: string;
        }
      >('/api/user/get-profile')
        .then(data => {
          if (data.userColor) setCachedUserColor(data.userColor);
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
            defaultTranslation,
            displayName: (data.displayName
              ?? `${data.firstName ?? ''} ${(data.lastName ?? '').charAt(0)}`.trim()
              ) || 'User',
          } as UserProfile;
          setCachedProfile(profile);
          return profile;
        }),
    staleTime: 5 * 60_000,
    initialData: cachedProfile,
    initialDataUpdatedAt: cachedProfile ? Date.now() - 30_000 : undefined,
  });
}

export function useXP() {
  const { isLoaded, isSignedIn } = useAuth();
  const cachedXP = getCachedXP();
  return useQuery({
    queryKey: ['xp'],
    enabled: isLoaded && isSignedIn,
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
  const { isLoaded, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ['limits'],
    enabled: isLoaded && isSignedIn,
    queryFn: () => api.get<{ tier: string; limits: Record<string, number>; usage: Record<string, number> }>('/api/user/limits'),
    staleTime: 5 * 60_000,
  });
}
