import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { updateCachedProfileData } from '@/utils/profile-cache';

const USER_COLOR_KEY = 'harvous-user-color';

export function getCachedUserColor(): string | null {
  try { return localStorage.getItem(USER_COLOR_KEY); } catch { return null; }
}

function setCachedUserColor(color: string) {
  try { localStorage.setItem(USER_COLOR_KEY, color); } catch { /* ignore */ }
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
  const cached = getCachedUserColor();
  return useQuery({
    queryKey: ['profile'],
    queryFn: () =>
      api.get<Omit<UserProfile, 'displayName'> & { displayName?: string; emailVerified?: boolean; churchName?: string | null; churchCity?: string | null; churchState?: string | null; hasLockPinSet?: boolean }>('/api/user/get-profile')
        .then(data => {
          if (data.userColor) setCachedUserColor(data.userColor);
          updateCachedProfileData({
            firstName: data.firstName ?? '',
            lastName: data.lastName ?? '',
            userColor: data.userColor ?? 'blue',
            email: data.email ?? '',
            emailVerified: data.emailVerified ?? false,
            churchName: data.churchName ?? null,
            churchCity: data.churchCity ?? null,
            churchState: data.churchState ?? null,
            hasLockPinSet: data.hasLockPinSet
          });
          return {
            ...data,
            // API doesn't return displayName — compute it from firstName + lastName
            displayName: (data.displayName
              ?? `${data.firstName ?? ''} ${(data.lastName ?? '').charAt(0)}`.trim()
              ) || 'User',
          } as UserProfile;
        }),
    staleTime: 5 * 60_000,
    // Seed with cached color so the avatar renders correctly before the first fetch completes
    placeholderData: cached
      ? { userColor: cached, displayName: '', firstName: null, lastName: null, email: '', id: '', profileImageUrl: null, church: null }
      : undefined,
  });
}

export function useXP() {
  return useQuery({
    queryKey: ['xp'],
    queryFn: () => api.get<XPData>('/api/user/xp'),
    staleTime: 60_000,
  });
}

export function useUserLimits() {
  return useQuery({
    queryKey: ['limits'],
    queryFn: () => api.get<{ tier: string; limits: Record<string, number>; usage: Record<string, number> }>('/api/user/limits'),
    staleTime: 5 * 60_000,
  });
}
