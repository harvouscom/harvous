/**
 * Read-only: resolve and build every active Review item for one reader, as a sitting would.
 *
 * The dry run for a change to the ladders. For each active item it resolves the rung
 * (`askedRungFor`), builds the item's view (`buildReviewItemViews`) and its exercise
 * (`buildReviewReveal`), and asks the same question the sitting asks before it hands a question
 * over (`revealCarriesExercise`). Where an item cannot be built it walks `alternativeSteps` the way
 * `review-sitting.ts`'s `repair` does — **without writing the step it finds**. The sitting's own
 * repair writes; this never calls it.
 *
 * Prints:
 *   - unbuildable items (nothing builds on any step: the sitting would rest them),
 *   - repairable items (the current step fails, another builds: the sitting would move them),
 *   - rung changes by kind: `lastRungKey` (what was last asked) → the rung resolved now,
 *   - spot-check lines: chapters asked whole-chapter questions, verses showing "You marked this"
 *     and carrying the reader's annotation, notes asked the Takeaway question.
 *
 * `--json=<path>` also writes one line per item so a run on `main` and a run on a branch can be
 * diffed ("before and after").
 *
 * Usage:
 *   npx tsx server/scripts/audit-review-rungs.ts --user=<clerk user id> [--json=/tmp/after.jsonl]
 *   npx tsx server/scripts/audit-review-rungs.ts --user-env=TEST_USER_A_CLERK_ID
 *
 * Nothing here inserts, updates or deletes. `--user` is required for the reason
 * `preview-review-engine.ts` gives: dev and live Clerk mint different ids against one database.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { db, ReviewItems, eq, and } from '../db';
import {
  askedRungFor,
  buildReviewItemViews,
  buildReviewReveal,
  type ReviewItemRow,
} from '../utils/review-service';
import { revealCarriesExercise } from '@/utils/review-reveal-exercise';
import { alternativeSteps, reviewRungIsGraded } from '@/utils/review-prompts';

/* `--user-env=TEST_USER_A_CLERK_ID` reads the id from the environment, so it never lands in a log. */
const userEnv = process.argv.find((a) => a.startsWith('--user-env='))?.split('=')[1];
const uid =
  process.argv.find((a) => a.startsWith('--user='))?.split('=')[1] ??
  (userEnv ? process.env[userEnv]?.trim() || undefined : undefined);
const jsonPath = process.argv.find((a) => a.startsWith('--json='))?.split('=')[1];
if (!uid) {
  console.error('usage: npx tsx server/scripts/audit-review-rungs.ts --user=<clerk user id> [--json=<path>]');
  process.exit(1);
}

const rows = (await db
  .select()
  .from(ReviewItems)
  .where(and(eq(ReviewItems.userId, uid), eq(ReviewItems.status, 'active')))) as ReviewItemRow[];

/** Does this row, on this step, resolve to a rung whose exercise builds? Read-only. */
async function builds(row: ReviewItemRow): Promise<{ rung: string | null; ok: boolean; reveal: unknown }> {
  const rung = await askedRungFor(uid!, row).catch(() => null);
  if (!rung) return { rung: null, ok: false, reveal: null };
  const graded = reviewRungIsGraded({ kind: row.kind, ladderStep: row.ladderStep, promptKey: rung });
  const reveal = await buildReviewReveal(uid!, row).catch(() => null);
  // An ungraded rung (the Takeaway card) is sent without an exercise, as the sitting does.
  const ok = !graded || revealCarriesExercise(rung, reveal as Parameters<typeof revealCarriesExercise>[1]);
  return { rung, ok, reveal };
}

const changes: Record<string, Record<string, number>> = {};
const unbuildable: string[] = [];
const repairable: string[] = [];
const spot = { chapterWhole: 0, chapterVerseLevel: 0, verseMarked: 0, verseAnnotated: 0, noteTakeaway: 0 };
const lines: string[] = [];

for (const row of rows) {
  const [view] = await buildReviewItemViews(uid, [row], { dropUnaskable: true }).catch(() => []);
  const now = await builds(row);
  let repairedTo: { step: number; rung: string | null } | null = null;
  if (!now.ok) {
    for (const step of alternativeSteps(row.kind, row.ladderStep)) {
      const candidate = await builds({ ...row, ladderStep: step });
      if (candidate.ok) {
        repairedTo = { step, rung: candidate.rung };
        break;
      }
    }
    (repairedTo ? repairable : unbuildable).push(`${row.kind} ${row.id} ${row.scriptureReference ?? row.noteId ?? ''} step=${row.ladderStep} rung=${now.rung}`);
  }

  const before = row.lastRungKey ?? '(never asked)';
  const after = repairedTo?.rung ?? now.rung ?? '(none)';
  if (before !== after) {
    const byKind = (changes[row.kind] ??= {});
    const key = `${before} -> ${after}`;
    byKind[key] = (byKind[key] ?? 0) + 1;
  }

  if (row.kind === 'chapter') {
    if (['chapter.order', 'chapter.person', 'chapter.place'].includes(after)) spot.chapterWhole += 1;
    else spot.chapterVerseLevel += 1;
  }
  if (row.kind === 'verse') {
    if (view?.framing?.template === 'marked') spot.verseMarked += 1;
    const annotation = (now.reveal as { context?: { annotation?: unknown } } | null)?.context?.annotation;
    if (annotation) spot.verseAnnotated += 1;
  }
  if (row.kind === 'note' && after === 'note.takeaway') spot.noteTakeaway += 1;

  lines.push(
    JSON.stringify({
      id: row.id,
      kind: row.kind,
      ref: row.scriptureReference ?? row.noteId,
      step: row.ladderStep,
      lastRungKey: row.lastRungKey ?? null,
      rung: now.rung,
      builds: now.ok,
      repairedTo,
      prompt: view?.prompt ?? null,
      framing: view?.framing?.template ?? null,
    }),
  );
}

console.log(`active items: ${rows.length}`);
console.log(`unbuildable (would rest): ${unbuildable.length}`);
for (const line of unbuildable) console.log(`  ${line}`);
console.log(`repairable (would move step): ${repairable.length}`);
for (const line of repairable) console.log(`  ${line}`);
console.log('rung changes by kind (last asked -> now):');
for (const [kind, byChange] of Object.entries(changes)) {
  for (const [change, n] of Object.entries(byChange).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(8)} ${String(n).padStart(4)}  ${change}`);
  }
}
console.log('spot checks:', JSON.stringify(spot));
if (jsonPath) {
  writeFileSync(jsonPath, `${lines.join('\n')}\n`);
  console.log(`wrote ${lines.length} lines to ${jsonPath}`);
}
process.exit(0);
