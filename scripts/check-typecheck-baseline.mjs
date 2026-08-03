#!/usr/bin/env node
/**
 * Typecheck ratchet.
 *
 * The repo has a large stock of pre-existing type errors, so `tsc --noEmit` can't be a
 * pass/fail gate without a long cleanup first. But "nothing runs tsc" is not free: it let
 * two real bugs ship that the compiler had already caught —
 *
 *   - PrototypeSidebar read `p.items` from a page whose field is `notes`, making the list
 *     `[undefined]` and throwing downstream;
 *   - Home's readiness call passed five settled-flags that its parameter type didn't
 *     declare, so all five were silently discarded and Home painted too early.
 *
 * So instead of a clean-tree gate, this fails when the error count for any file goes *up*,
 * or when a file gains its first error. Fixing errors is always allowed and lowers the
 * baseline. Run with --update after a genuine improvement.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(here, 'typecheck-baseline.json');
const shouldUpdate = process.argv.includes('--update');

function runTsc() {
  try {
    execFileSync('npx', ['tsc', '--noEmit'], { cwd: join(here, '..'), encoding: 'utf8' });
    return '';
  } catch (err) {
    // tsc exits non-zero when there are errors; the diagnostics are on stdout.
    return `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
}

/** file path -> number of `error TS…` diagnostics reported against it. */
function countErrorsByFile(output) {
  const counts = {};
  for (const line of output.split('\n')) {
    const match = line.match(/^(\S+?)\(\d+,\d+\): error TS\d+/);
    if (!match) continue;
    counts[match[1]] = (counts[match[1]] ?? 0) + 1;
  }
  return counts;
}

const counts = countErrorsByFile(runTsc());
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (shouldUpdate || !existsSync(BASELINE_PATH)) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`Typecheck baseline written: ${total} error(s) across ${Object.keys(counts).length} file(s).`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0);

const regressions = [];
for (const [file, count] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (count > allowed) regressions.push({ file, count, allowed });
}

if (regressions.length > 0) {
  console.error('Typecheck ratchet failed — new type errors:\n');
  for (const { file, count, allowed } of regressions) {
    console.error(`  ${file}: ${count} error(s), baseline allows ${allowed}`);
  }
  console.error('\nRun `npx tsc --noEmit` to see them. Fix the new errors, or if you have');
  console.error('deliberately traded one error for another, run `npm run typecheck:baseline`.');
  process.exit(1);
}

const improved = baselineTotal - total;
console.log(
  improved > 0
    ? `Typecheck ratchet passed (${total} error(s); ${improved} fewer than baseline — run \`npm run typecheck:baseline\` to lock it in).`
    : `Typecheck ratchet passed (${total} error(s), no regressions).`,
);
