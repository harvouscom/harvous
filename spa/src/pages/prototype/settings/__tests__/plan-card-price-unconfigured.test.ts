import { describe, expect, it, vi } from 'vitest';

// As in CI and previews: no billing product configured, so `planFor` finds no listed plan.
// (Vite inlines each module's env when it loads it, so blanking env from a test can't
// reach billing-plans; stubbing its answer is the faithful version of that state.)
vi.mock('@/lib/billing-plans', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing-plans')>();
  return { ...actual, planFor: () => null, listedPlans: () => [] };
});

const { planCardPrice } = await import('../PrototypeAddonsPage');

describe('plan card price without billing configured', () => {
  it('still shows the price: it is a fact about the plan, not the environment', () => {
    expect(planCardPrice({ hasPlus: false, billing: null, canManageBilling: false })).toEqual({
      primary: '$6/mo',
      secondary: '$36/yr',
      note: null,
    });
  });
});
