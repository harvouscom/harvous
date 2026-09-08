/**
 * `drizzle-kit push`, with the same target check every other database script now has.
 *
 * This one matters most and was the last one uncovered. Unlike the additive DDL scripts, push
 * diffs the *whole* schema against the target and offers to drop whatever it does not find in
 * `server/db/schema.ts` — so run from a branch that is missing another branch's tables, it
 * proposes deleting them. That is the single most destructive command in the repo, it sits in
 * `predeploy`, and it reached the database through `node -r dotenv/config node_modules/.bin/
 * drizzle-kit` without passing through anything that could say which database it was.
 *
 * A wrapper rather than a flag on the guard, because drizzle-kit is a binary: there is no
 * module boundary to hook. It checks, then hands over.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireDbTarget, PRODUCTION_ACK_FLAG } from '../utils/require-db-target';

/**
 * Find drizzle-kit wherever the install actually put it.
 *
 * The npm script hardcoded `node_modules/.bin/drizzle-kit`, relative to the working directory.
 * That misses in a git worktree, which has no `node_modules` of its own and resolves packages
 * up at the repository root — so the command failed there before this wrapper existed too.
 * Resolving through Node's own algorithm finds it either way.
 */
function drizzleKitBin(): string {
  const local = 'node_modules/.bin/drizzle-kit';
  if (existsSync(local)) return local;
  try {
    /*
     * Resolved through the package's main entry, then sideways to the binary.
     *
     * Neither `drizzle-kit/bin.cjs` nor `drizzle-kit/package.json` can be asked for directly:
     * the package declares an `exports` map listing neither, so both throw
     * ERR_PACKAGE_PATH_NOT_EXPORTED even though the files are sitting there. The bare
     * specifier is exported, and `bin.cjs` is its neighbour.
     */
    const require = createRequire(import.meta.url);
    const bin = join(dirname(require.resolve('drizzle-kit')), 'bin.cjs');
    if (existsSync(bin)) return bin;
  } catch {
    // Fall through to the original path, so the error names what the script always named.
  }
  return local;
}

export function runGuardedDbPush(argv: readonly string[] = process.argv.slice(2)): number {
  requireDbTarget({ scriptName: 'db:push', writes: true, argv });

  // Everything except our own acknowledgement flag, which drizzle-kit would reject.
  const forwarded = argv.filter((a) => a !== PRODUCTION_ACK_FLAG);

  const result = spawnSync(
    'node',
    ['-r', 'dotenv/config', drizzleKitBin(), 'push', '--config', 'drizzle.config.ts', ...forwarded],
    { stdio: 'inherit' },
  );
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runGuardedDbPush());
}
