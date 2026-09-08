import { describe, expect, it } from 'vitest';
import { runBounded } from '../run-bounded';

describe('runBounded', () => {
  it('preserves order while capping in-flight work', async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 8 }, (_, index) => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return index;
    });

    await expect(runBounded(tasks, 3)).resolves.toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('runs nothing when given no tasks', async () => {
    await expect(runBounded([], 3)).resolves.toEqual([]);
  });
});
