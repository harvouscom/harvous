/**
 * Prefetch space panel data (members / ownership) when the user is on a space page.
 * Enables EditSpacePanel to show "Edit Space" vs "About Space" immediately on open.
 */

import { setCachedPanelData, getSpaceMembersCacheKey, type SpaceMembersCache } from './panel-data-cache';

export function prefetchSpacePanelData(spaceId: string): void {
  if (typeof window === 'undefined' || !spaceId?.startsWith('space_')) return;

  const opts: RequestInit = { credentials: 'include', cache: 'no-store' };

  fetch(`/api/spaces/${spaceId}/members`, opts)
    .then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      const cached: SpaceMembersCache = {
        totalMembers: data.memberCount ?? data.members?.length ?? 1,
        isOwner: data.isOwner ?? false,
        memberLimit: data.isOwner && data.limits ? (data.limits.membersPerSpace ?? null) : null,
        members: data.members ?? [],
        pendingInvitations: data.pendingInvitations ?? [],
      };
      setCachedPanelData(getSpaceMembersCacheKey(spaceId), cached);
    })
    .catch(() => { /* non-fatal */ });
}
