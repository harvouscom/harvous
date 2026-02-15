import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

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
  currentXP: number;
  seasonXP: number;
  season: number;
  level: number;
  nextLevelXP: number;
  lifetimeXP: number;
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () =>
      api.get<Omit<UserProfile, 'displayName'> & { displayName?: string }>('/api/user/get-profile')
        .then(data => ({
          ...data,
          // API doesn't return displayName — compute it from firstName + lastName
          displayName: (data.displayName
            ?? `${data.firstName ?? ''} ${(data.lastName ?? '').charAt(0)}`.trim()
            ) || 'User',
        } as UserProfile)),
    staleTime: 5 * 60_000,
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
