import { describe, expect, it } from 'vitest';
import { ACTIVITY_SCENE_ITEMS } from '../SharedSpacesDesignScenePreview';
import {
  SHARED_SPACES_DESIGN_SCENES,
  SHARED_SPACES_VERIFICATION_SCENE_IDS,
} from '../sceneRegistry';
import { SHARED_SPACE_THREAD_FIXTURES } from '../shared-space-dashboard-fixtures';

describe('Shared Spaces verification gallery', () => {
  it('tracks all seven rendered verification baselines', () => {
    expect(SHARED_SPACES_VERIFICATION_SCENE_IDS).toHaveLength(7);
    expect(SHARED_SPACES_DESIGN_SCENES.map((scene) => scene.id)).toEqual(
      expect.arrayContaining([...SHARED_SPACES_VERIFICATION_SCENE_IDS]),
    );
  });

  it('registers populated, detached, and empty Activity scenes', () => {
    expect(SHARED_SPACES_DESIGN_SCENES.map((scene) => scene.id)).toEqual(
      expect.arrayContaining([
        '21-activity-populated',
        '22-activity-detached',
        '23-activity-empty',
      ]),
    );
    expect(ACTIVITY_SCENE_ITEMS.populated).toHaveLength(2);
    expect(ACTIVITY_SCENE_ITEMS.detached[0]).toMatchObject({
      statusLabel: 'Passage changed',
      anchor: { status: 'detached', start: null, end: null },
    });
    expect(ACTIVITY_SCENE_ITEMS.empty).toEqual([]);
  });

  it('covers owner/member dashboards with and without a current Thread', () => {
    expect(SHARED_SPACES_DESIGN_SCENES.map((scene) => scene.id)).toEqual(
      expect.arrayContaining([
        '24-thread-owner-empty',
        '25-thread-member-empty',
        '26-thread-owner-current',
        '27-thread-member-current',
      ]),
    );
    expect(SHARED_SPACE_THREAD_FIXTURES.ownerEmpty).toMatchObject({
      isOwner: true,
      currentThread: null,
    });
    expect(SHARED_SPACE_THREAD_FIXTURES.memberEmpty).toMatchObject({
      isOwner: false,
      currentThread: null,
    });
    expect(SHARED_SPACE_THREAD_FIXTURES.ownerCurrent.currentThread?.noteCount).toBeGreaterThan(0);
    expect(SHARED_SPACE_THREAD_FIXTURES.memberCurrent.currentThread?.noteCount).toBeGreaterThan(0);
  });
});
