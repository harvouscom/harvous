import { describe, expect, it } from 'vitest';
import {
  churchHubSpacesForOrg,
  formatChurchLocation,
  isPersonalSharedSpace,
  resolveMyChurchFromNav,
  staffChurchChannelSummary,
  staffChurchesFromNavSpaces,
  staffedChurchSharedSpaces,
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

  it('appends country for outside-US / manual entries', () => {
    expect(
      formatChurchLocation({
        churchCity: 'Nairobi',
        churchState: null,
        churchCountry: 'Kenya',
      }),
    ).toBe('Nairobi, Kenya');
    expect(
      formatChurchLocation({
        churchCity: 'Vancouver',
        churchState: 'BC',
        churchCountry: 'Canada',
      }),
    ).toBe('Vancouver, BC, Canada');
    expect(
      formatChurchLocation({
        churchCity: 'Austin',
        churchState: 'TX',
        churchCountry: 'United States',
      }),
    ).toBe('Austin, TX');
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

describe('staffedChurchSharedSpaces', () => {
  it('returns owned and leader church shared spaces; ignores personal, ministry, and members', () => {
    const ownedChurchShared = space({
      id: 'space_owned',
      title: 'Youth group',
      type: 'shared',
      orgId: 'org_1',
      churchName: 'Testament Made',
    });
    const leaderMembership = space({
      id: 'space_lead',
      title: 'Elders',
      type: 'shared',
      orgId: 'org_1',
      churchName: 'Testament Made',
      role: 'leader',
    });
    const memberOnly = space({
      id: 'space_member',
      title: 'Visitors',
      type: 'shared',
      orgId: 'org_1',
      role: 'member',
    });
    const personalShared = space({
      id: 'space_personal',
      title: 'Family',
      type: 'shared',
      orgId: null,
    });
    const ministry = space({
      id: 'space_channel',
      title: 'Adult education',
      type: 'public',
      orgId: 'org_1',
      churchName: 'Testament Made',
    });

    const rows = staffedChurchSharedSpaces({
      spaces: [ownedChurchShared, personalShared, ministry],
      memberOfSpaces: [leaderMembership, memberOnly],
    });

    expect(rows.map((s) => s.id)).toEqual(['space_lead', 'space_owned']);
  });
});
