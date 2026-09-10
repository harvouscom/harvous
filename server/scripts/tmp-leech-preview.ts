/**
 * Put one throwaway review item on the edge of becoming a leech, for previewing cut 4.
 *
 * Prints the fields it is about to overwrite and the flags to put them back, like its sibling
 * `tmp-ladder-preview.ts`. `--lapses=N --streak=N --step=N` set the state; `--due=` restores.
 */
import 'dotenv/config';
import { db, ReviewItems, eq, and } from '../db';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const uid = arg('user') ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const id = arg('id') ?? 'review_1788384048178';
const lapses = Number(arg('lapses') ?? 3);
const streak = Number(arg('streak') ?? 1);
const step = Number(arg('step') ?? 3);
const restore = arg('due');

const [before] = await db
  .select()
  .from(ReviewItems)
  .where(and(eq(ReviewItems.id, id), eq(ReviewItems.userId, uid)))
  .limit(1);
if (!before) {
  console.log(`NOT FOUND: ${id}`);
  process.exit(1);
}
console.log(
  `before: ${before.id} step=${before.ladderStep} lapses=${before.lapseCount} streak=${before.successStreak} ` +
    `state=${before.recallState} interval=${before.intervalDays} due=${before.dueAt.toISOString()}`,
);
console.log(
  `  to undo: --id=${id} --step=${before.ladderStep} --lapses=${before.lapseCount} --streak=${before.successStreak} --due=${before.dueAt.toISOString()}`,
);
const [row] = await db
  .update(ReviewItems)
  .set({
    ladderStep: step,
    lapseCount: lapses,
    successStreak: streak,
    reviewCount: Math.max(before.reviewCount, 2),
    dueAt: restore ? new Date(restore) : new Date(),
    updatedAt: new Date(),
  })
  .where(and(eq(ReviewItems.id, id), eq(ReviewItems.userId, uid)))
  .returning();
console.log(`after:  step=${row.ladderStep} lapses=${row.lapseCount} streak=${row.successStreak} due=${row.dueAt.toISOString()}`);
process.exit(0);
