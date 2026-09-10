/**
 * Add or remove a throwaway reader-marked span, for previewing the span-stemmed rungs.
 *
 * The spans on this account were all captured against a translation other than the one Review
 * renders, so the fitness guard (rightly) rejects every one of them and the feature cannot be
 * seen on real data. This makes one that fits, and takes it away again.
 *
 *   --ref="John 15:5" --excerpt="you are the branches"   # add
 *   --remove=<id>                                        # take it away
 */
import 'dotenv/config';
import { db, StudyThreadEntries, eq } from '../db';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const uid = arg('user') ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const remove = arg('remove');

if (remove) {
  const [row] = await db.delete(StudyThreadEntries).where(eq(StudyThreadEntries.id, remove)).returning();
  console.log(row ? `removed ${row.id} (${row.scriptureReference})` : `NOT FOUND: ${remove}`);
  process.exit(0);
}

const reference = arg('ref') ?? 'John 15:5';
const excerpt = arg('excerpt') ?? 'you are the branches';
const id = `tmp_span_${Date.now()}`;
const [row] = await db
  .insert(StudyThreadEntries)
  .values({
    id,
    userId: uid,
    parentNoteId: null,
    entryKindRaw: 'scriptureLink',
    scriptureReference: reference,
    scripturePassageTranslation: 'NET',
    scripturePassageExcerpt: excerpt,
    sourceSnippet: excerpt,
    createdAt: new Date(),
  })
  .returning();
console.log(`added ${row.id} ${row.scriptureReference} "${row.scripturePassageExcerpt}"`);
console.log(`  to undo: --remove=${row.id}`);
process.exit(0);
