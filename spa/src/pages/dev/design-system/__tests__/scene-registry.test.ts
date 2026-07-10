import { describe, expect, it } from 'vitest';
import { DESIGN_SYSTEM_CORE_SCENES } from '../sceneRegistry';
import { SHARED_SPACES_DESIGN_SCENES } from '../../shared-spaces-design/sceneRegistry';

describe('design-system scene registries', () => {
  it('has unique ids across core and shared-spaces galleries', () => {
    const ids = [...DESIGN_SYSTEM_CORE_SCENES, ...SHARED_SPACES_DESIGN_SCENES].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks core foundation scenes for visual baselines', () => {
    const baseline = DESIGN_SYSTEM_CORE_SCENES.filter((s) => s.visualBaseline);
    expect(baseline.length).toBeGreaterThanOrEqual(5);
    for (const scene of baseline) {
      expect(scene.screenshotSlug).toBeTruthy();
    }
  });
});
