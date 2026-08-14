#!/usr/bin/env node

/**
 * `drizzle-kit push`, but it fails the shell when the push fails.
 *
 * drizzle-kit swallows statement-execution errors on the Postgres path. In
 * drizzle-kit 0.31 the apply loop inside `pgPush` reads:
 *
 *     for (const dStmnt of statementsToExecute) { await db.query(dStmnt); }
 *     render('[✓] Changes applied');
 *   } catch (e4) {
 *     console.error(e4);            // <- no process.exit(1)
 *   }
 *
 * (The sqlite path immediately below it does `console.error(e); process.exit(1)`.
 * The Postgres path just forgets the exit.)
 *
 * So one failing statement — an ALTER that Postgres rejects, say — skips every
 * remaining statement in the run and still exits 0. `db:push && db:rls` then
 * reports success over a half-applied schema, and the next person to add a
 * column silently loses it too.
 *
 * This wrapper watches stderr, which is where that swallowed error lands, and
 * exits non-zero if anything error-shaped shows up. stdin and stdout stay
 * inherited: drizzle-kit's data-loss approval prompt refuses to render unless
 * both are a TTY (`bin.cjs`: "Interactive prompts require a TTY terminal"), so
 * piping either one would turn every prompting push into a silent no-op.
 *
 * Usage: npm run db:push [-- <extra drizzle-kit args>]
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Node's inspect output for a thrown error always leads with the constructor
 * name — `PostgresError: column "x" ... contains null values`, `TypeError: ...`.
 * Node's own stderr chatter is *Warning* shaped (DeprecationWarning,
 * ExperimentalWarning), so it does not collide with this.
 */
const ERROR_SHAPED = /\b[A-Za-z]*Error\b/;

/** Exported for tests: did drizzle-kit print a swallowed error to stderr? */
export function looksLikeSwallowedError(stderrText) {
  return ERROR_SHAPED.test(stderrText);
}

export const PARTIAL_APPLY_MESSAGE = [
  '',
  '❌ drizzle-kit push reported an error and stopped partway through.',
  '',
  '   It exits 0 even when this happens, so treat the schema as PARTIALLY',
  '   APPLIED: statements before the failure landed, the failing one and',
  '   everything after it did not.',
  '',
  '   Fix the cause above (a constraint the existing rows violate is the',
  '   usual one — reconcile the data first), then run `npm run db:push`',
  '   again. It is safe to re-run; it re-applies whatever is still pending.',
  '',
].join('\n');

function main() {
  // Overridable so the tests can stand in a stub for drizzle-kit. Nothing else
  // should set this.
  const drizzleKit =
    process.env.DB_PUSH_DRIZZLE_KIT_BIN ?? resolve(repoRoot, 'node_modules', '.bin', 'drizzle-kit');

  const child = spawn(
    process.execPath,
    [
      '-r',
      'dotenv/config',
      drizzleKit,
      'push',
      '--config',
      'drizzle.config.ts',
      ...process.argv.slice(2),
    ],
    { cwd: repoRoot, stdio: ['inherit', 'inherit', 'pipe'] },
  );

  let stderrText = '';

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrText += chunk;
    // Still the user's output — pass it straight through, unbuffered.
    process.stderr.write(chunk);
  });

  // Ctrl-C should stop the push, not just this wrapper.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('error', (error) => {
    console.error(`\n❌ Could not run drizzle-kit: ${error.message}`);
    process.exit(1);
  });

  child.on('close', (code, signal) => {
    if (signal) {
      console.error(`\n❌ drizzle-kit push was terminated by ${signal}. Schema may be partially applied.`);
      process.exit(1);
    }

    if (code !== 0) {
      process.exit(code ?? 1);
    }

    if (looksLikeSwallowedError(stderrText)) {
      console.error(PARTIAL_APPLY_MESSAGE);
      process.exit(1);
    }

    process.exit(0);
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main();
}
