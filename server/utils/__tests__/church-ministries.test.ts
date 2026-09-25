import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({ db: {} }));

import {
  buildStaffScope,
  cleanMinistryName,
  effectiveSpaceMinistry,
  planArchiveMinistry,
  planAssignSpace,
  resolveCreateMinistry,
} from '../church-ministries';

describe('buildStaffScope', () => {
  it('scopes each staffer to their live ministries, and an all-archived one to nothing', () => {
    const scope = buildStaffScope(
      [
        { userId: 'a', ministryId: 'min_youth' },
        { userId: 'a', ministryId: 'min_old' },
        { userId: 'b', ministryId: 'min_old' },
      ],
      new Set(['min_youth']),
    );
    expect([...scope.ministryIdsByUser.get('a')!]).toEqual(['min_youth']);
    // Fails closed: still scoped, to nothing — never widened to the whole church.
    expect(scope.ministryIdsByUser.get('b')!.size).toBe(0);
    expect(scope.ministryIdsByUser.has('c')).toBe(false);
  });
});

describe('effectiveSpaceMinistry', () => {
  it('reads an archived or unknown ministry as church-wide', () => {
    const live = new Set(['min_youth']);
    expect(effectiveSpaceMinistry('min_youth', live)).toBe('min_youth');
    expect(effectiveSpaceMinistry('min_old', live)).toBeNull();
    expect(effectiveSpaceMinistry(null, live)).toBeNull();
  });
});

describe('planArchiveMinistry', () => {
  const open = { id: 's1', audience: 'church' };
  it('archives an empty ministry', () => {
    expect(planArchiveMinistry({ spaces: [], releaseSpaces: false })).toEqual({ action: 'archive', releaseSpaceIds: [] });
  });
  it('refuses one with spaces unless told to release them', () => {
    expect(planArchiveMinistry({ spaces: [open], releaseSpaces: false })).toMatchObject({ code: 'MINISTRY_NOT_EMPTY' });
    expect(planArchiveMinistry({ spaces: [open], releaseSpaces: true })).toEqual({ action: 'archive', releaseSpaceIds: ['s1'] });
  });
  it('never releases a restricted channel into church-wide', () => {
    expect(planArchiveMinistry({ spaces: [{ id: 's2', audience: 'leaders' }], releaseSpaces: true })).toMatchObject({
      code: 'AUDIENCE_REQUIRES_MINISTRY',
    });
  });
});

describe('planAssignSpace', () => {
  const space = { id: 'group', audience: 'church' };
  it('moves a lone space', () => {
    expect(planAssignSpace({ space, pairedSpace: null, targetMinistryId: 'min_youth', movePair: false })).toEqual({
      action: 'assign',
      spaceIds: ['group'],
    });
  });
  it('keeps a group and its channel together', () => {
    const paired = { id: 'channel', ministryId: 'min_kids', audience: 'church' };
    expect(planAssignSpace({ space, pairedSpace: paired, targetMinistryId: 'min_youth', movePair: false })).toMatchObject({
      code: 'PAIRED_ACROSS_MINISTRIES',
    });
    expect(planAssignSpace({ space, pairedSpace: paired, targetMinistryId: 'min_youth', movePair: true })).toEqual({
      action: 'assign',
      spaceIds: ['group', 'channel'],
    });
    // Already in the same ministry: nothing to keep together.
    expect(
      planAssignSpace({ space, pairedSpace: { ...paired, ministryId: 'min_youth' }, targetMinistryId: 'min_youth', movePair: false }),
    ).toMatchObject({ action: 'assign' });
  });
  it('will not make a restricted channel church-wide', () => {
    expect(
      planAssignSpace({ space: { id: 'c', audience: 'ministry' }, pairedSpace: null, targetMinistryId: null, movePair: false }),
    ).toMatchObject({ code: 'AUDIENCE_REQUIRES_MINISTRY' });
  });
});

describe('resolveCreateMinistry', () => {
  const live = new Set(['min_youth', 'min_kids']);
  it('uses a named live ministry', () => {
    expect(resolveCreateMinistry({ requested: 'min_youth', liveMinistryIds: live, creatorMinistryIds: null })).toEqual({
      ok: true,
      ministryId: 'min_youth',
    });
    expect(resolveCreateMinistry({ requested: 'min_gone', liveMinistryIds: live, creatorMinistryIds: null })).toMatchObject({
      code: 'MINISTRY_NOT_FOUND',
    });
  });
  it('keeps a scoped staffer inside their own ministries', () => {
    const mine = new Set(['min_youth']);
    expect(resolveCreateMinistry({ requested: 'min_kids', liveMinistryIds: live, creatorMinistryIds: mine })).toMatchObject({
      code: 'MINISTRY_OUT_OF_SCOPE',
    });
    expect(resolveCreateMinistry({ requested: null, liveMinistryIds: live, creatorMinistryIds: mine })).toEqual({
      ok: true,
      ministryId: 'min_youth',
    });
    expect(
      resolveCreateMinistry({ requested: null, liveMinistryIds: live, creatorMinistryIds: new Set(['min_youth', 'min_kids']) }),
    ).toMatchObject({ code: 'MINISTRY_REQUIRED' });
  });
  it('leaves an unscoped staffer’s new space church-wide', () => {
    expect(resolveCreateMinistry({ requested: null, liveMinistryIds: live, creatorMinistryIds: null })).toEqual({
      ok: true,
      ministryId: null,
    });
  });
});

describe('cleanMinistryName', () => {
  it('trims, collapses and bounds', () => {
    expect(cleanMinistryName('  Young   Adults ')).toBe('Young Adults');
    expect(cleanMinistryName('')).toBeNull();
    expect(cleanMinistryName('x'.repeat(41))).toBeNull();
    expect(cleanMinistryName(7)).toBeNull();
  });
});
