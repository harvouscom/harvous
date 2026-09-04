/** Reset a throwaway chapter item to a clean, due state. Read-modify on one row, by id. */
import 'dotenv/config';
import { db, ReviewItems, eq, and } from '../db';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const uid = arg('user') ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const id = arg('item');
if (!id) { console.log('usage: --item=<reviewItemId> [--step=N]'); process.exit(1); }

await db
  .update(ReviewItems)
  .set({
    ladderStep: Number(arg('step') ?? 0),
    // `--in-days=3` pushes it into the future, for looking at the empty queue.
    dueAt: new Date(Date.now() + Number(arg('in-days') ?? 0) * 86_400_000),
    reviewCount: 0,
    successStreak: 0,
    lapseCount: 0,
    intervalDays: 1,
    recallState: 'new',
    lastOutcome: null,
    lastReviewedAt: null,
    lastRungKey: null,
  })
  .where(and(eq(ReviewItems.id, id), eq(ReviewItems.userId, uid)));
console.log(`reset ${id} to step ${arg('step') ?? 0}, due now`);
process.exit(0);
