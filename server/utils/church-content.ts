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
      return row;
    });
  } catch (error) {
    if (error instanceof SharedSpaceLifecycleError) {
      const marked = await db
        .update(ChurchContentSubmissions)
        .set({ status: 'failed', reviewNote: error.message.slice(0, REVIEW_NOTE_MAX), updatedAt: now })
        .where(and(eq(ChurchContentSubmissions.id, submissionId), inArray(ChurchContentSubmissions.status, fromStatuses)))
        .returning({ id: ChurchContentSubmissions.id });
      if (marked.length) {
        // Imported here, not at the top: church-content-push reads this module's role helper.
        const { notifyAuthorOfOutcome } = await import('./church-content-push');
        void notifyAuthorOfOutcome({ submissionId, outcome: 'failed', now });
      }
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
