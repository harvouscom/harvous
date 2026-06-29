import { describe, expect, it } from 'vitest';
import { aggregateCanonGroupCounts } from '../admin-pulse-canon-groups';
import { buildCanonGroupObservations } from '../admin-pulse-group-insights';
import { computeRisingDeltas, computeCoolingDeltas } from '../admin-pulse-deltas';

describe('aggregateCanonGroupCounts', () => {
  it('rolls book counts into canon sections', () => {
    const groups = aggregateCanonGroupCounts([
      { name: 'Matthew', count: 10 },
      { name: 'John', count: 5 },
      { name: 'Romans', count: 3 },
      { name: 'Genesis', count: 2 },
    ]);

    const gospels = groups.find((group) => group.id === 'gospels');
    const paul = groups.find((group) => group.id === 'paul');
    const law = groups.find((group) => group.id === 'law');

    expect(gospels?.count).toBe(15);
    expect(paul?.count).toBe(3);
    expect(law?.count).toBe(2);
    expect(gospels?.sharePct).toBe(75);
  });
});

describe('buildCanonGroupObservations', () => {
  it('summarizes leaders, testament skew, and momentum', () => {
    const groups = aggregateCanonGroupCounts([
      { name: 'Matthew', count: 20 },
      { name: 'Mark', count: 10 },
      { name: 'Romans', count: 4 },
      { name: 'Genesis', count: 2 },
    ]);
    const previous = aggregateCanonGroupCounts([
      { name: 'Matthew', count: 8 },
      { name: 'Romans', count: 2 },
      { name: 'Psalms', count: 12 },
    ]);
    const currentItems = groups.map((group) => ({ name: group.label, count: group.count }));
    const previousItems = previous.map((group) => ({ name: group.label, count: group.count }));

    const observations = buildCanonGroupObservations({
      days: 7,
      groups,
      rising: computeRisingDeltas(currentItems, previousItems, 3),
      cooling: computeCoolingDeltas(currentItems, previousItems, 3),
    });

    expect(observations[0]).toContain('Gospels leads');
    expect(observations.some((line) => line.includes('New Testament'))).toBe(true);
    expect(observations.some((line) => line.includes('up'))).toBe(true);
  });
});
