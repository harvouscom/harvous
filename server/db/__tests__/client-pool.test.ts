import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Source contract for the connection pool.
 *
 * Asserted against source rather than by opening connections, because the failure this guards
 * only appears when *two* processes are up — a dev server and a test run, or two worktrees —
 * and a test that could reproduce that is a test that would cause it.
 */
const client = readFileSync(join(__dirname, '..', 'client.ts'), 'utf8');

describe('database pool sizing', () => {
  it('asks for one connection in a test worker or a one-shot script, not ten', () => {
    /*
     * Vitest forks a worker per CPU and each one that imports the client builds its own pool.
     * At ten apiece, running the suite while `npm run dev` was up failed three integration
     * tests with EMAXCONNSESSION — in a file unrelated to the change under test, which is the
     * expensive part: the failure lands on whoever lost the race, not on whoever caused it.
     */
    expect(client).toContain('const SINGLE_CONNECTION = 1');
    expect(client).toMatch(/isTestRun\(\)\s*\|\|\s*isOneShotScript\(\)/);
  });

  it('treats server/scripts as one-shot, without each script opting in', () => {
    // A backfill against production held ten clients for minutes while the dev server held ten
    // more. Nine scripts share this singleton; none of them runs two queries at once.
    expect(client).toContain('isOneShotScript');
    expect(client).toContain('process.argv[1]');
    expect(client).toMatch(/server\[\\\\\/\]scripts/);
  });

  it('recognises a test run from vitest or NODE_ENV', () => {
    expect(client).toContain('process.env.VITEST');
    expect(client).toContain("process.env.NODE_ENV === 'test'");
  });

  it('keeps DB_POOL_MAX able to override, including under test', () => {
    // The escape hatch has to win, or a second worktree has no way out of the same squeeze.
    expect(client).toMatch(/Number\(process\.env\.DB_POOL_MAX\)\s*\|\|/);
  });

  it('stops preparing statements on the transaction pooler', () => {
    /*
     * Transaction mode multiplexes one server connection across many clients, so a statement
     * prepared on one is absent on the next. This is what makes moving the runtime URL from
     * port 5432 to 6543 — the actual cure for the 15-client cap — a one-line env change.
     */
    expect(client).toContain('isTransactionPooler');
    expect(client).toContain('prepare: false');
    expect(client).toContain("parsed.port === '6543'");
    expect(client).toContain("parsed.searchParams.get('pgbouncer')");
  });

  it('says which port means what, where the next person will look', () => {
    expect(client).toMatch(/session/i);
    expect(client).toMatch(/15/);
  });
});
