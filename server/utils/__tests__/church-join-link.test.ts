import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({
  db: {},
  first: (rows: unknown[]) => (Array.isArray(rows) ? rows[0] : undefined),
  Churches: {},
  ChurchJoinLinks: {},
  Spaces: {},
  and: () => undefined,
  eq: () => undefined,
  isNull: () => undefined,
}));
vi.mock('../church-org-access', () => ({ resolveChurchOrgAccess: vi.fn() }));

import {
  JOIN_FOLLOW_CAP,
  churchJoinUrl,
  joinLinkDeadReason,
  pickChannelsToFollow,
  planJoinRedeem,
  renderChurchJoinQrSvg,
  viewerChurchConnection,
} from '../church-join-link';

describe('churchJoinUrl', () => {
  it('builds the bare join path with no query string', () => {
    expect(churchJoinUrl('https://app.harvous.com/', 'AbC123')).toBe('https://app.harvous.com/churches/join/AbC123');
  });
});

describe('renderChurchJoinQrSvg', () => {
  it('draws black on white, whatever the viewer’s theme', () => {
    const svg = renderChurchJoinQrSvg('https://app.harvous.com/churches/join/AbCdEf123456');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
  });
});

describe('joinLinkDeadReason', () => {
  const live = { isActive: true, deletedAt: null };

  it('keeps a live link to a live church working', () => {
    expect(joinLinkDeadReason({ revokedAt: null }, live)).toBeNull();
  });

  it('answers the same way for a revoked link and a church that is gone — naming neither', () => {
    const revoked = joinLinkDeadReason({ revokedAt: new Date() }, live);
    const gone = joinLinkDeadReason({ revokedAt: null }, { isActive: false, deletedAt: null });
    const deleted = joinLinkDeadReason({ revokedAt: null }, { isActive: true, deletedAt: new Date() });
    expect(revoked).toBeTruthy();
    expect(new Set([revoked, gone, deleted, joinLinkDeadReason({ revokedAt: null }, null)]).size).toBe(1);
  });
});

describe('pickChannelsToFollow', () => {
  const offered = [{ id: 'space_a' }, { id: 'space_b' }, { id: 'space_c' }];

  it('keeps only offered channels, once each, in the order asked', () => {
    expect(pickChannelsToFollow(['space_b', 'space_x', 'space_b', ' space_a '], offered)).toEqual([
      'space_b',
      'space_a',
    ]);
  });

  it('treats anything but an array as nothing to follow', () => {
    expect(pickChannelsToFollow(undefined, offered)).toEqual([]);
    expect(pickChannelsToFollow('space_a', offered)).toEqual([]);
    expect(pickChannelsToFollow([1, null, {}], offered)).toEqual([]);
  });

  it('never follows more than the cap', () => {
    const many = Array.from({ length: JOIN_FOLLOW_CAP + 5 }, (_, i) => ({ id: `space_${i}` }));
    expect(pickChannelsToFollow(many.map((c) => c.id), many)).toHaveLength(JOIN_FOLLOW_CAP);
  });
});

describe('planJoinRedeem', () => {
  it('connects someone with no church', () => {
    expect(planJoinRedeem({ viewerConnectedChurchId: null, churchId: 'chur_a', confirmSwitch: false })).toEqual({
      action: 'connect',
    });
  });

  it('does nothing new for someone already here', () => {
    expect(planJoinRedeem({ viewerConnectedChurchId: 'chur_a', churchId: 'chur_a', confirmSwitch: false })).toEqual({
      action: 'already_connected',
    });
  });

  it('asks before moving someone from another church, and moves them once they confirm', () => {
    expect(planJoinRedeem({ viewerConnectedChurchId: 'chur_b', churchId: 'chur_a', confirmSwitch: false })).toEqual({
      action: 'confirm_switch',
    });
    expect(planJoinRedeem({ viewerConnectedChurchId: 'chur_b', churchId: 'chur_a', confirmSwitch: true })).toEqual({
      action: 'connect',
    });
  });
});

describe('viewerChurchConnection', () => {
  it('describes the viewer relative to this church', () => {
    expect(viewerChurchConnection(null, 'chur_a')).toBe('none');
    expect(viewerChurchConnection('chur_a', 'chur_a')).toBe('here');
    expect(viewerChurchConnection('chur_b', 'chur_a')).toBe('elsewhere');
  });
});
