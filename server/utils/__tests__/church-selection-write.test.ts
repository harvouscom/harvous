import { beforeEach, describe, expect, it, vi } from 'vitest';

const updates: Array<Record<string, unknown>> = [];
const inserts: Array<Record<string, unknown>> = [];
let existingRow: Record<string, unknown> | undefined;

vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (existingRow ? [existingRow] : []) }) }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: async () => undefined };
      },
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        inserts.push(values);
      },
    }),
  },
  first: (rows: unknown[]) => (Array.isArray(rows) ? rows[0] : undefined),
  eq: (...args: unknown[]) => args,
  UserMetadata: { userId: 'userId' },
}));

vi.mock('../../db/dates', () => ({
  nowISO: () => new Date('2026-09-25T12:00:00.000Z'),
  toDate: (val: Date | string | null | undefined) => (val == null ? null : new Date(val)),
}));

const awardChurchAddedXP = vi.fn(async () => true);
vi.mock('../xp-system', () => ({ awardChurchAddedXP: (...a: unknown[]) => awardChurchAddedXP(...(a as [])) }));

const releaseChannelFollowsForOrg = vi.fn(async () => 2);
vi.mock('../ministry-channel-follow', async () => {
  const actual = await vi.importActual<typeof import('../ministry-channel-follow')>('../ministry-channel-follow');
  return {
    orgLeftByChurchChange: actual.orgLeftByChurchChange,
    releaseChannelFollowsForOrg: (...a: unknown[]) => releaseChannelFollowsForOrg(...(a as [])),
  };
});

import { connectUserToChurch } from '../church-selection-write';

const church = {
  id: 'chur_new',
  orgId: 'org_new',
  hmcChurchId: null,
  name: 'New Hope Assembly of God',
  city: 'Springfield',
  state: 'MO',
  country: 'US',
};

describe('connectUserToChurch', () => {
  beforeEach(() => {
    updates.length = 0;
    inserts.length = 0;
    existingRow = undefined;
    awardChurchAddedXP.mockClear();
    releaseChannelFollowsForOrg.mockClear();
  });

  it('connects a person with no metadata row, and awards first-church XP once', async () => {
    const result = await connectUserToChurch('user_a', church);
    expect(result).toEqual({ alreadyConnected: false, leftOrgId: null });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      userId: 'user_a',
      hmcChurchId: null,
      churchName: 'New Hope Assembly of God',
      churchCity: 'Springfield',
      connectedChurchId: 'chur_new',
      connectedOrgId: 'org_new',
    });
    expect(awardChurchAddedXP).toHaveBeenCalledTimes(1);
    expect(releaseChannelFollowsForOrg).not.toHaveBeenCalled();
  });

  it('keeps connectedChurchAt and awards nothing when already connected here', async () => {
    existingRow = {
      userId: 'user_a',
      churchName: 'New Hope Assembly of God',
      connectedChurchId: 'chur_new',
      connectedOrgId: 'org_new',
      connectedChurchAt: '2026-08-01T00:00:00.000Z',
      churchAddedAt: '2026-08-01T00:00:00.000Z',
    };
    const result = await connectUserToChurch('user_a', church);
    expect(result).toEqual({ alreadyConnected: true, leftOrgId: null });
    expect(updates[0].connectedChurchAt).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(awardChurchAddedXP).not.toHaveBeenCalled();
  });

  it('releases the old church’s follows when someone moves', async () => {
    existingRow = {
      userId: 'user_a',
      churchName: 'Grace Chapel',
      connectedChurchId: 'chur_old',
      connectedOrgId: 'org_old',
      connectedChurchAt: '2026-01-01T00:00:00.000Z',
    };
    const result = await connectUserToChurch('user_a', church);
    expect(result).toEqual({ alreadyConnected: false, leftOrgId: 'org_old' });
    expect(updates[0]).toMatchObject({ connectedChurchId: 'chur_new', connectedOrgId: 'org_new' });
    expect(updates[0].connectedChurchAt).toEqual(new Date('2026-09-25T12:00:00.000Z'));
    expect(releaseChannelFollowsForOrg).toHaveBeenCalledWith('user_a', 'org_old');
  });

  it('never fails the connection when releasing old follows does', async () => {
    existingRow = { userId: 'user_a', connectedChurchId: 'chur_old', connectedOrgId: 'org_old' };
    releaseChannelFollowsForOrg.mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectUserToChurch('user_a', church)).resolves.toMatchObject({ leftOrgId: 'org_old' });
    expect(updates).toHaveLength(1);
  });
});
