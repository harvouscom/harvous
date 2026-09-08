/**
 * A throwaway chapter review item, for walking the chapter ladder against real text.
 *
 * Goes through `createReviewItem` so the reference is canonicalised and refused the way the
 * route would refuse it. Prints the remove command. `--due=now` makes it due at once (a
 * chapter otherwise waits a night); `--step=N` sets the rung.
 */
import 'dotenv/config';
import { db, ReviewItems, eq, and } from '../db';
import { createReviewItem } from '../utils/review-service';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const uid = arg('user') ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const chapter = arg('chapter');
const remove = arg('remove');

if (remove) {
  await db.delete(ReviewItems).where(and(eq(ReviewItems.id, remove), eq(ReviewItems.userId, uid)));
  console.log(`removed ${remove}`);
  process.exit(0);
}
if (!chapter) {
  console.log('usage: --chapter="John 3" [--step=N] [--translation=NET] [--due=now] | --remove=<reviewItemId>');
  process.exit(1);
}

const result = await createReviewItem(uid, {
  kind: 'chapter',
  scriptureReference: chapter,
  translation: arg('translation') ?? 'NET',
});
if ('error' in result) {
  console.log(`refused: ${result.error}`);
  process.exit(1);
}
const patch: Record<string, unknown> = {};
if (arg('step')) patch.ladderStep = Number(arg('step'));
if (arg('due') === 'now') patch.dueAt = new Date();
if (Object.keys(patch).length) {
  await db.update(ReviewItems).set(patch).where(eq(ReviewItems.id, result.item.id));
}
console.log(`${result.created ? 'created' : 'existing'} ${result.item.id} for ${result.item.scriptureReference} at step ${patch.ladderStep ?? result.item.ladderStep}`);
console.log(`  remove with: npx tsx server/scripts/tmp-chapter-item.ts --remove=${result.item.id}`);
process.exit(0);
