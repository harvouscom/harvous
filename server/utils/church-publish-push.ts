/**
 * "New from your church" — a push when followed channels have something new.
 *
 * Not a push per publish. A channel with a daily cadence, or a staff member
 * posting a series' five steps in one sitting, would otherwise buzz a whole
 * congregation five times before lunch. Instead an hourly job asks, per person
 * who opted in: has anything reached a channel you follow since you last looked
 * (or since we last told you)? If so, one coalesced notification, at most one
 * per local day, only in daytime hours, never while they're already in the app.
 *
 * "Since you last looked" is the same watermark the switcher badge and the feed's
 * New marks use (`SpaceMemberships.lastVisitedAt`, else `joinedAt`), so the push
 * never announces something the app would not call new.
 *
 * Deliveries are recorded in `ReminderDeliveries` as kind `church`, which the
 * reminder policy's per-kind windows and variant stats both ignore — a church
 * that posts a lot must not pause someone's Sunday verse.
 */
import {
  db,
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
  Notes,
  PushSubscriptions,
  ReminderDeliveries,
  SpaceMemberships,
  SpaceNotes,
  Spaces,
  UserMetadata,
} from '../db';
import { parseReminderSettings } from '@/utils/reminder-settings';
import { isValidIanaTimeZone } from './votd-local-date';
import { localPartsFor } from './push-reminders';
import { REMINDER_BADGE, REMINDER_ICON, TITLE_MAX } from './reminder-payload';
import { isPushConfigured, sendToUser, type ReminderNotificationPayload } from './web-push-client';

export const CHURCH_PUSH_KIND = 'church';
export const CHURCH_PUSH_TAG = 'harvous-church';
/** Daytime only: news from church can wait for morning. */
export const CHURCH_PUSH_HOUR_MIN = 9;
export const CHURCH_PUSH_HOUR_MAX = 20;
/** In the app this recently means they'll see the feed; don't buzz them about it. */
const RECENTLY_ACTIVE_MS = 2 * 60 * 60 * 1000;
const BODY_MAX = 120;

export type ChannelNews = { title: string; count: number };

/** Whether this hour, today, may carry a church push. Pure. */
export function churchPushWindowOpen(input: {
  localHour: number;
  localDate: string;
  lastSentLocalDate: string | null;
}): boolean {
  if (input.localHour < CHURCH_PUSH_HOUR_MIN || input.localHour > CHURCH_PUSH_HOUR_MAX) return false;
  return input.lastSentLocalDate !== input.localDate;
}

/**
 * The notification's words. Pure, and every title is a fixed string so it fits
 * the one-line budget `reminder-payload.ts` measured (TITLE_MAX).
 */
export function churchPushCopy(news: readonly ChannelNews[]): { title: string; body: string } | null {
  const live = news.filter((n) => n.count > 0).sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  if (live.length === 0) return null;
  const title = 'New from your church';
  const parts = live.map((n) => (n.count === 1 ? `1 new in ${n.title}` : `${n.count} new in ${n.title}`));
  let body = parts.join(' · ');
  if (body.length > BODY_MAX) body = `${body.slice(0, BODY_MAX - 1)}…`;
  return { title: title.length <= TITLE_MAX ? title : 'From your church', body };
}

type Candidate = {
  userId: string;
  timezone: string | null;
  reminderSettings: string | null;
  connectedOrgId: string | null;
  lastActiveAt: Date | null;
};

async function loadCandidates(): Promise<Candidate[]> {
  return db
    .select({
      userId: UserMetadata.userId,
      timezone: UserMetadata.timezone,
      reminderSettings: UserMetadata.reminderSettings,
      connectedOrgId: UserMetadata.connectedOrgId,
      lastActiveAt: UserMetadata.lastActiveAt,
    })
    .from(UserMetadata)
    .where(
      and(
        isNotNull(UserMetadata.reminderSettings),
        isNotNull(UserMetadata.timezone),
        isNotNull(UserMetadata.connectedOrgId),
        sql`${UserMetadata.reminderSettings} LIKE '%"churchUpdates":true%'`,
        sql`EXISTS (SELECT 1 FROM ${PushSubscriptions} WHERE ${PushSubscriptions.userId} = ${UserMetadata.userId})`,
      ),
    );
}

async function lastChurchPushAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ sentAt: sql<Date | null>`max(${ReminderDeliveries.sentAt})` })
    .from(ReminderDeliveries)
    .where(and(eq(ReminderDeliveries.userId, userId), eq(ReminderDeliveries.kind, CHURCH_PUSH_KIND)));
  return row?.sentAt ? new Date(row.sentAt) : null;
}

