/**
 * Church review questions reaching the people who follow them (docs/CHURCH_V2_ROADMAP.md §B).
 *
 * **Pull, never push.** Publishing writes one definition row. Each follower's own read of Review
 * runs this, and it creates *their* `ReviewItems` rows — so nothing fans out to a thousand
 * people on publish, a reader who never opens Review costs nothing, and staff never write into
 * anyone's rows.
 *
 * **Held is a query, not a state.** Whether a reader still has a church question — it is
 * published, its channel is live, they still follow it — is `churchItemHeldSql`, applied by every
 * read. Unfollowing, disconnecting, or a question being taken down all pause the item with no
 * write; following again brings it back with its history intact. A restricted channel that
 * reaps someone's follow (roadmap §C3) narrows this with no further change.
 *
 * Paced like the engine: at most three new a day and eight outstanding, so a church that
 * publishes forty questions on Sunday does not bury a reader's own study on Monday.
 */

import {
  db,
  ChurchReviewExercises,
  Churches,
  ReviewItems,
  SpaceMemberships,
  Spaces,
  and,
  desc,
  eq,
  inArray,
  isNull,
  sql,
  type SQL,
} from '../db';
import { generateTimestampId } from '@/utils/ids';
import { churchIsSponsored } from './church-entitlement';

export const CHURCH_REVIEW_DAILY_CAP = 3;
export const CHURCH_REVIEW_MAX_OUTSTANDING = 8;
/** How many church rows a Plus reader's sitting of eight may hold. */
export const CHURCH_REVIEW_SITTING_SHARE = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 60_000;

/**
 * The one condition every Review read adds: a row is either the reader's own, or a church row
 * whose question is published, whose channel is live, and which the reader still follows.
 */
export function churchItemHeldSql(): SQL {
  return sql`(${ReviewItems.churchExerciseId} IS NULL OR EXISTS (
    SELECT 1 FROM ${ChurchReviewExercises}
    JOIN ${Spaces} ON ${Spaces.id} = ${ChurchReviewExercises.channelSpaceId}
    JOIN ${SpaceMemberships} ON ${SpaceMemberships.spaceId} = ${ChurchReviewExercises.channelSpaceId}
    WHERE ${ChurchReviewExercises.id} = ${ReviewItems.churchExerciseId}
      AND ${ChurchReviewExercises.status} = 'published'
      AND ${Spaces.deletedAt} IS NULL
      AND ${SpaceMemberships.userId} = ${ReviewItems.userId}
      AND ${SpaceMemberships.role} = 'member'
  ))`;
}

/** Who can see what: everything held, or — for a reader Review is free to via their church — church rows only. */
export type ReviewScope = { access: 'full' | 'church' };

export function reviewScopeSql(scope: ReviewScope): SQL {
  return scope.access === 'church'
    ? sql`(${ReviewItems.origin} = 'church' AND ${churchItemHeldSql()})`
    : churchItemHeldSql();
}

/**
 * Pure: which of a sitting's rows to keep so church questions never crowd out a reader's own
 * study. A church-only reader keeps everything; a Plus reader keeps at most `share` church rows.
 */
export function capChurchShare<T extends { origin: string }>(rows: readonly T[], scope: ReviewScope, share = CHURCH_REVIEW_SITTING_SHARE): T[] {
  if (scope.access === 'church') return [...rows];
  let church = 0;
  return rows.filter((row) => {
    if (row.origin !== 'church') return true;
    church += 1;
    return church <= share;
  });
}

type Candidate = {
  id: string;
  kind: string;
  version: number;
  scriptureReference: string | null;
  translation: string | null;
  channelTitle: string;
};

/** Pure: the ReviewItems kind a church exercise is asked as. */
export function reviewKindForChurchExercise(kind: string): 'verse' | 'chapter' | 'church' {
  return kind === 'verse' || kind === 'chapter' ? kind : 'church';
}

/**
 * Pure: which new exercises to hand a reader now. Newest first, never one they already hold in
 * any status (an archived row stays archived — adding it back is theirs to do), never a passage
 * they already review as their own, and within both caps.
 */
