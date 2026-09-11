/**
 * Do the people who hold a feature actually use it?
 *
 * The question the admin dashboard could not answer at all: Review and Challenges sit behind
 * `requireFeature`, so they are the surfaces people pay for, and nothing on any admin surface
 * read `ReviewItems`, `ReviewEvents` or `Challenges`. A throwaway script first, per
 * server/scripts/recall-open-rate-by-kind.ts — a rate nobody re-reads does not deserve a panel.
 *
 * "Used" is deliberately different per feature, because the features are different shapes:
 *   review         answered a review (an outcome row, not merely a card being shown)
 *   shared_spaces  owns a space somebody else is actually in
 *   challenges     has a Challenges row
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npm run paid:activation
 *   npm run paid:activation -- --days=90
 */

import 'dotenv/config';
import { db } from '../db/client';
import { sql, type SQL } from 'drizzle-orm';
import { FEATURE_KEYS, isFeatureWithheld, type FeatureKey } from '@/lib/billing-plans';
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

/**
 * Per feature: has this user ever used it, and did they use it inside the window.
 *
 * `null` means the feature has no usage signal worth measuring — `connector` ships no rows of
 * its own, so a 0% activation for it would read as a finding rather than as an absence.
 */
function usagePredicates(
  key: FeatureKey,
  since: string,
): { ever: SQL; recent: SQL } | null {
  switch (key) {
    case 'review':
      return {
        ever: sql`EXISTS (SELECT 1 FROM "ReviewItems" ri WHERE ri."userId" = u."userId")`,
        // An outcome, not a `shown`: the inbox writes `shown` rows when it is fetched, so
        // counting those would score "loaded Home" as "reviewed".
        recent: sql`EXISTS (
          SELECT 1 FROM "ReviewEvents" re
          WHERE re."userId" = u."userId"
            AND re."action" IN ('recalled', 'almost', 'revealed')
            AND re."createdAt" >= ${since}
        )`,
      };
    case 'shared_spaces':
      /*
       * Owning a space is not using the feature; someone else being in it is. Keyed on a
       * membership row rather than `Spaces.type` on purpose — a space with nobody else in it
       * is not being shared, whatever it is typed as.
       */
      return {
        ever: sql`EXISTS (
          SELECT 1 FROM "Spaces" s
          JOIN "SpaceMemberships" m ON m."spaceId" = s."id" AND m."userId" <> s."userId"
          WHERE s."userId" = u."userId" AND s."deletedAt" IS NULL
        )`,
        recent: sql`EXISTS (
          SELECT 1 FROM "Spaces" s
          JOIN "SpaceMemberships" m ON m."spaceId" = s."id" AND m."userId" <> s."userId"
          WHERE s."userId" = u."userId" AND s."deletedAt" IS NULL AND m."joinedAt" >= ${since}
        )`,
      };
    case 'challenges':
      return {
        ever: sql`EXISTS (SELECT 1 FROM "Challenges" c WHERE c."userId" = u."userId")`,
        recent: sql`EXISTS (
          SELECT 1 FROM "Challenges" c
          WHERE c."userId" = u."userId" AND c."startedAt" >= ${since}
        )`,
      };
    default:
      return null;
  }
}

type Row = { entitled: number; ever_used: number; used_recent: number };

async function main() {
  requireDbTarget({ scriptName: 'paid-feature-activation', writes: false });
  const { days } = parseArgs();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  console.log(`\nPaid feature activation — window ${days} day(s) since ${since}\n`);
  console.log(
    `${pad('feature', 16)}${num('entitled', 10)}${num('ever', 7)}${num('window', 8)}${num('rate%', 8)}${num('never', 7)}  note`,
  );

  for (const key of FEATURE_KEYS) {
    const predicates = usagePredicates(key, since);
    const withheld = isFeatureWithheld(key);

    if (!predicates) {
      console.log(`${pad(key, 16)}${num('—', 10)}${num('—', 7)}${num('—', 8)}${num('—', 8)}${num('—', 7)}  no usage signal recorded`);
      continue;
    }

    let row: Row | undefined;
    try {
      const rows = (await db.execute<Row>(sql`
        WITH u AS (
          SELECT DISTINCT "userId" FROM "Entitlements"
          WHERE "featureKey" = ${key} AND "status" = 'active'
        )
        SELECT
          COUNT(*)::int AS entitled,
          COUNT(*) FILTER (WHERE ${predicates.ever})::int  AS ever_used,
          COUNT(*) FILTER (WHERE ${predicates.recent})::int AS used_recent
        FROM u
      `)) as unknown as Row[];
      row = rows[0];
    } catch (error) {
      if (isEntitlementsTableMissing(error)) {
        console.log('Entitlements table does not exist yet. Run `npm run db:push`.');
        return;
      }
      throw error;
    }

    const entitled = row?.entitled ?? 0;
    const ever = row?.ever_used ?? 0;
    const recent = row?.used_recent ?? 0;
    const rate = entitled > 0 ? ((100 * recent) / entitled).toFixed(1) : '0.0';
    const note = withheld ? 'WITHHELD — usage here predates the gate; see the note below' : '';
    console.log(
      `${pad(key, 16)}${num(entitled, 10)}${num(ever, 7)}${num(recent, 8)}${num(rate, 8)}${num(entitled - ever, 7)}  ${note}`,
    );
  }

  console.log(`
─────────────────────────────────────────────────────────────────────────────
Read this before acting on it.

"entitled" counts active rows regardless of source, and almost all of ours are
admin grants rather than purchases. A comped account that never opens the
feature is a different fact from a paying one that never opens it, and this
table does not separate them — run paid:census for that split before reading a
low rate as a retention problem.

Nor is this a cohort. Entitlements.grantedAt is not compared to the window, so
somebody granted access yesterday counts in "never" for a reason that has
nothing to do with whether the feature is any good.

A withheld feature does NOT necessarily show 0, and that is by design rather
than a leak. Withholding shuts the gate; it deletes nothing, so rows created
before the switch went in keep counting here forever. When Challenges was
withheld the existing row was 18 minutes older than the commit that withheld it,
which is exactly the shape to expect.

So a non-zero row for a withheld feature is a question, not a finding: check
whether the activity predates the withholding before reading it as a bypass. If
any of it is newer than the switch, that IS a bypass and worth chasing — every
Challenges route goes through requireFeature and createChallenge has exactly one
caller, so there is no legitimate path that would produce one.
─────────────────────────────────────────────────────────────────────────────`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
