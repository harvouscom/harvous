/**
 * "How many, never who" for ministry channel followers.
 *
 * `GET /api/spaces/:spaceId/members` let any follower of a ministry channel list
 * every other follower. The scoping is a pure helper, tested directly here; the
 * route is held to calling it by source assertion, matching the house pattern in
 * church-library-routes.test.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  scopeSpaceRosterForViewer,
  spaceRosterIsRestrictedForViewer,
} from '../../utils/shared-space-lifecycle';

const channel = { type: 'public', orgId: 'org_church' };
const roster = [
  { userId: 'user_leader', role: 'leader' },
  { userId: 'user_viewer', role: 'member' },
  { userId: 'user_other_a', role: 'member' },
  { userId: 'user_other_b', role: 'member' },
];

const scope = (
  space: { type?: string | null; orgId?: string | null },
  viewerRole: string,
  viewerIsChurchStaff = false,
) =>
  scopeSpaceRosterForViewer(roster, {
    space,
    viewerUserId: 'user_viewer',
    viewerRole,
    viewerIsChurchStaff,
  });

describe('ministry channel roster privacy', () => {
  it('gives a follower the channel’s authors and their own row, never other followers', () => {
    const { members, rosterRestricted } = scope(channel, 'member');
    expect(rosterRestricted).toBe(true);
    expect(members.map((m) => m.userId)).toEqual(['user_leader', 'user_viewer']);
  });

  it('keeps the full roster for the owner and leaders', () => {
    for (const role of ['owner', 'leader']) {
      const { members, rosterRestricted } = scope(channel, role);
      expect(rosterRestricted).toBe(false);
      expect(members).toHaveLength(roster.length);
    }
  });

  it('keeps the full roster for church staff who only follow the channel (Make leader)', () => {
    const { members, rosterRestricted } = scope(channel, 'member', true);
    expect(rosterRestricted).toBe(false);
    expect(members).toHaveLength(roster.length);
  });

  it('leaves Shared Spaces — church or not — and personal spaces unchanged', () => {
    for (const space of [
      { type: 'shared', orgId: null },
      { type: 'shared', orgId: 'org_church' },
      { type: 'personal', orgId: null },
      // A public room with no church is not a ministry channel.
      { type: 'public', orgId: null },
    ]) {
      const { members, rosterRestricted } = scope(space, 'member');
      expect(rosterRestricted).toBe(false);
      expect(members).toHaveLength(roster.length);
    }
  });

  it('only asks about church staff when the answer could change the result', () => {
    expect(spaceRosterIsRestrictedForViewer({ space: channel, viewerRole: 'member' })).toBe(true);
    expect(spaceRosterIsRestrictedForViewer({ space: channel, viewerRole: 'leader' })).toBe(false);
    expect(
      spaceRosterIsRestrictedForViewer({ space: { type: 'shared', orgId: 'org_church' }, viewerRole: 'member' }),
    ).toBe(false);
  });
});

describe('GET /api/spaces/:spaceId/members', () => {
  const routeSource = readFileSync(resolve(process.cwd(), 'server/routes/spaces.ts'), 'utf8');
  const start = routeSource.indexOf("route.get('/api/spaces/:spaceId/members'");
  const end = routeSource.indexOf('\nroute.', start + 1);
  const handler = routeSource.slice(start, end === -1 ? undefined : end);

  it('scopes the roster before reading anyone’s names', () => {
    expect(start).toBeGreaterThan(-1);
    const scopedAt = handler.indexOf('scopeSpaceRosterForViewer(');
    const metadataAt = handler.indexOf('from(UserMetadata)');
    expect(scopedAt, 'handler never scopes the roster').toBeGreaterThan(-1);
    expect(metadataAt).toBeGreaterThan(-1);
    expect(scopedAt, 'names are read before the roster is scoped').toBeLessThan(metadataAt);
  });

  it('builds the response from the scoped rows, not the unscoped query', () => {
    expect(handler).toMatch(/const \{ members, rosterRestricted \} = scopeSpaceRosterForViewer\(allMembers/);
    expect(handler).not.toMatch(/allMembers\.map\(/);
    expect(handler).toContain('rosterRestricted,');
  });
});