export function pickChurchDeliveries(input: {
  candidates: readonly Candidate[];
  heldExerciseIds: ReadonlySet<string>;
  ownPassageKeys: ReadonlySet<string>;
  addedToday: number;
  outstanding: number;
}): Candidate[] {
  const room = Math.max(
    0,
    Math.min(CHURCH_REVIEW_DAILY_CAP - input.addedToday, CHURCH_REVIEW_MAX_OUTSTANDING - input.outstanding),
  );
  const out: Candidate[] = [];
  for (const candidate of input.candidates) {
    if (out.length >= room) break;
    if (input.heldExerciseIds.has(candidate.id)) continue;
    if (candidate.scriptureReference) {
      const key = candidate.scriptureReference.trim().toLowerCase();
      if (input.ownPassageKeys.has(key)) continue;
    }
    out.push(candidate);
  }
  return out;
}

const inFlight = new Map<string, Promise<number>>();
const lastRun = new Map<string, number>();

/**
 * Deliver what a reader's followed channels have published, and catch up anything staff edited.
 * Never throws — a Review read must not fail because delivery did. Returns how many were added.
 */
export function refillChurchReviewQueue(userId: string, now: Date = new Date()): Promise<number> {
  const running = inFlight.get(userId);
  if (running) return running;
  const last = lastRun.get(userId);
  if (last !== undefined && now.getTime() - last < COOLDOWN_MS) return Promise.resolve(0);
  lastRun.set(userId, now.getTime());
  const run = runDelivery(userId, now)
    .catch((error) => {
      console.warn('[church-review] delivery failed', error);
      return 0;
    })
    .finally(() => inFlight.delete(userId));
  inFlight.set(userId, run);
  if (lastRun.size > 500) {
    for (const [key, at] of lastRun) if (now.getTime() - at >= COOLDOWN_MS) lastRun.delete(key);
  }
  return run;
}

