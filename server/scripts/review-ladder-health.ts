/**
 * What each review rung is actually doing to the people on it.
 *
 * The admin dashboard reads no Review table at all, and the one Review signal that does exist —
 * the thumbs up / thumbs down shipped with question feedback — has a single consumer, a
 * per-user windowed dislike tally in review-service.ts. Nothing aggregates it, so the button
 * cannot answer the question it exists to ask.
 *
 * A throwaway script rather than a panel, per recall-open-rate-by-kind.ts, and this one in
 * particular should stay a script until the denominator below is real.
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npm run review:ladder
 *   npm run review:ladder -- --days=90
 */

import 'dotenv/config';
import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { reviewExerciseFamily } from '@/utils/review-exercise-families';
import { isReviewEventsTableMissing, isReviewItemsTableMissing } from '../utils/pg-undefined-relation';
import { requireDbTarget } from '../utils/require-db-target';

export function parseArgs(argv: readonly string[] = process.argv) {
  let days = 60;
  for (const a of argv) {
    if (a.startsWith('--days=')) {
      const parsed = parseInt(a.slice('--days='.length), 10);
      days = Number.isNaN(parsed) ? days : Math.max(1, parsed);
    }
  }
  return { days };
}

const pad = (s: string, n: number) => String(s).padEnd(n);
const num = (v: unknown, n: number) => String(v ?? 0).padStart(n);

type RungRow = {
  rungKey: string;
  shown: number;
  answered: number;
  recalled: number;
  almost: number;
  revealed: number;
  deferred: number;
  liked: number;
  disliked: number;
  first_try: number;
  graded_rows: number;
  median_next_days: string | null;
};

type ItemRow = { kind: string; recallState: string; n: number; leeches: number; avg_step: string | null };

async function main() {
  requireDbTarget({ scriptName: 'review-ladder-health', writes: false });
  const { days } = parseArgs();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let rungs: RungRow[];
  try {
    rungs = (await db.execute<RungRow>(sql`
      SELECT
        "rungKey",
        COUNT(*) FILTER (WHERE "action" = 'shown')::int                          AS shown,
        COUNT(*) FILTER (WHERE "action" IN ('recalled','almost','revealed'))::int AS answered,
        COUNT(*) FILTER (WHERE "action" = 'recalled')::int                       AS recalled,
        COUNT(*) FILTER (WHERE "action" = 'almost')::int                         AS almost,
        COUNT(*) FILTER (WHERE "action" = 'revealed')::int                       AS revealed,
        COUNT(*) FILTER (WHERE "action" = 'deferred')::int                       AS deferred,
        COUNT(*) FILTER (WHERE "action" = 'liked')::int                          AS liked,
        COUNT(*) FILTER (WHERE "action" = 'disliked')::int                       AS disliked,
        -- Only meaningful once attemptNumber started being written; null rows are excluded
        -- rather than assumed to be first tries.
        COUNT(*) FILTER (WHERE "attemptNumber" = 1)::int                         AS first_try,
        COUNT(*) FILTER (WHERE "graded" IS TRUE)::int                            AS graded_rows,
        ROUND(percentile_cont(0.5) WITHIN GROUP (
          ORDER BY "nextIntervalDays"
        )::numeric, 1)                                                           AS median_next_days
      FROM "ReviewEvents"
      WHERE "createdAt" >= ${since} AND "rungKey" IS NOT NULL
      GROUP BY 1
      ORDER BY answered DESC, 1
    `)) as unknown as RungRow[];
  } catch (error) {
    if (isReviewEventsTableMissing(error)) {
      console.log('ReviewEvents does not exist yet. Run `npm run review:schema:apply`.');
      return;
    }
    throw error;
  }

  console.log(`\nReview ladder health — last ${days} day(s) since ${since}\n`);
  console.log('A. Per rung (family derived here, never stored)');
  console.log(
    `${pad('rungKey', 20)}${pad('family', 14)}${num('shown', 7)}${num('answ', 6)}${num('recall', 7)}${num('almost', 7)}${num('reveal', 7)}${num('defer', 6)}${num('1st', 5)}${num('like', 6)}${num('dis', 5)}${num('nextD', 7)}`,
  );
  if (rungs.length === 0) {
    console.log('  (no events carrying a rung in the window)');
  }
  let totalShown = 0;
  for (const r of rungs) {
    totalShown += r.shown;
    console.log(
      `${pad(r.rungKey, 20)}${pad(reviewExerciseFamily(r.rungKey).id, 14)}${num(r.shown, 7)}${num(r.answered, 6)}${num(r.recalled, 7)}${num(r.almost, 7)}${num(r.revealed, 7)}${num(r.deferred, 6)}${num(r.first_try, 5)}${num(r.liked, 6)}${num(r.disliked, 5)}${num(r.median_next_days ?? '—', 7)}`,
    );
  }

  let items: ItemRow[];
  try {
    items = (await db.execute<ItemRow>(sql`
      SELECT "kind", "recallState",
             COUNT(*)::int                                        AS n,
             COUNT(*) FILTER (WHERE "lapseCount" >= 4)::int       AS leeches,
             ROUND(AVG("ladderStep")::numeric, 1)                 AS avg_step
      FROM "ReviewItems"
      WHERE "status" = 'active'
      GROUP BY 1, 2
      ORDER BY 1, 2
    `)) as unknown as ItemRow[];
  } catch (error) {
    if (isReviewItemsTableMissing(error)) {
      console.log('\nReviewItems does not exist yet.');
      return;
    }
    throw error;
  }

  console.log('\nB. Active items by kind and recall state (all time, not windowed)');
  console.log(`${pad('kind', 14)}${pad('state', 12)}${num('items', 7)}${num('leech', 7)}${num('avgStep', 9)}`);
  for (const r of items) {
    console.log(
      `${pad(r.kind, 14)}${pad(r.recallState, 12)}${num(r.n, 7)}${num(r.leeches, 7)}${num(r.avg_step ?? '—', 9)}`,
    );
  }

  console.log(`
─────────────────────────────────────────────────────────────────────────────
Read this before acting on it.

Block A only sees events written after rung capture shipped, which was
2026-09-10. Every row older than that has a null rungKey and is excluded — not
just the "shown" rows the session route was fixed to tag, but the outcomes too,
since nothing passed a rung before then. At the time of writing that meant 410
events in the table and 0 of them visible here, which is why an empty Block A is
the expected reading rather than a broken query.

So: until the window is entirely after that date, an empty or thin Block A says
nothing about the rungs. Block B reads ReviewItems directly and is unaffected. ${totalShown === 0 ? '(Right now: no rung-carrying shown rows at all.)' : ''}

The same applies to "1st" and to the graded split: attemptNumber and graded were
added at the same time, and older rows are null rather than 1/false. A rung whose
"1st" is far below its "answ" may simply predate the columns.

This is still not difficulty. A rung's revealed count mixes the reader who tried
twice and missed with the one who tapped through — attemptNumber separates those
two now, but only for rows written from here on, and nothing records how long
anyone spent. Deliberately: a thinking-time number on a devotional practice is an
invitation to optimise for speed.

Families are derived by reviewExerciseFamily at print time and never stored.
FAMILY_BY_KEY calls itself "a naming, not a taxonomy" and is expected to be
re-cut; grouping in SQL would freeze one cut into an append-only log.
─────────────────────────────────────────────────────────────────────────────`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
