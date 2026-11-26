import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/require-db-target', () => ({ requireDbTarget: () => {} }));

import { buildPlanListing, type PlanFile } from '../discover-publish-plan';
import { NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH } from '@/data/note-templates';

const dir = resolve(__dirname, '../../../docs/advent-2026-study-plan');
const plan = JSON.parse(readFileSync(resolve(dir, 'plan.json'), 'utf-8')) as PlanFile;
const bodies = plan.steps.map((s) => readFileSync(resolve(dir, 'notes', s.contentFile), 'utf-8').trim());

describe('the Advent 2026 plan', () => {
  it('builds a pack that installs as a study plan, steps in order', () => {
    const { payload, preview } = buildPlanListing(plan, bodies, 'user_harvous');
    const parsed = JSON.parse(payload);
    expect(parsed.notes.map((n: { title: string }) => n.title)).toEqual(plan.steps.map((s) => s.title));
    expect(parsed.sequence.stepSourceIds).toEqual(parsed.notes.map((n: { sourceId: string }) => n.sourceId));
    expect(JSON.parse(preview)).toMatchObject({ official: true, stepCount: plan.steps.length });
  });

  it('fits the catalog’s limits', () => {
    expect(plan.description.length).toBeLessThanOrEqual(NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH);
    expect(plan.title.length).toBeLessThanOrEqual(120);
  });

  it('refuses a step with no body', () => {
    expect(() => buildPlanListing(plan, ['', ...bodies.slice(1)], 'u')).toThrow(/Empty body/);
  });
});
