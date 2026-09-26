/**
 * Church content lifecycle — publish at a set time, and approval before publish
 * (docs/CHURCH_V2_ROADMAP.md §D).
 *
 * **Going live is always the ordinary publish.** A note is live in a channel exactly when it has
 * a `SpaceNotes` row, and every reader (feed, search, push, the space itself) relies on that. A
 * `ChurchContentSubmissions` row is the promise to make that row later — at `publishAt`, or when
 * a reviewer approves — and `publishSubmission` keeps it by calling
 * `associateAuthoredNoteWithSpace` as the author. Nothing is ever half-live.
 *
 * Approval: with `Churches.contentApproval` on, staff without `review_content` (teachers, plain
 * staff) submit instead of publishing, and `POST /api/spaces/:id/add-note` refuses them with
 * `CONTENT_APPROVAL_REQUIRED` so no client can route around it.
 */

import {
  db,
  first,
  ChurchContentSubmissions,
  ChurchServicePublishedNotes,
  Churches,
  and,
  eq,
  inArray,
  isNull,
  lte,
} from '../db';
import { capabilitiesForChurchRole } from './church-role-capabilities';
import { fetchClerkOrgMemberships } from './clerk-org';
import { associateAuthoredNoteWithSpace, SharedSpaceLifecycleError } from './shared-space-lifecycle';
import { broadcastCanonicalNoteInvalidation } from './broadcast-shared-space-note';

export type SubmissionStatus = 'in_review' | 'scheduled' | 'published' | 'declined' | 'withdrawn' | 'failed';
export const OPEN_SUBMISSION_STATUSES: SubmissionStatus[] = ['in_review', 'scheduled'];

export const CONTENT_APPROVAL_REQUIRED_CODE = 'CONTENT_APPROVAL_REQUIRED';
export const REVIEW_NOTE_MAX = 280;
/** How far ahead a publish can be set. A year covers any series planned in advance. */
export const PUBLISH_AT_MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

export type SubmissionRow = typeof ChurchContentSubmissions.$inferSelect;

export type PublishAtResult = { ok: true; publishAt: Date | null } | { ok: false; error: string };

/**
 * Pure: read a requested publish time. Absent or null means "now". A time in the past — or
 * within the next minute, which is "now" by the time anyone reads it — also means now; a time
 * more than a year out is refused.
 */
export function parsePublishAt(raw: unknown, now: Date): PublishAtResult {
  if (raw === undefined || raw === null || raw === '') return { ok: true, publishAt: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Choose a date and time' };
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return { ok: false, error: 'Choose a date and time' };
  if (at.getTime() - now.getTime() > PUBLISH_AT_MAX_AHEAD_MS) {
    return { ok: false, error: 'Choose a time within the next year' };
  }
  return { ok: true, publishAt: at.getTime() - now.getTime() <= 60_000 ? null : at };
}

/** When a planner entry's post goes out if nobody says otherwise: its date, at this church time. */
export const PLANNED_ENTRY_PUBLISH_TIME = '08:00';

/**
 * Pure: the instant a church wall-clock reading names — `2026-09-27` at `08:00` in
 * `America/Chicago` is 13:00Z. Planner dates are stored as the church's wall clock and never
 * converted (church-service-times.ts); this is the one place one becomes an instant, because
 * a publish has to happen at a moment. An unknown zone reads as UTC, like `churchClockNow`.
 */
export function churchWallTimeToInstant(date: string, time: string, timezone: string | null | undefined): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const zone = timezone || 'UTC';
  const offsetAt = (instant: number): number => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).formatToParts(new Date(instant));
      const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
      return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - instant;
    } catch {
      return 0;
    }
  };
  // Twice, so a date on the far side of a DST change settles on that side's offset.
  let instant = wall - offsetAt(wall);
  instant = wall - offsetAt(instant);
  return new Date(instant);
}

export type SubmitPlan = 'publish_now' | 'scheduled' | 'in_review';

/** Pure: what a submission becomes. Approval wins over a time — the time rides along. */
export function planSubmission(input: { approvalRequired: boolean; publishAt: Date | null }): SubmitPlan {
  if (input.approvalRequired) return 'in_review';
  return input.publishAt ? 'scheduled' : 'publish_now';
}

/** Pure: what an approval does — schedules it for its time if that is still ahead, else publishes. */
export function planApproval(input: { publishAt: Date | null; now: Date }): 'publish_now' | 'scheduled' {
  return input.publishAt && input.publishAt.getTime() - input.now.getTime() > 60_000 ? 'scheduled' : 'publish_now';
}

/** Pure: may this person act on this submission, and how? */
export function submissionActor(input: {
  submission: Pick<SubmissionRow, 'authorUserId'>;
  userId: string;
  canReview: boolean;
}): { isAuthor: boolean; canReview: boolean; canSee: boolean } {
  const isAuthor = input.submission.authorUserId === input.userId;
  return { isAuthor, canReview: input.canReview, canSee: isAuthor || input.canReview };
}

