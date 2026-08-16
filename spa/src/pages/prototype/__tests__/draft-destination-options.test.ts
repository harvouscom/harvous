/**
 * Where a draft may be re-sent.
 *
 * The rule worth pinning is the one whose failure is invisible until save: a ministry
 * channel you *follow* looks exactly like a room you could write into — it is in the
 * sidebar, it has a title — but `canAuthorInSpace` gives a follower `member` and the server
 * refuses the note. Offering it would be offering a failure.
 */
import { describe, expect, it } from 'vitest';
import { draftDestinationOptions } from '../PrototypeDraftDestinationSheet';
import type { NavSpace } from '../../../hooks/queries/useNavigation';

const space = (over: Partial<NavSpace> & { id: string; title: string }): NavSpace =>
  ({ type: 'shared', ...over }) as NavSpace;

const HOME = 'space_home';

describe('draftDestinationOptions', () => {
  it('always offers My Home, first', () => {
    const options = draftDestinationOptions({ spaces: [], memberOfSpaces: [], homeSpaceId: HOME });
    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({ spaceId: null, label: 'My Home', isHome: true });
  });

  it('offers shared spaces the viewer belongs to', () => {
    const options = draftDestinationOptions({
      spaces: [space({ id: 'space_family', title: 'Family' })],
      memberOfSpaces: [],
      homeSpaceId: HOME,
    });
    expect(options.map((o) => o.label)).toEqual(['My Home', 'Family']);
  });

  it('never offers a channel the viewer only follows', () => {
    // The failure this prevents is silent until save: the row looks writable and is not.
    const options = draftDestinationOptions({
      spaces: [],
      memberOfSpaces: [space({ id: 'space_youth', title: 'Youth', type: 'public', role: 'member' })],
      homeSpaceId: HOME,
    });
    expect(options.map((o) => o.label)).toEqual(['My Home']);
  });

  it('does offer a channel the viewer leads', () => {
    const options = draftDestinationOptions({
      spaces: [],
      memberOfSpaces: [space({ id: 'space_youth', title: 'Youth', type: 'public', role: 'leader' })],
      homeSpaceId: HOME,
    });
    expect(options.map((o) => o.label)).toEqual(['My Home', 'Youth']);
  });

  it('never lists the home space twice', () => {
    const options = draftDestinationOptions({
      spaces: [space({ id: HOME, title: 'My Home', type: 'personal' })],
      memberOfSpaces: [],
      homeSpaceId: HOME,
    });
    expect(options).toHaveLength(1);
  });

  it('de-duplicates a space that appears in both lists', () => {
    const family = space({ id: 'space_family', title: 'Family' });
    const options = draftDestinationOptions({
      spaces: [family],
      memberOfSpaces: [family],
      homeSpaceId: HOME,
    });
    expect(options.map((o) => o.label)).toEqual(['My Home', 'Family']);
  });

  it('normalizes a bare id so it matches what the shell stores', () => {
    const options = draftDestinationOptions({
      spaces: [space({ id: '1785269710187', title: 'Family' })],
      memberOfSpaces: [],
      homeSpaceId: HOME,
    });
    expect(options[1].spaceId).toBe('space_1785269710187');
  });
});
