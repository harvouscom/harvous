import { describe, expect, it } from 'vitest';
import {
  planMinistryChannelFollow,
  planMinistryChannelUnfollow,
} from '../ministry-channel-follow';

describe('planMinistryChannelFollow', () => {
  const channel = { type: 'public', orgId: 'org_1', deletedAt: null };

  it('inserts when user has no membership on an active ministry channel', () => {
    expect(planMinistryChannelFollow({ space: channel, existingRole: null })).toEqual({
      action: 'insert',
    });
  });

  it('no-ops when already a member or staff', () => {
    expect(planMinistryChannelFollow({ space: channel, existingRole: 'member' })).toEqual({
      action: 'noop',
      reason: 'already_member',
    });
    expect(planMinistryChannelFollow({ space: channel, existingRole: 'leader' })).toEqual({
      action: 'noop',
      reason: 'already_staff',
    });
    expect(planMinistryChannelFollow({ space: channel, existingRole: 'owner' })).toEqual({
      action: 'noop',
      reason: 'already_staff',
    });
  });

  it('rejects personal shared spaces and missing/inactive spaces', () => {
    expect(
      planMinistryChannelFollow({
        space: { type: 'shared', orgId: 'org_1', deletedAt: null },
        existingRole: null,
      }),
    ).toEqual({ action: 'reject', code: 'NOT_MINISTRY_CHANNEL' });
    expect(
      planMinistryChannelFollow({
        space: { type: 'public', orgId: null, deletedAt: null },
        existingRole: null,
      }),
    ).toEqual({ action: 'reject', code: 'NOT_MINISTRY_CHANNEL' });
    expect(planMinistryChannelFollow({ space: null, existingRole: null })).toEqual({
      action: 'reject',
      code: 'SPACE_NOT_FOUND',
    });
    expect(
      planMinistryChannelFollow({
        space: { ...channel, deletedAt: '2026-01-01T00:00:00.000Z' },
        existingRole: null,
      }),
    ).toEqual({ action: 'reject', code: 'SPACE_INACTIVE' });
  });
});

describe('planMinistryChannelUnfollow', () => {
  const channel = { type: 'public', orgId: 'org_1' };

  it('deletes member follows only', () => {
    expect(planMinistryChannelUnfollow({ space: channel, existingRole: 'member' })).toEqual({
      action: 'delete',
    });
  });

  it('refuses to remove staff rows', () => {
    expect(planMinistryChannelUnfollow({ space: channel, existingRole: 'leader' })).toEqual({
      action: 'reject',
      code: 'STAFF_ROW',
    });
  });

  it('no-ops when not following', () => {
    expect(planMinistryChannelUnfollow({ space: channel, existingRole: null })).toEqual({
      action: 'noop',
      reason: 'not_following',
    });
  });
});
