/**
 * Display names for a suggestion queue.
 *
 * "Review is never shared" protects *observed* behaviour — what someone read,
 * wrote, or studied — and no church-facing route may read a user column to
 * answer it. A suggestion is the opposite kind of fact: an affirmative
 * submission, someone raising their hand, which a reviewer cannot act on,
 * reply to, or judge fairly without knowing who sent it.
 *
 * This helper is that exception, and it is meant to stay small and rare: it
 * reads exactly one thing (a name), it is imported only by the two suggestion
 * routes (church library, space study), and the contract tests on those files
 * fail if anything else starts importing it. Falls back to nothing rather
 * than an id, so a missing profile never leaks a raw Clerk id into a queue.
 */
import { db, inArray, UserMetadata } from '../db';

export async function displayNamesFor(userIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return out;

  const rows = await db
    .select({
      userId: UserMetadata.userId,
      firstName: UserMetadata.firstName,
      lastName: UserMetadata.lastName,
    })
    .from(UserMetadata)
    .where(inArray(UserMetadata.userId, unique));

  for (const row of rows) {
    const name = [row.firstName, row.lastName]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join(' ');
    if (name) out.set(row.userId, name);
  }
  return out;
}
