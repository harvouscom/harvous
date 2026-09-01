/**
 * Name the database a script is about to touch, and refuse to write to the live one by
 * accident.
 *
 * Call this before opening a connection. It prints the target either way — legibility is half
 * the value, and a script that says "PRODUCTION" on screen is one a person can stop — and for
 * writes it requires `--production` when the target is the live project or cannot be
 * identified.
 *
 * Deliberately not inside `server/db/client.ts`. That module is what the running API uses, and
 * a guard there would either fire on every production boot or have to be disabled in
 * production, which is the wrong way round. The hazard is one-off scripts run by hand from a
 * checkout whose `.env` may not be the one the operator assumes.
 */

import {
  classifyDbTarget,
  describeDbTarget,
  writeNeedsConfirmation,
  type DbTargetVerdict,
} from '@/utils/supabase-project-ref';

/** The flag that says "yes, I mean the live database". */
export const PRODUCTION_ACK_FLAG = '--production';

/**
 * Resolved the same way `server/db/client.ts` does, so the guard reports the connection the
 * script will actually open rather than one it might have opened.
 */
export function effectiveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.SUPABASE_DATABASE_URL ?? env.SUPABASE_DIRECT_URL;
}

export interface DbTargetDecision {
  verdict: DbTargetVerdict;
  allowed: boolean;
  /** What to print. Multi-line when refusing, so the reason is on screen. */
  message: string;
}

/**
 * Decide whether this run may proceed. Pure, so it can be tested without an environment.
 *
 * `writes: false` never refuses. A read cannot damage anything, and making `list-recent-
 * deleted-notes` demand a flag is how a guard earns a reputation for being in the way and
 * gets deleted.
 */
export function decideDbTarget(options: {
  url: string | undefined;
  writes: boolean;
  argv: readonly string[];
  scriptName: string;
}): DbTargetDecision {
  const verdict = classifyDbTarget(options.url);
  const target = describeDbTarget(verdict);
  const acknowledged = options.argv.includes(PRODUCTION_ACK_FLAG);

  /*
   * No connection string at all is a configuration problem, not a targeting one.
   *
   * There is nothing to be pointed at and nothing to protect — the connection will fail a
   * moment later whatever this returns. Staying quiet lets each script raise its own error,
   * which names the variable that is missing; the guard's "project ref could not be read"
   * would be true, unhelpful, and would hide the real cause. Found by an existing test that
   * asserts exactly that error, which is the test doing its job.
   */
  if (!options.url?.trim()) {
    return { verdict, allowed: true, message: `[${options.scriptName}] no database configured` };
  }

  if (!options.writes || !writeNeedsConfirmation(verdict) || acknowledged) {
    const note = acknowledged && verdict.kind === 'production' ? ' — acknowledged' : '';
    return { verdict, allowed: true, message: `[${options.scriptName}] target: ${target}${note}` };
  }

  const why =
    verdict.kind === 'production'
      ? 'This is the live database. Real people\'s study is in it.'
      : 'The project ref could not be read from the connection string, so production cannot be ruled out.';

  return {
    verdict,
    allowed: false,
    message: [
      `[${options.scriptName}] refusing to write.`,
      '',
      `  target: ${target}`,
      `  ${why}`,
      '',
      `  Re-run with ${PRODUCTION_ACK_FLAG} if that is what you intend.`,
      '',
    ].join('\n'),
  };
}

/**
 * The one line a script calls. Prints, and exits non-zero rather than returning when refusing,
 * so a caller that forgets to check the result still cannot proceed.
 */
export function requireDbTarget(options: {
  scriptName: string;
  writes: boolean;
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
}): DbTargetDecision {
  const decision = decideDbTarget({
    url: effectiveDatabaseUrl(options.env ?? process.env),
    writes: options.writes,
    argv: options.argv ?? process.argv.slice(2),
    scriptName: options.scriptName,
  });

  if (!decision.allowed) {
    console.error(decision.message);
    process.exit(1);
  }
  console.log(decision.message);
  return decision;
}
