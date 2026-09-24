/**
 * A sitting handed over with every question already built.
 *
 * The session read used to send the questions and build only the first one's exercise; the page
 * warmed the rest two at a time. Whether a question *could* be built was only discovered when its
 * reveal came back, and a builder that returned null came back as an empty field — which the dock
 * rendered as a prompt over nothing. Deciding that on the server, before the sitting leaves, is
 * the only place it can be decided once for every surface.
 *
 * Three outcomes per question:
 *
 * - **It builds.** Its exercise travels with the sitting, so the page asks for nothing more.
 * - **It does not, but another rung does.** The item moves to that rung — its stored step is
 *   rewritten, so the list, the reveal, the grader and the truth all resolve the new one — and is
 *   asked that instead. Tried in order: the next maintenance steps for an item past the top of its
 *   ladder (so it keeps its pass), then the kind's opening steps nearest where it stands.
 * - **Nothing builds.** It sits out the next few days rather than coming back tomorrow to fail
 *   the same way, and says so in the log with the rung that failed — which is how the next
 *   probe/builder mismatch gets found.
 */
import { and, eq } from 'drizzle-orm';
import { db, ReviewItems } from '../db';
import {
  askedRungFor,
  buildReviewItemViews,
  buildReviewReveal,
  type ReviewItemRow,
  type ReviewItemView,
  type ReviewRevealPayload,
} from './review-service';
import { revealCarriesExercise } from '@/utils/review-reveal-exercise';
import { alternativeSteps, reviewRungIsGraded } from '@/utils/review-prompts';

/** Built this many at a time: gentle on a ten-connection pool that Home is also drawing on. */
const REVEAL_BUILD_CONCURRENCY = 3;

/** How long a question that cannot be built sits out. Long enough not to be retried daily. */
const UNBUILDABLE_REST_DAYS = 3;

async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function buildOrNull(userId: string, row: ReviewItemRow): Promise<ReviewRevealPayload | null> {
  try {
    return await buildReviewReveal(userId, row);
  } catch {
    return null;
  }
}

/** Move an unbuildable item to a rung that builds, or rest it. Returns what it became. */
async function repair(
  userId: string,
  row: ReviewItemRow,
  failedRung: string | null,
  now: Date,
): Promise<{ view: ReviewItemView; reveal: ReviewRevealPayload } | null> {
  for (const step of alternativeSteps(row.kind, row.ladderStep)) {
    const candidate = { ...row, ladderStep: step };
    const [rung, reveal] = await Promise.all([
      askedRungFor(userId, candidate).catch(() => null),
      buildOrNull(userId, candidate),
    ]);
    if (!rung || !revealCarriesExercise(rung, reveal)) continue;
    const [view] = await buildReviewItemViews(userId, [candidate]);
    if (!view || view.promptKey !== rung) continue;
    await db
      .update(ReviewItems)
      .set({ ladderStep: step, updatedAt: now })
      .where(and(eq(ReviewItems.id, row.id), eq(ReviewItems.userId, userId)));
    console.warn('[review] moved an unbuildable question', {
      itemId: row.id,
      from: failedRung,
      to: rung,
    });
    return { view, reveal: reveal! };
  }

  const dueAt = new Date(now.getTime() + UNBUILDABLE_REST_DAYS * 86_400_000);
  await db
    .update(ReviewItems)
    .set({ dueAt, updatedAt: now })
    .where(and(eq(ReviewItems.id, row.id), eq(ReviewItems.userId, userId)));
  console.warn('[review] rested a question nothing could be built for', {
    itemId: row.id,
    kind: row.kind,
    rung: failedRung,
  });
  return null;
}

/**
 * The views for these rows, each with its exercise, in order — every one of them askable.
 *
 * `reveals` is keyed by item id and holds only the marked rungs, whose reveal is the exercise.
 */
export async function buildReviewSitting(
  userId: string,
  rows: ReviewItemRow[],
  now: Date = new Date(),
): Promise<{ items: ReviewItemView[]; reveals: Record<string, ReviewRevealPayload> }> {
  // The views and the exercises load the same material, memoised, so side by side they share it.
  const [views, built] = await Promise.all([
    buildReviewItemViews(userId, rows, { dropUnaskable: true }),
    mapBounded(rows, REVEAL_BUILD_CONCURRENCY, (row) => buildOrNull(userId, row)),
  ]);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const revealById = new Map(rows.map((row, index) => [row.id, built[index]]));

  const items: ReviewItemView[] = [];
  const reveals: Record<string, ReviewRevealPayload> = {};
  for (const view of views) {
    if (!reviewRungIsGraded(view)) {
      items.push(view);
      continue;
    }
    const reveal = revealById.get(view.id) ?? null;
    if (reveal && revealCarriesExercise(view.promptKey, reveal)) {
      items.push(view);
      reveals[view.id] = reveal;
      continue;
    }
    const row = rowById.get(view.id);
    const repaired = row ? await repair(userId, row, view.promptKey, now) : null;
    if (repaired) {
      items.push(repaired.view);
      reveals[repaired.view.id] = repaired.reveal;
    }
  }
  return { items, reveals };
}
