/** Read-only: chapter review items on this account, and where they came from. */
import 'dotenv/config';
import { db, ReviewItems, eq, and, desc } from '../db';
const uid = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1] ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const rows = await db
  .select({ id: ReviewItems.id, ref: ReviewItems.scriptureReference, origin: ReviewItems.origin, step: ReviewItems.ladderStep, due: ReviewItems.dueAt, created: ReviewItems.createdAt, label: ReviewItems.sourceLabel, translation: ReviewItems.translation })
  .from(ReviewItems)
  .where(and(eq(ReviewItems.userId, uid), eq(ReviewItems.kind, 'chapter')))
  .orderBy(desc(ReviewItems.createdAt));
for (const r of rows) console.log(JSON.stringify(r));
console.log(`${rows.length} chapter item(s)`);
process.exit(0);