async function runDelivery(userId: string, now: Date): Promise<number> {
  // Channels this reader follows, with their church, so a lapsed church adds nothing new.
  const followed = await db
    .select({
      channelId: Spaces.id,
      title: Spaces.title,
      isActive: Churches.isActive,
      deletedAt: Churches.deletedAt,
      billingPlan: Churches.billingPlan,
      pilotUntil: Churches.pilotUntil,
    })
    .from(SpaceMemberships)
    .innerJoin(Spaces, eq(Spaces.id, SpaceMemberships.spaceId))
    .innerJoin(Churches, eq(Churches.orgId, Spaces.orgId))
    .where(
      and(
        eq(SpaceMemberships.userId, userId),
        eq(SpaceMemberships.role, 'member'),
        eq(Spaces.type, 'public'),
        isNull(Spaces.deletedAt),
      ),
    );
  if (followed.length === 0) return 0;
  const titleOf = new Map(followed.map((row) => [row.channelId, row.title]));
  const sponsoredChannels = followed.filter((row) => churchIsSponsored(row)).map((row) => row.channelId);

  const allChannels = followed.map((row) => row.channelId);
  const published = await db
    .select({
      id: ChurchReviewExercises.id,
      kind: ChurchReviewExercises.kind,
      version: ChurchReviewExercises.version,
      scriptureReference: ChurchReviewExercises.scriptureReference,
      translation: ChurchReviewExercises.translation,
      channelSpaceId: ChurchReviewExercises.channelSpaceId,
    })
    .from(ChurchReviewExercises)
    .where(and(inArray(ChurchReviewExercises.channelSpaceId, allChannels), eq(ChurchReviewExercises.status, 'published')))
    .orderBy(desc(ChurchReviewExercises.publishedAt))
    .limit(100);
  if (published.length === 0) return 0;

  const held = await db
    .select({
      id: ReviewItems.id,
      churchExerciseId: ReviewItems.churchExerciseId,
      churchExerciseVersion: ReviewItems.churchExerciseVersion,
      status: ReviewItems.status,
    })
    .from(ReviewItems)
    .where(and(eq(ReviewItems.userId, userId), inArray(ReviewItems.churchExerciseId, published.map((e) => e.id))));
  const heldById = new Map(held.map((row) => [row.churchExerciseId!, row]));

  /*
   * Staff edited a question this reader holds: reset their copy to the new one. Their own write,
   * made on their own read — a church never writes into anyone's rows.
   */
  for (const exercise of published) {
    const row = heldById.get(exercise.id);
    if (!row || row.status === 'archived') continue;
    if ((row.churchExerciseVersion ?? 1) >= exercise.version) continue;
    await db
      .update(ReviewItems)
      .set({
        churchExerciseVersion: exercise.version,
        recallState: 'new',
        intervalDays: 1,
        dueAt: now,
        successStreak: 0,
        lapseCount: 0,
        ladderStep: 0,
        lastOutcome: null,
        lastRungKey: null,
        scriptureReference: exercise.scriptureReference,
        updatedAt: now,
      })
      .where(and(eq(ReviewItems.id, row.id), eq(ReviewItems.userId, userId)));
  }

  // New ones only from churches still sponsored; what a reader already holds keeps working.
  const sponsored = new Set(sponsoredChannels);
  const fresh = published.filter((e) => sponsored.has(e.channelSpaceId));
  if (fresh.length === 0) return 0;

  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const [counts, own] = await Promise.all([
    db
      .select({
        // An ISO string, cast: postgres.js cannot bind a Date inside a raw `sql` fragment.
        addedToday: sql<number>`count(*) filter (where ${ReviewItems.createdAt} >= ${windowStart.toISOString()}::timestamptz)::int`,
        outstanding: sql<number>`count(*) filter (where ${ReviewItems.status} = 'active')::int`,
      })
      .from(ReviewItems)
      .where(and(eq(ReviewItems.userId, userId), eq(ReviewItems.origin, 'church'))),
    db
      .select({ key: ReviewItems.sourceKey })
      .from(ReviewItems)
      .where(
        and(
          eq(ReviewItems.userId, userId),
          isNull(ReviewItems.churchExerciseId),
          inArray(ReviewItems.kind, ['verse', 'chapter']),
        ),
      ),
  ]);
  // The reader's own passages, by reference: `verse:john 3:16`, `chapter:John|3`.
  const ownPassageKeys = new Set<string>();
  for (const row of own) {
    const key = row.key.replace(/^verse:/, '').replace(/^chapter:/, '').replace('|', ' ').trim().toLowerCase();
    ownPassageKeys.add(key);
  }

  const picks = pickChurchDeliveries({
    candidates: fresh.map((e) => ({
      id: e.id,
      kind: e.kind,
      version: e.version,
      scriptureReference: e.scriptureReference,
      translation: e.translation,
      channelTitle: titleOf.get(e.channelSpaceId) ?? '',
    })),
    heldExerciseIds: new Set(heldById.keys()),
    ownPassageKeys,
    addedToday: counts[0]?.addedToday ?? 0,
    outstanding: counts[0]?.outstanding ?? 0,
  });

  let added = 0;
  for (const pick of picks) {
    const inserted = await db
      .insert(ReviewItems)
      .values({
        id: generateTimestampId('review'),
        userId,
        kind: reviewKindForChurchExercise(pick.kind),
        sourceKey: `church:${pick.id}`,
        // Never `noteId`: the note cascade deletes ReviewEvents by noteId with no user filter.
        noteId: null,
        scriptureReference: pick.scriptureReference,
        translation: pick.translation,
        status: 'active',
        recallState: 'new',
        intervalDays: 1,
        dueAt: now,
        origin: 'church',
        churchExerciseId: pick.id,
        churchExerciseVersion: pick.version,
        sourceLabel: pick.channelTitle ? `From ${pick.channelTitle}` : 'From your church',
        sourceAt: now,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: ReviewItems.id });
    added += inserted.length;
  }
  return added;
}

/**
 * "Answered by N": counted once per person, on their first finalized answer. The only thing a
 * church ever learns back, and it is floored at five before anyone sees it.
 */
export async function countChurchAnswer(item: { churchExerciseId?: string | null; reviewCount: number }): Promise<void> {
  if (!item.churchExerciseId || item.reviewCount > 0) return;
  await db
    .update(ChurchReviewExercises)
    .set({ answeredCount: sql`${ChurchReviewExercises.answeredCount} + 1` })
    .where(eq(ChurchReviewExercises.id, item.churchExerciseId));
}
