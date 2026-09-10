/**
 * Supabase Postgres database client via postgres.js + Drizzle ORM.
 *
 * `SUPABASE_DATABASE_URL` is the runtime connection and `SUPABASE_DIRECT_URL` is for
 * migrations and drizzle-kit.
 *
 * **Which port matters more than it looks.** Supabase's pooler answers on two:
 *
 * | Port | Mode        | Client cap        | Prepared statements |
 * |------|-------------|-------------------|---------------------|
 * | 6543 | transaction | high              | no — see `prepare`  |
 * | 5432 | session     | 15 per project    | yes                 |
 *
 * On 5432 the whole project shares fifteen clients, and this file's default pool of ten means
 * two of anything — a dev server and a test run, two worktrees, a server and a script — can
 * exhaust it between them. The symptom is EMAXCONNSESSION on whatever query lost the race,
 * which reads as a bug in unrelated code.
 *
 * If `SUPABASE_DATABASE_URL` is on 5432 today, moving it to 6543 is the fix, and the
 * `prepare: false` below already handles the difference. Keep `SUPABASE_DIRECT_URL` where it
 * is: migrations want a real session.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

/**
 * One connection for a test worker or a one-shot script.
 *
 * Vitest forks a worker per CPU, and any worker that imports this module builds its own pool.
 * At the default of 10 that is 10 more clients on top of whatever the dev server already
 * holds, and Supabase's *session* pooler caps the project at 15 — so running the suite with
 * `npm run dev` up failed three integration tests with EMAXCONNSESSION, in a file that had
 * nothing to do with the change under test. A test doing a handful of queries in sequence has
 * no use for a pool at all.
 */
const SINGLE_CONNECTION = 1;

function isTestRun(): boolean {
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
}

/**
 * A one-shot script in `server/scripts/`, which wants one connection for the same reason.
 *
 * Nine of them share this singleton, and each was taking ten clients for the length of its run
 * — a backfill against production held ten for minutes while the dev server held ten more.
 * They all work through a list in sequence and never issue two queries at once, so the pool
 * bought nothing and cost most of the project's budget.
 *
 * Detected from argv rather than a flag each script has to remember to set: nothing under
 * `server/scripts/` is a server, and a rule nobody has to opt into is one nobody can forget.
 */
function isOneShotScript(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && /[\\/]server[\\/]scripts[\\/]/.test(entry);
}

/**
 * Supabase's transaction pooler, which is port 6543 (session mode is 5432).
 *
 * Worth knowing which you are on: session mode caps the whole project at 15 clients, while
 * transaction mode carries far more, and the two differ on prepared statements. See the
 * `prepare` option below.
 */
function isTransactionPooler(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.port === '6543' || parsed.searchParams.get('pgbouncer') === 'true';
  } catch {
    return false;
  }
}

function createDb() {
  // Prefer the pooler URL (port 6543) for runtime queries.
  // SUPABASE_DIRECT_URL (port 5432) is for drizzle-kit migrations only.
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.SUPABASE_DIRECT_URL;
  if (!url) throw new Error('Missing SUPABASE_DIRECT_URL or SUPABASE_DATABASE_URL environment variable');

  /*
   * `DB_POOL_MAX` exists for the case where more than one API is pointed at the same
   * database — two worktrees running `dev:all` side by side, most often. Supabase's session
   * pooler caps the *project* at 15 clients, so two servers each asking for 10 exhaust it
   * between them and every query starts failing with EMAXCONNSESSION.
   *
   * The failure does not look like a connection problem from the browser. The app renders
   * signed in and completely empty: `/api/navigation/data` is among the first requests to
   * lose its turn, and a browser with no cached space id has nothing to fall back on — so
   * the space tile drops to its layers fallback, the greeting has no counts, and Activity
   * says "nothing recorded on this day" while the network tab shows a 500 that a retry
   * quietly turns into a 200. Two people on the same localhost can disagree about whether
   * it works, depending on which of them has a warm cache.
   *
   * Default unchanged at 10, so a single server behaves exactly as before.
   */
  const poolMax =
    Number(process.env.DB_POOL_MAX) ||
    (isTestRun() || isOneShotScript() ? SINGLE_CONNECTION : 10);

  const client = postgres(url, {
    max: poolMax,
    idle_timeout: 300,
    connect_timeout: 30,
    /*
     * Transaction-mode pooling multiplexes one server connection across many clients, so a
     * prepared statement made on one is not there on the next. postgres.js prepares by
     * default, which fails against it — hence this, keyed off the URL rather than a flag, so
     * moving SUPABASE_DATABASE_URL to port 6543 is a one-line env change and not a debugging
     * session. A no-op on session mode, where prepared statements are fine.
     */
    ...(isTransactionPooler(url) ? { prepare: false } : {}),
  });
  return drizzle(client, { schema });
}

// Lazy singleton — created on first access so env vars can be loaded first
let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// Convenience export for direct usage: `import { db } from './client'`
// Uses a proxy to defer creation until first property access
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});

/** First real query pays TCP+TLS to Supabase; dedupe parallel warmups within one invocation. */
let warmPostgresPromise: Promise<void> | null = null;

/**
 * Establishes the postgres.js pool connection (SELECT 1). Safe to call multiple times;
 * concurrent callers share one attempt. Failures are logged; callers may still retry via normal queries.
 */
export function warmPostgresConnection(): Promise<void> {
  if (!warmPostgresPromise) {
    warmPostgresPromise = (async () => {
      try {
        await getDb().execute(sql`select 1`);
      } catch (e) {
        console.warn('[db] warmPostgresConnection:', e instanceof Error ? e.message : e);
      }
    })();
  }
  return warmPostgresPromise;
}