/** What has reached this person's followed channels since `since`-per-channel. */
async function newsFor(userId: string, orgId: string, lastPushAt: Date | null): Promise<ChannelNews[]> {
  const followed = await db
    .select({
      id: Spaces.id,
      title: Spaces.title,
      lastVisitedAt: SpaceMemberships.lastVisitedAt,
      joinedAt: SpaceMemberships.joinedAt,
    })
    .from(SpaceMemberships)
    .innerJoin(Spaces, eq(Spaces.id, SpaceMemberships.spaceId))
    .where(
      and(
        eq(SpaceMemberships.userId, userId),
        eq(SpaceMemberships.role, 'member'),
        eq(Spaces.orgId, orgId),
        eq(Spaces.type, 'public'),
        isNull(Spaces.deletedAt),
      ),
    );
  if (followed.length === 0) return [];

  const rows = await db
    .select({ spaceId: SpaceNotes.spaceId, addedAt: SpaceNotes.addedAt })
    .from(SpaceNotes)
    .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
    .where(
      and(
        inArray(
          SpaceNotes.spaceId,
          followed.map((f) => f.id),
        ),
        isNull(SpaceNotes.removedAt),
        eq(Notes.contentEncrypted, false),
        ne(Notes.userId, userId),
        gt(SpaceNotes.addedAt, sql`now() - interval '14 days'`),
      ),
    );

  const counts = new Map<string, number>();
  for (const row of rows) {
    const channel = followed.find((f) => f.id === row.spaceId);
    if (!channel || !row.addedAt) continue;
    const seen = channel.lastVisitedAt ?? channel.joinedAt;
    const since = [seen, lastPushAt].filter(Boolean).map((d) => new Date(d as Date).getTime());
    const watermark = since.length ? Math.max(...since) : 0;
    if (new Date(row.addedAt).getTime() > watermark) {
      counts.set(channel.id, (counts.get(channel.id) ?? 0) + 1);
    }
  }
  return followed
    .filter((f) => counts.has(f.id))
    .map((f) => ({ title: f.title, count: counts.get(f.id)! }));
}

export type ChurchPushTickSummary = {
  considered: number;
  sent: number;
  skipped?: 'unconfigured';
  dryRun: boolean;
};

export async function runChurchPublishTick(
  { now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {},
): Promise<ChurchPushTickSummary> {
  const summary: ChurchPushTickSummary = { considered: 0, sent: 0, dryRun };
  if (!isPushConfigured()) return { ...summary, skipped: 'unconfigured' };

  const candidates = await loadCandidates();
  const activeCutoff = now.getTime() - RECENTLY_ACTIVE_MS;

  for (const row of candidates) {
    const settings = parseReminderSettings(row.reminderSettings);
    if (!settings?.churchUpdates || !row.connectedOrgId) continue;
    if (!row.timezone || !isValidIanaTimeZone(row.timezone)) continue;
    if (row.lastActiveAt && row.lastActiveAt.getTime() > activeCutoff) continue;
    summary.considered += 1;

    const parts = localPartsFor(row.timezone, now);
    const lastAt = await lastChurchPushAt(row.userId);
    const lastSentLocalDate = lastAt ? localPartsFor(row.timezone, lastAt).localDate : null;
    if (!churchPushWindowOpen({ localHour: parts.hour, localDate: parts.localDate, lastSentLocalDate })) continue;

    const copy = churchPushCopy(await newsFor(row.userId, row.connectedOrgId, lastAt));
    if (!copy || dryRun) continue;

    const deliveryId = crypto.randomUUID();
    await db.insert(ReminderDeliveries).values({
      id: deliveryId,
      userId: row.userId,
      kind: CHURCH_PUSH_KIND,
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
      // Its own tag, so it never replaces a Sunday verse still on the lock screen.
      tag: CHURCH_PUSH_TAG,
      renotify: false,
      icon: REMINDER_ICON,
      badge: REMINDER_BADGE,
      data: { url: '/', kind: CHURCH_PUSH_KIND, deliveryId, sentAt: now.toISOString() },
      actions: [{ action: 'open', title: 'Open' }],
    };
    const result = await sendToUser(row.userId, payload);
    if (result.sent === 0) {
      // Reached nobody — don't let a dead device use up today's one push.
      await db.delete(ReminderDeliveries).where(eq(ReminderDeliveries.id, deliveryId));
      continue;
    }
    await db.update(ReminderDeliveries).set({ deviceCount: result.sent }).where(eq(ReminderDeliveries.id, deliveryId));
    summary.sent += 1;
  }

  console.log(`[church-push] considered=${summary.considered} sent=${summary.sent}${dryRun ? ' (dry run)' : ''}`);
  return summary;
}
