import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/**
 * Contract tests for the congregant-facing church routes (server/routes/church.ts).
 * These guard the authorization shape that keeps one church's curriculum from
 * leaking to another church's members, and keep read access alive when a
 * church's plan lapses.
 */
describe('congregant church route contracts', () => {
  const route = () => source('server/routes/church.ts');

  it('requires auth on every endpoint', () => {
    const endpoints = route().match(/app\.(get|post|put|delete|patch)\(/g) ?? [];
    const gated = route().match(/requireAuth/g) ?? [];
    expect(endpoints.length).toBeGreaterThanOrEqual(6);
    // One requireAuth per endpoint, plus the import.
    expect(gated.length).toBeGreaterThanOrEqual(endpoints.length);
    // This is the congregant surface — the admin gate must never be *used*
    // here (the docblock names it only to contrast with churches.ts).
    expect(route()).not.toMatch(/requireHarvousAdmin\s*\(/);
    expect(route()).not.toMatch(/^import[\s\S]*?requireHarvousAdmin/m);
  });

  it('keeps every path under /api/church', () => {
    const paths = [...route().matchAll(/app\.(?:get|post|put|delete|patch)\(\s*'([^']+)'/g)].map(
      (m) => m[1],
    );
    expect(paths.length).toBeGreaterThanOrEqual(6);
    for (const path of paths) {
      expect(path.startsWith('/api/church')).toBe(true);
    }
  });

  it('adds no copy endpoint — channel notes reuse the existing copy-notes route', () => {
    // "Save a copy" on a read-only foreign note already covers ministry
    // channels (a follower holds a `member` row, so the source is readable and
    // My Home is authorable). A second copy path would be a second set of
    // lineage rules to keep in sync.
    expect(route()).not.toContain('copyNoteIntoPersonalHome');
    expect(route()).not.toContain('db.insert(Notes)');
    const spaces = source('server/routes/spaces.ts');
    expect(spaces).toContain('/api/spaces/:spaceId/copy-notes');
  });

  it('scopes the congregant surface to the caller’s own connected church', () => {
    // The congregant endpoints must never take an orgId from the request — the
    // church always comes from the caller's own UserMetadata.connectedOrgId.
    // (The staff billing endpoints below may take one; they are staff-gated.)
    const congregantSurface = route().slice(
      route().indexOf("'/api/church/channels'"),
      route().indexOf("'/api/church/billing'"),
    );
    expect(route()).toContain('getConnectedChurch');
    expect(route()).toContain('UserMetadata.connectedOrgId');
    expect(congregantSurface).not.toMatch(/c\.req\.(query|param)\(\s*'orgId'\s*\)/);
    expect(congregantSurface).not.toMatch(/body\.orgId/);
  });

  it('staff-gates every endpoint that accepts an orgId from the request', () => {
    // An orgId parameter is a cross-church lever. Anywhere one is read, an
    // isChurchStaffForOrg check must follow before anything is returned.
    const staffSurface = route().slice(route().indexOf("'/api/church/billing'"));
    expect(staffSurface).toMatch(/c\.req\.query\('orgId'\)/);
    // Every handler that reads an orgId resolves it through a helper that
    // checks staff membership first — billing, checkout, and the staff roster
    // (which routes all four of its endpoints through resolveStaffContext).
    expect(staffSurface).toContain('isChurchStaffForOrg');
    expect(route()).toContain('resolveStaffContext');
    // Slice from the body, not the signature — the return type names
    // fetchClerkOrgMemberships before any code runs.
    const resolver = route().slice(route().indexOf('const orgId = orgIdInput.trim();'));
    expect(resolver.indexOf('isChurchStaffForOrg')).toBeLessThan(
      resolver.indexOf('await fetchClerkOrgMemberships'),
    );
  });

  it('refuses to confirm a channel exists to someone outside the church', () => {
    // The cross-church rejection must be the same 404 as an unknown id, not a 403.
    expect(route()).toContain('church.orgId !== space.orgId');
    const guard = route().slice(route().indexOf('resolveFollowTarget'));
    expect(guard).toContain("code: 'CHANNEL_NOT_FOUND'");
    expect(guard).not.toContain("code: 'FORBIDDEN'");
  });

  it('gates new follows on sponsorship but never gates unfollow', () => {
    const followBlock = route().slice(
      route().indexOf("/api/church/channels/:spaceId/follow'"),
      route().indexOf("/api/church/channels/:spaceId/unfollow'"),
    );
    const unfollowBlock = route().slice(
      route().indexOf("/api/church/channels/:spaceId/unfollow'"),
      route().indexOf("'/api/church/feed'"),
    );
    expect(followBlock).toContain('churchSponsorship');
    expect(followBlock).toContain('CHURCH_LAPSED_CODE');
    // Leaving must work even for a lapsed church.
    expect(unfollowBlock).not.toContain('CHURCH_LAPSED_CODE');
  });

  it('delegates membership writes to the ministry-channel-follow planners', () => {
    // Roles are never written inline here — the planners own the invariant that
    // owner/leader rows are untouchable.
    expect(route()).toContain('followMinistryChannel');
    expect(route()).toContain('unfollowMinistryChannel');
    expect(route()).not.toContain('db.insert(SpaceMemberships)');
    expect(route()).not.toContain('db.delete(SpaceMemberships)');
  });

  it('only ever follows ministry broadcast spaces', () => {
    expect(route()).toContain('isMinistryBroadcastSpaceRow');
  });

  it('excludes encrypted notes and removed associations from the feed', () => {
    const feed = route().slice(route().indexOf("/api/church/feed'"));
    expect(feed).toContain('eq(Notes.contentEncrypted, false)');
    expect(feed).toContain('isNull(SpaceNotes.removedAt)');
  });

  it('builds the feed from followed channels only, not all org channels', () => {
    const feed = route().slice(route().indexOf("/api/church/feed'"));
    expect(feed).toContain("eq(SpaceMemberships.role, 'member')");
    expect(feed).toContain('eq(SpaceMemberships.userId, auth.userId)');
  });

  it('returns feed previews rather than full note bodies', () => {
    const feed = route().slice(route().indexOf("/api/church/feed'"));
    expect(feed).toContain('stripHtmlForCard');
    expect(feed).toContain('excerpt');
  });
});

describe('church sponsorship gates the existing staff write path', () => {
  it('blocks church-scoped writes when the church lapses', () => {
    const staff = source('server/utils/church-staff.ts');
    expect(staff).toContain('churchIsSponsored');
    expect(staff).toContain('CHURCH_LAPSED_CODE');
    // 402 Payment Required, distinct from the 403 staff-permission failure.
    expect(staff).toContain('status: 402');
  });

  it('leaves read paths untouched — lapsing must not hide published study', () => {
    const access = source('server/utils/space-access.ts');
    expect(access).not.toContain('churchIsSponsored');
    expect(access).not.toContain('church-entitlement');
  });
});
