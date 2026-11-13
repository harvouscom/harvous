import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { FamilyChildVerseHighlights, FamilyChildVerseStickers, Notes, ReviewEvents, ReviewItems, UserNodeStates } from '../db/schema';
import { buildReviewSitting } from '../utils/review-sitting';
import {
  composeTodaySittingFor,
  createReviewItem,
  itemsShownSince,
  nextScheduledReviewAt,
  recordReviewEvent,
  reviewSourceKey,
} from '../utils/review-service';
import type { Child } from './service';

/**
 * Look back: adult Review's engine, run for a child.
 *
 * Same items, scheduling, exercises (that step up and back from how they do, never by choice) and
 * a sitting that ends — with a smaller day for a child. What it draws on is the child's own:
 * their notes, and the verses they highlighted or stickered in My Bible. Nothing here is graded by
 * a model; the verse rungs are marked against the text, note cards are judged by the child.
 *
 * Rows live in ReviewItems / ReviewEvents under the child's id (`child_…`), like a reader's, and
 * are exported to the parent and deleted with the notebook (see notebook-export.ts, service.ts).
 */

/** A child's day: a few questions, then done. Adults get eight. */
export const CHILD_LOOK_BACK_CAP = 5;
const CHILD_LOOK_BACK_SLACK = 2;
/** New things brought in per read, so a big notebook arrives a little at a time. */
const SEED_PER_READ = 4;

const verseReference = (row: { book: string; chapter: number; verse: number }) => `${row.book} ${row.chapter}:${row.verse}`;

/**
 * Bring the child's marked verses and notes into Look back, a few at a time, newest first.
 * Idempotent: anything already an item is skipped before `createReviewItem` is asked.
 */
export async function seedChildLookBack(child: Child, now = new Date()) {
  const translation = child.bibleTranslations[0];
  const [highlights, stickers, notes, existing] = await Promise.all([
    db.select({ book: FamilyChildVerseHighlights.book, chapter: FamilyChildVerseHighlights.chapter, verse: FamilyChildVerseHighlights.verse, at: FamilyChildVerseHighlights.createdAt })
      .from(FamilyChildVerseHighlights).where(eq(FamilyChildVerseHighlights.childId, child.id))
      .orderBy(desc(FamilyChildVerseHighlights.createdAt)).limit(40),
    db.select({ book: FamilyChildVerseStickers.book, chapter: FamilyChildVerseStickers.chapter, verse: FamilyChildVerseStickers.verse, at: FamilyChildVerseStickers.createdAt })
      .from(FamilyChildVerseStickers).where(eq(FamilyChildVerseStickers.childId, child.id))
      .orderBy(desc(FamilyChildVerseStickers.createdAt)).limit(40),
    db.select({ id: Notes.id, at: Notes.updatedAt }).from(Notes)
      .where(and(eq(Notes.userId, child.id), ne(Notes.noteType, 'scripture')))
      .orderBy(desc(Notes.updatedAt)).limit(40),
    db.select({ sourceKey: ReviewItems.sourceKey }).from(ReviewItems).where(eq(ReviewItems.userId, child.id)),
  ]);
  const have = new Set(existing.map(row => row.sourceKey));
  const candidates: { at: number; create: () => Promise<unknown>; key: string | null }[] = [];
  for (const row of [...highlights, ...stickers]) {
    const scriptureReference = verseReference(row);
    const key = reviewSourceKey({ kind: 'verse', scriptureReference });
    candidates.push({ at: row.at.getTime(), key,
      create: () => createReviewItem(child.id, { kind: 'verse', scriptureReference, translation, origin: 'user' }, now) });
  }
  for (const row of notes) {
    const key = reviewSourceKey({ kind: 'note', noteId: row.id });
    candidates.push({ at: new Date(row.at ?? 0).getTime(), key,
      create: () => createReviewItem(child.id, { kind: 'note', noteId: row.id, origin: 'user' }, now) });
  }
  const seen = new Set<string>();
  const fresh = candidates
    .filter(candidate => candidate.key && !have.has(candidate.key) && !seen.has(candidate.key) && seen.add(candidate.key))
    .sort((a, b) => b.at - a.at)
    .slice(0, SEED_PER_READ);
  // A note with nothing to ask about yet is simply not an item; createReviewItem says so and moves on.
  for (const candidate of fresh) await candidate.create().catch(() => null);
}

/** Today's Look back sitting: built exactly like the adult dock's, smaller. */
export async function childLookBackSitting(child: Child, since: Date | null, now = new Date()) {
  await seedChildLookBack(child, now);
  const sitting = await composeTodaySittingFor(child.id, {
    since, cap: CHILD_LOOK_BACK_CAP, slack: CHILD_LOOK_BACK_SLACK, now, scope: { access: 'full' },
  });
  const { items, reveals } = await buildReviewSitting(child.id, sitting.rows, now);
  const rowById = new Map(sitting.rows.map(row => [row.id, row]));
  const shownSince = since ?? new Date(now.getTime() - 86_400_000);
  // Awaited (at most a handful of rows) so nothing is written under the child's id after the request ends.
  await itemsShownSince(child.id, items.map(item => item.id), shownSince)
    .then(already => Promise.all(items.map(item => {
      const row = rowById.get(item.id);
      return row && !already.has(item.id) ? recordReviewEvent(child.id, row, 'shown', { rungKey: item.promptKey }) : Promise.resolve();
    })))
    .catch(() => {});
  const nextDueAt = items.length === 0 ? await nextScheduledReviewAt(child.id, now, { access: 'full' }) : null;
  return { items, reveals, ...(nextDueAt ? { nextDueAt: nextDueAt.toISOString() } : {}) };
}

/** For the parent's export: what Look back holds and how it's going, without the question text. */
export async function exportChildLookBack(child: Child) {
  return db.select({
    kind: ReviewItems.kind, scriptureReference: ReviewItems.scriptureReference, noteId: ReviewItems.noteId,
    status: ReviewItems.status, reviewCount: ReviewItems.reviewCount, lastOutcome: ReviewItems.lastOutcome,
    dueAt: ReviewItems.dueAt, lastReviewedAt: ReviewItems.lastReviewedAt,
  }).from(ReviewItems).where(eq(ReviewItems.userId, child.id));
}

/** Look back's rows go with the notebook. ReviewItems/ReviewEvents key on a text userId, no FK. */
export async function deleteChildLookBack(tx: Pick<typeof db, 'delete'>, childId: string) {
  await tx.delete(ReviewEvents).where(eq(ReviewEvents.userId, childId));
  await tx.delete(ReviewItems).where(eq(ReviewItems.userId, childId));
  // Study-graph rows a child's answers wrote before review-service skipped them for children.
  await tx.delete(UserNodeStates).where(eq(UserNodeStates.userId, childId));
}

