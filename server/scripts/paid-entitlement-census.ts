/**
 * What we have sold, who holds it, and whether the dashboard agrees.
 *
 * A throwaway script rather than an admin surface, following
 * server/scripts/recall-open-rate-by-kind.ts: the question is which of these numbers anyone
 * actually re-reads, and shipping a dashboard to find out would be building something. The
 * ones that earn a second look get promoted; the rest stay here.
 *
 * Block B is the reason this ran first. `UserMetadata.tier` was the admin dashboard's paid
 * split until it moved to `Entitlements`, and the off-diagonal cells are the size of what that
 * column was getting wrong.
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npm run paid:census
 *   npm run paid:census -- --days=90
 */

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { FOUNDING_CAP, isFeatureWithheld, type FeatureKey } from '@/lib/billing-plans';
import { nonWithheldFeatureKeys } from '../utils/admin-paid-stats';
import { isEntitlementsTableMissing } from '../utils/pg-undefined-relation';
import { requireDbTarget } from '../utils/require-db-target';

export function parseArgs(argv: readonly string[] = process.argv) {
  let days = 30;
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

type CensusRow = {
  featureKey: string;
  source: string;
  status: string;
  accounts: number;
  granted_in_window: number;
  changed_in_window: number;
};

type ReconcileRow = { tier: string | null; entitled: number; not_entitled: number };

type ScalarRow = {
  total_accounts: number;
  founding_claims: number;
  polar_customers: number;
  churches_paid: number;
  churches_pilot: number;
  churches_pilot_lapsed: number;
};

async function main() {
  requireDbTarget({ scriptName: 'paid-entitlement-census', writes: false });
  const { days } = parseArgs();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const keys = nonWithheldFeatureKeys();

  let census: CensusRow[];
  try {
    census = (await db.execute<CensusRow>(sql`
      SELECT "featureKey", "source", "status",
             COUNT(DISTINCT "userId")::int AS accounts,
             COUNT(DISTINCT "userId") FILTER (WHERE "grantedAt" >= ${since})::int AS granted_in_window,
             COUNT(DISTINCT "userId") FILTER (WHERE "status" <> 'active' AND "updatedAt" >= ${since})::int AS changed_in_window
      FROM "Entitlements"
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3
    `)) as unknown as CensusRow[];
  } catch (error) {
    if (isEntitlementsTableMissing(error)) {
      console.log('Entitlements table does not exist yet. Run `npm run db:push`.');
      return;
    }
    throw error;
  }

  console.log(`\nPaid entitlement census — window ${days} day(s) since ${since}\n`);
  console.log('A. Every entitlement row, by feature / source / status');
  console.log(
    `${pad('feature', 16)}${pad('source', 14)}${pad('status', 11)}${num('accts', 7)}${num('new', 6)}${num('ended', 7)}  note`,
  );
  if (census.length === 0) {
    console.log('  (no entitlement rows at all)');
  }
  for (const r of census) {
    const withheld = isFeatureWithheld(r.featureKey as FeatureKey);
    const note = withheld ? 'WITHHELD — rows exist, access does not' : '';
    console.log(
      `${pad(r.featureKey, 16)}${pad(r.source, 14)}${pad(r.status, 11)}${num(r.accounts, 7)}${num(r.granted_in_window, 6)}${num(r.changed_in_window, 7)}  ${note}`,
    );
  }

  /*
   * Counted the way the gate counts: active, and not a withheld feature. `hasEntitlementForUserId`
   * short-circuits on `isFeatureWithheld` before it queries, so a row for a withheld feature
   * grants nothing and must not appear on the entitled side of this table.
   */
  const reconcile = (await db.execute<ReconcileRow>(sql`
    SELECT um."tier",
           COUNT(*) FILTER (WHERE e.hit IS NOT NULL)::int AS entitled,
           COUNT(*) FILTER (WHERE e.hit IS NULL)::int     AS not_entitled
    FROM "UserMetadata" um
    LEFT JOIN LATERAL (
      SELECT 1 AS hit FROM "Entitlements" x
      WHERE x."userId" = um."userId"
        AND x."status" = 'active'
        AND x."featureKey" IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})
      LIMIT 1
    ) e ON true
    GROUP BY 1
    ORDER BY 1
  `)) as unknown as ReconcileRow[];

  console.log('\nB. The legacy `tier` column against actual entitlements');
  console.log(`${pad('tier', 16)}${num('entitled', 10)}${num('not', 8)}`);
  let disagreements = 0;
  for (const r of reconcile) {
    const tier = r.tier ?? '(null)';
    console.log(`${pad(tier, 16)}${num(r.entitled, 10)}${num(r.not_entitled, 8)}`);
    disagreements += tier === 'unlimited' ? r.not_entitled : r.entitled;
  }
  console.log(
    disagreements > 0
      ? `  → ${disagreements} account(s) where the two disagree. That is what the old dashboard split got wrong.`
      : '  → the two agree everywhere.',
  );

  const scalars = (await db.execute<ScalarRow>(sql`
    SELECT
      (SELECT COUNT(*) FROM "UserMetadata")::int AS total_accounts,
      (SELECT COUNT(*) FROM "UserMetadata" WHERE "foundingClaimedAt" IS NOT NULL)::int AS founding_claims,
      (SELECT COUNT(*) FROM "UserMetadata" WHERE "polarCustomerId" IS NOT NULL)::int AS polar_customers,
      (SELECT COUNT(*) FROM "Churches" WHERE "deletedAt" IS NULL AND "billingPlan" IS NOT NULL)::int AS churches_paid,
      (SELECT COUNT(*) FROM "Churches" WHERE "deletedAt" IS NULL AND "pilotUntil" > NOW())::int AS churches_pilot,
      (SELECT COUNT(*) FROM "Churches" WHERE "deletedAt" IS NULL AND "pilotUntil" <= NOW() AND "billingPlan" IS NULL)::int AS churches_pilot_lapsed
  `)) as unknown as ScalarRow[];
  const s = scalars[0];

  console.log('\nC. The scalars no admin surface shows');
  console.log(`  accounts              ${s?.total_accounts ?? 0}`);
  console.log(`  founding claims       ${s?.founding_claims ?? 0} / ${FOUNDING_CAP} cap`);
  console.log(`  polar customer ids    ${s?.polar_customers ?? 0}`);
  console.log(
    `  churches              paid ${s?.churches_paid ?? 0} · in pilot ${s?.churches_pilot ?? 0} · pilot lapsed unpaid ${s?.churches_pilot_lapsed ?? 0}`,
  );

  console.log(`
─────────────────────────────────────────────────────────────────────────────
Read this before acting on it.

Entitlements is mutable state, not a log. There is no status-change history:
setEntitlementsForProduct and cancelBillingEntitlements overwrite "status" and
"updatedAt" in place. So the "ended" column sees only the most recent transition
per row, and someone who cancelled and resubscribed inside the window reads as
plainly active, with nothing recording the round trip.

That makes every number here a snapshot. "How many are paid right now" is
honest. "How many churned last month" is not answerable from this table, and a
churn chart built on "ended" would quietly undercount exactly the people whose
behaviour you most want to see. Measuring that needs an entitlement event log,
which does not exist yet.

Founding claims are the one number with a deadline attached, since the offer is
a promise about the first ${FOUNDING_CAP} people. Note that countFoundingClaims()
in server/utils/entitlements.ts returns the cap on error so the offer fails
closed — this script queries the column directly for that reason, and a number
here that suddenly equals the cap is worth confirming rather than believing.
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
