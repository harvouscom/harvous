/**
 * The switch that lets production answer the question dev cannot.
 *
 * Home's gate exists to beat a 2.5s deadline against real latency, and the trace that reports
 * whether it did was `import.meta.env.DEV`-only — so the one environment whose answer matters
 * could never be asked. `?debug=home` arms it for the tab.
 *
 * The three cases below are the whole contract, and the middle one is the reason this is a pure
 * function: the trace reports on the *first* settle of a load, so checking it means reloading,
 * and a flag that only lived as long as the URL would be useless for the job it exists to do.
 */
import { describe, expect, it } from 'vitest';
import { homeSettleTraceDecision } from '../useHomeSettleTrace';

describe('homeSettleTraceDecision', () => {
  it('is off by default, and asks for nothing to be written', () => {
    expect(homeSettleTraceDecision('', false)).toEqual({
      enabled: false,
      arm: false,
      disarm: false,
    });
  });

  it('turns on and arms the tab when asked', () => {
    expect(homeSettleTraceDecision('?debug=home', false)).toEqual({
      enabled: true,
      arm: true,
      disarm: false,
    });
  });

  it('stays on across a reload that has dropped the parameter', () => {
    // The point of arming. A reload is how you compare a cold load with a warm one.
    expect(homeSettleTraceDecision('', true)).toEqual({
      enabled: true,
      arm: false,
      disarm: false,
    });
  });

  it('turns off on request, and clears the arming with it', () => {
    expect(homeSettleTraceDecision('?debug=off', true)).toEqual({
      enabled: false,
      arm: false,
      disarm: true,
    });
  });

  it('ignores a debug parameter meant for something else', () => {
    expect(homeSettleTraceDecision('?debug=reader', false).enabled).toBe(false);
    // And does not disturb an arming that is already there.
    expect(homeSettleTraceDecision('?debug=reader', true)).toEqual({
      enabled: true,
      arm: false,
      disarm: false,
    });
  });

  it('reads the parameter alongside others', () => {
    expect(homeSettleTraceDecision('?space=space_1&debug=home', false).enabled).toBe(true);
  });
});
