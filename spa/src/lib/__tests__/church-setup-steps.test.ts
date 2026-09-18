import { describe, expect, it } from 'vitest';
import { churchSetupSteps, shouldShowChurchSetup } from '../church-setup-steps';

const all = { manageSettings: true, createChannel: true, manageTemplates: true, managePlan: true };
const none = { serviceTimes: false, channel: false, starter: false, plannedService: false, published: false };

describe('churchSetupSteps', () => {
  it('orders an admin’s steps the way a church needs them', () => {
    expect(churchSetupSteps({ can: all, has: none }).map((s) => s.id)).toEqual([
      'times',
      'channel',
      'starter',
      'plan',
      'publish',
    ]);
  });

  it('only offers steps the person can do', () => {
    // A teacher: publishes, but sets neither the clock, the starters nor the plan.
    const teacher = { manageSettings: false, createChannel: true, manageTemplates: false, managePlan: false };
    expect(churchSetupSteps({ can: teacher, has: none }).map((s) => s.id)).toEqual(['channel', 'publish']);
  });

  it('ticks what is already true', () => {
    const steps = churchSetupSteps({ can: all, has: { ...none, channel: true, published: true } });
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(['channel', 'publish']);
  });
});

describe('shouldShowChurchSetup', () => {
  const steps = churchSetupSteps({ can: all, has: none });

  it('shows while something is left, and not once put away', () => {
    expect(shouldShowChurchSetup(steps, false)).toBe(true);
    expect(shouldShowChurchSetup(steps, true)).toBe(false);
  });

  it('goes away by itself when everything is done, or when nothing applies', () => {
    const done = churchSetupSteps({
      can: all,
      has: { serviceTimes: true, channel: true, starter: true, plannedService: true, published: true },
    });
    expect(shouldShowChurchSetup(done, false)).toBe(false);
    expect(shouldShowChurchSetup([], false)).toBe(false);
  });
});
