/**
 * Which surface the canvas shows, per location.
 *
 * The interesting case is the church hub, which had no main-pane branch at all — the feed
 * rendered whatever the parent, so a church only existed on the rail.
 */
import { describe, expect, it } from 'vitest';
import { resolveMainPaneSurface } from '../resolve-main-pane-surface';
import { HOME_LOCATION, churchParent, type ProtoLocation } from '../proto-location';

const CHURCH_HUB: ProtoLocation = { parent: churchParent('org_1'), spaceId: null };

/** Shorthand: most cases are about location, not about sharedness. */
const at = (location: ProtoLocation, isSharedSpace = false) =>
  resolveMainPaneSurface({ location, isSharedSpace });

describe('resolveMainPaneSurface', () => {
  it('gives My Home the Activity feed', () => {
    expect(at(HOME_LOCATION)).toBe('activity');
  });

  it('gives a church parent with no space open its hub', () => {
    expect(at(CHURCH_HUB)).toBe('church-hub');
  });

  it('gives a shared space its own hub, under either parent', () => {
    expect(at({ parent: churchParent('org_1'), spaceId: 'space_1' }, true)).toBe('space-hub');
    expect(at({ ...HOME_LOCATION, spaceId: 'space_2' }, true)).toBe('space-hub');
  });

  it('leaves a personal space on Activity', () => {
    /*
     * The same line the study feed's scope options draw: a personal space is not a scope,
     * because narrowing to it is what My Home already means. A hub for one would be a second
     * My Home wearing a different name.
     */
    expect(at({ ...HOME_LOCATION, spaceId: 'space_3' }, false)).toBe('activity');
  });

  it('reads the parent, not the org id', () => {
    /* Two churches are both the church hub — the id picks which church, not which surface. */
    expect(at({ parent: churchParent('org_2'), spaceId: null })).toBe('church-hub');
  });

  it('lets an open space outrank the parent hub', () => {
    /* Standing in a church's space shows that space, not the church catalog above it. */
    expect(at(CHURCH_HUB)).toBe('church-hub');
    expect(at({ parent: churchParent('org_1'), spaceId: 'space_9' }, true)).toBe('space-hub');
  });
});
