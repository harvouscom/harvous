import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { orgLeftByChurchChange } from '../ministry-channel-follow';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('orgLeftByChurchChange', () => {
  it('names the old church when the person clears or switches', () => {
    expect(orgLeftByChurchChange('org_a', null)).toBe('org_a');
    expect(orgLeftByChurchChange('org_a', 'org_b')).toBe('org_a');
  });

  it('is null when nothing was left', () => {
    expect(orgLeftByChurchChange('org_a', 'org_a')).toBeNull();
    expect(orgLeftByChurchChange(null, 'org_b')).toBeNull();
    expect(orgLeftByChurchChange('  ', null)).toBeNull();
  });
});

describe('releaseChannelFollowsForOrg', () => {
  const util = () => {
    const text = source('server/utils/ministry-channel-follow.ts');
    return text.slice(text.indexOf('export async function releaseChannelFollowsForOrg'));
  };

  it('only removes follower rows, and only on that church’s channels', () => {
    expect(util()).toContain("eq(SpaceMemberships.role, 'member')");
    expect(util()).toContain("eq(Spaces.type, 'public')");
    expect(util()).toContain('eq(Spaces.orgId, orgId)');
  });

  it('runs after the new connection is written, and never fails the save', () => {
    const route = source('server/routes/user.ts');
    const write = route.indexOf("message: 'Church information updated'");
    const release = route.indexOf('releaseChannelFollowsForOrg(auth.userId, leftOrgId)');
    expect(release).toBeGreaterThan(route.indexOf('connectedOrgId: connection.connectedOrgId'));
    expect(release).toBeLessThan(write);
    expect(route.slice(release - 200, release)).toContain('try {');
  });
});
