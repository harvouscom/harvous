import 'dotenv/config';
import { db, ReviewItems, eq, and } from '../db';
const uid = 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const id = 'review_1788384048178';
const step = Number(process.argv.find(a => a.startsWith('--step='))?.split('=')[1] ?? 5);
const [row] = await db.update(ReviewItems)
  .set({ ladderStep: step, dueAt: new Date(), updatedAt: new Date() })
  .where(and(eq(ReviewItems.id, id), eq(ReviewItems.userId, uid)))
  .returning();
console.log(row ? `set ${row.id} -> ladderStep ${row.ladderStep}, due now` : 'NOT FOUND');
process.exit(0);
