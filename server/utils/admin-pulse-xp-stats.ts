/**
 * Admin Pulse — community XP aggregates from UserXP.
 */

import { db, UserXP, and, gte, lt, or, sql, desc } from '../db';
import { XP_VALUES, DAILY_CAPS, ACTIVITY_TYPES } from './xp-system';
import { computeRisingDeltas, type RankDelta } from '@/utils/admin-pulse-deltas';
import { xpActivityLabel } from '@/utils/admin-xp-activity-labels';
import type { DiscoveryRankItem } from './admin-usage-stats';

export type PulseXpActivity = {
  activityType: string;
  label: string;
  totalXp: number;
  eventCount: number;
  users: number;
};

export type PulseXpRate = {
  label: string;
  value: string;
  detail?: string;
};

export type PulseXpSummary = {
  days: number;
  totalXp: number;
  eventCount: number;
  users: number;
  avgXpPerUser: number;
  byActivity: PulseXpActivity[];
  rising: RankDelta[];
  rates: PulseXpRate[];
};

function xpWindowFilter(since: Date, until?: Date) {
  const filters = [gte(UserXP.createdAt, since)];
  if (until) filters.push(lt(UserXP.createdAt, until));
  return and(...filters);
}

/** Exclude legacy Threads-table thread_created XP; keep prototype study-thread awards. */
function xpStudyThreadScopeFilter() {
  return or(
    sql`${UserXP.activityType} <> ${ACTIVITY_TYPES.THREAD_CREATED}`,
    sql`${UserXP.relatedId} LIKE 'note_%'`,
    sql`${UserXP.metadata} LIKE '%"kind":"study_thread"%'`,
  );
}

function xpScopedWhere(since: Date, until?: Date) {
  return and(xpWindowFilter(since, until), xpStudyThreadScopeFilter());
}

async function fetchXpHeadline(since: Date, until?: Date): Promise<{
  totalXp: number;
  eventCount: number;
  users: number;
}> {
  const rows = await db
    .select({
      totalXp: sql<number>`coalesce(sum(${UserXP.xpAmount}), 0)`.mapWith(Number),
      eventCount: sql<number>`count(*)`.mapWith(Number),
      users: sql<number>`count(distinct ${UserXP.userId})`.mapWith(Number),
    })
    .from(UserXP)
    .where(xpScopedWhere(since, until));

  const row = rows[0];
  return {
    totalXp: row?.totalXp ?? 0,
    eventCount: row?.eventCount ?? 0,
    users: row?.users ?? 0,
  };
}

async function fetchXpByActivity(since: Date, until?: Date): Promise<PulseXpActivity[]> {
  const rows = await db
    .select({
      activityType: UserXP.activityType,
      totalXp: sql<number>`coalesce(sum(${UserXP.xpAmount}), 0)`.mapWith(Number),
      eventCount: sql<number>`count(*)`.mapWith(Number),
      users: sql<number>`count(distinct ${UserXP.userId})`.mapWith(Number),
    })
    .from(UserXP)
    .where(xpScopedWhere(since, until))
    .groupBy(UserXP.activityType)
    .orderBy(desc(sql`sum(${UserXP.xpAmount})`), UserXP.activityType);

  return rows.map((row) => ({
    activityType: row.activityType,
    label: xpActivityLabel(row.activityType),
    totalXp: row.totalXp,
    eventCount: row.eventCount,
    users: row.users,
  }));
}

