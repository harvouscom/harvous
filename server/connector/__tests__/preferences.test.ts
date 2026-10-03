import { describe, expect, it, vi } from 'vitest';

let rows: unknown[] = [];
vi.mock('../../db', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return {
    db: { select: () => q },
    ConnectorPreferences: { userId: 'userId', allowStartNotes: 'allowStartNotes' },
    eq: () => null,
    first: <T,>(r: T[]) => r[0],
  };
});

const { allowsStartNotes } = await import('../preferences');

describe('Let AI apps start notes', () => {
  it('is off until the person turns it on', async () => {
    rows = [];
    expect(await allowsStartNotes('u')).toBe(false);
  });
  it('follows the saved switch once there is one', async () => {
    rows = [{ allowStartNotes: true }];
    expect(await allowsStartNotes('u')).toBe(true);
  });
});
