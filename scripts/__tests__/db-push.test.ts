/**
 * `npm run db:push` used to report success over a half-applied schema:
 * drizzle-kit's Postgres path catches statement-execution errors, prints them
 * to stderr, and exits 0 anyway, so the `&& npm run db:rls` in the npm script
 * ran and the whole chain looked green.
 *
 * These cover the wrapper that closes that hole. The integration cases stand a
 * stub in for drizzle-kit so the real failure shape — error on stderr, exit 0 —
 * can be reproduced without a database.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { looksLikeSwallowedError } from '../db-push.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbPushScript = join(repoRoot, 'scripts', 'db-push.js');

/** The exact error drizzle-kit swallowed on the StudyThreadEntries push. */
const REAL_POSTGRES_ERROR = `PostgresError: column "parentNoteId" of relation "StudyThreadEntries" contains null values
    at ErrorResponse (/repo/node_modules/postgres/cjs/src/connection.js:788:26) {
  severity_local: 'ERROR',
  code: '23502',
  routine: 'ATRewriteTable'
}`;

describe('looksLikeSwallowedError', () => {
  it('catches the PostgresError drizzle-kit swallows', () => {
    expect(looksLikeSwallowedError(REAL_POSTGRES_ERROR)).toBe(true);
  });

  it('catches other thrown errors by their constructor name', () => {
    expect(looksLikeSwallowedError('TypeError: cannot read x of undefined')).toBe(true);
    expect(looksLikeSwallowedError('Error: connection terminated')).toBe(true);
  });

  it('ignores an empty stderr', () => {
    expect(looksLikeSwallowedError('')).toBe(false);
  });

  it("ignores Node's own stderr warnings, which are Warning- not Error-shaped", () => {
    expect(
      looksLikeSwallowedError('(node:123) [DEP0040] DeprecationWarning: punycode is deprecated'),
    ).toBe(false);
    expect(looksLikeSwallowedError('(node:123) ExperimentalWarning: VM Modules')).toBe(false);
  });
});

describe('db-push.js exit codes', () => {
  let stubDir: string;

  /** A stand-in for `node_modules/.bin/drizzle-kit`. */
  function writeStub(name: string, body: string): string {
    const path = join(stubDir, name);
    writeFileSync(path, `#!/usr/bin/env node\n${body}\n`, 'utf8');
    chmodSync(path, 0o755);
    return path;
  }

  function runDbPush(stubPath: string): Promise<{ code: number | null; stderr: string }> {
    return new Promise((resolvePromise) => {
      const child = spawn(process.execPath, [dbPushScript], {
        cwd: repoRoot,
        env: { ...process.env, DB_PUSH_DRIZZLE_KIT_BIN: stubPath },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('close', (code) => resolvePromise({ code, stderr }));
    });
  }

  beforeAll(() => {
    stubDir = mkdtempSync(join(tmpdir(), 'db-push-test-'));
  });

  afterAll(() => {
    rmSync(stubDir, { recursive: true, force: true });
  });

  it('fails the shell when drizzle-kit prints an error but exits 0', async () => {
    const stub = writeStub(
      'drizzle-kit-swallows.js',
      `console.error(${JSON.stringify(REAL_POSTGRES_ERROR)});\nprocess.exit(0);`,
    );

    const { code, stderr } = await runDbPush(stub);

    expect(code).toBe(1);
    // The original error still reaches the user, and is named as a partial apply.
    expect(stderr).toContain('contains null values');
    expect(stderr).toContain('PARTIALLY');
  });

  it('succeeds when the push is clean, so `&& npm run db:rls` still runs', async () => {
    const stub = writeStub('drizzle-kit-clean.js', `console.log('[i] No changes detected');`);

    const { code } = await runDbPush(stub);

    expect(code).toBe(0);
  });

  it("propagates drizzle-kit's own non-zero exit", async () => {
    const stub = writeStub('drizzle-kit-exits-3.js', `process.exit(3);`);

    const { code } = await runDbPush(stub);

    expect(code).toBe(3);
  });
});
