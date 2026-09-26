/**
 * Pushes about church content moving through approval (docs/CHURCH_V2_ROADMAP.md §D).
 *
 * Two, both to staff about their own work — so they need only a device that allows
 * notifications, not the congregant "New from your church" opt-in:
 *
 *   - **The author**, immediately, when their post is approved, sent back, or could not go out.
 *     One per event: these are answers to something they asked for, like a reply.
 *   - **Reviewers**, from the hourly church tick, when posts are waiting for them. Coalesced:
 *     at most one a local day, daytime only, and only when something arrived since the last one.
 *
 * Recorded in `ReminderDeliveries` under `church-*` kinds, which the reminder policy ignores
 * (`isChurchDeliveryKind`) — staff work must never pause someone's Sunday verse.
 *
 * Best effort throughout: a failed push never fails the approval that caused it.
 */
import {
  db,
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  sql,
  ChurchContentSubmissions,
  Churches,
  Notes,
  PushSubscriptions,
  ReminderDeliveries,
  Spaces,
  UserMetadata,
} from '../db';
import { enterSpaceUrl } from '@/utils/enter-space-link';
import { isValidIanaTimeZone } from './votd-local-date';
import { localPartsFor } from './push-reminders';
import { REMINDER_BADGE, REMINDER_ICON, TITLE_MAX } from './reminder-payload';
import { isPushConfigured, sendToUser, type ReminderNotificationPayload } from './web-push-client';
import { fetchClerkOrgMemberships } from './clerk-org';
import { roleCanReview } from './church-content';
import { CHURCH_PUSH_HOUR_MAX, CHURCH_PUSH_HOUR_MIN } from './church-publish-push';

export const CHURCH_CONTENT_PUSH_KIND = 'church-content';
export const CHURCH_REVIEW_PUSH_KIND = 'church-review';
const BODY_MAX = 120;

export type AuthorOutcome = 'approved' | 'scheduled' | 'declined' | 'failed';

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** The author's notification. Pure; titles are fixed strings inside the TITLE_MAX budget. */
export function authorOutcomeCopy(input: {
  outcome: AuthorOutcome;
  noteTitle: string;
  channelTitle: string;
  reviewNote?: string | null;
  publishAtLabel?: string | null;
}): { title: string; body: string } {
  const note = input.noteTitle.trim() || 'Your post';
  const titles: Record<AuthorOutcome, string> = {
    approved: 'Your post is out',
    scheduled: 'Your post is approved',
    declined: 'Your post came back',
    failed: 'Your post didn’t go out',
  };
  const bodies: Record<AuthorOutcome, string> = {
    approved: `${note} is now in ${input.channelTitle}.`,
    scheduled: `${note} goes out in ${input.channelTitle}${input.publishAtLabel ? ` ${input.publishAtLabel}` : ''}.`,
    declined: input.reviewNote?.trim() ? `${note}: ${input.reviewNote.trim()}` : `${note} wasn’t approved for ${input.channelTitle}.`,
    failed: `${note} couldn’t be published to ${input.channelTitle}.`,
  };
  const title = titles[input.outcome];
  return { title: title.length <= TITLE_MAX ? title : 'Your church post', body: clip(bodies[input.outcome], BODY_MAX) };
}

/** The reviewers' nudge. Pure. */
export function reviewerNudgeCopy(waiting: number): { title: string; body: string } | null {
  if (waiting <= 0) return null;
  return {
    title: 'Waiting for your approval',
    body: waiting === 1 ? '1 post is waiting for you to approve it.' : `${waiting} posts are waiting for you to approve them.`,
  };
}

/** Pure: whether a reviewer is due a nudge this hour. */
export function reviewerNudgeDue(input: {
  localHour: number;
  localDate: string;
  lastSentLocalDate: string | null;
  lastSentAt: Date | null;
  newestWaitingAt: Date | null;
}): boolean {
  if (!input.newestWaitingAt) return false;
  if (input.localHour < CHURCH_PUSH_HOUR_MIN || input.localHour > CHURCH_PUSH_HOUR_MAX) return false;
  if (input.lastSentLocalDate === input.localDate) return false;
  // Only for something they haven't been told about.
  return !input.lastSentAt || input.newestWaitingAt.getTime() > input.lastSentAt.getTime();
}

async function userClock(userId: string): Promise<string> {
  const row = (
    await db.select({ timezone: UserMetadata.timezone }).from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1)
  )[0];
  return row?.timezone && isValidIanaTimeZone(row.timezone) ? row.timezone : 'UTC';
}

async function deliver(
  userId: string,
  kind: string,
  now: Date,
  copy: { title: string; body: string },
  url: string,
  tag: string,
): Promise<boolean> {
  const parts = localPartsFor(await userClock(userId), now);
  const deliveryId = crypto.randomUUID();
  await db.insert(ReminderDeliveries).values({
    id: deliveryId,
    userId,
    kind,
    variant: 'plain',
    sentAt: now,
    localDate: parts.localDate,
    localHour: parts.hour,
    deviceCount: 0,
    outcome: null,
    outcomeAt: null,
    outcomeSource: null,
  });
  const payload: ReminderNotificationPayload = {
    title: copy.title,
    body: copy.body,
    tag,
    renotify: false,
    icon: REMINDER_ICON,
    badge: REMINDER_BADGE,
    data: { url, kind, deliveryId, sentAt: now.toISOString() },
    actions: [{ action: 'open', title: 'Open' }],
  };
  const result = await sendToUser(userId, payload);
  if (result.sent === 0) {
    await db.delete(ReminderDeliveries).where(eq(ReminderDeliveries.id, deliveryId));
    return false;
  }
  await db.update(ReminderDeliveries).set({ deviceCount: result.sent }).where(eq(ReminderDeliveries.id, deliveryId));
  return true;
}

