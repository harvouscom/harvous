import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
const database = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../../db/client', () => ({ db: database }));
import { ownedChild, redeemHandoff, withChildSession } from '../service';
import { CHILD_NOTICE_VERSION, childSecret } from '../policy';
const child = { id: 'child-a', parentUserId: 'parent-a', status: 'active', noticeVersion: CHILD_NOTICE_VERSION, consentedAt: new Date() };
function fakeTx(results: unknown[][]) {
  const queries: any[] = [];
  const tx: any = {
    select: vi.fn(() => {
      const value = results.shift() ?? [];
      const builder: any = {
        from: () => builder, where: (condition: any) => { queries.push(condition); return builder; },
        for: () => Promise.resolve(value), then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject)
      };
      return builder;
    }),
    update: vi.fn(() => ({ set: () => ({ where: vi.fn().mockResolvedValue([]) }) })),
    delete: vi.fn(() => ({ where: () => ({ returning: vi.fn().mockResolvedValue([]) }) })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) }))
  };
  database.transaction.mockImplementation((work) => work(tx));
  return { tx, queries };
}
beforeEach(() => vi.clearAllMocks());
describe('family account isolation', () => {
  it('requires both child ID and parent ID on parent reads and writes', async () => {
    const { tx, queries } = fakeTx([[]]);
    await expect(ownedChild(tx, 'parent-b', 'child-a')).rejects.toMatchObject({ status: 404 });
    const query = new PgDialect().sqlToQuery(queries[0]);
    expect(query.params).toEqual(['child-a', 'parent-b']);
    expect(tx.update).not.toHaveBeenCalled();
  });
  it('rejects missing or expired sessions before reading any notebook', async () => {
    const { tx } = fakeTx([[]]); const work = vi.fn();
    await expect(withChildSession(childSecret(), work)).rejects.toMatchObject({ status: 401 });
    expect(work).not.toHaveBeenCalled(); expect(tx.update).not.toHaveBeenCalled();
  });
  it('checks revocation after locking the child, not just when issuing a token', async () => {
    fakeTx([[{ childId: child.id, tokenHash: 'hash' }], [{ ...child, status: 'revoked' }]]);
    const work = vi.fn(); await expect(withChildSession(childSecret(), work)).rejects.toMatchObject({ status: 403 });
    expect(work).not.toHaveBeenCalled();
  });
  it('does not use a session a parent ended while its request waited for a lock', async () => {
    fakeTx([[{ childId: child.id, tokenHash: 'hash' }], [child], []]);
    const work = vi.fn(); await expect(withChildSession(childSecret(), work)).rejects.toMatchObject({ status: 401 });
    expect(work).not.toHaveBeenCalled();
  });
  it('passes only the authenticated child to notebook operations', async () => {
    fakeTx([[{ childId: child.id, tokenHash: 'hash' }], [child], [{ tokenHash: 'hash' }]]);
    const work = vi.fn().mockResolvedValue('notebook');
    expect(await withChildSession(childSecret(), work)).toBe('notebook');
    expect(work.mock.calls[0][1].id).toBe('child-a');
  });
  it('cannot redeem a handoff twice or after expiry', async () => {
    const { tx } = fakeTx([[{ childId: child.id, tokenHash: 'hash' }], [child]]);
    await expect(redeemHandoff(childSecret())).rejects.toMatchObject({ status: 401 });
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
