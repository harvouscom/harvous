/**
 * Preloaded into drizzle-kit by `db-push-guarded.ts`, so a failed push exits non-zero.
 *
 * drizzle-kit 0.31's Postgres push swallows a rejected statement twice over. `pgPush` wraps its
 * apply loop in a catch that prints the error and returns, and the `push` command's own handler
 * catches whatever else escapes and then calls `process.exit(0)` explicitly:
 *
 *     } catch (e4) { console.error(e4); }
 *     process.exit(0);
 *
 * So one bad statement skips every statement after it, the run reports success, and the
 * `&& npm run db:rls` behind it carries on over a half-applied schema. That is how
 * ReadingEvents once landed without its two indexes and nothing said so.
 *
 * A preload rather than reading the output, because stdin and stdout have to stay attached to
 * the terminal: drizzle-kit's data-loss prompt refuses to render unless both are a TTY, and
 * piping either would turn every prompting push into a silent no-op.
 *
 * Only an error *object* reaching the console counts. drizzle-kit's own messages are strings and
 * it already exits 1 on the failures it means to report; an aborted prompt exits 0 with no error
 * logged and stays 0.
 */
'use strict';

let failed = false;

function isErrorLike(value) {
  if (value instanceof Error) return true;
  // A driver's error can come from another realm or a plain object shaped like one.
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.message === 'string' &&
    (typeof value.stack === 'string' || typeof value.code === 'string')
  );
}

for (const method of ['error', 'log', 'warn']) {
  const original = console[method].bind(console);
  console[method] = (...args) => {
    if (args.some(isErrorLike)) failed = true;
    original(...args);
  };
}

const exit = process.exit.bind(process);
process.exit = (code) => {
  const requested = code ?? process.exitCode ?? 0;
  if (failed && Number(requested) === 0) {
    console.error('\n[db:push] drizzle-kit reported an error above but exited 0 — failing the run.');
    console.error('[db:push] Statements after the failed one were not applied.');
    return exit(1);
  }
  return exit(code);
};

// An error logged on a path that never calls process.exit still fails the run.
process.on('beforeExit', () => {
  if (failed && !process.exitCode) process.exitCode = 1;
});
