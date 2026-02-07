export interface UserProfile {
  firstName: string | null;
  lastName: string | null;
  userColor: string;
  email: string | null;
  emailVerified: boolean;
  churchName: string | null;
  churchCity: string | null;
  churchState: string | null;
  hasLockPinSet: boolean;
}

export interface XPData {
  seasonalXP: number;
  lifetimeXP: number;
  totalXP: number;
  season: string;
  seasonName: string;
  breakdown: Record<string, unknown>;
  backfilled: boolean;
}
