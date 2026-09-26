import { describe, expect, it } from 'vitest';
import { scopesAdmitViewer } from '../church-library-access';

const space = (spaceId: string) => ({ scopeKind: 'space', spaceId, ministryKey: null });
const ministry = (ministryKey: string) => ({ scopeKind: 'ministry', spaceId: null, ministryKey });
const org = { scopeKind: 'org', spaceId: null, ministryKey: null };

describe('scopesAdmitViewer', () => {
  it('admits everyone to an unscoped or org-wide item', () => {
    expect(scopesAdmitViewer([], [], false)).toBe(true);
    expect(scopesAdmitViewer([org], [], false)).toBe(true);
  });

  it('admits a ministry item to someone in that ministry, not someone outside it', () => {
    expect(scopesAdmitViewer([ministry('min_youth')], [], false, ['min_youth'])).toBe(true);
    expect(scopesAdmitViewer([ministry('min_youth')], [], false, ['min_kids'])).toBe(false);
    expect(scopesAdmitViewer([ministry('min_youth')], [], false)).toBe(false);
  });

  it('admits on any matching scope, ministry or room', () => {
    const scopes = [ministry('min_youth'), space('space_tuesday')];
    expect(scopesAdmitViewer(scopes, ['space_tuesday'], false, [])).toBe(true);
    expect(scopesAdmitViewer(scopes, [], false, ['min_youth'])).toBe(true);
    expect(scopesAdmitViewer(scopes, ['space_other'], false, ['min_kids'])).toBe(false);
  });

  it('staff see everything', () => {
    expect(scopesAdmitViewer([ministry('min_youth')], [], true)).toBe(true);
  });

  it('a ministry id never matches a room id', () => {
    expect(scopesAdmitViewer([ministry('space_tuesday')], ['space_tuesday'], false, [])).toBe(false);
  });
});