export function getPulseXpRates(): PulseXpRate[] {
  return [
    {
      label: 'Study session',
      value: `${XP_VALUES.SESSION_BASE}–${XP_VALUES.SESSION_MAX} XP`,
      detail: `Up to ${DAILY_CAPS.SESSIONS} completed/day`,
    },
    { label: 'Creation bonus', value: `${XP_VALUES.CREATION_BONUS} XP`, detail: `Up to ${DAILY_CAPS.CREATION_BONUS} XP/day` },
    { label: 'Note created', value: `${XP_VALUES.NOTE_CREATED} XP` },
    { label: 'Thread created', value: `${XP_VALUES.THREAD_CREATED} XP` },
    { label: 'First note of day', value: `+${XP_VALUES.FIRST_NOTE_DAILY_BONUS} XP bonus` },
    {
      label: 'Note opened',
      value: `${XP_VALUES.NOTE_OPENED} XP`,
      detail: `Up to ${DAILY_CAPS.NOTE_OPENED} XP/day`,
    },
    { label: 'Verse of the Day', value: `${XP_VALUES.VOTD_ENGAGED} XP` },
    { label: 'Weekly streak (3–4 days)', value: `${XP_VALUES.WEEKLY_STREAK_3_4_DAYS} XP` },
    { label: 'Weekly streak (5–6 days)', value: `${XP_VALUES.WEEKLY_STREAK_5_6_DAYS} XP` },
    { label: 'Weekly streak (7 days)', value: `${XP_VALUES.WEEKLY_STREAK_7_DAYS} XP` },
    { label: 'New season return', value: `${XP_VALUES.NEW_SEASON_BONUS} XP` },
    { label: 'Church added', value: `${XP_VALUES.CHURCH_ADDED} XP` },
    { label: 'Monthly attendance', value: `${XP_VALUES.MONTHLY_ATTENDANCE} XP` },
    { label: 'Referral (1st friend)', value: '100 XP', detail: 'Then 75, 50, 25…' },
  ];
}

function emptyPulseXpSummary(days = 0): PulseXpSummary {
  return {
    days,
    totalXp: 0,
    eventCount: 0,
    users: 0,
    avgXpPerUser: 0,
    byActivity: [],
    rising: [],
    rates: getPulseXpRates(),
  };
}

function toRankItems(activities: PulseXpActivity[]): DiscoveryRankItem[] {
  return activities.map((row) => ({ name: row.label, count: row.totalXp }));
}

export async function getAdminPulseXp(
  daysParam: number,
  currentSince: Date,
  previousSince: Date,
  previousUntil: Date,
): Promise<PulseXpSummary> {
  const days = Math.min(Math.max(daysParam, 1), 90);
  try {
    const [currentActivities, headline] = await Promise.all([
      fetchXpByActivity(currentSince),
      fetchXpHeadline(currentSince),
    ]);
    const previousActivities = await fetchXpByActivity(previousSince, previousUntil);

    const { totalXp, eventCount, users } = headline;
    const avgXpPerUser = users > 0 ? Math.round(totalXp / users) : 0;

    const rising = computeRisingDeltas(toRankItems(currentActivities), toRankItems(previousActivities), 5);

    return {
      days,
      totalXp,
      eventCount,
      users,
      avgXpPerUser,
      byActivity: currentActivities,
      rising,
      rates: getPulseXpRates(),
    };
  } catch (error) {
    console.error('[admin pulse xp]', error);
    return emptyPulseXpSummary(days);
  }
}

/** Monthly report XP block — fixed calendar range, no rising deltas. */
export async function getAdminPulseXpForRange(
  since: Date,
  until: Date,
): Promise<Pick<PulseXpSummary, 'totalXp' | 'eventCount' | 'users' | 'avgXpPerUser' | 'byActivity'>> {
  try {
    const [byActivity, headline] = await Promise.all([
      fetchXpByActivity(since, until),
      fetchXpHeadline(since, until),
    ]);
    const { totalXp, eventCount, users } = headline;
    const avgXpPerUser = users > 0 ? Math.round(totalXp / users) : 0;
    return { totalXp, eventCount, users, avgXpPerUser, byActivity };
  } catch (error) {
    console.error('[admin pulse xp range]', error);
    return { totalXp: 0, eventCount: 0, users: 0, avgXpPerUser: 0, byActivity: [] };
  }
}
