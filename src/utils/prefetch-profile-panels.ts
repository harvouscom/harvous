/**
 * Prefetch profile panel data when the user enters the Profile section.
 * Populates panel-data-cache so that opening Manage Billing, My Sharing,
 * Referral, My Achievements, or My Spaces shows cached data immediately (no loading).
 * Runs in the background; does not block the UI.
 */

import { setCachedPanelData, PANEL_CACHE_KEYS } from './panel-data-cache';
import { getThreadGradientCSS } from './colors';

export function prefetchProfilePanelData(): void {
  if (typeof window === 'undefined') return;

  const opts: RequestInit = { credentials: 'include', cache: 'no-store' };

  Promise.allSettled([
    fetch('/api/subscription/status', opts).then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setCachedPanelData(PANEL_CACHE_KEYS.subscription, {
        hasUnlimited: data.hasUnlimited,
        currentCount: data.currentCount ?? 0,
        limit: data.limit ?? null,
        referralBonusNotes: data.referralBonusNotes ?? 0
      });
    }),
    Promise.all([
      fetch('/api/profile/my-sharing', opts),
      fetch('/api/profile/my-shared-spaces', opts)
    ]).then(async ([sharingRes, spacesRes]) => {
      if (!sharingRes.ok) return;
      const sharingData = await sharingRes.json();
      const threads = sharingData.threads ?? [];
      const notes = sharingData.notes ?? [];
      let ownedSpaces: Array<{ id: string; title: string; color?: string | null; memberCount: number; shareToken?: string | null; shareUrl?: string }> = [];
      if (spacesRes.ok) {
        const spacesData = await spacesRes.json();
        ownedSpaces = spacesData.owned ?? [];
      }
      setCachedPanelData(PANEL_CACHE_KEYS.sharing, { threads, notes, ownedSpaces });
    }),
    fetch('/api/referral/status', { ...opts, method: 'GET' }).then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setCachedPanelData(PANEL_CACHE_KEYS.referral, {
        referralBonusNotes: data.referralBonusNotes ?? 0,
        referralCode: data.referralCode ?? null,
        limit: data.limit ?? null
      });
    }),
    fetch('/api/user/achievements', opts).then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setCachedPanelData(PANEL_CACHE_KEYS.achievements, {
        seasonalXP: data.seasonalXP ?? 0,
        lifetimeXP: data.lifetimeXP ?? 0,
        seasonName: data.seasonName ?? '',
        allSeasons: data.allSeasons ?? []
      });
    }),
    Promise.all([
      fetch('/api/navigation/data', opts),
      fetch('/api/profile/my-shared-spaces', opts)
    ]).then(async ([navRes, sharedRes]) => {
      if (!navRes.ok) return;
      const navData = await navRes.json();
      const spaces = (navData.spaces ?? []).map((s: { backgroundGradient?: string; color?: string }) => ({
        ...s,
        backgroundGradient: s.backgroundGradient || getThreadGradientCSS(s.color || 'paper')
      }));
      let sharedSpaceIds: string[] = [];
      let memberOfSpaces: Array<{ id: string; title: string; color?: string | null; memberCount: number }> = [];
      if (sharedRes.ok) {
        const sharedData = await sharedRes.json();
        sharedSpaceIds = (sharedData.owned ?? []).map((o: { id: string }) => o.id);
        memberOfSpaces = sharedData.memberOf ?? [];
      }
      setCachedPanelData(PANEL_CACHE_KEYS.mySpaces, { spaces, sharedSpaceIds, memberOfSpaces });
    })
  ]).catch(() => { /* non-fatal */ });
}