/** Pure: a reviewer's note — plain, collapsed, capped. */
export function cleanReviewNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, REVIEW_NOTE_MAX) : null;
}

/**
 * The staffer's Clerk role in this church, or undefined when Clerk could not answer. Callers
 * fail closed on undefined: an outage must not publish around a pastor's approval.
 */
export async function churchRoleFor(orgId: string, userId: string): Promise<string | null | undefined> {
  try {
    const roster = await fetchClerkOrgMemberships(orgId);
    return roster.find((member) => member.userId === userId)?.role ?? null;
  } catch {
    return undefined;
  }
}

export function roleCanReview(role: string | null | undefined): boolean {
  return role !== undefined && capabilitiesForChurchRole(role).includes('review_content');
}

/** Whether this church requires approval of this person's channel material. */
export async function contentApprovalRequired(userId: string, orgId: string): Promise<boolean> {
  const church = first(
    await db
      .select({ contentApproval: Churches.contentApproval })
      .from(Churches)
      .where(and(eq(Churches.orgId, orgId), isNull(Churches.deletedAt)))
      .limit(1),
  );
  if (!church?.contentApproval) return false;
  return !roleCanReview(await churchRoleFor(orgId, userId));
}

export type PublishOutcome = { ok: true } | { ok: false; error: string; code: string };

/**
 * Keep a submission's promise: claim it (so two ticks, or a tick and a tap, never both publish)
 * and add the note to its channel as its author, in one transaction. If the publish itself is
 * refused — the author no longer leads the channel, the note was deleted or locked — the claim
 * rolls back and the row is marked `failed` with the reason, for the Content list to show.
 */
export async function publishSubmission(
  submissionId: string,
  now: Date,
  fromStatuses: SubmissionStatus[] = OPEN_SUBMISSION_STATUSES,
): Promise<PublishOutcome> {
  let claimed: SubmissionRow | undefined;
  try {
    claimed = await db.transaction(async (tx) => {
      const row = first(
        await tx
          .update(ChurchContentSubmissions)
          .set({ status: 'published', publishedAt: now, updatedAt: now })
          .where(and(eq(ChurchContentSubmissions.id, submissionId), inArray(ChurchContentSubmissions.status, fromStatuses)))
          .returning(),
      ) as SubmissionRow | undefined;
      if (!row) return undefined;
      await associateAuthoredNoteWithSpace(tx, {
        spaceId: row.channelSpaceId,
        noteId: row.noteId,
        actorId: row.authorUserId,
        now,
      });
      if (row.serviceId) await claimPlannedEntry(tx, row.serviceId, row.noteId, row.authorUserId, now);
      return row;
    });
  } catch (error) {
    if (error instanceof SharedSpaceLifecycleError) {
      await db
        .update(ChurchContentSubmissions)
        .set({ status: 'failed', reviewNote: error.message.slice(0, REVIEW_NOTE_MAX), updatedAt: now })
        .where(and(eq(ChurchContentSubmissions.id, submissionId), inArray(ChurchContentSubmissions.status, fromStatuses)));
      return { ok: false, error: error.message, code: error.code };
    }
    throw error;
  }
  if (!claimed) return { ok: false, error: 'Already published or no longer waiting', code: 'NOT_OPEN' };
  await broadcastCanonicalNoteInvalidation(claimed.authorUserId, claimed.noteId, {
    type: 'note:updated',
    id: claimed.noteId,
  }).catch(() => undefined);
  return { ok: true };
}

/**
 * The live note is the material for its planner entry: the "material claims the service" row
 * the followers' Home card reads (docs/future/CHURCH_STUDY_MATERIAL_LINKING.md). Idempotent.
 */
export async function claimPlannedEntry(
  tx: Pick<typeof db, 'insert'>,
  serviceId: string,
  noteId: string,
  userId: string,
  now: Date,
): Promise<void> {
  await tx
    .insert(ChurchServicePublishedNotes)
    .values({ id: `svcpub_${crypto.randomUUID()}`, serviceId, noteId, publishedByUserId: userId, createdAt: now })
    .onConflictDoNothing();
}

/** How many a tick publishes at most; the rest wait five minutes. */
const TICK_BATCH = 50;

/**
 * Publish every scheduled submission whose time has come. Runs every five minutes on the Fly
 * process (server/scheduler.ts). Each row is claimed independently, so a second machine or an
 * overlapping run publishes nothing twice.
 */
export async function runChurchContentTick(now: Date = new Date()): Promise<{ published: number; failed: number }> {
  const due = await db
    .select({ id: ChurchContentSubmissions.id })
    .from(ChurchContentSubmissions)
    .where(and(eq(ChurchContentSubmissions.status, 'scheduled'), lte(ChurchContentSubmissions.publishAt, now)))
    .limit(TICK_BATCH);
  let published = 0;
  let failed = 0;
  for (const { id } of due) {
    const outcome = await publishSubmission(id, now, ['scheduled']);
    if (outcome.ok) published += 1;
    else if (outcome.code !== 'NOT_OPEN') failed += 1;
  }
  return { published, failed };
}
