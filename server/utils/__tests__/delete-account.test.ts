/**
 * Deleting an account removes what the account owns — every table, the backups, and the copies
 * at Polar, Audienceful and PostHog — attempts every step even when one fails, and stops the
 * subscription first.
 *
 * The guard at the bottom is the one that matters over time: every table in the schema with a
 * `userId` column is either deleted here or named in KEPT with a reason. A new per-user table
 * that nobody wires into deletion fails this test instead of quietly outliving its owner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableColumns, getTableName, is, Table } from 'drizzle-orm';

const deletedTables: string[] = [];
const order: string[] = [];
let failTable: string | null = null;

vi.mock('../../db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('../../db/schema');
  const ops = await vi.importActual<Record<string, unknown>>('drizzle-orm');
  const selectChain = () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = async () => [{ email: 'reader@example.com' }];
    chain.then = (resolve: (rows: unknown[]) => unknown) => resolve([]);
    return chain;
  };
  return {
    ...schema,
    eq: ops.eq,
    and: ops.and,
    or: ops.or,
    inArray: ops.inArray,
    db: {
      select: () => selectChain(),
      delete: (table: Table) => ({
        where: async () => {
          const name = getTableName(table);
          if (name === failTable) throw new Error('boom');
          deletedTables.push(name);
          order.push(`db:${name}`);
        },
      }),
    },
  };
});

vi.mock('../delete-note-cascade', () => ({
  deleteNotesCascadeForUser: async () => {
    order.push('db:Notes');
  },
}));
vi.mock('../record-search-event', () => ({
  deleteSearchEventsForUser: async () => {
    deletedTables.push('SearchEvents');
  },
}));
const deleteExternal = vi.fn(async () => {
  order.push('polar');
});
vi.mock('../polar-client', () => ({
  isPolarConfigured: () => true,
  getPolarClient: () => ({ customers: { deleteExternal } }),
}));
const deleteUserExports = vi.fn(async () => {});
vi.mock('../user-export-backup-store', () => ({
  isUserExportBackupConfigured: () => true,
  listUserExportKeysForUser: async (userId: string) => [`${userId}/2026-10-01.csv`],
  deleteUserExports,
}));

const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }));

const { deleteAccountData } = await import('../delete-account');
const schema = await vi.importActual<Record<string, unknown>>('../../db/schema');

beforeEach(() => {
  deletedTables.length = 0;
  order.length = 0;
  failTable = null;
  deleteExternal.mockClear();
  deleteUserExports.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  process.env.AUDIENCEFUL_API_KEY = 'aud_test';
  process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test';
  process.env.POSTHOG_PROJECT_ID = '42';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deleteAccountData', () => {
  it('cancels billing before it deletes anything', async () => {
    await deleteAccountData('user_1');
    expect(order[0]).toBe('polar');
    expect(deleteExternal).toHaveBeenCalledWith({ externalId: 'user_1', anonymize: true });
  });

  it('removes the backups, the Audienceful contact and the PostHog person', async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/persons/?distinct_id=')) {
        return new Response(JSON.stringify({ results: [{ id: 'p1' }] }), { status: 200 });
      }
      return new Response(null, { status: 204 });
    });
    const { failures } = await deleteAccountData('user_1');
    expect(failures).toEqual([]);
    expect(deleteUserExports).toHaveBeenCalledWith(['user_1/2026-10-01.csv']);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toContain('https://api.audienceful.com/v2/people/delete');
    expect(urls.some((u) => u.includes('/persons/p1/?delete_events=true'))).toBe(true);
  });

  it('keeps going after a step fails, and says which', async () => {
    failTable = 'ReadingEvents';
    const { failures } = await deleteAccountData('user_1');
    expect(failures).toEqual(['reading history']);
    expect(deletedTables).toContain('UserMetadata');
  });

  /*
   * Kept on purpose, each with its reason. Anything else with a userId must be deleted.
   */
  const KEPT: Record<string, string> = {
    // Removed through the note cascade (mocked here), keyed by note rather than read by user.
    Notes: 'note cascade',
  };

  it('leaves no per-user table behind', async () => {
    await deleteAccountData('user_1');
    const perUser = Object.values(schema)
      .filter((value): value is Table => is(value, Table))
      .filter((table) => 'userId' in getTableColumns(table))
      .map((table) => getTableName(table));
    // Not vacuous: the schema has dozens of per-user tables.
    expect(perUser.length).toBeGreaterThan(30);
    const missed = perUser.filter((name) => !deletedTables.includes(name) && !(name in KEPT));
    expect(missed).toEqual([]);
  });
});