/**
 * Tell a submission's author what happened to it. Never throws, and never tells someone about
 * their own decision (a reviewer approving their own post).
 */
export async function notifyAuthorOfOutcome(input: {
  submissionId: string;
  outcome: AuthorOutcome;
  actorUserId?: string | null;
  now?: Date;
}): Promise<void> {
  try {
    if (!isPushConfigured()) return;
    const row = (
      await db
        .select({
          authorUserId: ChurchContentSubmissions.authorUserId,
          noteId: ChurchContentSubmissions.noteId,
          channelSpaceId: ChurchContentSubmissions.channelSpaceId,
          reviewNote: ChurchContentSubmissions.reviewNote,
          publishAt: ChurchContentSubmissions.publishAt,
          noteTitle: Notes.title,
          channelTitle: Spaces.title,
        })
        .from(ChurchContentSubmissions)
        .innerJoin(Notes, eq(Notes.id, ChurchContentSubmissions.noteId))
        .innerJoin(Spaces, eq(Spaces.id, ChurchContentSubmissions.channelSpaceId))
        .where(eq(ChurchContentSubmissions.id, input.submissionId))
        .limit(1)
    )[0];
    if (!row || row.authorUserId === input.actorUserId) return;
    const now = input.now ?? new Date();
    const timezone = await userClock(row.authorUserId);
    const publishAtLabel = row.publishAt
      ? `on ${new Date(row.publishAt).toLocaleString('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      : null;
    const copy = authorOutcomeCopy({
      outcome: input.outcome,
      noteTitle: row.noteTitle ?? '',
      channelTitle: row.channelTitle,
      reviewNote: row.reviewNote,
      publishAtLabel,
    });
    // A live post opens in its channel; anything else opens the note, in the author's Home.
    const url = input.outcome === 'approved' ? enterSpaceUrl(row.channelSpaceId) : `/note/${row.noteId}`;
    await deliver(row.authorUserId, CHURCH_CONTENT_PUSH_KIND, now, copy, url, `harvous-church-content-${input.submissionId}`);
  } catch (error) {
    console.warn('[church-content-push] author notice failed', error instanceof Error ? error.message : error);
  }
}

/**
 * The reviewer nudge, run from the hourly church tick. Per church with approval on and posts
 * waiting: each reviewer (by Clerk role) with a device gets one coalesced push, at most daily.
 */
export async function runChurchReviewNudgeTick(
  { now = new Date() }: { now?: Date } = {},
): Promise<{ churches: number; sent: number }> {
  const summary = { churches: 0, sent: 0 };
  if (!isPushConfigured()) return summary;

  const waiting = await db
    .select({
      orgId: ChurchContentSubmissions.orgId,
      n: sql<number>`count(*)::int`,
      newest: sql<Date>`max(${ChurchContentSubmissions.createdAt})`,
    })
    .from(ChurchContentSubmissions)
    .innerJoin(Churches, eq(Churches.orgId, ChurchContentSubmissions.orgId))
    .where(and(eq(ChurchContentSubmissions.status, 'in_review'), eq(Churches.contentApproval, true)))
    .groupBy(ChurchContentSubmissions.orgId);

  for (const church of waiting) {
    summary.churches += 1;
    let roster: { userId: string; role: string | null }[];
    try {
      roster = await fetchClerkOrgMemberships(church.orgId);
    } catch {
      continue; // Clerk down: try again next hour.
    }
    const reviewers = roster.filter((member) => roleCanReview(member.role)).map((member) => member.userId);
    if (reviewers.length === 0) continue;

    // Reviewers who can be reached at all.
    const reachable = await db
      .selectDistinct({ userId: PushSubscriptions.userId })
      .from(PushSubscriptions)
      .where(inArray(PushSubscriptions.userId, reviewers));
    if (reachable.length === 0) continue;

    // Where the tap lands: the channel holding the oldest waiting post, in church context.
    const oldest = (
      await db
        .select({ channelSpaceId: ChurchContentSubmissions.channelSpaceId })
        .from(ChurchContentSubmissions)
        .where(and(eq(ChurchContentSubmissions.orgId, church.orgId), eq(ChurchContentSubmissions.status, 'in_review')))
        .orderBy(asc(ChurchContentSubmissions.createdAt))
        .limit(1)
    )[0];
    const copy = reviewerNudgeCopy(church.n);
    if (!copy || !oldest) continue;

    for (const { userId } of reachable) {
      const last = (
        await db
          .select({ sentAt: ReminderDeliveries.sentAt, localDate: ReminderDeliveries.localDate })
          .from(ReminderDeliveries)
          .where(and(eq(ReminderDeliveries.userId, userId), eq(ReminderDeliveries.kind, CHURCH_REVIEW_PUSH_KIND), isNotNull(ReminderDeliveries.sentAt)))
          .orderBy(sql`${ReminderDeliveries.sentAt} DESC`)
          .limit(1)
      )[0];
      const parts = localPartsFor(await userClock(userId), now);
      const due = reviewerNudgeDue({
        localHour: parts.hour,
        localDate: parts.localDate,
        lastSentLocalDate: last?.localDate ?? null,
        lastSentAt: last?.sentAt ? new Date(last.sentAt) : null,
        newestWaitingAt: church.newest ? new Date(church.newest) : null,
      });
      if (!due) continue;
      if (await deliver(userId, CHURCH_REVIEW_PUSH_KIND, now, copy, enterSpaceUrl(oldest.channelSpaceId), 'harvous-church-review')) {
        summary.sent += 1;
      }
    }
  }
  if (summary.sent) console.log(`[church-review-push] churches=${summary.churches} sent=${summary.sent}`);
  return summary;
}
