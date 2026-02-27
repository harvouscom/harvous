/**
 * List notes and threads for a specific userId with titles, dates, and content preview.
 *
 * Usage (from repo root, .env or ASTRO_DB_* set):
 *   USER_ID=user_35FUJeLEI2L0gRjCJqIIbNWraRK npx tsx scripts/explore-user-notes-threads.ts
 *
 * Or omit USER_ID to use the default (your live ID).
 */
import 'dotenv/config';
import { db, Notes, Threads, Spaces } from '../server/db';
import { eq, desc, inArray } from 'drizzle-orm';

const DEFAULT_USER_ID = 'user_35FUJeLEI2L0gRjCJqIIbNWraRK';

function contentPreview(content: string | null, maxLen = 80): string {
  if (!content) return '(empty)';
  const stripped = content.replace(/\s+/g, ' ').trim();
  return stripped.length <= maxLen ? stripped : stripped.slice(0, maxLen) + '…';
}

async function main() {
  const userId = process.env.USER_ID?.trim() || DEFAULT_USER_ID;

  const threads = await db
    .select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      spaceId: Threads.spaceId,
      createdAt: Threads.createdAt,
    })
    .from(Threads)
    .where(eq(Threads.userId, userId))
    .orderBy(Threads.createdAt);

  const notes = await db
    .select({
      id: Notes.id,
      title: Notes.title,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      createdAt: Notes.createdAt,
      content: Notes.content,
    })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .orderBy(desc(Notes.createdAt));

  const spaceIds = [...new Set([...threads.map((t) => t.spaceId), ...notes.map((n) => n.spaceId)].filter(Boolean))] as string[];
  const spaces =
    spaceIds.length > 0
      ? await db.select({ id: Spaces.id, title: Spaces.title }).from(Spaces).where(inArray(Spaces.id, spaceIds)).all()
      : [];
  const spaceTitleById = Object.fromEntries(spaces.map((s) => [s.id, s.title]));

  console.log('=== User:', userId, '===\n');
  console.log('--- Threads (' + threads.length + ') ---\n');
  for (const t of threads) {
    const spaceTitle = t.spaceId ? spaceTitleById[t.spaceId] ?? t.spaceId : '(no space)';
    console.log(' ', t.id);
    console.log('   title:', t.title);
    if (t.subtitle) console.log('   subtitle:', t.subtitle);
    console.log('   space:', spaceTitle);
    console.log('   createdAt:', t.createdAt);
    console.log('');
  }

  console.log('--- Notes (' + notes.length + ') ---\n');
  for (const n of notes) {
    const spaceTitle = n.spaceId ? spaceTitleById[n.spaceId] ?? n.spaceId : '(no space)';
    const thread = threads.find((t) => t.id === n.threadId);
    const threadTitle = thread?.title ?? n.threadId;
    console.log(' ', n.id);
    console.log('   title:', n.title ?? '(no title)');
    console.log('   thread:', threadTitle);
    console.log('   space:', spaceTitle);
    console.log('   createdAt:', n.createdAt);
    console.log('   content preview:', contentPreview(n.content));
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
