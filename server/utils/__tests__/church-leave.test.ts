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
    // Both connect doors (Settings and the join link) write through this helper.
    const helper = source('server/utils/church-selection-write.ts');
    const body = helper.slice(helper.indexOf('export async function persistChurchSelection'));
    const write = body.indexOf('connectedOrgId: connection.connectedOrgId');
    const release = body.indexOf('releaseChannelFollowsForOrg(userId, leftOrgId)');
    expect(write).toBeGreaterThan(-1);
    expect(release).toBeGreaterThan(write);
    expect(body.slice(release - 200, release)).toContain('try {');
  });

  it('is reached from both connect doors, never re-implemented beside them', () => {
    const route = source('server/routes/user.ts');
    expect(route).toContain('await persistChurchSelection(');
    expect(route).not.toContain('releaseChannelFollowsForOrg(');
    const helper = source('server/utils/church-selection-write.ts');
    const connect = helper.slice(helper.indexOf('export async function connectUserToChurch'));
    expect(connect).toContain('await persistChurchSelection(');
  });
});
