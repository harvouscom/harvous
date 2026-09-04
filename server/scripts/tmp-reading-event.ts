/**
 * A throwaway ReadingEvents row, for seeing the reading-note card without waiting a day.
 *
 * Inserts the row directly rather than through `recordReadingEvent`, so it writes nothing to the
 * Study Bible layer — one row, removable by the id it prints.
 */
import 'dotenv/config';
import { db, ReadingEvents, eq, and } from '../db';
import { nowISO } from '../db/dates';
import { generateTimestampId } from '@/utils/ids';
import { resolveScriptureChapterTarget } from '@/utils/scripture-chapter-target';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const uid = arg('user') ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const remove = arg('remove');

if (remove) {
  await db.delete(ReadingEvents).where(and(eq(ReadingEvents.id, remove), eq(ReadingEvents.userId, uid)));
  console.log(`removed ${remove}`);
  process.exit(0);
}

const book = arg('book');
const chapter = Number(arg('chapter'));
const target = book ? resolveScriptureChapterTarget(book, chapter) : null;
if (!target) {
  console.log('usage: --book="Ephesians" --chapter=5 [--dwell=read] [--translation=NET] | --remove=<id>');
  process.exit(1);
}

const id = generateTimestampId('readingevent');
await db.insert(ReadingEvents).values({
  id,
  userId: uid,
  book: target.book,
  bookOrder: target.bookOrder,
  chapter: target.chapter,
  translation: arg('translation') ?? 'NET',
  dwellBucket: arg('dwell') ?? 'read',
  createdAt: nowISO(),
});
console.log(`created ${id} — ${target.book} ${target.chapter} (${arg('dwell') ?? 'read'})`);
console.log(`  remove with: npx tsx server/scripts/tmp-reading-event.ts --remove=${id}`);
process.exit(0);
