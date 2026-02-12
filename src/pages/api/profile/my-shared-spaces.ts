export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Spaces, Members, eq, desc, asc, sql } from 'astro:db';
import { getSpaceMemberCount } from '@/utils/tier-limits';
import { jsonResponse, errorResponse, unauthorizedResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

/**
 * GET /api/profile/my-shared-spaces
 *
 * Returns spaces the user owns that have members (owned shared spaces)
 * and spaces the user is a member of (memberOf).
 * Used by MySharingPanel "Shared spaces" tab.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/profile/my-shared-spaces', 'read', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    const origin = new URL(request.url).origin;

    // Owned shared spaces: spaces user owns that have a share link (shareToken) and/or at least one member
    // Order by lastVisited (visited first, newest first) for consistent ordering with nav/MySpacesPanel
    const ownedSpacesRows = await db
      .select({ id: Spaces.id, title: Spaces.title, color: Spaces.color, shareToken: Spaces.shareToken })
      .from(Spaces)
      .where(eq(Spaces.userId, userId))
      .orderBy(
        asc(sql`CASE WHEN ${Spaces.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Spaces.lastVisited)
      )
      .all();

    const owned: Array<{
      id: string;
      title: string;
      color?: string | null;
      memberCount: number;
      shareToken?: string | null;
      shareUrl?: string;
    }> = [];

    for (const space of ownedSpacesRows) {
      const memberCount = await getSpaceMemberCount(space.id);
      const hasShareLink = space.shareToken != null && space.shareToken.length > 0;
      if (memberCount > 0 || hasShareLink) {
        owned.push({
          id: space.id,
          title: space.title || 'Untitled space',
          color: space.color ?? undefined,
          memberCount,
          shareToken: space.shareToken ?? undefined,
          shareUrl: space.shareToken ? `${origin}/spaces/join/${space.shareToken}` : undefined
        });
      }
    }

    // Member of: spaces user is a member of (exclude owned)
    const memberships = await db
      .select({ spaceId: Members.spaceId })
      .from(Members)
      .where(eq(Members.userId, userId))
      .all();

    const memberOf: Array<{
      id: string;
      title: string;
      color?: string | null;
      memberCount: number;
    }> = [];

    const ownedSpaceIds = new Set(ownedSpacesRows.map((s) => s.id));

    for (const m of memberships) {
      if (ownedSpaceIds.has(m.spaceId)) continue;

      const spaceRow = await db
        .select({ id: Spaces.id, title: Spaces.title, color: Spaces.color })
        .from(Spaces)
        .where(eq(Spaces.id, m.spaceId))
        .get();

      if (spaceRow) {
        const memberCount = await getSpaceMemberCount(spaceRow.id);
        memberOf.push({
          id: spaceRow.id,
          title: spaceRow.title || 'Untitled space',
          color: spaceRow.color ?? undefined,
          memberCount
        });
      }
    }

    return jsonResponse({ owned, memberOf }, 200, {
      'Cache-Control': 'private, max-age=0, no-store'
    });
  } catch (error: unknown) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/profile/my-shared-spaces',
      action: 'get_my_shared_spaces'
    });
    return errorResponse(standardError.message, standardError.code, 500);
  }
};
