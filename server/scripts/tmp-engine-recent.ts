/** Read-only: what the engine added in the rolling window, so its cap can be seen. */
import 'dotenv/config';
import { db, ReviewItems, eq, and, gt, desc } from '../db';
const uid = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1] ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const since = new Date(Date.now() - 24 * 3600 * 1000);
const rows = await db
  .select({ id: ReviewItems.id, kind: ReviewItems.kind, ref: ReviewItems.scriptureReference, created: ReviewItems.createdAt })
  .from(ReviewItems)
  .where(and(eq(ReviewItems.userId, uid), eq(ReviewItems.origin, 'engine'), gt(ReviewItems.createdAt, since)))
  .orderBy(desc(ReviewItems.createdAt));
for (const r of rows) console.log(JSON.stringify(r));
console.log(`${rows.length} engine item(s) in the last 24h`);
process.exit(0);
