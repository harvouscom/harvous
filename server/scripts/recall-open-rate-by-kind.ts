/**
 * Open rate per recall opportunity kind, from RecallEvents.
 *
 * The first step docs/future/RICHER_HOME_RECOMMENDATIONS.md asks for, and deliberately a
 * throwaway script rather than an admin surface: the question is whether a per-kind scoring
 * multiplier is worth building at all, and answering it by shipping a dashboard would be
 * building something. The admin panel already reports raw opens by kind; what is missing is
 * the denominator, and impressions have been recorded all along.
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npx tsx server/scripts/recall-open-rate-by-kind.ts
 *   npx tsx server/scripts/recall-open-rate-by-kind.ts --days=60
 */

import 'dotenv/config';
import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { recallKindDisplayLabel } from '@/utils/recall-opportunity-kinds';
import { isRecallEventsTableMissing } from '../utils/pg-undefined-relation';

function parseArgs() {
  let days = 60;
  for (const a of process.argv) {
    if (a.startsWith('--days=')) days = Math.max(1, parseInt(a.slice('--days='.length), 10) || 60);
  }
  return { days };
}

type Row = {
  kind: string;
  shown: number;
  opened: number;
  completed: number;
  put_away: number;
  open_rate_pct: string | number | null;
  users: number;
};

async function main() {
  const { days } = parseArgs();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  /*
   * Each CTE dedupes to one row per (kind, user, opportunity, day), and that is the
   * load-bearing part rather than a tidiness.
   *
   * An impression fires every time the shelf renders, so one card seen across a day of Home
   * visits logs many impressions while opening it logs one. Divided raw, the open rate would
   * be understated by roughly however often someone loads Home — which varies by user, so it
   * would not even be a constant factor.
   */
  const query = sql`
    WITH shown AS (
      SELECT DISTINCT "kind", "userId", "opportunityId",
             DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day
      FROM "RecallEvents"
      WHERE "action" = 'impression' AND "createdAt" >= ${since}
    ),
    opened AS (
      SELECT DISTINCT "kind", "userId", "opportunityId",
             DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day
      FROM "RecallEvents"
      WHERE "action" = 'open' AND "createdAt" >= ${since}
    ),
    finished AS (
      SELECT DISTINCT "kind", "userId", "opportunityId",
             DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day
      FROM "RecallEvents"
      WHERE "action" = 'complete' AND "createdAt" >= ${since}
    ),
    put_away AS (
      SELECT DISTINCT "kind", "userId", "opportunityId",
             DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day
      FROM "RecallEvents"
      WHERE "action" IN ('snooze', 'dismissed') AND "createdAt" >= ${since}
    )
    SELECT
      s."kind"                                                AS kind,
      COUNT(*)::int                                           AS shown,
      COUNT(o.*)::int                                         AS opened,
      COUNT(f.*)::int                                         AS completed,
      COUNT(p.*)::int                                         AS put_away,
      ROUND(100.0 * COUNT(o.*) / NULLIF(COUNT(*), 0), 1)      AS open_rate_pct,
      COUNT(DISTINCT s."userId")::int                         AS users
    FROM shown s
    LEFT JOIN opened   o USING ("kind", "userId", "opportunityId", day)
    LEFT JOIN finished f USING ("kind", "userId", "opportunityId", day)
    LEFT JOIN put_away p USING ("kind", "userId", "opportunityId", day)
    GROUP BY s."kind"
    ORDER BY shown DESC
  `;

  let rows: Row[] = [];
  try {
    const result = await db.execute(query);
    rows = (Array.isArray(result) ? result : (result as { rows?: Row[] }).rows ?? []) as Row[];
  } catch (error) {
    if (isRecallEventsTableMissing(error)) {
      console.log('RecallEvents table does not exist yet. Run `npm run db:push`.');
      return;
    }
    throw error;
  }

  console.log(`Recall open rate by kind, last ${days} day(s) since ${since}\n`);
  if (rows.length === 0) {
    console.log('No impressions recorded in the window — nothing to measure.');
  } else {
    const pad = (s: string, n: number) => s.padEnd(n);
    const num = (v: number | string | null, n: number) => String(v ?? 0).padStart(n);
    console.log(
      `${pad('kind', 20)}${pad('label', 26)}${num('shown', 8)}${num('opened', 8)}${num('rate%', 8)}${num('done', 7)}${num('away', 7)}${num('users', 7)}`,
    );
    for (const r of rows) {
      console.log(
        `${pad(r.kind, 20)}${pad(recallKindDisplayLabel(r.kind), 26)}${num(r.shown, 8)}${num(r.opened, 8)}${num(r.open_rate_pct, 8)}${num(r.completed, 7)}${num(r.put_away, 7)}${num(r.users, 7)}`,
      );
    }
  }

  /*
   * Printed with the numbers, not left to a reader's memory, because the numbers are more
   * persuasive than they deserve to be.
   */
  console.log(`
─────────────────────────────────────────────────────────────────────────────
Read this before acting on it.

These rates are confounded by position, and the confound is structural rather
than incidental. RECALL_KIND_TIER puts revisitNote / highlight / annotateHighlight
in tier 0, and selectRecallOpportunities pins the single best candidate to the
head slot before rotating only the tail. Tier-0 kinds therefore occupy the first
row far more often than tier-3 kinds ever can.

RecallEvents records no position, so an open rate cannot be decomposed into
"this kind is useful" and "this kind is usually first". A multiplier built on
these numbers would launder the tier ordering we chose into evidence that users
chose it.

So: a steep spread here is a reason to look at which kinds are being shown at
all, and a reason to add a position column to RecallEvents and measure again.
It is not, on its own, a reason to build the acceptance-rate multiplier in
docs/future/RICHER_HOME_RECOMMENDATIONS.md.
─────────────────────────────────────────────────────────────────────────────`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
