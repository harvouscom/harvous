/**
 * Move one review item to a chosen rung and make it due, for previewing.
 *
 * Prints what it is about to overwrite before overwriting it. The first version of this script
 * did not, so a preview could not be undone — you had no record of the rung and due date the item
 * was actually on.
 */
import 'dotenv/config';
import { db, ReviewItems, eq, and } from '../db';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const uid = arg('user') ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const id = arg('id') ?? 'review_1788384048178';
const step = Number(arg('step') ?? 5);
const restore = arg('due'); // ISO string, to put an item back

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
  `before: ${before.id} kind=${before.kind} ladderStep=${before.ladderStep} ` +
    `dueAt=${before.dueAt?.toISOString() ?? 'null'} reviewCount=${before.reviewCount}`,
);
console.log(`  to undo: --id=${id} --step=${before.ladderStep} --due=${before.dueAt?.toISOString() ?? ''}`);

const [row] = await db
  .update(ReviewItems)
  .set({
    ladderStep: step,
    dueAt: restore ? new Date(restore) : new Date(),
    updatedAt: new Date(),
  })
  .where(and(eq(ReviewItems.id, id), eq(ReviewItems.userId, uid)))
  .returning();

console.log(`after:  ${row.id} ladderStep=${row.ladderStep} dueAt=${row.dueAt?.toISOString()}`);
process.exit(0);
