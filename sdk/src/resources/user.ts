import type { HttpClient } from '../http.js';
import type { UserProfile, XPData } from '../types/user.js';

export class UserResource {
  constructor(private http: HttpClient) {}

  /** Get the current user's profile */
  async profile(): Promise<UserProfile> {
    return this.http.get<UserProfile>('/api/user/get-profile');
  }

  /** Get the current user's XP data */
  async xp(options?: {
    season?: string;
    backfill?: boolean;
  }): Promise<XPData> {
    return this.http.get<XPData>('/api/user/xp', {
      season: options?.season,
      backfill: options?.backfill,
    });
  }
}
