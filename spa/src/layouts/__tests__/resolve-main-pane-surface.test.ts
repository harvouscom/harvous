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

describe('resolveMainPaneSurface', () => {
  it('gives My Home the Activity feed', () => {
    expect(resolveMainPaneSurface(HOME_LOCATION)).toBe('activity');
  });

  it('gives a church parent with no space open its hub', () => {
    expect(resolveMainPaneSurface(CHURCH_HUB)).toBe('church-hub');
  });

  it('keeps a space on Activity, whoever its parent is', () => {
    /*
     * Today's behaviour, kept on purpose: the space hub is the next phase. Asserting it here
     * so that phase has to change a test rather than discover it had already half-happened.
     */
    expect(resolveMainPaneSurface({ parent: churchParent('org_1'), spaceId: 'space_1' })).toBe(
      'activity',
    );
    expect(resolveMainPaneSurface({ ...HOME_LOCATION, spaceId: 'space_2' })).toBe('activity');
  });

  it('reads the parent, not the org id', () => {
    /* Two churches are both the church hub — the id picks which church, not which surface. */
    expect(resolveMainPaneSurface({ parent: churchParent('org_2'), spaceId: null })).toBe(
      'church-hub',
    );
  });
});
