import { describe, expect, it } from 'vitest';
import {
  churchHubSpacesForOrg,
  formatChurchLocation,
  isPersonalSharedSpace,
  resolveMyChurchFromNav,
  staffChurchChannelSummary,
  staffChurchesFromNavSpaces,
} from '../church-settings';
import type { NavSpace } from '../../hooks/queries/useNavigation';

function space(partial: Partial<NavSpace> & Pick<NavSpace, 'id' | 'title'>): NavSpace {
  return {
    color: null,
    backgroundGradient: '',
    ownerId: 'user_1',
    memberCount: 1,
    ...partial,
  };
}

describe('staffChurchesFromNavSpaces', () => {
  it('groups ministry channels by org and ignores shared spaces', () => {
    const rows = staffChurchesFromNavSpaces([
      space({
        id: 'space_a',
        title: 'Adult education',
        type: 'public',
        orgId: 'org_1',
        churchName: 'Testament Made',
        churchCity: 'Austin',
        churchState: 'TX',
      }),
      space({
        id: 'space_b',
        title: 'Students',
        type: 'public',
        orgId: 'org_1',
        churchName: 'Testament Made',
        churchCity: 'Austin',
        churchState: 'TX',
      }),
      space({ id: 'space_c', title: 'Family', type: 'shared', orgId: null }),
    ]);
    expect(rows).toEqual([
      {
        orgId: 'org_1',
        churchName: 'Testament Made',
        churchCity: 'Austin',
        churchState: 'TX',
        channelTitles: ['Adult education', 'Students'],
      },
    ]);
    expect(staffChurchChannelSummary(rows[0]!)).toBe('2 ministry channels');
    expect(formatChurchLocation(rows[0]!)).toBe('Austin, TX');
  });
});

describe('formatChurchLocation', () => {
  it('formats city/state and omits empties', () => {
    expect(formatChurchLocation({ churchCity: 'Austin', churchState: 'TX' })).toBe('Austin, TX');
    expect(formatChurchLocation({ churchCity: 'Austin', churchState: null })).toBe('Austin');
    expect(formatChurchLocation({ churchCity: null, churchState: 'TX' })).toBe('TX');
    expect(formatChurchLocation({ churchCity: null, churchState: null })).toBeNull();
  });
});

describe('resolveMyChurchFromNav / churchHubSpacesForOrg', () => {
  const ministry = space({
    id: 'space_a',
    title: 'Adult education',
    type: 'public',
    orgId: 'org_1',
    churchName: 'Testament Made',
  });
  const family = space({ id: 'space_c', title: 'Family', type: 'shared', orgId: null });
  const churchShared = space({
    id: 'space_d',
    title: 'Youth group',
    type: 'shared',
    orgId: 'org_1',
    churchName: 'Testament Made',
  });

  it('uses staff bridge when home org is not connected', () => {
    expect(resolveMyChurchFromNav({ spaces: [ministry, family] })?.orgId).toBe('org_1');
  });

  it('lists ministry + church-scoped shared under the hub org', () => {
    expect(churchHubSpacesForOrg([ministry, family, churchShared], 'org_1').map((s) => s.id)).toEqual([
      'space_a',
      'space_d',
    ]);
    expect(isPersonalSharedSpace(family)).toBe(true);
    expect(isPersonalSharedSpace(churchShared)).toBe(false);
  });
});
