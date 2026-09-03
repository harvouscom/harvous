/** Create a throwaway note review item for previewing the note ladder. Prints the id to remove. */
import 'dotenv/config';
import { db, ReviewItems, eq, and } from '../db';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const uid = arg('user') ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const noteId = arg('note');
const remove = arg('remove');

if (remove) {
  await db.delete(ReviewItems).where(and(eq(ReviewItems.id, remove), eq(ReviewItems.userId, uid)));
  console.log(`removed ${remove}`);
  process.exit(0);
}
if (!noteId) {
  console.log('usage: --note=<noteId> [--step=N] | --remove=<reviewItemId>');
  process.exit(1);
}

const id = `review_${Date.now()}`;
const now = new Date();
await db.insert(ReviewItems).values({
  id,
  userId: uid,
  kind: 'note',
  sourceKey: `note:${noteId}`,
  noteId,
  ladderStep: Number(arg('step') ?? 0),
  dueAt: now,
  createdAt: now,
  updatedAt: now,
  status: 'active',
  reviewCount: 0,
  recallState: 'due',
} as never);
console.log(`created ${id} for note ${noteId} at step ${arg('step') ?? 0}`);
console.log(`  remove with: npx tsx server/scripts/tmp-note-item.ts --remove=${id}`);
process.exit(0);
