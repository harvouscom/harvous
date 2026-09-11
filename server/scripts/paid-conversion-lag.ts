/**
 * Signup cohort to first purchase: the only honest conversion number available today.
 *
 * "Honest" is doing work in that sentence. The funnel a paywall actually has is
 * try -> subscribe, and the trying is invisible: /api/review/sample and
 * /api/review/sample/answer grade server-side and write nothing at all, so no row anywhere
 * records that somebody was shown the demo. What is recordable is the coarser
 * signed-up -> paid, which is what this prints.
 *
 * A throwaway script rather than an admin surface, per
 * server/scripts/recall-open-rate-by-kind.ts — and this one is cohort-shaped, which belongs in
 * a monthly report rather than a live board even if it does earn promotion.
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npm run paid:conversion
 *   npm run paid:conversion -- --days=2000
 */

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { isEntitlementsTableMissing } from '../utils/pg-undefined-relation';
import { requireDbTarget } from '../utils/require-db-target';

export function parseArgs(argv: readonly string[] = process.argv) {
  // 365 rather than a tidier 180 because the observed median lag is ~148 days: a window
  // shorter than the thing being measured reports zero and looks like a finding.
  let days = 365;
  for (const a of argv) {
    if (a.startsWith('--days=')) {
      // `|| default` would fold --days=0 back to the default, because 0 is falsy — so an
      // explicit zero has to be told apart from an unparseable flag before clamping.
      const parsed = parseInt(a.slice('--days='.length), 10);
      days = Number.isNaN(parsed) ? days : Math.max(1, parsed);
    }
  }
  return { days };
}

const pad = (s: string, n: number) => String(s).padEnd(n);
const num = (v: unknown, n: number) => String(v ?? 0).padStart(n);

type Row = {
  cohort: string;
  signups: number;
  converted: number;
  rate_pct: string | null;
  median_days: string | null;
};

async function main() {
  requireDbTarget({ scriptName: 'paid-conversion-lag', writes: false });
  const { days } = parseArgs();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let rows: Row[];
  try {
    /*
     * source='billing' only. An admin grant is not a conversion, and with almost every
     * entitlement in this database being a grant, counting them would report a conversion
     * rate of roughly "everyone we comped".
     */
    rows = (await db.execute<Row>(sql`
      WITH first_paid AS (
        SELECT "userId", MIN("grantedAt") AS paid_at
        FROM "Entitlements"
        WHERE "source" = 'billing'
        GROUP BY 1
      )
      SELECT
        TO_CHAR(um."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM')        AS cohort,
        COUNT(*)::int                                                AS signups,
        COUNT(fp."userId")::int                                      AS converted,
        ROUND(100.0 * COUNT(fp."userId") / NULLIF(COUNT(*), 0), 1)   AS rate_pct,
        ROUND(percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(epoch FROM (fp.paid_at - um."createdAt")) / 86400
        )::numeric, 1)                                               AS median_days
      FROM "UserMetadata" um
      LEFT JOIN first_paid fp ON fp."userId" = um."userId"
      WHERE um."createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1
    `)) as unknown as Row[];
  } catch (error) {
    if (isEntitlementsTableMissing(error)) {
      console.log('Entitlements table does not exist yet. Run `npm run db:push`.');
      return;
    }
    throw error;
  }

  console.log(`\nSignup cohort to first purchase — signups since ${since}\n`);
  console.log(`${pad('cohort', 12)}${num('signups', 9)}${num('paid', 7)}${num('rate%', 8)}${num('med days', 10)}`);
  if (rows.length === 0) {
    console.log('  (no signups in the window)');
  }
  let totalSignups = 0;
  let totalConverted = 0;
  for (const r of rows) {
    totalSignups += r.signups;
    totalConverted += r.converted;
    console.log(
      `${pad(r.cohort, 12)}${num(r.signups, 9)}${num(r.converted, 7)}${num(r.rate_pct ?? '0.0', 8)}${num(r.median_days ?? '—', 10)}`,
    );
  }
  if (rows.length > 0) {
    const overall = totalSignups > 0 ? ((100 * totalConverted) / totalSignups).toFixed(1) : '0.0';
    console.log(`${pad('all', 12)}${num(totalSignups, 9)}${num(totalConverted, 7)}${num(overall, 8)}`);
  }

  console.log(`
─────────────────────────────────────────────────────────────────────────────
Read this before acting on it.

This is signup -> paid, not try -> paid, and the difference is the whole funnel.
The paywall's own demo (GET /api/review/sample, POST /api/review/sample/answer)
grades the answer server-side and persists nothing, so there is no denominator
for "was offered the sample" and no way to tell a cohort that never saw the
paywall from one that saw it and declined. Closing that needs capture that does
not exist yet, not a smarter query.

The window cuts on signup date, so it hides conversions whose cohort falls
outside it — with a median lag near 150 days, a 180-day window reported 0% while
the full history showed two. Widen before concluding anything from a zero.

Recent cohorts are also censored, not merely small: somebody who signed up last
week has had a week to convert, while the oldest cohort has had months. The rate
for the newest months will keep rising after this is printed, so do not read the
trailing edge as a decline.

Finally, grantedAt is when the entitlement row was written, which is the Polar
webhook's clock rather than the checkout's. Close enough for "days to convert",
wrong for anything finer.
─────────────────────────────────────────────────────────────────────────────`);
}

// Guards against running as a side effect of import. paid-scripts.test.ts imports this file
// for `parseArgs`, and every test file in this repo runs as a real import under vitest — so an
// unconditional `main()` call here executed the whole script during collection, including in CI
// where there is no database connection, and crashed the run outside any `it()` block.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
