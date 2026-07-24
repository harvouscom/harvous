import { describe, expect, it } from 'vitest';
import { mergeHmcChurchInterest } from '../hmc-church-interest';

describe('mergeHmcChurchInterest', () => {
  it('sorts by userCount desc then name, and flags registered orgs', () => {
    const rows = mergeHmcChurchInterest(
      [
        {
          hmcChurchId: 'TX-1',
          churchName: 'Zion',
          churchCity: 'Austin',
          churchState: 'TX',
          userCount: 2,
        },
        {
          hmcChurchId: 'IA-9',
          churchName: 'New Hope',
          churchCity: 'Urbandale',
          churchState: 'IA',
          userCount: 5,
        },
        {
          hmcChurchId: 'TX-2',
          churchName: 'Alpha',
          churchCity: 'Dallas',
          churchState: 'TX',
          userCount: 2,
        },
      ],
      [
        { id: 'chur_1', orgId: 'org_1', hmcChurchId: 'IA-9' },
        { id: 'chur_2', orgId: 'org_2', hmcChurchId: null },
      ],
    );

    expect(rows.map((r) => r.hmcChurchId)).toEqual(['IA-9', 'TX-2', 'TX-1']);
    expect(rows[0]).toMatchObject({
      hmcChurchId: 'IA-9',
      churchName: 'New Hope',
      userCount: 5,
      registeredChurchId: 'chur_1',
      registeredOrgId: 'org_1',
    });
    expect(rows[1].registeredChurchId).toBeNull();
    expect(rows[2].registeredChurchId).toBeNull();
  });

  it('skips empty hmc ids and trims denorm fields', () => {
    const rows = mergeHmcChurchInterest(
      [
        {
          hmcChurchId: '  ',
          churchName: 'Nope',
          churchCity: null,
          churchState: null,
          userCount: 1,
        },
        {
          hmcChurchId: ' TX-3 ',
          churchName: '  Hope  ',
          churchCity: ' Austin ',
          churchState: ' TX ',
          userCount: 1,
        },
      ],
      [],
    );
    expect(rows).toEqual([
      {
        hmcChurchId: 'TX-3',
        churchName: 'Hope',
        churchCity: 'Austin',
        churchState: 'TX',
        userCount: 1,
        registeredChurchId: null,
        registeredOrgId: null,
      },
    ]);
  });
});
