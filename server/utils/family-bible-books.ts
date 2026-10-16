/**
 * "Our Bible" for a family — which books the household has been in. Book names, nothing else.
 *
 * The family rule (family-progress.ts): progress, not content, and book names are the one
 * named exception to "only counts". This goes a step narrower than what a parent sees of a
 * child: no counts, no chapters, and no who — one set of books for the whole household.
 *
 * Opt-in, per person. Every role's join text promised something this would change ("Your study
 * stays private", "Nothing about your study is shown to anyone"), so a member's books count
 * only after they choose to add them, recorded in the family's own history as
 * `bible_books_shared` / `bible_books_unshared` (latest wins). Taking them back is one tap.
 *
 * Never here: chapters, note titles or bodies, highlights, Review, a user column in the
 * result. A contract test scans this file's source.
 */

import { db, FamilyEvents, FamilyMembers, Notes, ReadingEvents, ScriptureMetadata, and, desc, eq, inArray } from '../db';
import { canonicalCoverageBook } from '@/utils/bible-coverage';
import { orderedCanonBooks } from '@/utils/bible-book-chapters';

export const FAMILY_BIBLE_SHARED = 'bible_books_shared';
export const FAMILY_BIBLE_UNSHARED = 'bible_books_unshared';

/** Glances are a page passing by; only reading counts as reading. */
const READ_BUCKETS = ['read', 'study'];

/**
 * Whose books count: each current member's latest choice, newest event first. Someone who left
 * keeps no place on the family's map, whatever they chose while they were in it.
 */
export function sharersFrom(
  memberIds: readonly string[],
  eventsNewestFirst: ReadonlyArray<{ actorUserId: string | null; kind: string }>,
): Set<string> {
  const current = new Set(memberIds);
  const decided = new Set<string>();
  const sharers = new Set<string>();
  for (const event of eventsNewestFirst) {
    const who = event.actorUserId;
    if (!who || decided.has(who)) continue;
    decided.add(who);
    if (event.kind === FAMILY_BIBLE_SHARED && current.has(who)) sharers.add(who);
  }
  return sharers;
}

/** Members of this family whose latest choice is to add their books. */
export async function familyBibleSharers(familyId: string): Promise<Set<string>> {
  const [members, events] = await Promise.all([
    db.select({ userId: FamilyMembers.userId }).from(FamilyMembers).where(eq(FamilyMembers.familyId, familyId)),
    db
      .select({ actorUserId: FamilyEvents.actorUserId, kind: FamilyEvents.kind })
      .from(FamilyEvents)
      .where(
        and(
          eq(FamilyEvents.familyId, familyId),
          inArray(FamilyEvents.kind, [FAMILY_BIBLE_SHARED, FAMILY_BIBLE_UNSHARED]),
        ),
      )
      .orderBy(desc(FamilyEvents.createdAt)),
  ]);
  return sharersFrom(
    members.map((m) => m.userId),
    events,
  );
}

/** The household's books, canon order. Empty until someone adds theirs. */
export async function loadFamilyBibleBooks(familyId: string): Promise<string[]> {
  const sharers = [...(await familyBibleSharers(familyId))];
  if (sharers.length === 0) return [];

  const [readBooks, citedBooks] = await Promise.all([
    db
      .selectDistinct({ book: ReadingEvents.book })
      .from(ReadingEvents)
      .where(and(inArray(ReadingEvents.userId, sharers), inArray(ReadingEvents.dwellBucket, READ_BUCKETS))),
    db
      .selectDistinct({ book: ScriptureMetadata.book })
      .from(ScriptureMetadata)
      .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
      .where(inArray(Notes.userId, sharers)),
  ]);

  const books = new Set<string>();
  for (const row of [...readBooks, ...citedBooks]) {
    const book = row.book ? canonicalCoverageBook(row.book) : null;
    if (book) books.add(book);
  }
  return orderedCanonBooks().filter((book) => books.has(book));
}
