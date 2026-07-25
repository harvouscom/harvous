import { describe, expect, it } from 'vitest';
import {
  canCreateChurchOrgContent,
  canCreateChurchSharedSpaceFromNav,
  churchHubSpacesForOrg,
  formatChurchLocation,
  formatHubNewBadge,
  formatMinistryChannelTeaser,
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
  it('groups ministry + church-scoped shared by org; ignores personal Shared Spaces', () => {
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
      space({
        id: 'space_d',
        title: 'Youth group',
        type: 'shared',
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
        channelTitles: ['Adult education', 'Students', 'Youth group'],
      },
    ]);
    expect(staffChurchChannelSummary(rows[0]!)).toBe('3 ministry channels');
    expect(formatChurchLocation(rows[0]!)).toBe('Austin, TX');
  });

  it('unlocks My Church from a church-scoped Shared Space alone (no ministry channel yet)', () => {
    const rows = staffChurchesFromNavSpaces([
      space({
        id: 'space_d',
        title: 'Youth group',
        type: 'shared',
        orgId: 'org_1',
        churchName: 'Testament Made',
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.orgId).toBe('org_1');
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

  it('uses church-scoped Shared Space as staff bridge without a ministry channel', () => {
    expect(resolveMyChurchFromNav({ spaces: [churchShared, family] })?.orgId).toBe('org_1');
  });

  it('lists ministry + church-scoped shared under the hub org', () => {
    expect(churchHubSpacesForOrg([ministry, family, churchShared], 'org_1').map((s) => s.id)).toEqual([
      'space_a',
      'space_d',
    ]);
    expect(isPersonalSharedSpace(family)).toBe(true);
    expect(isPersonalSharedSpace(churchShared)).toBe(false);
  });

  it('unlocks My Church from connectedOrgId with zero nav spaces via profile denorm', () => {
    expect(
      resolveMyChurchFromNav({
        spaces: [],
        memberOfSpaces: [],
        connectedOrgId: 'org_connected',
        churchName: 'Testament Made',
        churchCity: 'Austin',
        churchState: 'TX',
      }),
    ).toEqual({
      orgId: 'org_connected',
      churchName: 'Testament Made',
      churchCity: 'Austin',
      churchState: 'TX',
      channelTitles: [],
    });
  });

  it('prefers spaces for the connected org over a synthetic empty summary', () => {
    expect(
      resolveMyChurchFromNav({
        spaces: [ministry],
        connectedOrgId: 'org_1',
        churchName: 'Fallback Name',
      })?.churchName,
    ).toBe('Testament Made');
  });

  it('keeps staff bridge when there is no connection', () => {
    expect(
      resolveMyChurchFromNav({
        spaces: [ministry],
        connectedOrgId: null,
      })?.orgId,
    ).toBe('org_1');
  });
});

describe('formatMinistryChannelTeaser / formatHubNewBadge', () => {
  it('prefers latest activity with cadence', () => {
    expect(
      formatMinistryChannelTeaser({
        publishCadence: 'weekly',
        lastCurriculumAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        cadenceStale: false,
      }),
    ).toBe('2 days ago · Weekly');
  });

  it('marks quieter than cadence when stale', () => {
    expect(
      formatMinistryChannelTeaser({
        publishCadence: 'weekly',
        lastCurriculumAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        cadenceStale: true,
      }),
    ).toMatch(/^20 days ago · Quieter than Weekly$/);
  });

  it('formats new badges and caps at 9+', () => {
    expect(formatHubNewBadge(0)).toBeNull();
    expect(formatHubNewBadge(3)).toBe('3');
    expect(formatHubNewBadge(12)).toBe('9+');
  });
});

describe('canCreateChurchSharedSpaceFromNav', () => {
  it('is false for connected congregants with no staff spaces', () => {
    expect(
      canCreateChurchSharedSpaceFromNav({ spaces: [], memberOfSpaces: [] }, 'org_1'),
    ).toBe(false);
  });

  it('canCreateChurchOrgContent allows home church staff with an empty hub', () => {
    expect(
      canCreateChurchOrgContent({
        navigation: { spaces: [], memberOfSpaces: [] },
        orgId: 'org_1',
        connectedOrgId: 'org_1',
        isHomeChurchStaff: true,
      }),
    ).toBe(true);
    expect(
      canCreateChurchOrgContent({
        navigation: { spaces: [], memberOfSpaces: [] },
        orgId: 'org_1',
        connectedOrgId: 'org_1',
        isHomeChurchStaff: false,
      }),
    ).toBe(false);
  });

  it('canCreateChurchOrgContent allows live org staff even without home connection match', () => {
    expect(
      canCreateChurchOrgContent({
        navigation: { spaces: [], memberOfSpaces: [] },
        orgId: 'org_staff',
        connectedOrgId: 'org_other',
        isHomeChurchStaff: false,
        isOrgStaff: true,
      }),
    ).toBe(true);
  });

  it('is true when the viewer owns a church-scoped Shared Space for the org', () => {
    expect(
      canCreateChurchSharedSpaceFromNav(
        {
          spaces: [
            space({
              id: 'space_d',
              title: 'Youth group',
              type: 'shared',
              orgId: 'org_1',
            }),
          ],
          memberOfSpaces: [],
        },
        'org_1',
      ),
    ).toBe(true);
  });

  it('is true for owner/leader memberships and false for members', () => {
    expect(
      canCreateChurchSharedSpaceFromNav(
        {
          spaces: [],
          memberOfSpaces: [
            space({
              id: 'space_lead',
              title: 'Elders',
              type: 'shared',
              orgId: 'org_1',
              role: 'leader',
            }),
          ],
        },
        'org_1',
      ),
    ).toBe(true);
    expect(
      canCreateChurchSharedSpaceFromNav(
        {
          spaces: [],
          memberOfSpaces: [
            space({
              id: 'space_member',
              title: 'Visitors',
              type: 'shared',
              orgId: 'org_1',
              role: 'member',
            }),
          ],
        },
        'org_1',
      ),
    ).toBe(false);
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
